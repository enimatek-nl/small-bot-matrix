# SmallBot

[![deno doc](https://doc.deno.land/badge.svg)](https://raw.githubusercontent.com/cybertim/SmallBotMatrix/main/mod.ts)

**S**mall **Ma**trix **L**itt**l**e Bot

Very small implementation (bare essential) to quickly setup a Matrix Bot in Deno/Typescript/Web.

## Examples

```typescript
const client = new SmallBot({
    accessToken: "mysecretaccesstoken",
    homeserverUrl: "https://matrix.org/",
    eventHandler: async (client, roomId, event) => {
        if (event.sender !== client.ownUserId) {
            const profile = await client.getUserProfile(event.sender);
            await client.sendRoomNotice(roomId, profile.displayname + ", you said: <b>" + event.content.body + "</b>");
        }
    }
});

await client.start();
```

## Documentation
View it online at [doc.deno.land](https://raw.githubusercontent.com/cybertim/SmallBotMatrix/main/mod.ts)