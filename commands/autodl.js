
/**
 * File Name: autodl.js
 * ICA: igbot-api
 * Author: Tanvir Ahmed (Tanvir143)
 * GitHub: www.github.com/143tanvir
 */

"use strict";

const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

const tanvir143 = {
    api: "https://noobs-api.top/dipto/alldl?url=",
    emoji: {
        loading: "🧐",
        success: "✅",
        error: "❌"
    },
    cache: path.join(__dirname, "cache", "igvideo")
};

module.exports = {
    config: {
        name: "autodl",
        aliases: ["ig", "reel"],
        version: "1.0",
        author: "Tanvir Ahmed (Tanvir143)",
        cooldown: 3,
        role: 0,
        category: "Users Cmd",
        shortDescription: {
            en: "Instagram video auto downloader"
        },
        guide: {
            en: "Send an Instagram Reel/video link."
        }
    },

    onStart: async function () {},

    onChat: async function ({ api, event }) {
        if (event.type === "message_reaction") return;

        const match = String(event.body || "").match(
            /https?:\/\/(?:www\.)?instagram\.com\/(?:reel|reels|p|tv)\/[^\s]+/i
        );

        if (!match) return;

        const url = match[0].replace(/[)\]}>.,!?;:'"]+$/g, "");
        let file;

        const react = emoji => new Promise(resolve => {
            if (!event.messageID || !api.setMessageReaction) {
                return resolve();
            }

            try {
                api.setMessageReaction(
                    emoji,
                    event.messageID,
                    () => resolve()
                );
            } catch (_) {
                resolve();
            }
        });

        const send = data => new Promise((resolve, reject) => {
            api.sendMessage(
                data,
                event.threadID,
                (err, info) => err ? reject(err) : resolve(info),
                event.messageID
            );
        });

        try {
            await react(tanvir143.emoji.loading);
            await fs.ensureDir(tanvir143.cache);

            const { data } = await axios.get(
                tanvir143.api + encodeURIComponent(url),
                { timeout: 30000 }
            );

            const videoURL = typeof data?.result === "string"
    ? data.result
    : data?.result?.video;

            if (!videoURL || !/^https?:\/\//i.test(videoURL)) {
                throw new Error("Video URL unavailable");
            }

            const response = await axios.get(videoURL, {
                responseType: "arraybuffer",
                timeout: 180000,
                maxContentLength: 1024 * 1024 * 1024
            });

            const contentType = String(
                response.headers["content-type"] || ""
            );

            if (
                !response.data?.length ||
                contentType.includes("text/html")
            ) {
                throw new Error("Invalid video response");
            }

            file = path.join(
                tanvir143.cache,
                `ig_${Date.now()}.mp4`
            );

            await fs.writeFile(file, response.data);

            await send({
                body: "📦 SENDING YOUR VIDEO...",
                attachment: fs.createReadStream(file)
            });

            await react(tanvir143.emoji.success);
        } catch (_) {
            await react(tanvir143.emoji.error);

            try {
                await send("❌ Video download failed.");
            } catch (_) {}
        } finally {
            if (file) {
                await fs.remove(file).catch(() => {});
            }
        }
    }
};
