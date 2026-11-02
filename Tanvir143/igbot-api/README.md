<!--
File Name: README.md
ICA: igbot-api
Auhor: Tanvir Ahmed (Tanvir143)
GitHub: www.github.com/143tanvir
WhatsApp: +8801750079773
Note: Project metadata only; original source credits and license notices are retained.
Original attribution/license notices below are preserved.
-->

# igbot-api

A compatibility-oriented Node.js client for Instagram Direct, based on the `@lazyneoaz/ig-chat-api` project. It retains the original hosted ICA transport and callback login signature while adding compatibility helpers for common WONICA-style bot code.

> **Important:** this is a client for a compatible ICA server, not a standalone Instagram protocol implementation. Set `CHAT_API_URL` and `CHAT_API_KEY`, or pass `serverUrl` and `apiKey` as login options. Server capabilities determine which remote methods can actually run.

## Login (original signature retained)

```js
const login = require('igbot-api');
login({ appState: require('./appstate.json') }, {
  serverUrl: process.env.CHAT_API_URL,
  apiKey: process.env.CHAT_API_KEY,
  listenEvents: true,
  autoReconnect: true
}, (err, api) => {
  if (err) return console.error(err);
  api.listenMqtt((err, event) => {
    if (err) return console.error(err);
    if (event && event.type === 'message') api.sendMessage(event.body || '', event.threadID);
  });
});
```

Promise style is also supported without changing the callback style:

```js
const { login } = require('igbot-api');
const api = await login({ appState: require('./appstate.json') }, {
  serverUrl: process.env.CHAT_API_URL,
  apiKey: process.env.CHAT_API_KEY
});
api.listen((err, event) => { /* handle event */ });
```

## Compatibility additions

- CommonJS default export plus named `login` / `connect` exports.
- `api.listen()` alias for `api.listenMqtt()`, plus `stopListening()` and `stopListeningAsync()`.
- EventEmitter lifecycle events: `connected`, `disconnected`, and `error` (attach an error listener before listening).
- `getCurrentUser()` and `getHealth()` helpers.
- Compatible aliases/wrappers for `getInbox`, `getUserInfoByUsername`, `replyToMessage`, `sendReaction`, `stopTypingIndicator`, `sendImage`, `sendAudio`, `sendVideo`, `sendMusic`, `musicSearch`, `sendTextEffect`, `sendAvatarTextEffect`, `addUserToThread`, and `removeUserFromThread`.
- Keeps `api._userID` as an alias of `api.userID` for older event handlers.
- Supports the common callback overload `sendTypingIndicator(threadID, callback)` as well as `sendTypingIndicator(threadID, isTyping, callback)`.
- Optional newer methods such as story/live/search APIs are proxied when the configured server implements them; this client cannot add server-side functionality by itself.

## Compatibility scope

These aliases match the API calls found in the Tanvir143 InstaBot command/message/event structure. They adapt argument shapes to existing ICA methods; they do not add missing capabilities to the remote server. Features still depend on the configured server exposing the underlying method and on its event payloads matching the expected fields.

## Local installation (no publish needed)

In the bot's root `package.json`:

```json
{ "dependencies": { "igbot-api": "file:./Tanvir143/igbot-api" } }
```

Then run `npm install`. For local testing, the source folder's `package.json` must have `name: "igbot-api"`.

## License and attribution

This package retains the original MIT license and upstream attribution. Source project: https://github.com/lazyneoaz/ig-chat-api.
