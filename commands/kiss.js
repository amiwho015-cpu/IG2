/**
 * File Name: kiss.js
 * ICA: igbot-api
 * Author: Tanvir Ahmed (Tanvir143)
 * GitHub: www.github.com/143tanvir
 */

"use strict";

const axios = require("axios");
const { Jimp } = require("jimp");
const { resolveProfile } = require("../src/utils");

const TEMPLATE_URL = "https://i.imgur.com/3laJwc1.jpg";
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

const GAY_MESSAGE =
  "🌈 Gay Detected!\nদুইজনই ছেলে, তাই kiss image তৈরি করা হয়নি।";

const LESBIAN_MESSAGE =
  "🌈 Lesbian Detected!\nদুইজনই মেয়ে, তাই kiss image তৈরি করা হয়নি।";

const REGISTER_MESSAGE =
  "❌ অন্তত একজনের gender register থাকতে হবে।\n.pair boy অথবা .pair girl ব্যবহার করো।";

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
  const matches =
    String(body || "").match(/@([a-zA-Z0-9._]+)/g) || [];

  return [...new Set(matches.map(name => name.slice(1)))];
}

async function resolveUsername(username, api) {
  const cleanName = String(username || "")
    .trim()
    .replace(/^@+/, "")
    .replace(/[,\s]+$/, "");

  if (!cleanName || typeof api.getUserID !== "function") {
    return null;
  }

  const result = await new Promise((resolve, reject) => {
    let settled = false;

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve(value);
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
      return normalizeID(first.userID || first.id) || null;
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

async function getTargetIDs(event, api) {
  const senderID = normalizeID(event.senderID);
  const mentions = getMentionIDs(event);

  if (mentions.length >= 2) {
    return mentions.slice(0, 2);
  }

  if (mentions.length === 1) {
    return [senderID, mentions[0]];
  }

  const usernames = extractUsernames(event.body);

  if (usernames.length >= 2) {
    const ids = await Promise.all(
      usernames.slice(0, 2).map(name =>
        resolveUsername(name, api)
      )
    );

    if (ids.every(Boolean)) return ids;

    throw new Error("দুইজনের username resolve করা যায়নি।");
  }

  if (usernames.length === 1) {
    const targetID = await resolveUsername(usernames[0], api);

    if (!targetID) {
      throw new Error(
        `@${usernames[0]} username থেকে user ID পাওয়া যায়নি।`
      );
    }

    return [senderID, targetID];
  }

  const replyID = getReplyID(event);

  if (replyID) return [senderID, replyID];

  return [];
}

function reactToCommand(api, event) {
  if (
    typeof api.setMessageReaction !== "function" ||
    !event.messageID
  ) {
    return;
  }

  try {
    api.setMessageReaction(
      "🌚",
      event.messageID,
      error => {
        if (error) {
          console.warn(
            "[Tanvir143 | igBot] Kiss reaction failed:",
            error.message || error
          );
        }
      },
      true
    );
  } catch (error) {
    console.warn(
      "[Tanvir143 | igBot] Kiss reaction failed:",
      error.message || error
    );
  }
}

async function getPairCollection() {
  const database = global.database;

  if (!database) {
    throw new Error("global.database পাওয়া যায়নি।");
  }

  if (database.ready) {
    await database.ready;
  }

  const usersCollection =
    database.users && database.users.collection;

  if (
    !usersCollection ||
    !usersCollection.db ||
    typeof usersCollection.db.collection !== "function"
  ) {
    throw new Error("MongoDB collection পাওয়া যায়নি।");
  }

  return usersCollection.db.collection("PairData");
}

async function getRegisteredGenders(threadID) {
  const collection = await getPairCollection();

  const data = await collection.findOne({
    _id: String(threadID)
  });

  return {
    boy: new Set((data?.boy || []).map(normalizeID)),
    girl: new Set((data?.girl || []).map(normalizeID))
  };
}

function getGender(userID, genderData) {
  const isBoy = genderData.boy.has(userID);
  const isGirl = genderData.girl.has(userID);

  if (isBoy && isGirl) {
    throw new Error(
      `User ${userID} boy এবং girl দুই list-এই আছে।`
    );
  }

  if (isBoy) return "boy";
  if (isGirl) return "girl";

  return null;
}

async function getProfileImage(userID, event, api) {
  const fakeEvent = {
    ...event,
    senderID: String(userID),
    messageReply: null,
    mentions: {}
  };

  const profile = await resolveProfile(
    [String(userID)],
    fakeEvent,
    api
  );

  const profileData = Array.isArray(profile)
    ? profile[0]
    : profile;

  if (!profileData) {
    throw new Error(
      `User ${userID}-এর profile পাওয়া যায়নি।`
    );
  }

  const imageURL =
    profileData.profilePicture ||
    profileData.avatar ||
    profileData.photoURL ||
    profileData.profilePic;

  if (
    typeof imageURL !== "string" ||
    !/^https?:\/\//i.test(imageURL)
  ) {
    throw new Error(
      `User ${userID}-এর profile picture URL পাওয়া যায়নি।`
    );
  }

  const response = await axios.get(imageURL, {
    responseType: "arraybuffer",
    timeout: 15000,
    maxContentLength: MAX_IMAGE_SIZE,
    maxBodyLength: MAX_IMAGE_SIZE,
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });

  const buffer = Buffer.from(response.data);

  if (!buffer.length) {
    throw new Error(
      `User ${userID}-এর profile picture খালি।`
    );
  }

  return buffer;
}

async function downloadImage(url) {
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 15000,
    maxContentLength: MAX_IMAGE_SIZE,
    maxBodyLength: MAX_IMAGE_SIZE,
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });

  return Buffer.from(response.data);
}

async function loadTemplate() {
  const buffer = await downloadImage(TEMPLATE_URL);
  const template = await Jimp.read(buffer);

  if (!template.bitmap.width || !template.bitmap.height) {
    throw new Error("Kiss template-এর dimensions পাওয়া যায়নি।");
  }

  return template;
}

/**
 * Jimp v1.6.1 compatible circular avatar.
 * Transparent corners are preserved when compositing.
 */
async function loadAvatar(buffer, size) {
  const image = await Jimp.read(buffer);

  image.cover({
    w: size,
    h: size
  });

  const circle = new Jimp({
    width: size,
    height: size,
    color: 0x00000000
  });

  const source = image.bitmap.data;
  const target = circle.bitmap.data;

  const center = (size - 1) / 2;
  const radius = size / 2;
  const radiusSquared = radius * radius;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - center;
      const dy = y - center;

      if (dx * dx + dy * dy <= radiusSquared) {
        const index = (y * size + x) * 4;

        target[index] = source[index];
        target[index + 1] = source[index + 1];
        target[index + 2] = source[index + 2];
        target[index + 3] = source[index + 3];
      }
    }
  }

  return circle;
}

