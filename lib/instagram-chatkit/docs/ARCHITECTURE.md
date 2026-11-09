# Code structure

[README](https://github.com/ttkienn/instagram-chatkit#readme) · [API](https://github.com/ttkienn/instagram-chatkit/blob/main/docs/DOCS.md) · **[Code structure](https://github.com/ttkienn/instagram-chatkit/blob/main/docs/ARCHITECTURE.md)**

## Getting started

Clone the repository to work on the library:

```bash
git clone https://github.com/ttkienn/instagram-chatkit.git instagram-chatkit
cd instagram-chatkit
npm ci
```

## Files and folders

| File or folder | What it contains |
| --- | --- |
| [src/index.js](https://github.com/ttkienn/instagram-chatkit/blob/main/src/index.js) | Exports available from `instagram-chatkit` |
| [src/client.js](https://github.com/ttkienn/instagram-chatkit/blob/main/src/client.js) | The main client for login, sending, and receiving |
| [src/auth/](https://github.com/ttkienn/instagram-chatkit/tree/main/src/auth), [src/client/](https://github.com/ttkienn/instagram-chatkit/tree/main/src/client) | Login and connection management |
| [src/features/](https://github.com/ttkienn/instagram-chatkit/tree/main/src/features) | API groups: messages, threads, users, media, and notes |
| [src/transport/http/](https://github.com/ttkienn/instagram-chatkit/tree/main/src/transport/http) | Sends requests to Instagram and reads responses |
| [src/realtime/mqtt/](https://github.com/ttkienn/instagram-chatkit/tree/main/src/realtime/mqtt) | Receives messages and reconnects after connection loss |
| [src/receiving/](https://github.com/ttkienn/instagram-chatkit/tree/main/src/receiving) | Filters and handlers for received messages |
| [src/storage/](https://github.com/ttkienn/instagram-chatkit/tree/main/src/storage) | Reads and saves sessions |
| [src/shared/](https://github.com/ttkienn/instagram-chatkit/tree/main/src/shared) | Cookies, errors, input checks, and logging |
| [src/bot/](https://github.com/ttkienn/instagram-chatkit/tree/main/src/bot) | Built-in bot, imported from `instagram-chatkit/bot` |
| [types/](https://github.com/ttkienn/instagram-chatkit/tree/main/types) | TypeScript declarations |
| [examples/](https://github.com/ttkienn/instagram-chatkit/tree/main/examples) | Examples of using the library |
| [scripts/](https://github.com/ttkienn/instagram-chatkit/tree/main/scripts) | Code and package checks |

## Making changes

Edit the matching group in `src/features/`, then update its declarations in `types/`. For example, message sending lives in `features/messages/`, and chat management lives in `features/threads/`.

## Checks

```bash
npm run verify
```

