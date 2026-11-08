function sleep(time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}


// Shape-agnostic: does any text field of this object say "Instagram User" / "Facebook user" (Instagram's placeholder for a dead account)?
function hasPlaceholder(obj, depth = 0) {
  if (obj == null || depth > 3) return false;
  if (typeof obj === "string") return /^\s*(instagram|facebook) user\s*$/i.test(obj);
  if (Array.isArray(obj)) return obj.some(x => hasPlaceholder(x, depth + 1));
  if (typeof obj === "object") return Object.values(obj).some(x => hasPlaceholder(x, depth + 1));
  return false;
}

// Members as Instagram lists them in the thread itself (the "People" list): id -> raw entry.
function threadEntries(threadInfo) {
  const map = new Map();
  const add = (entry, keyHint) => {
    if (!entry || typeof entry !== "object") return;
    const id = String(entry.id ?? entry.userID ?? entry.userId ?? entry.pk ?? entry.user_id ?? keyHint ?? "");
    if (id) map.set(id, entry);
  };
  for (const key of ["userInfo", "users", "participants", "members"]) {
    const v = threadInfo[key];
    if (Array.isArray(v)) v.forEach(e => add(e));
    else if (v && typeof v === "object") Object.entries(v).forEach(([k, e]) => add(e, k));
  }
  return map;
}

