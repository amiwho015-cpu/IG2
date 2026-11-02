/**
 * File Name: hack.js
 * ICA: igbot-api
 * Author: Tanvir Ahmed (Tanvir143)
 * GitHub: www.github.com/143tanvir
 */

"use strict";

const axios = require("axios");
const sharp = require("sharp");
const fontkit = require("fontkit");
const { resolveProfile } = require("../src/utils");

const TEMPLATE_URL = "https://i.imgur.com/a5kHNs2.png";
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

const USERNAME_FONT_SIZE = 62;
const USERNAME_EXTRA_DOWN = 20;
const AVATAR_EXTRA_SIZE = 44;

const REGULAR_FONT = fontkit.openSync(
  require.resolve("@fontsource/roboto/files/roboto-latin-400-normal.woff")
);

const BOLD_FONT = fontkit.openSync(
  require.resolve("@fontsource/roboto/files/roboto-latin-700-normal.woff")
);

function normalizeID(id) {
  return String(id || "").replace(/[^0-9]/g, "");
}

function getMentionIDs(event) {
  return [
    ...new Set(
      Object.keys(event.mentions || {})
        .map(normalizeID)
        .filter(Boolean)
    )
  ];
}

function getReplyID(event) {
  const reply = event.messageReply || {};
  return normalizeID(reply.senderID || reply.senderId || "");
}

function extractUsernames(body) {
  const matches = String(body || "").match(/@([a-zA-Z0-9._]+)/g) || [];
  return [...new Set(matches.map(name => name.slice(1)))];
}

async function resolveUsername(username, api) {
  const cleanName = String(username || "")
    .trim()
    .replace(/^@+/, "")
    .replace(/[\s,]+$/, "");

  if (!cleanName || typeof api.getUserID !== "function") {
    return null;
  }

  const result = await new Promise((resolve, reject) => {
    let settled = false;

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      error ? reject(error) : resolve(value);
    };

    try {
      const returned = api.getUserID(
        cleanName,
        (error, data) => {
          if (error) return finish(error);
          finish(null, data);
        }
      );

      if (returned && typeof returned.then === "function") {
        returned.then(
          value => finish(null, value),
          error => finish(error)
        );
      } else if (returned !== undefined && returned !== null) {
        finish(null, returned);
      }
    } catch (error) {
      finish(error);
    }
  });

  if (typeof result === "string" || typeof result === "number") {
    return normalizeID(result) || null;
  }

  if (Array.isArray(result) && result.length) {
    const first = result[0];

    if (typeof first === "string" || typeof first === "number") {
      return normalizeID(first) || null;
    }

    if (first && typeof first === "object") {
      return normalizeID(
        first.userID || first.userId || first.id
      ) || null;
    }
  }

  if (result && typeof result === "object") {
    return normalizeID(
      result.userID ||
      result.userId ||
      result.id ||
      result.ID
    ) || null;
  }

  return null;
}

async function getTarget(event, api) {
  const mentions = getMentionIDs(event);

  if (mentions.length) {
    return mentions[0];
  }

  const usernames = extractUsernames(event.body);

  if (usernames.length) {
    const id = await resolveUsername(usernames[0], api);

    if (!id) {
      throw new Error(
        `@${usernames[0]} username থেকে user ID পাওয়া যায়নি।`
      );
    }

    return id;
  }

  return getReplyID(event) || null;
}

function getUserInfo(api, userID) {
  return new Promise(resolve => {
    if (!api || typeof api.getUserInfo !== "function") {
      return resolve(null);
    }

    let settled = false;

    const finish = value => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    try {
      const returned = api.getUserInfo(
        String(userID),
        (error, data) => finish(error ? null : data)
      );

      if (returned && typeof returned.then === "function") {
        returned.then(finish, () => finish(null));
      } else if (returned && typeof returned === "object") {
        finish(returned);
      }
    } catch (_) {
      finish(null);
    }
  });
}

async function getProfileData(userID, event, api) {
  let profile = null;

  try {
    const result = await resolveProfile(
      [String(userID)],
      {
        ...event,
        senderID: String(userID),
        messageReply: null,
        mentions: {}
      },
      api
    );

    profile = Array.isArray(result) ? result[0] : result;
  } catch (error) {
    console.warn(
      "[Tanvir143 | igBot] resolveProfile warning:",
      error.message || error
    );
  }

  const infoResult = await getUserInfo(api, userID);

  const info = infoResult && (
    infoResult[String(userID)] ||
    infoResult[userID] ||
    infoResult
  );

  return {
    ...(info && typeof info === "object" ? info : {}),
    ...(profile && typeof profile === "object" ? profile : {})
  };
}

