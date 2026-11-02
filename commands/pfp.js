/**
 * File Name: pfp.js
 * ICA: igbot-api
 * Auhor: Tanvir Ahmed (Tanvir143)
 * GitHub: www.github.com/143tanvir
 * WhatsApp: +8801750079773
 * Note: Project metadata only; original source credits and license notices are retained.
 */


"use strict";
/*
* Author  : Tanvir Ahmed (Tanvir143)
* GitHub  : www.github.com/143tanvir
* WhatsApp: +88 017500-79773
*/
const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

function getMentionID(event) {
    const mentions = event.mentions || {};

    if (Array.isArray(mentions)) {
        const first = mentions[0];
        return first?.id || first?.userID || first?.senderID || null;
    }

    const ids = Object.keys(mentions);
    return ids.length ? ids[0] : null;
}

function getReplyID(event) {
    return (
        event.messageReply?.senderID ||
        event.messageReply?.senderId ||
        event.messageReply?.userID ||
        null
    );
}

async function getUserInfo(api, userID) {
    if (typeof api.getUserInfo !== "function") {
        throw new Error("api.getUserInfo method paoa jayni.");
    }

    const result = await api.getUserInfo(userID);
    return result?.[userID] || result?.data?.[userID] || result;
}

function getImageUrl(info) {
    if (typeof info === "string" && /^https?:\/\//i.test(info)) {
        return info;
    }

    return (
        info?.thumbSrc ||
        info?.profilePicUrl ||
        info?.profile_pic_url ||
        info?.avatar ||
        info?.avatarUrl ||
        info?.picture ||
        info?.photoUrl ||
        info?.image ||
        info?.url ||
        null
    );
}

async function sendProfilePicture(api, event, imageUrl, name = "User") {
    const tempDir = path.join(__dirname, "tmp");
    await fs.ensureDir(tempDir);

    const filePath = path.join(tempDir, `pfp_${Date.now()}.jpg`);

    try {
        const response = await axios.get(imageUrl, {
            responseType: "arraybuffer",
            timeout: 30000,
            maxRedirects: 5,
            headers: { "User-Agent": "Mozilla/5.0" },
            validateStatus: status => status >= 200 && status < 300
        });

        const contentType = String(
            response.headers["content-type"] || ""
        ).toLowerCase();

        if (!contentType.startsWith("image/")) {
            throw new Error("Profile picture URL valid image return koreni.");
        }

        await fs.writeFile(filePath, response.data);

        await new Promise((resolve, reject) => {
            api.sendMessage(
                {
                    body: `✅ ${name}'s Profile Picture`,
                    attachment: fs.createReadStream(filePath)
                },
                event.threadID,
                err => err ? reject(err) : resolve(),
                event.messageID
            );
        });
    } finally {
        await fs.remove(filePath).catch(() => {});
    }
}

module.exports = {
    config: {
        name: "pfp",
        aliases: ["profilepic", "profilepicture"],
        version: "2.0.0",
        author: "Tanvir143",
        countDown: 5,
        role: 0,
        category: "Users cmd",
        description: {
            en: "Get a user's profile picture."
        },
        guide: {
            en: "{pn} @mention | reply | @username"
        }
    },

    onStart: async function ({ api, event, args, message }) {
        try {
            let userID = getMentionID(event);
            let username = "";

            // Reply target
            if (!userID && event.messageReply) {
                userID = getReplyID(event);
            }

            // Username lookup requires an API method that supports it.
            if (!userID && args.length) {
                username = args.join(" ").replace(/^@/, "").trim();
            }

            if (!userID && !username) {
                userID = event.senderID;
            }

            let info;

            if (userID) {
                info = await getUserInfo(api, userID);
            } else {
                const lookupMethods = [
                    api.getUserByUsername,
                    api.findUserByUsername,
                    api.searchUser
                ];

                const lookup = lookupMethods.find(
                    fn => typeof fn === "function"
                );

                if (!lookup) {
                    return message.reply(
                        "❌ Username lookup ei API-te available nei. Mention ba reply diye try koro."
                    );
                }

                info = await lookup.call(api, username);
                info = info?.user || info?.data?.user || info?.data || info;
            }

            const imageUrl = getImageUrl(info);

            if (!imageUrl) {
                return message.reply(
                    "❌ Profile picture URL paoa jayni. API response-e image field check korte hobe."
                );
            }

            const name =
                info?.name ||
                info?.fullName ||
                info?.full_name ||
                info?.username ||
                username ||
                "User";

            await sendProfilePicture(api, event, imageUrl, name);
        } catch (err) {
            console.error("[PFP ERROR]", err);

            return message.reply(
                `❌ PFP pathano jayni.\n📝 ${err.message || "Unknown error"}`
            );
        }
    }
};
