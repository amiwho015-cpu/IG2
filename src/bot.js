
/**
 * File Name: bot.js
 * ICA: igbot-api
 * Author: Tanvir Ahmed (Tanvir143)
 * GitHub: www.github.com/143tanvir
 * WhatsApp: +8801750079773
 * Note: Project metadata only; original source credits and license notices are retained.
 */

"use strict";

const log = require("./logger");
const { loadAccount } = require("./config");
const { createDatabase } = require("./database");
const { createRegistry, loadAll } = require("./commandLoader");
const { createDispatcher } = require("./dispatcher");
const { createOnlineStatus } = require("./onlineStatus");
const ica = require("../Tanvir143/ica");

function firstArray(...candidates) {
  for (const value of candidates) {
    if (Array.isArray(value)) return value;
  }
  return null;
}

function asList(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function getID(value) {
  if (value == null) return "";
  if (typeof value !== "object") return String(value);

  const id =
    value.userID ||
    value.userId ||
    value.user_id ||
    value.userFbId ||
    value.userFbID ||
    value.participantID ||
    value.participantId ||
    value.participant_id ||
    value.participantFbId ||
    value.leftParticipantFbId ||
    value.id ||
    value.pk ||
    "";

  return id == null ? "" : String(id);
}

function normalizeEvent(event) {
  if (!event || typeof event !== "object") return event;

  const normalized = Object.assign({}, event);

  if (Array.isArray(normalized.attachments)) {
    normalized.attachments = normalized.attachments.map(att => {
      if (!att || typeof att !== "object") return att;

      const type =
        att.type === "image"
          ? "photo"
          : att.type === "gif"
            ? "animated_image"
            : att.type;

      return Object.assign({}, att, { type });
    });
  }

  if (normalized.repliedToMessage) {
    const replied = normalized.repliedToMessage;

    normalized.messageReply = {
      messageID: replied.messageID || null,
      senderID:
        replied.senderID != null ? String(replied.senderID) : null,
      body: replied.body != null ? String(replied.body) : "",
      attachments: Array.isArray(replied.attachments)
        ? replied.attachments
        : [],
      timestamp: replied.timestamp || null
    };

    if (normalized.type === "message") {
      normalized.type = "message_reply";
    }
  }

  if (normalized.senderID != null && normalized.userID == null) {
    normalized.userID = normalized.senderID;
  }

  if (normalized.userID != null && normalized.senderID == null) {
    normalized.senderID = normalized.userID;
  }

  const actionData =
    normalized.logMessageData ||
    normalized.log_message_data ||
    {};

  const actionLog =
    normalized.action_log ||
    normalized.actionLog ||
    (normalized.message &&
      (normalized.message.action_log ||
        normalized.message.actionLog)) ||
    {};

  const logMessageType = String(
    normalized.logMessageType ||
    normalized.log_message_type ||
    ""
  ).toLowerCase();

  const actionText = [
    normalized.type,
    normalized.action,
    normalized.actionType,
    normalized.action_type,
    normalized.eventType,
    normalized.event_type,
    normalized.logMessageType,
    normalized.log_message_type,
    actionLog.action,
    actionLog.action_type,
    actionLog.actionType,
    actionLog.type,
    actionLog.description,
    actionLog.text
  ]
    .filter(value => value != null)
    .map(String)
    .join(" ")
    .toLowerCase();

  const addKeys = [
    "userIDs",
    "userIds",
    "participantIDs",
    "participantIds",
    "addedParticipants",
    "added_participants",
    "added_users",
    "added_user_ids",
    "usersAdded",
    "users_added",
    "participantsAdded",
    "participants_added"
  ];

  const removeKeys = [
    "removedParticipants",
    "removed_participants",
    "removed_users",
    "removed_user_ids",
    "left_users",
    "usersRemoved",
    "users_removed",
    "participantsRemoved",
    "participants_removed",
    "participantIDs",
    "participantIds"
  ];

  let added = firstArray(
    ...addKeys.map(key => normalized[key]),
    ...addKeys.map(key => actionData[key]),
    ...addKeys.map(key => actionLog[key])
  );

  let removed = firstArray(
    ...removeKeys.map(key => normalized[key]),
    ...removeKeys.map(key => actionData[key]),
    ...removeKeys.map(key => actionLog[key])
  );

  const isSubscribe = logMessageType === "log:subscribe";
  const isUnsubscribe = logMessageType === "log:unsubscribe";

  if (isSubscribe && !added) {
    const candidates =
      actionData.addedParticipants ||
      actionData.added_participants ||
      actionData.userIDs ||
      actionData.userIds ||
      actionData.participantIDs ||
      actionData.participantIds ||
      actionData.added_users ||
      actionData.users ||
      actionData.userFbId ||
      actionData.userFbID;

    if (candidates != null) {
      added = asList(candidates);
    }
  }

  if (isUnsubscribe && !removed) {
    const leftID =
      actionData.leftParticipantFbId ||
      actionData.leftParticipantID ||
      actionData.leftParticipantId ||
      actionData.userFbId ||
      actionData.userID ||
      actionData.userId ||
      actionData.participantID ||
      actionData.participant_id;

    if (leftID != null) {
      removed = [leftID];
    }
  }

  const logUsers =
    actionData.usernames ||
    actionData.username ||
    actionData.user_ids ||
    actionData.userIDs ||
    actionData.participantID ||
    actionData.participant_id ||
    actionData.users ||
    actionLog.usernames ||
    actionLog.username ||
    actionLog.user_ids ||
    actionLog.userIDs ||
    actionLog.participantID ||
    actionLog.participant_id ||
    actionLog.users;

  const logList = asList(logUsers);

  const logNames =
    actionData.usernames ||
    actionData.username ||
    actionLog.usernames ||
    actionLog.username;

  if (logNames != null && !normalized.usernames) {
    normalized.usernames = asList(logNames)
      .filter(value => value != null)
      .map(value => {
        if (typeof value === "object") {
          return value.username || value.vanity || value.handle || "";
        }
        return String(value);
      })
      .filter(Boolean);
  }

  const isJoinAction =
    /\b(join|joined|add|added|invite|invited|member_added|user_added|participant_added|participants_added)\b/.test(
      actionText
    );

  const isLeaveAction =
    /\b(leave|left|remove|removed|kick|kicked|member_removed|user_removed|participant_removed|participants_removed|unsubscribe)\b/.test(
      actionText
    );

  const existingType = String(normalized.type || "").toLowerCase();

  if (isSubscribe) {
    normalized.type = "join";
  } else if (isUnsubscribe) {
    normalized.type = "leave";
  } else if (
    !["join", "leave"].includes(existingType) &&
    isJoinAction &&
    (added || logList.length > 0)
  ) {
    normalized.type = "join";
  } else if (
    !["join", "leave"].includes(existingType) &&
    isLeaveAction &&
    (removed || logList.length > 0)
  ) {
    normalized.type = "leave";
  }

  if (normalized.type === "join" || normalized.type === "leave") {
    const source = normalized.type === "join" ? added : removed;

    let ids = asList(source)
      .map(getID)
      .filter(Boolean);

    if (!ids.length && normalized.type === "leave") {
      const leftID =
        actionData.leftParticipantFbId ||
        actionData.leftParticipantID ||
        actionData.leftParticipantId;

      if (leftID != null) {
        ids = [String(leftID)];
      }
    }

    if (!ids.length) {
      ids = logList.map(getID).filter(Boolean);
    }

    if (Array.isArray(normalized.userIDs)) {
      ids = [
        ...ids,
        ...normalized.userIDs.map(getID).filter(Boolean)
      ];
    }

    normalized.userIDs = [...new Set(ids)];

    if (
      !normalized.threadName &&
      (actionData.threadName || actionData.thread_name)
    ) {
      normalized.threadName =
        actionData.threadName || actionData.thread_name;
    }

    normalized.isGroup = true;
  }

  if (normalized.isGroup !== true) {
    const members = [
      ...(added || []),
      ...(removed || []),
      ...(normalized.userIDs || []),
      ...(normalized.participantIDs || []),
      ...(normalized.participants || [])
    ];

    const unique = new Set(members.map(getID).filter(Boolean));

    if (
      Array.isArray(added) ||
      Array.isArray(removed) ||
      String(normalized.threadID || "").includes(":") ||
      unique.size > 2
    ) {
      normalized.isGroup = true;
    }
  }

  return normalized;
}

function createBot(config) {
  const startedAt = Date.now();
  global.instabotStartedAt = startedAt;

  const database = createDatabase(config);

  // Make the database available to commands such as uptime.js.
  global.database = database;

  const registry = createRegistry();

  const state = {
    api: null,
    botID: null,
    listening: null,
    stopListening: null,
    listenerGeneration: 0,
    restartTimer: null,
    retireListener: null,
    running: false,
    stopping: false,
    commandCount: 0,
    eventCount: 0,
    messagesHandled: 0
  };

  const onlineStatus = createOnlineStatus({
    config,
    startedAt,
    stats: () => ({
      botID: state.botID,
      commands: state.commandCount,
      events: state.eventCount,
      messagesHandled: state.messagesHandled
    })
  });

  let dispatcher = null;

  function loadCommands() {
    const counts = loadAll(registry);
    state.commandCount = counts.commandCount;
    state.eventCount = counts.eventCount;
  }

  function buildOptions() {
    const options = {
      listenEvents: true,
      selfListen: config.selfListen,
      autoMarkRead: config.autoMarkRead,
      autoMarkDelivery: config.autoMarkDelivery,
      autoReconnect: config.autoReconnect,
      logLevel: "silent"
    };

    if (config.account && config.account.proxy) {
      options.proxy = config.account.proxy;
    }

    if (config.account && config.account.userAgent) {
      options.userAgent = config.account.userAgent;
    }

    return options;
  }

  function startServer() {
    return new Promise((resolve, reject) => {
      let settled = false;

      const finish = async (error, api) => {
        if (settled) return;

        if (error) {
          settled = true;
          return reject(error);
        }

        if (!api) {
          settled = true;
          return reject(
            new Error("ICA login returned no API instance")
          );
        }

        settled = true;
        state.api = api;

        try {
          state.botID = String(api.getCurrentUserID());

          dispatcher = createDispatcher({
            api,
            config,
            registry,
            database
          });

          try {
            const info = await api.getUserInfo(state.botID);
            const profile = info && info[state.botID];

            log.success(
              "LOGIN",
              `Logged in as ${state.botID}${
                profile && profile.vanity
                  ? ` (@${profile.vanity})`
                  : ""
              }`
            );
          } catch (_) {
            log.success("LOGIN", `Logged in as ${state.botID}`);
          }

          startListening();
          onlineStatus.start();
          resolve(api);
        } catch (err) {
          reject(err);
        }
      };

      let appState;

      try {
        appState = loadAccount();
      } catch (error) {
        return reject(error);
      }

      log.info("LOGIN", "Connecting through the installed ICA package");

      try {
        ica.login({ appState }, buildOptions(), finish);
      } catch (error) {
        reject(error);
      }
    });
  }

  function handleListenerEvent(error, rawEvent) {
    if (error) return handleListenerError(error);

    if (rawEvent && rawEvent.__internal) {
      if (rawEvent.__internal === "relogin") {
        log.warn(
          "LISTEN",
          "Server is re-logging in; waiting for the stream to resume"
        );

        onlineStatus.writeLine({
          event: "relogin",
          reason: rawEvent.reason || null
        });
      } else if (rawEvent.__internal === "error") {
        handleListenerError(
          rawEvent.error || { message: "server error" }
        );
      }

      return;
    }

    if (rawEvent && typeof rawEvent === "object") {
      const logType = String(
        rawEvent.logMessageType ||
        rawEvent.log_message_type ||
        ""
      ).toLowerCase();

      if (
        logType === "log:subscribe" ||
        logType === "log:unsubscribe"
      ) {
        try {
          log.info("ICA_MEMBERSHIP_RAW", JSON.stringify(rawEvent));
        } catch (_) {
          log.warn(
            "ICA_MEMBERSHIP_RAW",
            "Could not serialize raw event"
          );
        }
      }
    }

    const event = normalizeEvent(rawEvent);

    if (!event || event.type === "ready") return;

    state.messagesHandled++;

    if (shouldLog(event.type)) {
      const shown = Object.assign({}, event);

      if (Array.isArray(shown.participantIDs)) {
        shown.participantIDs =
          `Array(${shown.participantIDs.length})`;
      }

      log.info(
        String(event.type).toUpperCase(),
        JSON.stringify(shown)
      );
    }

    if (!dispatcher || typeof dispatcher.handle !== "function") {
      log.warn("DISPATCH", "Dispatcher is not ready");
      return;
    }

    Promise.resolve(dispatcher.handle(event)).catch(err => {
      log.error("DISPATCH", "Unhandled error", err);
    });
  }

  function shouldLog(type) {
    const settings = config.logEvents || {};

    if (settings.disableAll === true) return false;

    return settings[type] === true;
  }

  function handleListenerError(error) {
    const message = String(
      (error && (error.error || error.message)) || error
    );

    if (/connection closed|closed by user/i.test(message)) return;

    onlineStatus.writeLine({ event: "listener_error", error: message });

    // Do not repeatedly reconnect when Instagram requires human verification
    // or the saved session is invalid. Stop automation and require manual review.
    if (/captcha|checkpoint|challenge|suspend|suspended|verification required|two.?factor/i.test(message)) {
      state.listenerGeneration++;
      try {
        if (typeof state.stopListening === "function") state.stopListening();
      } catch (_) {}
      state.stopListening = null;
      state.listening = false;
      if (state.restartTimer) {
        clearInterval(state.restartTimer);
        state.restartTimer = null;
      }
      log.error("SAFETY", "Instagram verification/security checkpoint detected. Listener stopped; resolve it manually before restarting the bot.", message);
      return;
    }

    if (/not logged in|login_required|logged.?out|session.?expired|account_inactive/i.test(message)) {
      state.listenerGeneration++;
      try {
        if (typeof state.stopListening === "function") state.stopListening();
      } catch (_) {}
      state.stopListening = null;
      state.listening = false;
      if (state.restartTimer) {
        clearInterval(state.restartTimer);
        state.restartTimer = null;
      }
      log.error("SAFETY", "Instagram session is invalid/inactive. Automatic reconnect is disabled for this state; review account.txt and the account status manually.", message);
      return;
    }

    log.error("LISTEN", "Listener error", message);
  }

  function startListening() {
    if (state.stopping || !state.api) return;

    state.listenerGeneration++;
    const generation = state.listenerGeneration;

    if (state.retireListener) {
      clearTimeout(state.retireListener);
      state.retireListener = null;
    }

    try {
      if (typeof state.stopListening === "function") {
        state.stopListening();
      }
    } catch (_) {}

    try {
      state.stopListening = state.api.listenMqtt((error, event) => {
        if (generation !== state.listenerGeneration) return;

        handleListenerEvent(error, event);
      });

      state.listening = true;
      log.success("LISTEN", "Realtime listener started");
    } catch (error) {
      state.listening = false;
      handleListenerError(error);
      return;
    }

    if (state.restartTimer) {
      clearInterval(state.restartTimer);
      state.restartTimer = null;
    }

    const interval = Number(config.restartListenInterval) || 0;

    if (interval > 0) {
      state.restartTimer = setInterval(
        () => restartListening(),
        interval
      );

      if (state.restartTimer.unref) {
        state.restartTimer.unref();
      }
    }
  }

  function restartListening() {
    if (state.stopping || !state.api) return;

    if (state.restartTimer) {
      clearInterval(state.restartTimer);
      state.restartTimer = null;
    }

    try {
      if (typeof state.stopListening === "function") {
        state.stopListening();
      }
    } catch (_) {}

    if (state.retireListener) {
      clearTimeout(state.retireListener);
    }

    state.retireListener = setTimeout(() => {
      state.retireListener = null;
      startListening();
    }, 1000);

    if (state.retireListener.unref) {
      state.retireListener.unref();
    }

    log.info("LISTEN", "Listener restart scheduled");
  }

  function isNonRetryableStartupError(error) {
    const message = String((error && (error.error || error.message)) || error);
    return /no ica server url|no ica api key|no api key|missing.*api key|invalid.*api key|unauthorized|captcha|checkpoint|challenge|suspend|suspended|verification required|two.?factor|login_required|not logged in|session.?expired/i.test(message);
  }

  async function start() {
    log.master("BOOT", `${config.botName} starting…`);

    try {
      if (database.ready) {
        await database.ready;
      }

      log.success(
        "DATABASE",
        `Database ready (${database.provider || "default"})`
      );
    } catch (error) {
      log.error("DATABASE", "Database initialization failed", error);
      throw error;
    }

    loadCommands();

    let attempt = 0;

    for (;;) {
      if (state.stopping) return;

      try {
        await startServer();
        break;
      } catch (error) {
        if (state.stopping) return;

        const message = String(
          (error && (error.error || error.message)) || error
        );

        if (isNonRetryableStartupError(error)) {
          log.error("SAFETY", `Startup stopped without retrying: ${message}`);
          throw error;
        }

        attempt++;
        if (attempt > 5) {
          log.error("BOOT", `Stopped after ${attempt - 1} transient connection attempts: ${message}`);
          throw error;
        }

        const delay = Math.min(30000, 5000 * attempt);

        onlineStatus.writeLine({
          event: "boot_retry",
          attempt,
          error: message
        });

        log.warn(
          "BOOT",
          `Could not connect (attempt ${attempt}): ${message}. ` +
          `Retrying in ${Math.round(delay / 1000)}s…`
        );

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    if (state.stopping) return;

    state.running = true;

    log.success(
      "BOOT",
      `${config.botName} is online. Type ${config.prefix}help in a chat.`
    );
  }

  async function stop() {
    if (state.stopping) return;

    state.running = false;
    state.stopping = true;

    onlineStatus.writeLine({ event: "stopping" });

    state.listenerGeneration++;

    try {
      if (typeof state.stopListening === "function") {
        state.stopListening();
      }
    } catch (error) {
      log.warn("LISTEN", "Error while stopping listener", error);
    }

    state.stopListening = null;
    state.listening = false;

    if (state.restartTimer) {
      clearInterval(state.restartTimer);
      state.restartTimer = null;
    }

    if (state.retireListener) {
      clearTimeout(state.retireListener);
      state.retireListener = null;
    }

    try {
      if (typeof database.flush === "function") {
        await database.flush();
      }
    } catch (error) {
      log.error("DATABASE", "Failed to flush database", error);
    }

    try {
      if (typeof onlineStatus.stop === "function") {
        await onlineStatus.stop();
      }
    } catch (error) {
      log.warn("STATUS", "Error while stopping online status", error);
    }

    try {
      if (typeof database.close === "function") {
        await database.close();
      }
    } catch (error) {
      log.error("DATABASE", "Failed to close database", error);
    }

    log.master("BOOT", `${config.botName} stopped`);
  }

  return {
    start,
    stop,
    state,
    database,
    registry,
    normalizeEvent
  };
}

module.exports = { createBot, normalizeEvent };