function getUsername(profile = {}, userID) {
  let username =
    profile.vanity ||
    profile.username ||
    profile.userName ||
    profile.instagramUsername ||
    profile.instagram_username ||
    profile.handle ||
    profile.user_name ||
    "";

  username = String(username || "").trim();

  if (username.includes("/")) {
    username = username.split("/").filter(Boolean).pop() || "";
  }

  username = username
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .trim();

  if (
    !username ||
    username === "undefined" ||
    username === "null"
  ) {
    return String(userID);
  }

  return username;
}

function getAvatarURL(profile = {}) {
  return (
    profile.profilePicture ||
    profile.profilePic ||
    profile.profilePicUrl ||
    profile.thumbSrc ||
    profile.avatar ||
    profile.photoURL ||
    profile.photoUrl ||
    profile.image ||
    profile.picture ||
    null
  );
}

async function downloadImage(url) {
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 20000,
    maxContentLength: MAX_IMAGE_SIZE,
    maxBodyLength: MAX_IMAGE_SIZE,
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });

  const buffer = Buffer.from(response.data);

  if (!buffer.length) {
    throw new Error("Image download খালি এসেছে।");
  }

  if (buffer.length > MAX_IMAGE_SIZE) {
    throw new Error("Image 10 MB-এর বেশি।");
  }

  return buffer;
}

async function getAvatarBuffer(profile) {
  const imageURL = getAvatarURL(profile);

  if (
    typeof imageURL !== "string" ||
    !/^https?:\/\//i.test(imageURL)
  ) {
    throw new Error("Profile picture URL পাওয়া যায়নি।");
  }

  return downloadImage(imageURL);
}

function textWidth(value, font, size) {
  const layout = font.layout(String(value || ""));

  return (
    layout.glyphs.reduce(
      (sum, glyph) => sum + glyph.advanceWidth,
      0
    ) * size / font.unitsPerEm
  );
}

/**
 * Render actual font glyph paths.
 * SVG markup must remain inside a template literal.
 */
function makeText(
  value,
  x,
  baseline,
  size,
  color,
  bold = true,
  anchor = "middle"
) {
  const font = bold ? BOLD_FONT : REGULAR_FONT;
  const content = String(value || "");
  const layout = font.layout(content);
  const scale = size / font.unitsPerEm;
  const width = textWidth(content, font, size);

  let cursorX = x;

  if (anchor === "middle") {
    cursorX -= width / 2;
  }

  if (anchor === "end") {
    cursorX -= width;
  }

  const paths = [];

  for (const glyph of layout.glyphs) {
    const pathData = glyph.path.toSVG();

    if (pathData) {
      paths.push(
        `<path d="${pathData}" transform="translate(${cursorX.toFixed(2)},${baseline}) scale(${scale},-${scale})"/>`
      );
    }

    cursorX += glyph.advanceWidth * scale;
  }

  return `<g fill="${color}">${paths.join("")}</g>`;
}

function makeFittedText(
  value,
  x,
  baseline,
  maxWidth,
  maxSize,
  color,
  bold = true,
  anchor = "middle"
) {
  const font = bold ? BOLD_FONT : REGULAR_FONT;

  let content = String(value || "");
  let size = maxSize;

  while (
    content &&
    textWidth(content, font, size) > maxWidth &&
    size > 10
  ) {
    size -= 1;
  }

  if (textWidth(content, font, size) > maxWidth) {
    while (
      content.length > 3 &&
      textWidth(content + "...", font, size) > maxWidth
    ) {
      content = content.slice(0, -1);
    }

    content += "...";
  }

  return makeText(
    content,
    x,
    baseline,
    size,
    color,
    bold,
    anchor
  );
}

