/**
 * File Name: index.js
 * ICA: igbot-api
 * Auhor: Tanvir Ahmed (Tanvir143)
 * GitHub: www.github.com/143tanvir
 * WhatsApp: +8801750079773
 * Note: Project metadata only; original source credits and license notices are retained.
 */

"use strict";

// Load environment variables before importing bot modules.
require("dotenv").config();

const log = require("./src/logger");
const { loadConfig } = require("./src/config");
const { createBot } = require("./src/bot");
const { createStatusServer } = require("./src/statusServer");

const BANNER = [
	" ____   ___  ____   ___ _____ ",
	"|  _ \\ / _ \\| __ ) / _ \\_   _|",
	"| |_) | | | |  _ \\| | | || |  ",
	"|  _ <| |_| | |_) | |_| || |  ",
	"|_| \\_\\\\___/|____/ \\___/ |_|  "
];

function printBanner() {
	const version = require("./package.json").version;
	const author = "by TANVIR - Tanvir143";

	log.plain("");

	for (const line of BANNER) {
		log.plain(log.paint("magenta", line));
	}

	log.plain(log.paint("dim", ` ${author}  ·  v${version}`));
	log.plain("");
}

async function main() {
	printBanner();

	let config;

	try {
		config = loadConfig();
	} catch (error) {
		log.error("CONFIG", error.message);
		process.exitCode = 1;
		return;
	}

	const bot = createBot(config);

	const statusServer = createStatusServer({
		info: () => ({
			bot: config.botName,
			botId:
				config.server && config.server.botId
					? config.server.botId
					: "default",
			online: bot.state.running === true,
			userID: bot.state.botID || null,
			commands: bot.state.commandCount,
			events: bot.state.eventCount
		})
	});

	let shuttingDown = false;

	const shutdown = async (signal) => {
		if (shuttingDown) return;
		shuttingDown = true;

		log.warn("SYSTEM", `Received ${signal}; shutting down...`);

		try {
			await statusServer.stop();
		} catch (error) {
			log.error("HTTP", "Error stopping status server", error);
		}

		try {
			await bot.stop();
		} catch (error) {
			log.error("BOT", "Error stopping bot", error);
		}

		process.exit(0);
	};

	process.once("SIGINT", () => {
		void shutdown("SIGINT");
	});

	process.once("SIGTERM", () => {
		void shutdown("SIGTERM");
	});

	process.on("unhandledRejection", (reason) => {
		log.error("PROCESS", "Unhandled promise rejection", reason);
	});

	process.on("uncaughtException", (error) => {
		log.error("PROCESS", "Uncaught exception", error);
	});

	try {
		await statusServer.start();
	} catch (error) {
		log.error("HTTP", "Could not start the status server", error);
	}

	try {
		await bot.start();
	} catch (error) {
		log.error("BOOT", "Failed to start bot", error);

		// Keep the process alive for hosting platforms.
		await new Promise(() => {});
	}
}

main().catch((error) => {
	log.error("BOOT", "Fatal startup error", error);
	process.exitCode = 1;
});
