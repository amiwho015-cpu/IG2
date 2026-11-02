
/**
 * File Name: gcimg.js
 * ICA: igbot-api
 * Author: Tanvir Ahmed (Tanvir143)
 * GitHub: www.github.com/143tanvir
 */

"use strict";

const sharp = require("sharp");
const fontkit = require("fontkit");
const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

const REGULAR_FONT = fontkit.openSync(
    require.resolve("@fontsource/roboto/files/roboto-latin-400-normal.woff")
);
const BOLD_FONT = fontkit.openSync(
    require.resolve("@fontsource/roboto/files/roboto-latin-700-normal.woff")
);

const WIDTH = 1600;
const CACHE_DIR = path.join(__dirname, "../cache");
const COLUMNS = 6;
const CELL_W = 225;
const CELL_H = 158;
const GAP_X = 16;
const GAP_Y = 18;
const GRID_Y = 365;
const AVATAR_SIZE = 86;

fs.ensureDirSync(CACHE_DIR);

function escapeXML(value = "") {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

// Convert Unicode mathematical/stylish letters to normal text.
function normalizeGroupName(value) {
    let name = String(value || "Instagram Group");

    try {
        name = name.normalize("NFKD");
    } catch {}

    return name
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[\u200B-\u200F\uFEFF]/g, "")
        .replace(/\s+/g, " ")
        .trim() || "Instagram Group";
}

function roundRect(x, y, w, h, r, fill, stroke = "none", sw = 1) {
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
}

function textWidth(value, font, size) {
    const layout = font.layout(String(value || ""));

    return layout.glyphs.reduce(
        (sum, glyph) => sum + glyph.advanceWidth,
        0
    ) * size / font.unitsPerEm;
}

function makeText(value, x, baseline, size, color, bold = false, anchor = "start") {
    const font = bold ? BOLD_FONT : REGULAR_FONT;
    const content = String(value || "");
    const layout = font.layout(content);
    const scale = size / font.unitsPerEm;
    let cursorX = x;

    const width = textWidth(content, font, size);

    if (anchor === "middle") cursorX -= width / 2;
    if (anchor === "end") cursorX -= width;

    const paths = [];

    for (let i = 0; i < layout.glyphs.length; i++) {
        const glyph = layout.glyphs[i];
        const pathData = glyph.path.toSVG();

        if (pathData) {
            paths.push(
                `<path d="${pathData}" transform="translate(${cursorX.toFixed(2)},${baseline}) scale(${scale},-${scale})"/>`
            );
        }

        cursorX += glyph.advanceWidth * scale;
    }

    return `<g fill="${color}">${paths.join("")}</g>`;
}

function makeFittedText(value, x, baseline, maxWidth, maxSize, color, bold = false, anchor = "start") {
    const font = bold ? BOLD_FONT : REGULAR_FONT;
    let content = String(value || "");
    let size = maxSize;

    while (
        content &&
        textWidth(content, font, size) > maxWidth &&
        size > 10
    ) {
        size -= 1;
    }

    if (textWidth(content, font, size) > maxWidth) {
        while (
            content.length > 3 &&
            textWidth(content + "...", font, size) > maxWidth
        ) {
            content = content.slice(0, -1);
        }

        content += "...";
    }

    return makeText(content, x, baseline, size, color, bold, anchor);
}

function getThreadInfo(api, threadID) {
    return new Promise((resolve, reject) => {
        let finished = false;

        const done = (err, data) => {
            if (finished) return;
            finished = true;

            if (err) reject(err);
            else resolve(data);
        };

        try {
            const result = api.getThreadInfo(threadID, done);

            if (result && typeof result.then === "function") {
                result.then(data => done(null, data)).catch(done);
            } else if (result && typeof result === "object") {
                done(null, result);
            }
        } catch (error) {
            done(error);
        }
    });
}

