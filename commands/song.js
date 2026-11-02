/**
 * File Name: song.js
 * ICA: igbot-api
 * Author: Tanvir Ahmed (Tanvir143)
 * GitHub: www.github.com/143tanvir
 * Instagram: @ig.tanvir_ahmed
 */

"use strict";

const fs = require("fs-extra");
const axios = require("axios");
const os = require("os");
const path = require("path");

const MAX_SIZE = 25 * 1024 * 1024;

// Use OS temporary directory instead of a hardcoded app path.
const TMP_DIR = path.join(os.tmpdir(), "igbot-song");

function getError(err) {
    if (!err) return "Unknown error";
    if (typeof err === "string") return err;

    const data = err.response?.data;

    if (typeof data === "string") return data;

    if (data && typeof data === "object") {
        try {
            return JSON.stringify(data);
        } catch (_) {}
    }

    return err.message || String(err);
}

function formatDuration(value) {
    if (value === undefined || value === null || value === "") {
        return "Unknown";
    }

    if (typeof value === "string" && value.includes(":")) {
        return value;
    }

    let seconds = Number(value);

    if (!Number.isFinite(seconds) || seconds <= 0) {
        return "Unknown";
    }

    if (seconds > 10000) {
        seconds = Math.floor(seconds / 1000);
    }

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    return hours > 0
        ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
        : `${minutes}:${String(secs).padStart(2, "0")}`;
}

function findAudioUrl(obj, depth = 0) {
    if (!obj || typeof obj !== "object" || depth > 5) {
        return null;
    }

    const keys = [
        "progressive_download_url",
        "fast_start_progressive_download_url",
        "download_url",
        "downloadUrl",
        "audio_url",
        "audioUrl",
        "previewUrl",
        "preview_url",
        "web_30s_preview_download_url",
        "stream_url",
        "streamUrl",
        "url",
        "src",
        "link"
    ];

    for (const key of keys) {
        const value = obj[key];

        if (typeof value === "string" && /^https?:\/\//i.test(value)) {
            return value;
        }

        if (value && typeof value === "object") {
            const nested = findAudioUrl(value, depth + 1);
            if (nested) return nested;
        }
    }

    for (const key of [
        "track", "data", "result", "audio", "media", "music"
    ]) {
        if (obj[key] && typeof obj[key] === "object") {
            const nested = findAudioUrl(obj[key], depth + 1);
            if (nested) return nested;
        }
    }

    return null;
}

function getFirstTrack(data) {
    if (!data) return null;

    let list = Array.isArray(data)
        ? data
        : data.items ||
          data.tracks ||
          data.results ||
          data.songs ||
          data.data?.items ||
          data.data?.tracks ||
          data.data?.results ||
          data.data ||
          (data.track ? [data.track] : []);

    if (!Array.isArray(list)) {
        list = list && typeof list === "object" ? [list] : [];
    }

    if (!list.length) return null;

    const entry = list[0];
    const track = entry?.track || entry?.original_sound || entry;

    return {
        title:
            track?.title ||
            track?.canonical_title ||
            track?.name ||
            "Unknown Song",

        artist:
            track?.artist ||
            track?.display_artist ||
            track?.singer ||
            track?.channel ||
            track?.artist_name ||
            "Unknown Artist",

        duration:
            track?.duration ??
            track?.duration_seconds ??
            track?.durationSeconds ??
            track?.length ??
            track?.video_duration ??
            entry?.duration ??
            0,

        url: findAudioUrl(entry) || findAudioUrl(track)
    };
}

async function searchFirstSong(api, message, query) {
    let result;

    if (typeof api.searchMusic === "function") {
        result = await api.searchMusic(query);
    } else if (typeof message.musicSearch === "function") {
        result = await message.musicSearch(query);
    } else {
        throw new Error("ICA music search method paoa jayni.");
    }

    console.log("[SONG SEARCH RESULT]", JSON.stringify(result, null, 2));

    const track = getFirstTrack(result);

    if (!track) {
        throw new Error("Kono song search result paoa jayni.");
    }

    if (!track.url) {
        throw new Error("First result-e downloadable audio URL nei.");
    }

    return track;
}

