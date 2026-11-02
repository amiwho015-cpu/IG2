/**
 * File Name: gender.js
 * ICA: igbot-api
 * Author: Tanvir Ahmed (Tanvir143)
 * GitHub: www.github.com/143tanvir
 */

"use strict";

const MAX_TARGETS = 50;

module.exports.config = {
  name: "gender",
  aliases: ["setgender", "g"],
  version: "2.1.0",
  author: "Tanvir Ahmed ",
  cooldown: 3,
  role: 0,
  shortDescription: "Register and manage gender",
  longDescription: "Manage group gender registrations using MongoDB",
  category: "Users Cmd",
  guide: "{pn} boy | girl | list"
};

function normalizeID(id) {
  return id == null ? "" : String(id).trim();
}

function getArgs(event) {
  return String(event.body || "")
    .trim()
    .split(/\s+/)
    .slice(1);
}

async function getCollection() {
  const database = global.database;

  if (!database) {
    throw new Error("global.database পাওয়া যায়নি।");
  }

  if (database.ready) {
    await database.ready;
  }

  const usersCollection = database.users?.collection;

  if (
    !usersCollection ||
    !usersCollection.db ||
    typeof usersCollection.db.collection !== "function"
  ) {
    throw new Error("MongoDB collection পাওয়া যায়নি।");
  }

  return usersCollection.db.collection("PairData");
}

async function ensureGroup(collection, threadID) {
  await collection.updateOne(
    { _id: normalizeID(threadID) },
    {
      $setOnInsert: {
        boy: [],
        girl: []
      }
    },
    { upsert: true }
  );
}

async function getGroupData(collection, threadID) {
  const data = await collection.findOne({
    _id: normalizeID(threadID)
  });

  return {
    boy: Array.isArray(data?.boy)
      ? data.boy.map(normalizeID)
      : [],
    girl: Array.isArray(data?.girl)
      ? data.girl.map(normalizeID)
      : []
  };
}

function getMentionIDs(event) {
  return Object.keys(event.mentions || {})
    .map(normalizeID)
    .filter(Boolean);
}

function getUsernameTokens(args) {
  return args
    .filter(arg => /^@[\w.]+$/.test(arg))
    .map(arg => arg.replace(/^@+/, ""))
    .filter(Boolean);
}

async function resolveUsername(api, username) {
  if (!api || typeof api.getUserID !== "function") {
    return null;
  }

  return new Promise(resolve => {
    let finished = false;

    const finish = result => {
      if (finished) return;
      finished = true;

      if (!result || result instanceof Error) {
        return resolve(null);
      }

      if (Array.isArray(result)) {
        result = result[0];
      }

      if (typeof result === "string" || typeof result === "number") {
        return resolve(normalizeID(result) || null);
      }

      if (typeof result === "object") {
        const id =
          result.userID ??
          result.userId ??
          result.id ??
          result.uid;

        return resolve(id == null ? null : normalizeID(id));
      }

      resolve(null);
    };

    const timer = setTimeout(() => finish(null), 10000);

    const callback = (error, result) => {
      clearTimeout(timer);
      finish(error ? null : result);
    };

    try {
      const result = api.getUserID(username, callback);

      if (result && typeof result.then === "function") {
        result
          .then(value => {
            clearTimeout(timer);
            finish(value);
          })
          .catch(() => {
            clearTimeout(timer);
            finish(null);
          });
      } else if (
        typeof result === "string" ||
        typeof result === "number" ||
        Array.isArray(result)
      ) {
        clearTimeout(timer);
        finish(result);
      }
    } catch {
      clearTimeout(timer);
      finish(null);
    }
  });
}

async function resolveTargets(args, event, api) {
  const targets = new Set(getMentionIDs(event));

  if (event.messageReply?.senderID) {
    targets.add(normalizeID(event.messageReply.senderID));
  }

  const usernames = getUsernameTokens(args);

  for (const username of usernames) {
    const id = await resolveUsername(api, username);

    if (id) {
      targets.add(id);
    }
  }

  return [...targets].filter(Boolean);
}

function formatList(title, ids) {
  if (!ids.length) {
    return `${title}\n\nকেউ registered নেই।`;
  }

  return `${title} (${ids.length})\n\n` +
    ids.map((id, index) => `${index + 1}. ${id}`).join("\n");
}

