<!--
File Name: README.md
ICA: igbot-api
Auhor: Tanvir Ahmed (Tanvir143)
GitHub: www.github.com/143tanvir
WhatsApp: +8801750079773
Note: Project metadata only; original source credits and license notices are retained.
Original attribution/license notices below are preserved.
-->


<div align="center">

# ✦ igBot-143

**Instagram DM Bot · Commands · Media · Effects · Reply Menus**

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-7c3aed)](LICENSE)
[![GitHub](https://img.shields.io/badge/GitHub-143tanvir-181717?logo=github)](https://github.com/143tanvir/igBot-143)
<br> ![Repository Views](https://hits.sh/github.com/143tanvir/igBot-143.svg?style=for-the-badge&label=REPO%20VIEWS)

**Project Author**  
**Tanvir Ahmed (Tanvir143)**

**Original Source**  
Saifullah Al Neoaz (NKX)

</div>

---

## Overview

`igBot-143` is a command-based Instagram DM bot built around the local `igbot-api` package. It supports command aliases, roles, cooldowns, replies, reactions, media attachments, animated text effects, avatar effects, Instagram music stickers, and numbered reply menus.

The examples below are based on the project's message helper and dispatcher implementation, rather than generic API method guesses.

## Install and start

```bash
git clone https://github.com/143tanvir/igBot-143.git
cd igBot-143
npm install
npm start
```

Configure your own session and bot settings before starting. Never commit cookies, session files, API keys, or credentials to GitHub.

## Command structure

Create `commands/hello.js`:

```js
module.exports = {
  config: {
    name: "hello",
    aliases: ["hi"],
    author: "Tanvir143",
    category: "Users Cmd",
    cooldown: 3,
    role: 0,
    description: { en: "Send a greeting" },
    usage: { en: "{p}hello [name]" }
  },

  onStart: async function ({ message, args }) {
    return message.reply(`Hello ${args.join(" ") || "there"}! 👋`);
  }
};
```

- `name`: command name; `aliases`: alternative names.
- `role`: access level; `cooldown`: wait time between uses.
- `onStart`: command entry point; `args`: words after the command.
- `message`: the repository's message helper.
- `api` and `event`: available in the command context when lower-level API methods or incoming event data are needed.

## How media sending works

The project's `message` helper accepts a string or a payload such as `{ body, attachment }`. It routes attachments to the installed API's image, video, or audio sender.

Attachments can be a URL, local file path, `Buffer`, or readable stream.

**For local files, use `fs.createReadStream()` with the correct filename extension.** For a `Buffer`, include `mimetype` and `name` so the helper can identify the media type.

### Image / PNG

```js
const fs = require("fs");

return message.reply({
  body: "Here is the PNG 🖼️",
  attachment: fs.createReadStream("assets/image.png")
});
```

The project's image command also supports URL attachments:

```js
return message.reply({
  body: "",
  attachment: imageUrls
});
```

Here, `imageUrls` can be an array of image URLs.

### Video / MP4

```js
const fs = require("fs");

return message.reply({
  body: "Sending video 🎬",
  attachment: fs.createReadStream("assets/video.mp4")
});
```

### Audio / MP3

```js
const fs = require("fs");

return message.reply({
  body: "Sending audio 🎵",
  attachment: fs.createReadStream("assets/audio.mp3")
});
```

### Send downloaded media using a Buffer

Use this approach when an API returns image bytes.

```js
const axios = require("axios");

const response = await axios.get(imageUrl, {
  responseType: "arraybuffer",
  timeout: 60000
});

return message.reply({
  body: "Generated image",
  attachment: {
    buffer: Buffer.from(response.data),
    mimetype: "image/png",
    name: "generated.png"
  }
});
```

For a video Buffer, use `mimetype: "video/mp4"` and `name: "video.mp4"`. For MP3 audio, use `mimetype: "audio/mpeg"` and `name: "audio.mp3"`.

> **Important:** Use the media URL itself, not a webpage containing a media player. A direct URL can be passed as `attachment: "https://..."` or as an item in an attachment array. If an API returns a URL object, pass the actual URL string.

## Text effects and avatar effects

These are the helper methods used by the project:

```js
await message.effect("Hello with a fire effect!", "fire");
await message.avatarEffect("Hello with an avatar effect!", "love");
```

Text effect names documented by the included command:

- `love`
- `gift`
- `celebration`
- `fire`

Avatar effect names documented by the helper:

- `love`
- `angry`
- `laugh`
- `cry`

Actual delivery depends on whether the configured ICA server supports the requested operation.

## Reactions and ordinary messages

```js
// React to the message that triggered the command
await message.react("❤️");

// Reply to the triggering message
await message.reply("This replies to the triggering message.");

// Send a message to the same conversation
await message.send("Hello! This is a new message.");
```

## Instagram music sticker

The repository's music command uses `message.musicSearch()` and `message.music()`.

```js
const result = await message.musicSearch("Faded");

console.log(
  "Music search result:",
  JSON.stringify(result, null, 2)
);

// Inspect the returned structure and select a track
const tracks = Array.isArray(result)
  ? result
  : result?.items || result?.tracks || result?.results || [];

const first =
  tracks[0]?.track ||
  tracks[0]?.original_sound ||
  tracks[0];

const trackId =
  first?.audio_cluster_id ||
  first?.audioClusterId ||
  first?.audioClusterID;

if (trackId) {
  await message.music(trackId);
} else {
  await message.reply("No usable music result ID was found.");
}
```

The included `commands/music.js` has more defensive result-normalization logic and is the recommended reference.

**Note:** An Instagram music sticker is different from sending an MP3 audio attachment.

## Reply handler: numbered menu

The project's dispatcher provides `setReplyHandler(handler, messageID)`. Register the handler against the menu message ID so the user's reply selects the correct option.

```js
module.exports = {
  config: {
    name: "menu",
    aliases: ["choose"],
    author: "Tanvir143",
    category: "Users Cmd",
    cooldown: 3,
    role: 0,
    description: { en: "Show a numbered menu" },
    usage: { en: "{p}menu" }
  },

  onStart: async function ({ message, setReplyHandler }) {
    const sent = await message.reply(
      "Choose an action:\n\n" +
      "1. Text\n" +
      "2. Fire effect\n" +
      "3. PNG image\n\n" +
      "Reply with 1, 2, or 3."
    );

    if (!sent?.messageID) {
      return message.reply("Could not get the menu message ID.");
    }

    setReplyHandler(
      async ({ message: replyMessage, event: replyEvent }) => {
        const choice = String(replyEvent.body || "").trim();

        if (choice === "1") {
          await replyMessage.reply("You selected text. ✅");
        } else if (choice === "2") {
          await replyMessage.effect("Hello with fire!", "fire");
        } else if (choice === "3") {
          const fs = require("fs");

          await replyMessage.reply({
            body: "Here is the PNG 🖼️",
            attachment: fs.createReadStream("assets/image.png")
          });
        } else {
          await replyMessage.reply(
            "Invalid choice. Reply with 1, 2, or 3."
          );
        }
      },
      sent.messageID
    );
  }
};
```

Reply handlers in this dispatcher are one-shot. For a multi-step menu, register another handler for the next prompt's `messageID`.

## Full example — all main features

Save this as `commands/allfeatures.js`.

Add these files to the project's `assets` folder:

- `demo.png`
- `demo.mp4`
- `demo.mp3`

The command below demonstrates text messages, text effects, avatar effects, image attachments, video attachments, audio attachments, reactions, music search, and a numbered reply menu.

```js
"use strict";

const fs = require("fs");

module.exports = {
  config: {
    name: "allfeatures",
    aliases: ["all", "demo"],
    author: "Tanvir143",
    category: "Developer",
    cooldown: 5,
    role: 0,
    description: {
      en: "Demo the bot's main messaging features"
    },
    usage: {
      en: "{p}allfeatures [text]"
    }
  },

  onStart: async function ({ message, args, setReplyHandler }) {
    const text = args.join(" ").trim() || "Hello from Tanvir143!";

    const menu = await message.reply(
      `✨ ${text}\n\n` +
      "Choose what to test:\n" +
      "1. Text message\n" +
      "2. Text effect\n" +
      "3. Avatar effect\n" +
      "4. PNG image\n" +
      "5. MP4 video\n" +
      "6. MP3 audio\n" +
      "7. Music sticker search\n" +
      "8. Send all media\n\n" +
      "Reply with a number from 1 to 8."
    );

    try {
      await message.react("❤️");
    } catch (error) {
      console.error("[allfeatures] Reaction:", error.message);
    }

    if (!menu?.messageID) {
      return message.reply("Could not create the menu message ID.");
    }

    setReplyHandler(
      async ({ message: replyMessage, event: replyEvent }) => {
        const choice = String(replyEvent.body || "").trim();

        try {
          switch (choice) {
            case "1":
              await replyMessage.reply(text);
              break;

            case "2":
              await replyMessage.effect(text, "fire");
              break;

            case "3":
              await replyMessage.avatarEffect(text, "love");
              break;

            case "4":
              await replyMessage.reply({
                body: "PNG image 🖼️",
                attachment: fs.createReadStream("assets/demo.png")
              });
              break;

            case "5":
              await replyMessage.reply({
                body: "MP4 video 🎬",
                attachment: fs.createReadStream("assets/demo.mp4")
              });
              break;

            case "6":
              await replyMessage.reply({
                body: "MP3 audio 🎵",
                attachment: fs.createReadStream("assets/demo.mp3")
              });
              break;

            case "7": {
              const query = args.join(" ").trim() || "Faded";
              const result = await replyMessage.musicSearch(query);

              console.log(
                "[allfeatures] Music search result:",
                JSON.stringify(result, null, 2)
              );

              const tracks = Array.isArray(result)
                ? result
                : result?.items || result?.tracks || result?.results || [];

              const first =
                tracks[0]?.track ||
                tracks[0]?.original_sound ||
                tracks[0];

              const trackId =
                first?.audio_cluster_id ||
                first?.audioClusterId ||
                first?.audioClusterID;

              if (!trackId) {
                await replyMessage.reply(
                  "No usable music result ID found. Check the console result."
                );
                break;
              }

              await replyMessage.music(trackId);
              break;
            }

            case "8":
              await replyMessage.reply(text);

              await replyMessage.effect(text, "fire");

              await replyMessage.avatarEffect(text, "love");

              await replyMessage.reply({
                body: "PNG image 🖼️",
                attachment: fs.createReadStream("assets/demo.png")
              });

              await replyMessage.reply({
                body: "MP4 video 🎬",
                attachment: fs.createReadStream("assets/demo.mp4")
              });

              await replyMessage.reply({
                body: "MP3 audio 🎵",
                attachment: fs.createReadStream("assets/demo.mp3")
              });
              break;

            default:
              await replyMessage.reply(
                "Invalid choice. Reply with a number from 1 to 8."
              );
          }
        } catch (error) {
          console.error("[allfeatures] Failed:", error);

          await replyMessage.reply(
            `Action failed: ${error?.message || "Unknown error"}`
          );
        }
      },
      menu.messageID
    );
  }
};
```

### Before running the full example

1. Create an `assets` folder in the project root.
2. Add files named `demo.png`, `demo.mp4`, and `demo.mp3`.
3. Use media files you own or have permission to share.
4. Start the bot and run the `allfeatures` command.
5. Reply directly to the menu message with a number from `1` to `8`.

The example uses `fs.createReadStream()` for local media because it provides a readable stream with a filename extension the message helper can use to classify the attachment.

## More examples from the repository

- `commands/img.js` — send image URLs or images attached to a replied message.
- `commands/art.js` and `commands/imagine.js` — download generated image bytes with Axios and send a `Buffer` attachment.
- `commands/igDownload.js` — download a reel and send a readable file stream.
- `commands/song.js` — download audio to a temporary file, then send it as a readable stream.
- `commands/effect.js` — send a text effect using `message.effect(text, effect)`.
- `commands/music.js` — search for and send an Instagram music sticker using `message.musicSearch()` and `message.music()`.

## Troubleshooting

### Image arrives as the wrong type

Use a filename ending in `.png`, `.jpg`, or another correct image extension. For a Buffer attachment, set the correct `mimetype` and `name`.

### Video or audio fails

Make sure the file is valid and the extension or MIME type matches its actual format. Try sending a readable stream from a real `.mp4` or `.mp3` file.

### URL attachment fails

Use a direct, publicly accessible media URL rather than a webpage containing a player or HTML content. For better reliability, download the file and send it as a Buffer or readable stream.

### Effect fails

Check the effect name and confirm that the configured ICA server supports the operation.

### Music sticker fails

Inspect the results returned by `message.musicSearch()` and ensure the selected track contains a valid audio cluster ID. See `commands/music.js` for the repository's full normalization logic.

### Reply menu does not run

Reply directly to the menu message. The dispatcher uses the reply's message ID to match the registered handler, and the handler is consumed after one use.

### API method is unavailable

`igbot-api` is a compatibility client. The actual functionality depends on the configured remote ICA server.

## Credits

- **Project author:** Tanvir Ahmed (Tanvir143)
- **Original source:** Saifullah Al Neoaz (NKX)

Preserve upstream copyright and license notices when redistributing modified source code.

---

<div align="center">

**Built and maintained by Tanvir143**  
[GitHub Repository](https://github.com/143tanvir/igBot-143)

</div>
