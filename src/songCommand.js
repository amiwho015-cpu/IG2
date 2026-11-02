"use strict";

const fs = require("fs");
const { search, downloadAudio, removeLater } = require("./songDownload");

/** Text result list (no picture); the list is unsent as soon as a number is picked. */
module.exports = function makeSong({ name, aliases, order }) {
	const unsend = async (api, message, id) => {
		if (!id) return;
		try { await api.unsendMessage(id); return; } catch (_) { /* try the other path */ }
		try { await message.unsend(id); } catch (_) { /* already gone */ }
	};

	async function sendSong(api, message, video) {
		const wait = await message.reply(`⏳ Downloading: ${video.title}`).catch(() => null);
		let file;
		try {
			file = await downloadAudio(video.url, order);
			await message.reply({ attachment: fs.createReadStream(file) });
		}
		catch (e) {
			await unsend(api, message, wait && wait.messageID);
			return message.reply(`❌ Could not get the song. (${((e && e.message) || e).toString().slice(0, 200)})`);
		}
		finally { if (file) removeLater(file); }
		await unsend(api, message, wait && wait.messageID);
	}

	return {
		config: {
			name,
			aliases: aliases || [],
			version: "6.0",
			author: "InstaBOT",
			countDown: 5,
			role: 0,
			category: "media",
			description: { en: "Search YouTube and send the song as audio" },
			guide: { en: "{pn} <song name> → send the top result directly\n{pn} <song name> -l → show a list to pick from" }
		},

		onStart: async function ({ api, event, args, message }) {
			// Default: send the top result directly. Use -l to get the pick-from-list view.
			let auto = true;
			const words = args.filter(w => {
				const f = w.toLowerCase();
				if (f === "-a") { auto = true; return false; }
				if (f === "-l") { auto = false; return false; }
				return true;
			});
			const query = words.join(" ").trim();
			if (!query) return message.reply("🎵 Write a song name.\nExample: sing baila lento");

			let results;
			try { results = await search(query, auto ? 3 : 8); }
			catch (e) { return message.reply(`❌ Search failed. (${(e && e.message) || e})`); }
			if (!results.length) return message.reply(`❌ No results for "${query}".`);

			if (auto) return sendSong(api, message, results[0]);

			const lines = results.map((v, i) => `${i + 1}. ${v.title}${v.duration ? ` (${v.duration})` : ""}${v.channel ? `\n   ${v.channel}` : ""}`);
			const body = `🎵 Results for "${query}"\n━━━━━━━━━━━━━━\n${lines.join("\n")}\n━━━━━━━━━━━━━━\n↩ Reply with a number`;
			return message.reply(body, (err, info) => {
				if (err || !info) return;
				global.GoatBot.onReply.set(info.messageID, { commandName: name, messageID: info.messageID, author: event.senderID, results });
			});
		},

		onReply: async function ({ api, event, Reply, message }) {
			if (event.senderID !== Reply.author) return;
			const n = parseInt(String(event.body || "").trim());
			if (!Number.isInteger(n) || n < 1 || n > Reply.results.length)
				return message.reply(`❌ Reply with a number from 1 to ${Reply.results.length}.`);
			await unsend(api, message, Reply.messageID);       // auto-unsend the list
			return sendSong(api, message, Reply.results[n - 1]);
		}
	};
};
