"use strict";

/**
 * -mediatest : sends a test picture, voice and video (plain and as a reply) and tells you
 * exactly which one failed and WHY, so media problems can be fixed from one message.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

function ffmpegPath() {
	try { return require("ffmpeg-static") || "ffmpeg"; } catch (_) { return "ffmpeg"; }
}

function run(args) {
	return new Promise((resolve, reject) => {
		const child = spawn(ffmpegPath(), args, { stdio: ["ignore", "ignore", "pipe"] });
		let err = "";
		child.stderr.on("data", d => { err += d; });
		const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("ffmpeg timed out")); }, 60000);
		child.on("error", e => { clearTimeout(timer); reject(e); });
		child.on("close", code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}: ${err.slice(-150)}`)); });
	});
}

function makeImage(file) {
	const Canvas = require("canvas");
	const canvas = Canvas.createCanvas(640, 640);
	const ctx = canvas.getContext("2d");
	const g = ctx.createLinearGradient(0, 0, 640, 640);
	g.addColorStop(0, "#833ab4"); g.addColorStop(0.5, "#fd1d1d"); g.addColorStop(1, "#fcb045");
	ctx.fillStyle = g; ctx.fillRect(0, 0, 640, 640);
	ctx.fillStyle = "#fff"; ctx.font = "bold 64px sans-serif"; ctx.textAlign = "center";
	ctx.fillText("MEDIA TEST", 320, 340);
	fs.writeFileSync(file, canvas.toBuffer("image/jpeg", { quality: 0.9 }));
}

module.exports = {
	config: {
		name: "mediatest",
		aliases: ["mtest"],
		author: "InstaBOT",
		category: "system",
		cooldown: 30,
		role: 0,
		description: { en: "Send a test pic / voice / video and show the exact error if one fails" },
		usage: { en: "{p}mediatest" }
	},

	onStart: async function ({ api, event, message }) {
		const id = Date.now();
		const dir = os.tmpdir();
		const files = { image: path.join(dir, `mt_${id}.jpg`), audio: path.join(dir, `mt_${id}.m4a`), video: path.join(dir, `mt_${id}.mp4`) };
		const report = [];
		const media = api.client && api.client.media;

		try {
			makeImage(files.image);
			await run(["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", "-c:a", "aac", "-b:a", "54k", "-ac", "1", files.audio]);
			await run(["-y", "-f", "lavfi", "-i", "testsrc=size=480x480:rate=24:duration=2", "-f", "lavfi", "-i", "sine=duration=2", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", files.video]);
		}
		catch (e) {
			return message.reply(`❌ Could not make the test files: ${e.message}`);
		}

		const tests = [
			["image", "sendImage", false], ["audio", "sendAudio", false], ["video", "sendVideo", false],
			["image (reply)", "sendImage", true], ["audio (reply)", "sendAudio", true], ["video (reply)", "sendVideo", true]
		];

		for (const [label, fn, asReply] of tests) {
			const kind = label.split(" ")[0];
			const started = Date.now();
			if (media) media.lastMediaDebug = null;
			try {
				await api[fn](files[kind], event.threadID, "", asReply ? event.messageID : undefined);
				const note = media && media.lastMediaDebug ? ` (fallback used: ${media.lastMediaDebug.message.slice(0, 80)})` : "";
				report.push(`✅ ${label} ${Math.round((Date.now() - started) / 100) / 10}s${note}`);
			}
			catch (e) {
				const dbg = media && media.lastMediaDebug ? ` | graphql: ${media.lastMediaDebug.status || ""} ${media.lastMediaDebug.message} ${media.lastMediaDebug.body}`.slice(0, 260) : "";
				report.push(`❌ ${label}: ${String((e && e.message) || e).slice(0, 200)}${dbg}`);
			}
		}

		for (const f of Object.values(files)) { try { fs.unlinkSync(f); } catch (_) { /* ignore */ } }
		return message.reply(`🧪 MEDIA TEST\n${report.join("\n")}`);
	}
};
