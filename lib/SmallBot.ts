import {
    ISmallBotConfig,
    MatrixJoinedRoomsResponse,
    MatrixRoomEvent,
    MatrixRoomStateResponse,
    MatrixSyncResponse,
    MatrixUserProfileResponse,
    MatrixWhoAmIResponse,
} from "./ISmallBot.ts";

/**
 * Wrapper to interact with the matrix.org client API
 */
export class SmallBot {
    private requestId = 0;

    /**
     * Create an instance of `SmallBot`
     * ```ts
     * const client = new SmallBot({
     *    accessToken: "mysecretaccesstoken",
     *    homeserverUrl: "https://matrix.org/",
     *    eventHandler: async (client, roomId, event) => {
     *        if (event.sender !== client.ownUserId) {        
     *            await client.sendRoomNotice(roomId, "You said: <b>" + event.content.body + "</b>");
     *        }
     *    }
     *});
     * ```
     * @param config 
     */
    constructor(private config: ISmallBotConfig) {
        if (!config.syncTimeout) config.syncTimeout = 10000;
        if (!config.homeserverUrl) config.homeserverUrl = "https://matrix.org";
        if (!config.logger) {
            config.logger = {
                error: (log) => console.error(log),
                info: (log) => console.info(log),
            };
        }
        if (!config.store) {
            config.store = {
                read: () => {
                    try {
                        return Deno.readTextFileSync("small.store");
                    } catch (err) {
                        return undefined;
                    }
                },
                write: (since) => {
                    Deno.writeTextFileSync("small.store", since);
                },
            };
        }
        if (!config.formatHTMLtoPlain) {
            config.formatHTMLtoPlain = (html) => html.replace(/<[^>]+>/g, "");
        }
    }

    private async syncLoop(since?: string) {
        const syncResponse = await this.getSync(since);
        for (const entry of syncResponse.rooms.join.entries()) {
            for (const event of entry[1].timeline.events) {
                await this.config.eventHandler(this, entry[0], event);
            }
        }
        this.config.store?.write(syncResponse.next_batch);
        this.syncLoop(syncResponse.next_batch);
    }

    private async doRequest<T>(uri: string, query: string[], method?: string, body?: string) {
        const url = this.config.homeserverUrl + (this.config.homeserverUrl?.endsWith("/") ? "" : "/") + "_matrix/client/r0/" + uri;
        const q = "?access_token=" + this.config.accessToken + (query.length > 0 ? "&" : "") + query.join("&");
        const response = await fetch(url + q, {
            method: method ? method : "GET",
            body: body
        });
        this.config.logger?.info("Fetched from '" + url + "'");
        return <T>await response.json();
    }

    private async sendEvent(roomId: string, eventType: string, content: string) {
        const txnId = (new Date().getTime()) + "__REQ" + (++this.requestId);
        await this.doRequest("rooms/" + escape(roomId) + "/send/" + eventType + "/" + txnId, [], "PUT", content);
    }

    public get ownUserId(): string | undefined {
        return this.config.userId;
    }

    /**
     * Returns `MatrixUserProfileResponse` containing the current display name of the userId
     * ```ts
     * const profile = await client.getUserProfile(event.sender);
     * ```
     * @param userId ID of the user to retrieve the profile
     */
    async getUserProfile(userId: string) {
        return await this.doRequest<MatrixUserProfileResponse>(
            "profile/" + userId,
            [],
        );
    }

    /**
     * Returns `MatrixRoomStateResponse` of the given room id containing the current display name
     * @param roomId ID of Room to get the display name
     */
    async getRoomStateName(roomId: string) {
        return await this.doRequest<MatrixRoomStateResponse>("rooms/" + escape(roomId) + "/state/m.room.name/", []);
    }

    /**
     * Listens for new events on `/sync` with a timeout based on `syncTimeout` 
     * This method is looped automatically when `start()` is called
     * @param since token used to sync events from a specific point in time
     */
    async getSync(since?: string) {
        const response = await this.doRequest<MatrixSyncResponse>(
            "sync",
            [
                "full_state=false",
                "timeout=" + this.config.syncTimeout,
                (since ? ("since=" + since) : ""),
            ]
        );
        if (response.rooms && response.rooms.join) {
            response.rooms.join = new Map<string, MatrixRoomEvent>(Object.entries(response.rooms.join));
        } else {
            response.rooms = {join: new Map<string, MatrixRoomEvent>()};
        }
        return response;
    }

    /**
     * Returns the `MatrixWhoAmIResponse` containing the userId of the bot
     */
    async whoAmI() {
        return await this.doRequest<MatrixWhoAmIResponse>("account/whoami", []);
    }

    /**
     * Returns the `MatrixJoinedRoomsResponse` containing a Map of all joined roomId's
     */
    async joinedRooms() {
        return await this.doRequest<MatrixJoinedRoomsResponse>("joined_rooms", []);
    }

    /**
     * Alias of `sendMessage` with msgType `m.notice`
     * @param roomId ID of the Room
     * @param msg the HTML body of the message `formatHTMLtoPlain` will be used to create the plain-text version
     */
    async sendRoomNotice(roomId: string, msg: string) {
        await this.sendMessage(roomId, "m.notice", msg);
    }

    /**
     * Alias of `sendMessage` with msgType `m.text`
     * @param roomId ID of the Room
     * @param msg the HTML body of the message `formatHTMLtoPlain` will be used to create the plain-text version
     */
    async sendRoomText(roomId: string, msg: string) {
        await this.sendMessage(roomId, "m.text", msg);
    }

    /**
     * Send a custom message to a room
     * ```ts
     * await client.sendMessage(roomId, "m.text", "<b>hello world</b>");
     * ```
     * @param roomId ID of the Room
     * @param msgType type like `m.text` or `m.notice`
     * @param formattedBody the HTML body of the message `formatHTMLtoPlain` will be used to create the plain-text version
     */
    async sendMessage(
        roomId: string,
        msgType: string,
        formattedBody: string,
    ) {
        const plain = this.config.formatHTMLtoPlain ? this.config.formatHTMLtoPlain(formattedBody) : "";
        const payload = {
            msgtype: msgType,
            format: "org.matrix.custom.html",
            body: plain,
            formatted_body: formattedBody
        };
        await this.sendEvent(roomId, "m.room.message", JSON.stringify(payload));
    }

    /**
     * Call this method to start the /sync loop and send all events into your custom handler
     * ```ts
     * await client.start();
     * ```
     */
    async start() {
        try {
            if (!this.config.userId) {
                this.config.userId = (await this.whoAmI()).user_id;
            }
            this.syncLoop(this.config.store?.read());
        } catch (err) {
            this.config.logger?.error(err);
        }
    }
}