function getUserInfo(api, userID) {
    return new Promise((resolve, reject) => {
        if (!api || typeof api.getUserInfo !== "function") {
            return resolve(null);
        }

        let finished = false;

        const done = (err, data) => {
            if (finished) return;
            finished = true;

            if (err) reject(err);
            else resolve(data);
        };

        try {
            const result = api.getUserInfo(userID, done);

            if (result && typeof result.then === "function") {
                result.then(data => done(null, data)).catch(done);
            } else if (result && typeof result === "object") {
                done(null, result);
            }
        } catch (error) {
            done(error);
        }
    });
}

function normalizeIDs(ids) {
    if (!Array.isArray(ids)) return [];

    return ids.map(item => {
        if (item && typeof item === "object") {
            return String(item.id || item.userID || item.uid || "");
        }

        return String(item || "");
    }).filter(Boolean);
}

function getGroupImageURL(info) {
    return info.imageSrc ||
        info.imageUrl ||
        info.threadImage ||
        info.photo ||
        null;
}

function getAvatarURL(info = {}) {
    return info.thumbSrc ||
        info.profilePicUrl ||
        info.avatar ||
        info.image ||
        info.photoUrl ||
        info.picture ||
        null;
}

function getUsername(info = {}) {
    let username = info.vanity ||
        info.username ||
        info.userName ||
        info.instagramUsername ||
        info.instagram_username ||
        info.handle ||
        "";

    username = String(username || "").trim();

    if (username.includes("/")) {
        username = username.split("/").filter(Boolean).pop() || "";
    }

    username = username.replace(/^@+/, "").trim();

    if (!username || username === "undefined" || username === "null") {
        return "";
    }

    return "@" + username;
}

async function downloadBuffer(url, timeout = 10000) {
    if (!url || typeof url !== "string") return null;

    try {
        const response = await axios.get(url, {
            responseType: "arraybuffer",
            timeout,
            maxContentLength: 10 * 1024 * 1024,
            headers: {
                "User-Agent": "Mozilla/5.0"
            }
        });

        const buffer = Buffer.from(response.data);

        return buffer.length ? buffer : null;
    } catch {
        return null;
    }
}

async function prepareAvatar(url, size) {
    const buffer = await downloadBuffer(url);

    if (!buffer) return null;

    try {
        return await sharp(buffer)
            .rotate()
            .resize(size, size, {
                fit: "cover",
                position: "centre"
            })
            .png()
            .toBuffer();
    } catch {
        return null;
    }
}

async function getUserAvatar(api, usersData, userID, initialInfo = {}) {
    let info = { ...initialInfo };

    try {
        if (usersData && typeof usersData.getAvatarUrl === "function") {
            const url = await usersData.getAvatarUrl(String(userID));
            const avatar = await prepareAvatar(url, AVATAR_SIZE);

            if (avatar) {
                return { avatar, info };
            }
        }
    } catch {}

    let avatar = await prepareAvatar(getAvatarURL(info), AVATAR_SIZE);

    if (avatar) {
        return { avatar, info };
    }

    try {
        const fetched = await getUserInfo(api, String(userID));

        if (fetched && typeof fetched === "object") {
            const user = fetched[String(userID)] || fetched;

            info = { ...user, ...info };

            for (const key of [
                "thumbSrc",
                "profilePicUrl",
                "avatar",
                "image",
                "photoUrl",
                "picture",
                "username",
                "userName",
                "vanity",
                "instagramUsername"
            ]) {
                if (!info[key] && user[key]) {
                    info[key] = user[key];
                }
            }
        }
    } catch {}

    avatar = await prepareAvatar(getAvatarURL(info), AVATAR_SIZE);

    if (!avatar) return null;

    return { avatar, info };
}

async function circleAvatar(buffer, size) {
    const resized = await sharp(buffer)
        .resize(size, size, { fit: "cover" })
        .png()
        .toBuffer();

    const mask = Buffer.from(`
        <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
            <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/>
        </svg>
    `);

    return sharp(resized)
        .composite([{ input: mask, blend: "dest-in" }])
        .png()
        .toBuffer();
}

