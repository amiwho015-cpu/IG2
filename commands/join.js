
/**
 * File Name: join.js
 * ICA: igbot-api
 * Author: Tanvir Ahmed (Tanvir143)
 * GitHub: www.github.com/143tanvir
 * WhatsApp: +8801750079773
 */

"use strict";

module.exports = {
	config: {
		name: "join",
		aliases: ["gclist", "grouplist", "groups"],
		author: "Tanvir143",
		category: "Users Cmd",
		cooldown: 5,
		role: 0,
		description: {
			en: "List all available group chats"
		},
		usage: {
			en: "{p}join"
		}
	},

	onStart: async function ({
		message,
		api,
		config,
		setReplyHandler
	}) {
		try {
			if (typeof api.getThreadList !== "function") {
				return message.reply(
					"❌ ICA getThreadList() is unavailable."
				);
			}

			const threadMap = new Map();
			const maxPages = 10;
			const pageSize = 100;
			let cursor = null;

			// Fetch the default inbox using timestamp pagination.
			for (let pageNo = 0; pageNo < maxPages; pageNo++) {
				const result = await api.getThreadList(
					pageSize,
					cursor,
					[]
				);

				if (!Array.isArray(result) || result.length === 0) {
					break;
				}

				let added = 0;

				for (const thread of result) {
					if (!thread || typeof thread !== "object") {
						continue;
					}

					const rawID =
						thread.threadID ??
						thread.threadId ??
						thread.thread_id ??
						thread.id;

					if (rawID == null || String(rawID) === "") {
						continue;
					}

					const id = String(rawID);

					if (!threadMap.has(id)) {
						threadMap.set(id, thread);
						added++;
					}
				}

				if (added === 0 || result.length < pageSize) {
					break;
				}

				const timestamps = result
					.map(thread =>
						thread.timestamp ??
						thread.lastActivityTimestamp ??
						thread.lastMessageTimestamp
					)
					.filter(value =>
						value !== null &&
						value !== undefined &&
						String(value) !== ""
					);

				if (!timestamps.length) {
					break;
				}

				const nextCursor = String(
					timestamps[timestamps.length - 1]
				);

				if (nextCursor === cursor) {
					break;
				}

				cursor = nextCursor;
			}

			function getID(thread) {
				const id =
					thread.threadID ??
					thread.threadId ??
					thread.thread_id ??
					thread.id;

				return id == null ? "" : String(id);
			}

			function getMembers(info) {
				if (!info || typeof info !== "object") {
					return [];
				}

				const possible = [
					info.participantIDs,
					info.participantIds,
					info.participants,
					info.members,
					info.users,
					info.userInfo
				];

				for (const list of possible) {
					if (Array.isArray(list)) return list;

					if (
						list &&
						typeof list === "object"
					) {
						return Object.values(list);
					}
				}

				return [];
			}

			function explicitGroup(thread) {
				const flags = [
					thread.isGroup,
					thread.isGroupChat,
					thread.is_group
				];

				if (
					flags.some(value =>
						value === true ||
						String(value).toLowerCase() === "true"
					)
				) {
					return true;
				}

				const types = [
					thread.threadType,
					thread.thread_type,
					thread.type
				];

				for (const value of types) {
					if (value == null) continue;

					const type = String(value).toLowerCase();

					if (
						type === "2" ||
						type.includes("group") ||
						type.includes("multi")
					) {
						return true;
					}
				}

				return false;
			}

			function isGroup(thread, info) {
				if (explicitGroup(thread) || explicitGroup(info || {})) {
					return true;
				}

				const threadMembers = getMembers(thread);
				const infoMembers = getMembers(info);

				return (
					threadMembers.length > 2 ||
					infoMembers.length > 2
				);
			}

			/*
			 * If list metadata is insufficient, use getThreadInfo
			 * to identify threads with multiple participants.
			 */
			const groups = [];
			const infoBatchSize = 10;
			const allThreads = Array.from(threadMap.values());

			for (
				let start = 0;
				start < allThreads.length;
				start += infoBatchSize
			) {
				const batch = allThreads.slice(
					start,
					start + infoBatchSize
				);

				await Promise.all(
					batch.map(async thread => {
						const id = getID(thread);
						if (!id) return;

						let info = null;

						if (
							!isGroup(thread, null) &&
							typeof api.getThreadInfo === "function"
						) {
							try {
								info = await api.getThreadInfo(id);
							} catch (_) {
								// Keep the list response as fallback.
							}
						}

						if (!isGroup(thread, info)) return;

						const source = info || thread;

						const name = String(
							source.name ||
							source.threadName ||
							source.thread_name ||
							source.title ||
							thread.name ||
							thread.threadName ||
							thread.title ||
							"Unnamed Group"
						).trim();

						groups.push({
							id,
							name: name || "Unnamed Group"
						});
					})
				);
			}

			const uniqueGroups = Array.from(
				new Map(
					groups.map(group => [group.id, group])
				).values()
			).sort((a, b) => a.name.localeCompare(b.name));

			if (!uniqueGroups.length) {
				return message.reply(
					"❌ No groups detected.\n\n" +
					`Inbox threads fetched: ${threadMap.size}\n` +
					"Check the ICA server response and thread metadata."
				);
			}

			const list = uniqueGroups.map((group, index) => {
				const number = String(index + 1).padStart(2, "0");
				return `${number}. ${group.name}`;
			});

			const text =
`──────────────
       GROUP LIST
──────────────

${list.join("\n")}

Total Groups: ${uniqueGroups.length}

Reply with a number to join.
(Admin only)
──────────────`;

			const sent = await message.reply(text);

			if (!sent || !sent.messageID) return;

			setReplyHandler(
				async ({
					event: replyEvent,
					message: replyMessage
				}) => {
					const admins = Array.isArray(config.adminBot)
						? config.adminBot.map(String)
						: [];

					if (!admins.includes(String(replyEvent.senderID))) {
						return replyMessage.reply(
							"❌ Only bot admins can use the group number."
						);
					}

					const input = String(
						replyEvent.body || ""
					).trim();

					if (!/^\d+$/.test(input)) {
						return replyMessage.reply(
							"Reply with a valid group number."
						);
					}

					const index = Number(input) - 1;

					if (
						index < 0 ||
						index >= uniqueGroups.length
					) {
						return replyMessage.reply(
							`❌ Invalid number. Choose 1-${uniqueGroups.length}.`
						);
					}

					const selected = uniqueGroups[index];

					try {
						if (
							typeof api.addUserToThread !== "function"
						) {
							return replyMessage.reply(
								"❌ addUserToThread() is unavailable."
							);
						}

						await api.addUserToThread(
							String(replyEvent.senderID),
							selected.id
						);

						return replyMessage.reply(
`──────────────
        SUCCESS
──────────────

Request completed for:

${selected.name}

──────────────`
						);
					} catch (error) {
						return replyMessage.reply(
`──────────────
         ERROR
──────────────

Unable to add user to:

${selected.name}

${error.message || String(error)}

──────────────`
						);
					}
				},
				sent.messageID
			);
		} catch (error) {
			return message.reply(
				"❌ Unable to retrieve groups.\n" +
				(error.message || String(error))
			);
		}
	}
};
