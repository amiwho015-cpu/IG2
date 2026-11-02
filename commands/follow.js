
/**
 * File Name: follow.js
 * ICA: igbot-api
 * Author: Tanvir Ahmed (Tanvir143)
 * GitHub: www.github.com/143tanvir
 * WhatsApp: +8801750079773
 */

"use strict";

const { text } = require("../src/languages");

module.exports = {
	config: {
		name: "follow",
		aliases: ["fl"],
		version: "0.0.3",
		author: "Tanvir Ahmed",
		cooldown: 5,
		role: 0,
		description: {
			en: "Follow Instagram users"
		},
		category: "Users Cmd",
		guide: {
			en: "{pn} @mention\n{pn} username\n{pn} profile-link\nReply to a message with {pn} to follow its sender."
		}
	},

	onStart: async function ({ api, event, args, message, config }) {
		const lang = config.language || "en";
		const t = (key, ...values) => text(lang, key, ...values);

		const targets = [];
		const mentions = event.mentions || {};

		if (event.messageReply && event.messageReply.senderID) {
			targets.push({
				id: String(event.messageReply.senderID),
				label: String(event.messageReply.senderID)
			});
		} else if (Object.keys(mentions).length > 0) {
			for (const id of Object.keys(mentions)) {
				targets.push({
					id: String(id),
					label: String(mentions[id] || id).replace(/^@/, "")
				});
			}
		} else if (args.length > 0) {
			const findUid = global.utils && global.utils.findUid;

			if (typeof findUid !== "function") {
				return message.reply(
					"❌ Username/profile-link lookup is unavailable. Please mention or reply to the user."
				);
			}

			for (const arg of args) {
				try {
					const id = await findUid(arg);

					if (!id) {
						targets.push({ error: true, label: arg });
					} else {
						targets.push({
							id: String(id),
							label: arg
						});
					}
				} catch (error) {
					targets.push({ error: true, label: arg });
				}
			}
		} else {
			return message.reply(
				t("follow_syntax") !== "[missing text: follow_syntax]"
					? t("follow_syntax")
					: "⚠️ Mention a user, reply to their message, or provide a username/profile link."
			);
		}

		const results = [];

		for (const target of targets) {
			if (target.error) {
				results.push(
					t("follow_not_found", target.label) !==
					"[missing text: follow_not_found]"
						? t("follow_not_found", target.label)
						: `❌ Could not find user: ${target.label}`
				);
				continue;
			}

			try {
				if (typeof api.follow !== "function") {
					throw new Error("api.follow() is not supported by this ICA");
				}

				await api.follow(target.id);

				results.push(
					t("follow_success", target.label) !==
					"[missing text: follow_success]"
						? t("follow_success", target.label)
						: `✅ Followed: ${target.label}`
				);
			} catch (error) {
				const reason =
					error.error || error.message || String(error);

				results.push(
					t("follow_failed", target.label, reason) !==
					"[missing text: follow_failed]"
						? t("follow_failed", target.label, reason)
						: `❌ Failed to follow ${target.label}: ${reason}`
				);
			}
		}

		return message.reply(results.join("\n"));
	}
};