async function createKissImage(
  template,
  boyBuffer,
  girlBuffer
) {
  const width = template.bitmap.width;
  const height = template.bitmap.height;

  const avatarSize = Math.round(
    Math.min(width, height) * 0.34
  );

  // Girl: upper yellow marker.
  const girlX = Math.round(
    width * 0.434 - avatarSize / 2
  );

  const girlY = Math.round(
    height * 0.134 - avatarSize / 2
  );

  // Boy: lower-left yellow marker.
  const boyX = Math.round(
    width * 0.118 - avatarSize / 2
  );

  const boyY = Math.round(
    height * 0.542 - avatarSize / 2
  );

  const [girlAvatar, boyAvatar] = await Promise.all([
    loadAvatar(girlBuffer, avatarSize),
    loadAvatar(boyBuffer, avatarSize)
  ]);

  template.composite(girlAvatar, girlX, girlY);
  template.composite(boyAvatar, boyX, boyY);

  return template.getBuffer("image/png");
}

module.exports.config = {
  name: "kiss",
  aliases: ["k"],
  version: "1.5.1",
  author: "Tanvir Ahmed (Tanvir143)",
  cooldown: 5,
  role: 0,
  shortDescription: "Create a kiss image",
  longDescription:
    "Create a kiss image using registered genders and profile pictures.",
  category: "users cmd",
  guide: {
    en:
      "{pn} @mention\n" +
      "{pn} @username\n" +
      "{pn} @user1 @user2\n" +
      "Reply to a message with {pn}"
  }
};

module.exports.onStart = async function ({ api, event }) {
  const threadID = event.threadID;
  const messageID = event.messageID;

  reactToCommand(api, event);

  try {
    const targets = await getTargetIDs(event, api);

    if (
      targets.length !== 2 ||
      !targets[0] ||
      !targets[1]
    ) {
      return api.sendMessage(
        "💋 ব্যবহার:\n" +
          ".kiss @mention\n" +
          ".kiss @username\n" +
          ".kiss @user1 @user2\n" +
          "অথবা কারও message-এ reply দিয়ে .kiss লেখো।",
        threadID,
        messageID
      );
    }

    if (targets[0] === targets[1]) {
      return api.sendMessage(
        "❌ একই user-এর সঙ্গে kiss image তৈরি করা যাবে না।",
        threadID,
        messageID
      );
    }

    const genderData = await getRegisteredGenders(threadID);

    let gender1 = getGender(targets[0], genderData);
    let gender2 = getGender(targets[1], genderData);

    if (!gender1 && !gender2) {
      return api.sendMessage(
        REGISTER_MESSAGE,
        threadID,
        messageID
      );
    }

    // Infer the opposite gender for this command only.
    if (gender1 && !gender2) {
      gender2 = gender1 === "boy" ? "girl" : "boy";
    } else if (!gender1 && gender2) {
      gender1 = gender2 === "boy" ? "girl" : "boy";
    }

    if (gender1 === gender2) {
      return api.sendMessage(
        gender1 === "boy"
          ? GAY_MESSAGE
          : LESBIAN_MESSAGE,
        threadID,
        messageID
      );
    }

    const boyID =
      gender1 === "boy" ? targets[0] : targets[1];

    const girlID =
      gender1 === "girl" ? targets[0] : targets[1];

    const [boyBuffer, girlBuffer, template] =
      await Promise.all([
        getProfileImage(boyID, event, api),
        getProfileImage(girlID, event, api),
        loadTemplate()
      ]);

    const imageBuffer = await createKissImage(
      template,
      boyBuffer,
      girlBuffer
    );

    return api.sendMessage(
      {
        body: "UmmmmmmAhhh🫦🌚..",
        attachment: imageBuffer
      },
      threadID,
      messageID
    );
  } catch (error) {
    console.error(
      "[Tanvir143 | igBot] Kiss error:",
      error?.stack || error
    );

    const errorMessage = error?.response?.status
      ? `HTTP ${error.response.status}`
      : error?.message || String(error);

    return api.sendMessage(
      `❌ Kiss image error: ${errorMessage}`,
      threadID,
      messageID
    );
  }
};