async function createGroupCard(threadInfo, api, usersData) {
    // Normalize stylish Unicode group names before rendering.
    const threadName = normalizeGroupName(threadInfo.threadName);

    const participantIDs = [
        ...new Set(normalizeIDs(threadInfo.participantIDs))
    ];

    const adminIDs = normalizeIDs(threadInfo.adminIDs);

    const userInfoList = Array.isArray(threadInfo.userInfo)
        ? threadInfo.userInfo
        : [];

    const groupAvatarSize = 126;
    const gridWidth = COLUMNS * CELL_W + (COLUMNS - 1) * GAP_X;
    const startX = (WIDTH - gridWidth) / 2;

    const groupImage = await prepareAvatar(
        getGroupImageURL(threadInfo),
        groupAvatarSize
    );

    const groupAvatar = groupImage
        ? await circleAvatar(groupImage, groupAvatarSize)
        : null;

    const members = [];

    // Include members only when their profile picture is available.
    for (const id of participantIDs) {
        const info = userInfoList.find(item =>
            String(item.id || item.userID || item.uid || "") === id
        ) || {};

        try {
            const result = await getUserAvatar(
                api,
                usersData,
                id,
                info
            );

            if (!result || !result.avatar) continue;

            members.push({
                id,
                avatar: result.avatar,
                username: getUsername(result.info || info),
                isAdmin: adminIDs.includes(id)
            });
        } catch (error) {
            console.error("[GCIMG MEMBER]", id, error.message);
        }
    }

    const rows = Math.max(1, Math.ceil(members.length / COLUMNS));
    const height = GRID_Y + rows * (CELL_H + GAP_Y) + 65;
    const adminCount = adminIDs.length;
    const svg = [];

    svg.push(`
        <svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}">
            <defs>
                <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="#0b1220"/>
                    <stop offset="55%" stop-color="#111c35"/>
                    <stop offset="100%" stop-color="#082f49"/>
                </linearGradient>
                <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stop-color="#2dd4bf"/>
                    <stop offset="100%" stop-color="#a3e635"/>
                </linearGradient>
                <linearGradient id="card" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#152238"/>
                    <stop offset="100%" stop-color="#0f172a"/>
                </linearGradient>
            </defs>
            <rect width="${WIDTH}" height="${height}" fill="url(#bg)"/>
            <circle cx="1480" cy="40" r="300" fill="#22d3ee" opacity="0.06"/>
            ${roundRect(35, 35, WIDTH - 70, height - 70, 42, "#0d1526", "#263449", 2)}
            ${roundRect(70, 70, WIDTH - 140, 9, 5, "url(#accent)")}
            ${roundRect(75, 105, 1450, 170, 28, "#111c30", "#29384e", 2)}
            ${makeText("OUR GROUP MEMBERS", 285, 165, 35, "#ffffff", true)}
            ${makeFittedText(threadName, 285, 213, 850, 27, "#67e8f9", true)}
            ${makeText("GROUP", 285, 245, 16, "#94a3b8", true)}
            ${roundRect(1260, 125, 2, 105, 1, "#334155")}
            ${roundRect(1415, 125, 2, 105, 1, "#334155")}
            ${makeText(String(participantIDs.length), 1280, 173, 35, "#ffffff", true)}
            ${makeText("MEMBERS", 1280, 205, 14, "#94a3b8", true)}
            ${makeText(String(adminCount), 1430, 173, 35, "#a3e635", true)}
            ${makeText("ADMINS", 1430, 205, 14, "#94a3b8", true)}
            ${roundRect(90, 300, 1420, 2, 1, "#334155")}
    `);

    for (let i = 0; i < members.length; i++) {
        const row = Math.floor(i / COLUMNS);
        const col = i % COLUMNS;
        const x = startX + col * (CELL_W + GAP_X);
        const y = GRID_Y + row * (CELL_H + GAP_Y);

        svg.push(
            roundRect(
                x,
                y,
                CELL_W,
                CELL_H,
                22,
                "url(#card)",
                "#29384e",
                2
            )
        );
    }

    svg.push("</svg>");

    const overlays = [];

    if (groupAvatar) {
        overlays.push({
            input: groupAvatar,
            left: 105,
            top: 127
        });
    }

    const rings = [];

    for (let i = 0; i < members.length; i++) {
        const member = members[i];
        const row = Math.floor(i / COLUMNS);
        const col = i % COLUMNS;
        const x = startX + col * (CELL_W + GAP_X);
        const y = GRID_Y + row * (CELL_H + GAP_Y);
        const centerX = x + CELL_W / 2;
        const avatarY = y + 10;

        overlays.push({
            input: await circleAvatar(member.avatar, AVATAR_SIZE),
            left: Math.round(centerX - AVATAR_SIZE / 2),
            top: Math.round(avatarY)
        });

        if (member.isAdmin) {
            rings.push(
                `<circle cx="${centerX}" cy="${avatarY + AVATAR_SIZE / 2}" r="${AVATAR_SIZE / 2 + 4}" fill="none" stroke="#22c55e" stroke-width="5"/>`
            );
        }

        // Show username only, never the display name.
        if (member.username) {
            const usernameSVG = Buffer.from(`
                <svg xmlns="http://www.w3.org/2000/svg" width="${CELL_W}" height="38">
                    ${makeFittedText(
                        member.username,
                        CELL_W / 2,
                        25,
                        CELL_W - 18,
                        17,
                        "#e2e8f0",
                        true,
                        "middle"
                    )}
                </svg>
            `);

            overlays.push({
                input: usernameSVG,
                left: Math.round(x),
                top: Math.round(y + 108)
            });
        }
    }

    if (rings.length) {
        overlays.push({
            input: Buffer.from(`
                <svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}">
                    ${rings.join("\n")}
                </svg>
            `),
            left: 0,
            top: 0
        });
    }

    return sharp(Buffer.from(svg.join("\n")))
        .composite(overlays)
        .png()
        .toBuffer();
}

