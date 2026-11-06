
"use strict";

const axios = require("axios");
const fs = require("fs-extra");
const os = require("os");
const path = require("path");

const tanvir143Song = {
    config: {
        name: "song",
        aliases: ["sing", "play", "audio"],
        version: "9.0.0",
        author: "Tanvir Ahmed (Tanvir143)",
        cooldown: 4,
        role: 0,
        category: "Users Cmd",
        shortDescription: "Send the first song from search results",
        description: "Search and send the first available song.",
        guide: "{pn} song name"
    },

    onStart: async function ({ api, event, args, message }) {
        const query = args.join(" ").trim();
        const threadID = event.threadID;

        const tempDir = path.join(
            os.tmpdir(),
            "tanvir143-song"
        );

        let tempFile = null;

        function getError(error) {
            return error?.response?.data?.message ||
                error?.message ||
                String(error);
        }

        async function react(emoji) {
            try {
                if (typeof api.setMessageReaction === "function") {
                    return await api.setMessageReaction({
                        emoji,
                        messageId: event.messageID,
                        threadId: threadID
                    });
                }

                if (typeof api.sendReaction === "function") {
                    return await api.sendReaction(
                        threadID,
                        event.messageID,
                        emoji
                    );
                }
            } catch (error) {
                try {
                    if (typeof api.sendReaction === "function") {
                        return await api.sendReaction(
                            threadID,
                            event.messageID,
                            emoji
                        );
                    }
                } catch (fallbackError) {
                    console.error(
                        "[TANVIR143 REACTION ERROR]",
                        fallbackError.message
                    );
                }

                console.error(
                    "[TANVIR143 REACTION ERROR]",
                    error.message
                );
            }
        }

        function getFirstTrack(data) {
            if (!data) return null;

            if (Array.isArray(data)) {
                return data[0] || null;
            }

            if (typeof data !== "object") {
                return null;
            }

            const lists = [
                data.tracks,
                data.results,
                data.songs,
                data.items,
                data.data
            ];

            for (const list of lists) {
                if (Array.isArray(list) && list.length) {
                    return list[0];
                }
            }

            if (
                data.data &&
                typeof data.data === "object"
            ) {
                return getFirstTrack(data.data);
            }

            return data;
        }

        function findAudioUrl(data) {
            if (!data) return null;

            const keys = [
                "progressive_download_url",
                "fast_start_progressive_download_url",
                "download_url",
                "downloadUrl",
                "audio_url",
                "audioUrl",
                "stream_url",
                "streamUrl",
                "url",
                "src",
                "link"
            ];

            if (typeof data === "string") {
                return /^https?:\/\//i.test(data)
                    ? data
                    : null;
            }

            if (Array.isArray(data)) {
                for (const item of data) {
                    const result = findAudioUrl(item);
                    if (result) return result;
                }
                return null;
            }

            if (typeof data === "object") {
                for (const key of keys) {
                    const value = data[key];

                    if (
                        typeof value === "string" &&
                        /^https?:\/\//i.test(value)
                    ) {
                        return value;
                    }
                }

                for (const value of Object.values(data)) {
                    if (value && typeof value === "object") {
                        const result = findAudioUrl(value);
                        if (result) return result;
                    }
                }
            }

            return null;
        }

        function isM4AUrl(url) {
            try {
                return new URL(url).pathname
                    .toLowerCase()
                    .endsWith(".m4a");
            } catch {
                return false;
            }
        }

        async function downloadM4A(url, filePath) {
            const response = await axios({
                method: "GET",
                url,
                responseType: "arraybuffer",
                timeout: 60000,
                maxContentLength: 25 * 1024 * 1024,
                maxBodyLength: 25 * 1024 * 1024,
                headers: {
                    "User-Agent": "Mozilla/5.0"
                }
            });

            const buffer = Buffer.from(response.data);

            if (!buffer.length) {
                throw new Error("Audio file is empty.");
            }

            if (buffer.length > 25 * 1024 * 1024) {
                throw new Error("Song file is larger than 25 MB.");
            }

            if (
                buffer.length < 12 ||
                buffer.toString("ascii", 4, 8) !== "ftyp"
            ) {
                throw new Error("Invalid M4A audio file.");
            }

            await fs.writeFile(filePath, buffer);
            return filePath;
        }

        async function sendAudio(source) {
            if (typeof api.sendVoice !== "function") {
                throw new Error(
                    "ICA sendVoice() function paoa jayni."
                );
            }

            return api.sendVoice({
                ...source,
                threadId: threadID
            });
        }

        try {
            // Start reaction without blocking song search
            void react("😘");

            if (!query) {
                return message.reply(
                    "🎵 | Please provide a song name.\n" +
                    "Example: song Believer"
                );
            }

            if (typeof api.searchMusic !== "function") {
                throw new Error(
                    "ICA searchMusic() function paoa jayni."
                );
            }

            // Get only the first search result
            const searchResult = await api.searchMusic(query);
            const track = getFirstTrack(searchResult);

            if (!track) {
                throw new Error("No song found.");
            }

            const audioUrl =
                findAudioUrl(track) ||
                findAudioUrl(searchResult);

            if (!audioUrl) {
                throw new Error(
                    "First song has no audio URL."
                );
            }

            const title =
                track.title ||
                track.name ||
                track.track_name ||
                query;

            const artist =
                track.artist ||
                track.artists ||
                track.author ||
                track.singer ||
                "Unknown Artist";

            const infoText =
                `🎧 Song: ${title}\n` +
                `🎤 Artist: ${artist}`;

            let audioSource;

            if (isM4AUrl(audioUrl)) {
                audioSource = {
                    url: audioUrl
                };
            } else {
                await fs.ensureDir(tempDir);

                tempFile = path.join(
                    tempDir,
                    `tanvir143-${Date.now()}.m4a`
                );

                await downloadM4A(audioUrl, tempFile);

                audioSource = {
                    path: tempFile
                };
            }

            // Send song and information at the same time
            const [audioResult, infoResult] =
                await Promise.allSettled([
                    sendAudio(audioSource),
                    message.reply(infoText)
                ]);

            if (audioResult.status === "rejected") {
                throw audioResult.reason;
            }

            if (infoResult.status === "rejected") {
                console.error(
                    "[TANVIR143 INFO ERROR]",
                    getError(infoResult.reason)
                );
            }

            void react("✅");

        } catch (error) {
            console.error(
                "[TANVIR143 SONG ERROR]",
                error
            );

            void react("❌");

            try {
                await message.reply(
                    "❌ | Song failed.\n\n" +
                    `📝 | Error: ${getError(error)}`
                );
            } catch (replyError) {
                console.error(
                    "[TANVIR143 REPLY ERROR]",
                    getError(replyError)
                );
            }

        } finally {
            if (tempFile) {
                try {
                    await fs.remove(tempFile);
                } catch (error) {
                    console.error(
                        "[TANVIR143 CLEANUP ERROR]",
                        error.message
                    );
                }
            }
        }
    }
};

module.exports = tanvir143Song;
