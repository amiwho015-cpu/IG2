<div align="center">
  <img src="https://raw.githubusercontent.com/ttkienn/instagram-chatkit/main/assets/instagram-chatkit.png" alt="instagram-chatkit" width="900">
  <h1>instagram-chatkit</h1>
  <p>Send and receive Instagram messages with Node.js using browser cookies.</p>
  <p>
    <a href="https://www.npmjs.com/package/instagram-chatkit"><img src="https://img.shields.io/badge/npm-instagram--chatkit-CB3837?logo=npm&amp;logoColor=white" alt="npm: instagram-chatkit"></a>
    <img src="https://img.shields.io/badge/Node.js-24%2B-339933?logo=nodedotjs&amp;logoColor=white" alt="Node.js 24 or later">
    <a href="https://github.com/ttkienn/instagram-chatkit/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-333333" alt="MIT license"></a>
  </p>
  <p>
    <a href="https://github.com/ttkienn/instagram-chatkit/blob/main/docs/DOCS.md">API</a> ·
    <a href="https://github.com/ttkienn/instagram-chatkit/blob/main/examples/receive-message.js">Examples</a> ·
    <a href="https://github.com/ttkienn/instagram-chatkit">GitHub</a> ·
    <a href="https://github.com/ttkienn/instagram-chatkit/issues">Report an issue</a>
  </p>
  <p>
    <strong>English</strong> · <a href="https://github.com/ttkienn/instagram-chatkit/blob/main/README.vi.md">Tiếng Việt</a>
  </p>
</div>

---

## Install

Requires Node.js 24 or later.

```bash
npm install instagram-chatkit
```

## Get your cookies

In Chrome or Edge, log in to [Instagram](https://www.instagram.com), press F12, open **Network**, and reload the page. Select a request to `www.instagram.com` → **Headers → Request Headers → cookie**, right-click the value, and choose **Copy value**. Paste the full string into `IGCHAT_COOKIES` in `.env`:

```dotenv
IGCHAT_COOKIES="sessionid=...; csrftoken=...; ds_user_id=..."
```

## Example

Save this as `bot.mjs`:

```js
import { InstagramClient } from 'instagram-chatkit';

const client = new InstagramClient({
  cookies: process.env.IGCHAT_COOKIES,
  receiving: { receiveOwnMessages: false },
});

client.onMessage(async function (message) {
  if (message.text === '/ping') {
    await message.replyText('pong');
  }
});

client.onHandlerError(function (error) {
  console.error(error.code);
});

async function main() {
  await client.login();
  await client.connectRealtime();
}

main().catch(async function (error) {
  console.error(error.code);
  await client.close();
  process.exitCode = 1;
});
```

Run it, then send `/ping` from another account:

```bash
node --env-file=.env bot.mjs
```

Call `await client.close()` when your app stops. The [full example](https://github.com/ttkienn/instagram-chatkit/blob/main/examples/receive-message.js) handles Ctrl+C.

## Documentation

| Need | Read |
| --- | --- |
| Sending, receiving, media, and filters | [API reference](https://github.com/ttkienn/instagram-chatkit/blob/main/docs/DOCS.md) |
| Try sending or receiving messages | [Send](https://github.com/ttkienn/instagram-chatkit/blob/main/examples/send-message.js) · [Receive](https://github.com/ttkienn/instagram-chatkit/blob/main/examples/receive-message.js) |
| Run the built-in bot | [Bot example](https://github.com/ttkienn/instagram-chatkit/blob/main/examples/optional/bot.js) |
| Work on the library | [Code structure](https://github.com/ttkienn/instagram-chatkit/blob/main/docs/ARCHITECTURE.md) |

## Notes

- Keep cookies, `.env`, and saved sessions out of Git.
- Posting to your feed, using Stories/Highlights/Live, and adding captions to image messages are not supported yet.
- If you get `DELIVERY_UNKNOWN`, check the chat before sending again to avoid duplicates.

## Author

<table>
  <tr>
    <td align="center" width="100">
      <a href="https://github.com/ttkienn">
        <img src="https://github.com/ttkienn.png?size=160" alt="Thiệu Trung Kiên's GitHub avatar" width="80" height="80">
      </a>
    </td>
    <td>
      <strong>Thiệu Trung Kiên</strong><br>
      <a href="https://www.facebook.com/ttkiennn">Facebook</a> ·
      <a href="https://github.com/ttkienn">GitHub</a> ·
      <a href="https://www.npmjs.com/~thieutrungkien2">npm</a>
    </td>
  </tr>
</table>

## Donate

<p align="center">
  <img src="https://raw.githubusercontent.com/ttkienn/instagram-chatkit/main/assets/donate-mbbank.png" alt="MB Bank donation QR for account 543888999" width="240"><br>
  <strong>MB Bank · 543888999</strong>
</p>

Scan with your banking app and enter the amount you want to send.

## License

[MIT](https://github.com/ttkienn/instagram-chatkit/blob/main/LICENSE). Code from other projects keeps its original license; see [third-party notices](https://github.com/ttkienn/instagram-chatkit/blob/main/licenses/THIRD_PARTY_NOTICES.txt).