module.exports = {
    config: {
        name: "gcimg",
        aliases: ["groupimage", "groupcard", "gc"],
        version: "5.1.0",
        author: "Tanvir Ahmed (Tanvir143)",
        countDown: 10,
        role: 0,
        shortDescription: "Create a group member DP card",
        longDescription: "Creates a group card with member profile pictures and usernames.",
        category: "group",
        guide: "{pn}"
    },

    onStart: async function ({ api, event, message, usersData }) {
        const threadID = String(event.threadID || "");
        let filePath = null;

        try {
            await message.reply("⏳ Group card তৈরি হচ্ছে...");

            const threadInfo = await getThreadInfo(api, threadID);

            if (!threadInfo) {
                return message.reply(
                    "❌ Group information পাওয়া যায়নি।"
                );
            }

            const image = await createGroupCard(
                threadInfo,
                api,
                usersData
            );

            filePath = path.join(
                CACHE_DIR,
                `gcimg_${threadID}_${Date.now()}.png`
            );

            await fs.writeFile(filePath, image);

            await message.reply({
                body: "🖼️ Group card তৈরি হয়েছে!",
                attachment: fs.createReadStream(filePath)
            });
        } catch (error) {
            console.error("[GCIMG ERROR]", error);

            return message.reply(
                "❌ Group card তৈরি করা যায়নি। Console-এর [GCIMG ERROR] দেখো।"
            );
        } finally {
            if (filePath) {
                setTimeout(() => {
                    fs.remove(filePath).catch(() => {});
                }, 60000);
            }
        }
    }
};