module.exports.onStart = async function ({
  message,
  event,
  args,
  api
}) {
  const threadID = normalizeID(event.threadID);
  const senderID = normalizeID(event.senderID);

  const params = Array.isArray(args) && args.length
    ? args.map(String)
    : getArgs(event);

  const action = (params[0] || "").toLowerCase();
  const isRemove = (params[1] || "").toLowerCase() === "rmv";

  try {
    const collection = await getCollection();

    // Current group gender list
    if (
      action === "list" &&
      (params[1] || "").toLowerCase() !== "all"
    ) {
      const data = await getGroupData(collection, threadID);

      return message.reply(
        formatList("👦 Boy List", data.boy) +
        "\n\n" +
        formatList("👧 Girl List", data.girl)
      );
    }

    // All groups gender list
    if (
      action === "list" &&
      (params[1] || "").toLowerCase() === "all"
    ) {
      const documents = await collection.find({}).toArray();
      const boys = new Set();
      const girls = new Set();

      for (const doc of documents) {
        for (const id of Array.isArray(doc.boy) ? doc.boy : []) {
          boys.add(normalizeID(id));
        }

        for (const id of Array.isArray(doc.girl) ? doc.girl : []) {
          girls.add(normalizeID(id));
        }
      }

      return message.reply(
        formatList("🌍 All Boys", [...boys].filter(Boolean)) +
        "\n\n" +
        formatList("🌍 All Girls", [...girls].filter(Boolean))
      );
    }

    if (!["boy", "girl"].includes(action)) {
      return message.reply(
        "📌 Gender Command\n\n" +
        ".gender boy\n" +
        ".gender girl\n" +
        ".gender boy @username\n" +
        ".gender girl @username\n" +
        ".gender boy rmv @username\n" +
        ".gender girl rmv @username\n" +
        ".gender list\n" +
        ".gender list all"
      );
    }

    const gender = action;
    const otherGender = gender === "boy" ? "girl" : "boy";

    const targetArgs = params.slice(isRemove ? 2 : 1);
    let targets = await resolveTargets(targetArgs, event, api);

    const hasExplicitTarget =
      getMentionIDs(event).length > 0 ||
      getUsernameTokens(targetArgs).length > 0 ||
      Boolean(event.messageReply?.senderID);

    if (!targets.length) {
      if (hasExplicitTarget) {
        return message.reply(
          "❌ Target user পাওয়া যায়নি। @mention অথবা message reply ব্যবহার করো।"
        );
      }

      targets = [senderID];
    }

    if (targets.length > MAX_TARGETS) {
      return message.reply(
        `❌ একবারে সর্বোচ্চ ${MAX_TARGETS} জনকে target করা যাবে।`
      );
    }

    // FIX: Create the document separately to avoid conflicting updates.
    await ensureGroup(collection, threadID);

    const data = await getGroupData(collection, threadID);

    if (!isRemove) {
      const alreadyRegistered = [];
      const otherRegistered = [];

      for (const id of targets) {
        if (data[gender].includes(id)) {
          alreadyRegistered.push(id);
        } else if (data[otherGender].includes(id)) {
          otherRegistered.push(id);
        }
      }

      if (alreadyRegistered.length || otherRegistered.length) {
        let reply = "❌ Gender registration করা যায়নি।";

        if (alreadyRegistered.length) {
          reply +=
            `\n\n${gender.toUpperCase()}-এ আগে থেকেই registered:\n` +
            alreadyRegistered.join("\n");
        }

        if (otherRegistered.length) {
          reply +=
            `\n\n${otherGender.toUpperCase()}-এ আগে থেকেই registered:\n` +
            otherRegistered.join("\n") +
            `\n\nআগে .gender ${otherGender} rmv @username দিয়ে remove করো।`;
        }

        return message.reply(reply);
      }

      // Add only after the document exists.
      await collection.updateOne(
        { _id: threadID },
        {
          $addToSet: {
            [gender]: { $each: targets }
          }
        }
      );

      return message.reply(
        `✅ ${gender.toUpperCase()} registration successful!\n` +
        `👥 Registered: ${targets.length} user(s)`
      );
    }

    // Remove selected users from the requested gender.
    const existingTargets = targets.filter(id =>
      data[gender].includes(id)
    );

    if (!existingTargets.length) {
      return message.reply(
        `ℹ️ এই group-এর ${gender.toUpperCase()} list-এ target user registered নেই।`
      );
    }

    await collection.updateOne(
      { _id: threadID },
      {
        $pull: {
          [gender]: { $in: existingTargets }
        }
      }
    );

    return message.reply(
      `✅ ${gender.toUpperCase()} registration remove করা হয়েছে।\n` +
      `👥 Removed: ${existingTargets.length} user(s)`
    );
  } catch (error) {
    console.error(
      "[Tanvir143 | igBot] gender.js error:",
      error
    );

    return message.reply(
      "❌ Gender command failed.\n" +
      "Error: " + String(error.message || error)
    );
  }
};
