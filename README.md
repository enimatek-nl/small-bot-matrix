# SmallBot
**S**mall **Ma**trix **L**itt**l**e Bot

Very small implementation (bare essential) to quickly setup a Matrix Bot in Deno/Typescript/Web.

## Examples

```
const client = new SmallBot({
    accessToken: "mysecretaccesstoken",
    homeserverUrl: "https://matrix.org/",
    eventHandler: async (client, roomId, event) => {
        if (event.sender !== client.ownUserId) {        
            await client.sendRoomNotice(roomId, "You said: <b>" + event.content.body + "</b>");
        }
    }
});

await client.start();
```