// "dead" = Instagram answers normally but has no profile for this id (deactivated/deleted).
// Any error that is not clearly "not found" (rate limit, network, login) is "unknown", never "dead",
// so a hiccup can never get a real member kicked.
async function checkDead(api, id) {
  try {
    const res = await api.getUserInfo(id);
    const u = res && (res[id] || res[String(id)]);
    if (!u) return "dead";
    if (hasPlaceholder(u)) return "dead";
    // Instagram shows deactivated/deleted members as the placeholder "Instagram User" (grey avatar).
    const name = String(u.name || u.fullName || u.firstName || "").trim();
    if (!name || /^(instagram|facebook) user$/i.test(name) || name === `User ${id}`) return "dead";
    const hasName = true;
    const hasHandle = true;
    return hasName || hasHandle ? "alive" : "dead";
  } catch (e) {
    const m = String((e && (e.message || e.error)) || e);
    if (/not\s*found|404|does not exist|doesn'?t exist|no such user|user.*unavailable|deactivated/i.test(m)) return "dead";
    return "unknown";
  }
}

module.exports = {
  config: {
    name: "filteruser",
    version: "2.2",
    author: "CRX Shihab",
    countDown: 5,
    role: 1,
    description: {
      en: "filter group members by number of messages or locked account"
    },
    category: "box chat",
    guide: {
      en: "   {pn} [<number of messages> | die]"
    }
  },

  langs: {
    en: {
      needAdmin: "⚠️ | Please add the bot as a group admin to use this command",
      botNotAdmin: "🤖 | Bot is not an admin in this group. Please make bot admin first.",
      confirm: "⚠️ | Are you sure you want to delete group members with less than %1 messages?\nReact to this message to confirm",
      kickByBlock: "✅ | Successfully removed %1 members with locked accounts",
      kickByMsg: "✅ | Successfully removed %1 members with less than %2 messages",
      kickError: "❌ | An error occurred and could not kick %1 members:\n%2",
      noBlock: "✅ | There are no members with locked accounts",
      noMsg: "✅ | There are no members with less than %1 messages",
      noMembers: "✅ | No members to remove.",
      dieInvalid: "❌ | Invalid command. Use: filteruser <number> or filteruser die",
      notAdminMsg: "❌ | You are not a group admin. Only admins can use this command."
    }
  },

  onStart: async function ({ api, args, message, event, commandName, getLang }) {
    const { senderID, threadID } = event;

    const threadInfo = await api.getThreadInfo(threadID);
    const botID = api.getCurrentUserID();
    const isBotAdmin = threadInfo.adminIDs.some(admin => admin.id == botID);
    const isUserAdmin = threadInfo.adminIDs.some(admin => admin.id == senderID);

    if (!isUserAdmin) {
      return message.reply(getLang("notAdminMsg"));
    }

    if (!args[0]) {
      return message.reply(getLang("dieInvalid"));
    }

    // `filteruser debug <userID>`: show exactly what Instagram returns for one member (to tune dead detection)
    if (args[0].toLowerCase() === "debug") {
      const id = String(args[1] || event.messageReply?.senderID || "");
      if (!id) return message.reply("❌ | Use: filteruser debug <user id> (or reply to a user's message)");
      try {
        const raw = await api.getUserInfo(id);
        const entry = threadEntries(threadInfo).get(id);
        return message.reply(`${id} → ${entry && hasPlaceholder(entry) ? "dead" : await checkDead(api, id)}\nTHREAD ENTRY: ${JSON.stringify(entry || null).slice(0, 500)}\nUSERINFO: ${JSON.stringify(raw).slice(0, 500)}\nthreadInfo keys: ${Object.keys(threadInfo).join(",").slice(0, 200)}`);
      } catch (e) {
        return message.reply(`${id} → error: ${String((e && e.message) || e).slice(0, 300)}`);
      }
    }

    if (!isBotAdmin) {
      return message.reply(getLang("botNotAdmin"));
    }

    if (!isNaN(args[0])) {
      const minMsg = Number(args[0]);
      if (minMsg < 1) {
        return message.reply("❌ | Minimum message count must be greater than 0.");
      }
      message.reply(getLang("confirm", minMsg), (err, info) => {
        global.GoatBot.onReaction.set(info.messageID, {
          author: senderID,
          messageID: info.messageID,
          minimum: minMsg,
          commandName
        });
      });
    } else if (args[0].toLowerCase() === "die") {
      // Instagram has no "locked account" flag (that is a Facebook field), so a dead
      // account = deactivated / deleted: Instagram no longer returns any profile for it.
      const skip = new Set([String(botID), ...threadInfo.adminIDs.map(a => String(a.id))]);
      const ids = (threadInfo.participantIDs || []).map(String).filter(id => !skip.has(id));
      if (!ids.length) return message.reply(getLang("noBlock"));

      await message.reply(`🔎 | Checking ${ids.length} members for dead (deactivated/deleted) accounts...`);

      const entries = threadEntries(threadInfo);
      const dead = [];
      let unchecked = 0, failStreak = 0;
      for (const id of ids) {
        const entry = entries.get(id);
        const res = entry && hasPlaceholder(entry) ? "dead" : await checkDead(api, id);
        if (res === "dead") { dead.push(id); failStreak = 0; }
        else if (res === "alive") failStreak = 0;
        else { unchecked++; failStreak++; }
        if (failStreak >= 4) { unchecked += ids.length - ids.indexOf(id) - 1; break; } // Instagram is rate limiting: stop, never guess
        await sleep(500);
      }

      if (!dead.length) {
        let msg = getLang("noBlock");
        if (unchecked) msg += `\n⚠️ | ${unchecked} members could not be checked (Instagram rate limit). Try again in a few minutes.`;
        return message.reply(msg);
      }

      // Remove them straight away (no confirmation step).
      await message.reply(`🧹 | Found ${dead.length} dead account(s). Removing...`);
      const okIds = [], failed = [];
      for (const id of dead) {
        try { await api.removeUserFromGroup(id, threadID); okIds.push(id); }
        catch (e) { failed.push(id); }
        await sleep(700);
      }
      let out = "";
      if (okIds.length) out += `${getLang("kickByBlock", okIds.length)}\n`;
      if (failed.length) out += `${getLang("kickError", failed.length, failed.join("\n"))}\n`;
      if (unchecked) out += `⚠️ | ${unchecked} members could not be checked (Instagram rate limit). Run the command again later.\n`;
      return message.reply(out || getLang("noMembers"));
    } else {
      message.reply(getLang("dieInvalid"));
    }
  },

  onReaction: async function ({ api, Reaction, event, message, getLang }) {
    const { minimum = 1, author, dead } = Reaction;
    const { senderID, threadID } = event;
    if (event.userID != author) return;

    const threadInfo = await api.getThreadInfo(threadID);
    const botID = api.getCurrentUserID();
    const isUserAdmin = threadInfo.adminIDs.some(admin => admin.id == senderID);
    const isBotAdmin = threadInfo.adminIDs.some(admin => admin.id == botID);

    if (!isUserAdmin) {
      return message.reply(getLang("notAdminMsg"));
    }

    if (!isBotAdmin) {
      return message.reply(getLang("botNotAdmin"));
    }

    if (Array.isArray(dead)) {
      const okIds = [], failed = [];
      for (const id of dead) {
        try { await api.removeUserFromGroup(id, threadID); okIds.push(id); }
        catch (e) { failed.push(id); }
        await sleep(700);
      }
      let out = "";
      if (okIds.length) out += `${getLang("kickByBlock", okIds.length)}\n`;
      if (failed.length) out += `${getLang("kickError", failed.length, failed.join("\n"))}\n`;
      return message.reply(out || getLang("noMembers"));
    }

    const adminIDs = threadInfo.adminIDs.map(admin => admin.id);
    const membersCountLess = threadInfo.userInfo.filter(member =>
      member.type === "User" &&
      member.count < minimum &&
      member.id != botID &&
      !adminIDs.includes(member.id)
    );

    if (membersCountLess.length === 0) {
      return message.reply(getLang("noMembers"));
    }

    const errors = [];
    const success = [];
    for (const member of membersCountLess) {
      try {
        await api.removeUserFromGroup(member.id, threadID);
        success.push(member.id);
      } catch (e) {
        errors.push(member.name);
      }
      await sleep(700);
    }

    let msg = "";
    if (success.length > 0)
      msg += `${getLang("kickByMsg", success.length, minimum)}\n`;
    if (errors.length > 0)
      msg += `${getLang("kickError", errors.length, errors.join("\n"))}\n`;
    if (msg === "")
      msg += getLang("noMsg", minimum);
    message.reply(msg);
  }
};
    
