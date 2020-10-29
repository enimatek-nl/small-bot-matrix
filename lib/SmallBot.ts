import {
  ISmallBotConfig,
  MatrixJoinedRoomsResponse,
  MatrixRoomEvent,
  MatrixRoomStateResponse,
  MatrixSyncResponse,
  MatrixUserProfileResponse,
  MatrixWhoAmIResponse,
} from "./ISmallBot.ts";

export class SmallBot {
  private requestId = 0;

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

  private async doRequest<T>(
    uri: string,
    query: string[],
    method?: string,
    body?: string,
  ) {
    const url = this.config.homeserverUrl +
      (this.config.homeserverUrl?.endsWith("/") ? "" : "/") +
      "_matrix/client/r0/" +
      uri;
    const q = "?access_token=" + this.config.accessToken +
      (query.length > 0 ? "&" : "") +
      query.join("&");
    const response = await fetch(url + q, {
      method: method ? method : "GET",
      body: body,
    });
    this.config.logger?.info("Fetched from '" + url + "'");
    return <T> await response.json();
  }

  private async sendEvent(roomId: string, eventType: string, content: string) {
    const txnId = (new Date().getTime()) + "__REQ" + (++this.requestId);
    await this.doRequest(
      "rooms/" + escape(roomId) + "/send/" + eventType + "/" + txnId,
      [],
      "PUT",
      content,
    );
  }

  public get ownUserId(): string | undefined {
    return this.config.userId;
  }

  async getUserProfile(userId: string) {
    return await this.doRequest<MatrixUserProfileResponse>(
      "profile/" + userId,
      [],
    );
  }

  async getRoomStateName(roomId: string) {
    return await this.doRequest<MatrixRoomStateResponse>(
      "rooms/" + escape(roomId) + "/state/m.room.name/",
      [],
    );
  }

  async getSync(since?: string) {
    const response = await this.doRequest<MatrixSyncResponse>(
      "sync",
      [
        "full_state=false",
        "timeout=" + this.config.syncTimeout,
        (since ? ("since=" + since) : ""),
      ],
    );
    response.rooms.join = new Map<string, MatrixRoomEvent>(
      Object.entries(response.rooms.join),
    );
    return response;
  }

  async whoAmI() {
    return await this.doRequest<MatrixWhoAmIResponse>("whoami", []);
  }

  async joinedRooms() {
    return await this.doRequest<MatrixJoinedRoomsResponse>("joined_rooms", []);
  }

  async sendRoomNotice(roomId: string, msg: string) {
    await this.sendMessage(roomId, "m.notice", msg);
  }

  async sendRoomText(roomId: string, msg: string) {
    await this.sendMessage(roomId, "m.text", msg);
  }

  async sendMessage(
    roomId: string,
    msgType: string,
    formattedBody: string,
  ) {
    const plain = this.config.formatHTMLtoPlain
      ? this.config.formatHTMLtoPlain(formattedBody)
      : "";
    const payload = {
      msgtype: msgType,
      format: "org.matrix.custom.html",
      body: plain,
      formatted_body: formattedBody,
    };
    await this.sendEvent(roomId, "m.room.message", JSON.stringify(payload));
  }

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