async function sendFirstSong(api, event, track) {
    // Create a writable temporary directory automatically.
    await fs.ensureDir(TMP_DIR);

    const file = path.join(
        TMP_DIR,
        `song_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`
    );

    let writer;
    let downloadStream;

    try {
        const response = await axios.get(track.url, {
            responseType: "stream",
            timeout: 60000,
            maxRedirects: 5,
            headers: {
                "User-Agent": "Mozilla/5.0"
            },
            validateStatus: status => status >= 200 && status < 300
        });

        downloadStream = response.data;

        const contentType = String(
            response.headers["content-type"] || ""
        ).toLowerCase();

        if (
            contentType.includes("text/html") ||
            contentType.includes("application/json")
        ) {
            downloadStream.destroy();
            throw new Error("Audio URL theke audio file paoa jayni.");
        }

        const contentLength = Number(
            response.headers["content-length"] || 0
        );

        if (contentLength > MAX_SIZE) {
            downloadStream.destroy();
            throw new Error("Song file 25 MB-er beshi.");
        }

        let downloaded = 0;
        writer = fs.createWriteStream(file);

        await new Promise((resolve, reject) => {
            let settled = false;

            const fail = error => {
                if (settled) return;
                settled = true;
                downloadStream.destroy();
                writer.destroy();
                reject(error);
            };

            downloadStream.on("data", chunk => {
                downloaded += chunk.length;

                if (downloaded > MAX_SIZE) {
                    fail(new Error("Song file 25 MB-er beshi."));
                }
            });

            downloadStream.on("error", fail);
            writer.on("error", fail);

            writer.on("finish", () => {
                if (settled) return;
                settled = true;
                resolve();
            });

            downloadStream.pipe(writer);
        });

        if (!downloaded || !(await fs.pathExists(file))) {
            throw new Error("Downloaded audio file empty.");
        }

        const stat = await fs.stat(file);

        if (stat.size > MAX_SIZE) {
            throw new Error("Song file 25 MB-er beshi.");
        }

        const body =
            `🎧 Song: ${track.title}\n` +
            `🎤 Publisher: ${track.artist}\n\n` +
            `😘 Enjoy Using Tanvir143 Robot..`;

        await new Promise((resolve, reject) => {
            const stream = fs.createReadStream(file);

            stream.on("error", reject);

            api.sendMessage(
                {
                    body,
                    attachment: stream
                },
                event.threadID,
                err => {
                    if (err) return reject(err);
                    resolve();
                },
                event.messageID
            );
        });
    } finally {
        if (downloadStream && !downloadStream.destroyed) {
            downloadStream.destroy();
        }

        if (writer && !writer.destroyed) {
            writer.destroy();
        }

        await fs.remove(file).catch(() => {});
    }
}

async function react(api, event, emoji) {
    try {
        await api.setMessageReaction(
            emoji,
            event.messageID,
            event.threadID
        );
    } catch (_) {}
}

module.exports = {
    config: {
        name: "song",
        aliases: ["sing", "play", "audio"],
        version: "5.1.0",
        author: "Tanvir143",
        countDown: 10,
        role: 0,
        category: "Users cmd",
        shortDescription: {
            en: "Search and send a song."
        },
        description: {
            en: "Search and send the first song as audio."
        },
        guide: {
            en: "{pn} <song name>"
        }
    },

    onStart: async function ({ api, event, args, message }) {
        const query = args.join(" ").trim();

        if (!query) {
            await react(api, event, "❌");

            return message.reply(
                "🎵 Gaaner naam dao.\nExample: .song Jaane Kyun"
            );
        }

        await react(api, event, "😘");

        try {
            const track = await searchFirstSong(api, message, query);

            await sendFirstSong(api, event, track);

            await react(api, event, "✅");
        } catch (err) {
            console.error("[SONG ERROR]", err);

            await react(api, event, "❌");

            return message.reply(
                `❌ Song pathano jayni.\n📝 ${getError(err)}`
            );
        }
    }
};