async function createHackImage(
  templateBuffer,
  avatarBuffer,
  username
) {
  const metadata = await sharp(templateBuffer).metadata();
  const width = metadata.width;
  const height = metadata.height;

  if (!width || !height) {
    throw new Error(
      "Template image-এর dimensions পাওয়া যায়নি।"
    );
  }

  const avatarSize =
    Math.round(width * 0.22) + AVATAR_EXTRA_SIZE;

  const centerX = Math.round(width * 0.5);
  const centerY = Math.round(height * 0.446);

  const circleMask = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg"
         width="${avatarSize}"
         height="${avatarSize}">
      <circle
        cx="${avatarSize / 2}"
        cy="${avatarSize / 2}"
        r="${avatarSize / 2}"
        fill="#ffffff"
      />
    </svg>
  `);

  const circularAvatar = await sharp(avatarBuffer)
    .rotate()
    .resize(avatarSize, avatarSize, {
      fit: "cover",
      position: "centre"
    })
    .composite([
      {
        input: circleMask,
        blend: "dest-in"
      }
    ])
    .png()
    .toBuffer();

  const avatarX = Math.round(centerX - avatarSize / 2);
  const avatarY = Math.round(centerY - avatarSize / 2);

  const usernameBaseline =
    centerY +
    Math.round(avatarSize / 2) +
    USERNAME_FONT_SIZE +
    12 +
    USERNAME_EXTRA_DOWN;

  const usernameSVG = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg"
         width="${width}"
         height="${height}"
         viewBox="0 0 ${width} ${height}">
      ${makeFittedText(
        username,
        centerX,
        usernameBaseline,
        Math.round(width * 0.84),
        USERNAME_FONT_SIZE,
        "#FFFFFF",
        true,
        "middle"
      )}
    </svg>
  `);

  return sharp(templateBuffer)
    .composite([
      {
        input: circularAvatar,
        left: avatarX,
        top: avatarY
      },
      {
        input: usernameSVG,
        left: 0,
        top: 0
      }
    ])
    .png()
    .toBuffer();
}

function setReaction(api, event, emoji) {
  if (
    typeof api.setMessageReaction !== "function" ||
    !event.messageID
  ) {
    return;
  }

  try {
    api.setMessageReaction(
      emoji,
      event.messageID,
      error => {
        if (error) {
          console.warn(
            "[Tanvir143 | igBot] Reaction failed:",
            error.message || error
          );
        }
      },
      true
    );
  } catch (error) {
    console.warn(
      "[Tanvir143 | igBot] Reaction failed:",
      error.message || error
    );
  }
}

module.exports.config = {
  name: "hack",
  aliases: ["ighack"],
  version: "1.1.0",
  author: "Tanvir Ahmed (Tanvir143)",
  cooldown: 5,
  role: 0,
  shortDescription: "Create a funny fake Instagram login image",
  longDescription:
    "Creates a joke image using a user's profile picture.",
  category: "users cmd",
  guide: {
    en:
      "{pn} @mention\n" +
      "{pn} @username\n" +
      "Reply to a message with {pn}"
  }
};

module.exports.onStart = async function ({ api, event }) {
  const threadID = event.threadID;
  const originalMessageID = event.messageID;

  setReaction(api, event, "🎭");

  try {
    const targetID = await getTarget(event, api);

    if (!targetID) {
      return api.sendMessage(
        "🎭 ব্যবহার:\n" +
        ".hack @mention\n" +
        ".hack @username\n" +
        "অথবা কারও message-এ reply দিয়ে .hack লেখো।",
        threadID,
        originalMessageID
      );
    }

    const profile = await getProfileData(
      targetID,
      event,
      api
    );

    const username = getUsername(profile, targetID);

    const [avatarBuffer, templateBuffer] = await Promise.all([
      getAvatarBuffer(profile),
      downloadImage(TEMPLATE_URL)
    ]);

    const imageBuffer = await createHackImage(
      templateBuffer,
      avatarBuffer,
      username
    );

    api.sendMessage(
      {
        body: "",
        attachment: imageBuffer
      },
      threadID,
      (error, info) => {
        if (error) {
          console.error(
            "[Tanvir143 | igBot] Hack image send failed:",
            error.message || error
          );
          return;
        }

        if (info && info.messageID) {
          setReaction(
            api,
            {
              ...event,
              messageID: info.messageID
            },
            "✅"
          );
        }

        setTimeout(() => {
          api.sendMessage(
            "🎭 Hacked Successfull",
            threadID
          );
        }, 1000);
      }
    );
  } catch (error) {
    console.error(
      "[Tanvir143 | igBot] Hack command error:",
      error.stack || error
    );

    return api.sendMessage(
      `❌ Hack image তৈরি করা যায়নি: ${error.message || error}`,
      threadID,
      originalMessageID
    );
  }
};
