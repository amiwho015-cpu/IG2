"use strict";

const moment = require("moment-timezone");
const { listGroups } = require("../src/groupUtil");

const DEFAULT_DELAY = 600;
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** "1", "-1", "1,3", "2-5", "all"  ->  sorted array of serials, or null when it is not a target list. */
function parseTargets(raw, total) {
	const text = String(raw || "").trim().toLowerCase();
	if (text === "all") return Array.from({ length: total }, (_, i) => i + 1);
	const picked = new Set();
	for (const part of text.split(",")) {
		const token = part.replace(/^-+/, "");           // "-1" (prefix typed twice) means 1
		let m;
		if ((m = token.match(/^(\d+)$/))) picked.add(Number(m[1]));
		else if ((m = token.match(/^(\d+)-(\d+)$/))) {
			let a = Number(m[1]), b = Number(m[2]);
			if (a > b) [a, b] = [b, a];
			if (b - a > 200) return null;
			for (let n = a; n <= b; n++) picked.add(n);
		}
		else return null;
	}
	return picked.size ? [...picked].sort((x, y) => x - y) : null;
}

module.exports = {
	config: {
		name: "notification",
		aliases: ["notify", "noti"],
		version: "5.0",
		author: "CRX Shihab",
		countDown: 3,
		role: 2,
		shortDescription: { en: "Send a notification to a group by its serial number" },
		longDescription: { en: "Send text/media to one group (by serial number), several, or all groups." },
		category: "owner",
		guide: {
			en: "{pn} list [page] → groups with serial numbers\n" +
				"{pn} 1 hi → send \"hi\" to group no. 1\n" +
				"{pn} 1,3,5 hi / {pn} 2-4 hi → several groups\n" +
				"{pn} all hi → every group\n" +
				"Reply to a photo/video with {pn} <serial> [text] to send media"
		},
		envConfig: { delayPerGroup: DEFAULT_DELAY }
	},

	onStart: async function ({ message, api, event, args, envCommands, threadsData, usersData, config }) {
		const prefix = (config && config.prefix) || "-";
		const delayPerGroup = Number(envCommands && envCommands.notification && envCommands.notification.delayPerGroup) || DEFAULT_DELAY;

		let groups;
		try { groups = await listGroups(api, threadsData); }
		catch (e) { return message.reply(`❌ Could not load the group list. (${(e && e.message) || e})`); }
		if (!groups.length) return message.reply("⚠️ No groups found.");

		const first = String(args[0] || "").toLowerCase();

		if (first === "list") {
			const per = 20;
			const pages = Math.ceil(groups.length / per);
			const page = Math.min(Math.max(parseInt(args[1]) || 1, 1), pages);
			const start = (page - 1) * per;
			const lines = groups.slice(start, start + per).map((g, i) => `${start + i + 1}. ${g.name || "Unnamed Group"}`);
			return message.reply(`📋 GROUPS (${groups.length})\n━━━━━━━━━━━━━━\n${lines.join("\n")}\n━━━━━━━━━━━━━━\n📄 Page ${page}/${pages}` +
				(page < pages ? ` → ${prefix}noti list ${page + 1}` : "") + `\n✍ ${prefix}noti <serial> <message>`);
		}

		const serials = parseTargets(first, groups.length);
		if (!serials)
			return message.reply(`⚠️ Usage:\n${prefix}noti <serial> <message>   e.g. ${prefix}noti 1 hi\n${prefix}noti all <message>\n${prefix}noti list → see serial numbers`);

		const bad = serials.filter(n => n < 1 || n > groups.length);
		if (bad.length) return message.reply(`❌ No group with serial ${bad.join(", ")}. There are ${groups.length} groups (${prefix}noti list).`);

		const msgText = args.slice(1).join(" ").trim();
		const media = [...(event.attachments || []), ...((event.messageReply && event.messageReply.attachments) || [])]
			.filter(a => ["photo", "animated_image", "video", "audio", "sticker"].includes(a.type));
		if (!msgText && !media.length) return message.reply("⚠️ Write a message after the serial number (or reply to a photo/video).");

		let senderName = "Admin";
		try { senderName = (await usersData.getName(event.senderID)) || senderName; } catch (_) { /* keep default */ }
		const now = moment().tz("Asia/Dhaka");
		const body = `╭━━━━━━━━━━━━━━━━━━━━━━╮\n┃    📢 𝗡𝗢𝗧𝗜𝗙𝗜𝗖𝗔𝗧𝗜𝗢𝗡\n╰━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
			`👤 𝗔𝗱𝗺𝗶𝗻: ${senderName}\n🕒 𝗧𝗶𝗺𝗲: ${now.format("hh:mm A")} | ${now.format("DD/MM/YYYY")}\n\n` +
			`📝 𝗠𝗲𝘀𝘀𝗮𝗴𝗲:\n───────────────────\n${msgText || "(Media Attachment)"}\n───────────────────`;

		let sent = 0, failed = 0, firstError = "";
		const sentTo = [];
		for (let i = 0; i < serials.length; i++) {
			const g = groups[serials[i] - 1];
			try {
				const form = { body };
				if (media.length) form.attachment = await global.utils.getStreamsFromAttachment(media);
				await api.sendMessage(form, g.threadID);
				sent++;
				sentTo.push(`${serials[i]}. ${g.name || g.threadID}`);
			}
			catch (e) {
				failed++;
				if (!firstError) firstError = (e && (e.error || e.message)) || String(e);
			}
			if (i < serials.length - 1) await sleep(media.length ? 1500 : delayPerGroup);
		}

		if (serials.length === 1)
			return message.reply(sent ? `✅ Sent to ${sentTo[0]}` : `❌ Failed: ${firstError}`);
		return message.reply(`✅ Notification done\n━━━━━━━━━━━━━━\n🎯 Total: ${serials.length}\n🟢 Sent: ${sent}\n🔴 Failed: ${failed}` +
			(firstError ? `\n⚠️ ${firstError}` : ""));
	}
};
module.exports.parseTargets = parseTargets;
