"use strict";

const { listGroups, joinUser } = require("../src/groupUtil");

const LIMIT = 10;

function pageText(groups, page, totalPages) {
	const slice = groups.slice((page - 1) * LIMIT, page * LIMIT);
	const lines = slice.map((g, i) => `${(page - 1) * LIMIT + i + 1}. ${g.name || "Unnamed Group"} (${g.threadID})`);
	return `Groups ${page}/${totalPages} (${groups.length})\n${lines.join("\n")}\nnext / back / <page> | left <num> | join <num> [uid]`;
}

module.exports = {
	config: {
		name: "listbox",
		aliases: ["grouplist", "listgroup"],
		author: "CRX Shihab",
		version: "3.0",
		countDown: 5,
		role: 2,
		shortDescription: { en: "List all groups the bot is in" },
		longDescription: { en: "Paged list of every group chat the bot is in, with leave / join actions." },
		category: "box chat",
		guide: { en: "{pn} [page]" }
	},

	onStart: async function ({ api, event, args, message, threadsData, commandName }) {
		const groups = await listGroups(api, threadsData);
		if (!groups.length) return message.reply("No group chats found.");

		const totalPages = Math.ceil(groups.length / LIMIT);
		const page = Math.min(Math.max(parseInt(args[0]) || 1, 1), totalPages);

		message.reply(pageText(groups, page, totalPages), (err, info) => {
			if (err || !info) return;
			global.GoatBot.onReply.set(info.messageID, {
				commandName, messageID: info.messageID, author: event.senderID, allGroups: groups, page
			});
		});
	},

	onReply: async function ({ api, event, Reply, message, commandName }) {
		const { author, allGroups, page, messageID } = Reply;
		if (event.senderID !== author) return;

		const parts = String(event.body || "").trim().split(/\s+/);
		const action = (parts[0] || "").toLowerCase();
		const totalPages = Math.ceil(allGroups.length / LIMIT);
		const pick = n => allGroups[n - 1];

		if (action === "left" || action === "out") {
			const nums = [...new Set(parts.slice(1).map(Number).filter(n => Number.isInteger(n) && n > 0))];
			if (!nums.length) return message.reply("⚠️ Give group number(s). Example: left 1 or left 1 2 3");
			let left = 0;
			const failed = [];
			for (const n of nums) {
				const g = pick(n);
				if (!g) { failed.push(`#${n} (no such number)`); continue; }
				try { await api.leaveGroup(g.threadID); left++; }
				catch (error) { failed.push(`#${n} (${(error && (error.error || error.message)) || error})`); }
			}
			return message.reply(`✅ Left ${left} group(s).` + (failed.length ? `\n❌ Failed: ${failed.join(", ")}` : ""));
		}

		if (action === "join") {
			const g = pick(Number(parts[1]));
			if (!g) return message.reply("⚠️ Invalid group number. Example: join 1");
			const uid = /^\d+$/.test(parts[2] || "") ? parts[2] : event.senderID;
			const label = g.name || g.threadID;
			try {
				const res = await joinUser(api, uid, g.threadID);
				if (res.already) return message.reply(`ℹ️ Already in "${label}".`);
				return message.reply(`✅ Added to "${label}".${res.followed ? " (bot followed the account first)" : ""}`);
			}
			catch (error) {
				return message.reply(`❌ Could not add to "${label}". (${error.message || error})`);
			}
		}

		let newPage = page;
		if (action === "next") newPage = page + 1;
		else if (action === "back") newPage = page - 1;
		else if (/^\d+$/.test(action)) newPage = parseInt(action);
		else return;

		if (newPage < 1 || newPage > totalPages)
			return message.reply(`Invalid page. Choose between 1 and ${totalPages}.`);

		try { await message.unsend(messageID); } catch (_) { /* already gone */ }
		message.reply(pageText(allGroups, newPage, totalPages), (err, info) => {
			if (err || !info) return;
			global.GoatBot.onReply.set(info.messageID, {
				commandName, messageID: info.messageID, author, allGroups, page: newPage
			});
		});
	}
};
