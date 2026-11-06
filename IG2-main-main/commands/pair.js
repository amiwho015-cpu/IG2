const axios = require("axios");
const { pickPartner } = require("../src/gender");
const Canvas = require("canvas");
const fs = require("fs");
const path = require("path");
const { safeLoadImage, safeLoadBackground, safeThreadInfo } = require("../src/pairUtil");

const BACKGROUNDS = [
  "https://i.imgur.com/0aEluTM.jpeg",
  "https://i.imgur.com/0geTIBC.jpeg",
  "https://i.imgur.com/3Y3C1Yr.jpeg",
  "https://i.imgur.com/2zz53lV.jpeg",
  "https://i.imgur.com/S1hIuc7.jpeg",
  "https://i.imgur.com/2lDJNM3.jpeg",
  "https://i.imgur.com/2PrkMNy.jpeg",
  "https://i.imgur.com/TF9diX2.jpeg",
  "https://i.imgur.com/fK7OtYq.jpeg",
  "https://i.imgur.com/5OO802y.jpeg"
];


async function resolvePairProfile(api, target) {
  const query = String(target?.id || target?.query || "").trim().replace(/^@/, "");
  if (!query) return null;
  try {
    if (typeof api.getUserInfo === "function") {
      const result = await api.getUserInfo([query]);
      const profile = result && (result[query] || Object.values(result)[0]);
      if (profile && (profile.profilePicture || profile.thumbSrc || profile.username || profile.userID)) return profile;
    }
  } catch (error) {
    console.warn("[pair] direct profile lookup failed:", error.message);
  }
  // Fallback to Instagram's own user search (not Pinterest or a random image site).
  if (!target.id && typeof api.searchUsers === "function") {
    try {
      const results = await api.searchUsers(query);
      if (Array.isArray(results) && results.length) {
        const exact = results.find(u => String(u.username || "").toLowerCase() === query.toLowerCase());
        return exact || results[0];
      }
    } catch (error) {
      console.warn("[pair] Instagram user search failed:", error.message);
    }
  }
  return null;
}

module.exports = {
  config: {
    name: "pair",
    version: "9.5",
    author: "CRX Shihab",
    role: 0,
    countDown: 5,
    shortDescription: "Romantic pair system with random background",
    category: "LOVE"
  },

  onStart: async function ({ api, event, usersData, args }) {
    const { threadID, messageID, senderID, messageReply } = event;

    try {
      let targetID = senderID;
      let targetName = null;
      let avt1 = null;
      let avt2 = null;
      let senderName = "User";
      let partner = null;
      let senderGender = 0;

      // Explicit targets: .pair @username1 @username2, .pair @username, or .pair name
      // Mention IDs are preferred; otherwise resolve public Instagram usernames/search results.
      const mentionedIDs = Object.keys(event.mentions || {});
      const rawTargets = (Array.isArray(args) ? args : [])
        .map(v => String(v).trim())
        .filter(v => v && !["boy", "girl", "random"].includes(v.toLowerCase()));
      const explicitTargets = [];
      for (let i = 0; i < Math.max(mentionedIDs.length, rawTargets.length); i++) {
        if (mentionedIDs[i]) explicitTargets.push({ id: mentionedIDs[i] });
        else if (rawTargets[i]) explicitTargets.push({ query: rawTargets[i].replace(/^@/, "") });
      }

      if (explicitTargets.length >= 2) {
        const [p1, p2] = await Promise.all([
          resolvePairProfile(api, explicitTargets[0]),
          resolvePairProfile(api, explicitTargets[1])
        ]);
        if (!p1 || !p2) throw new Error("দুইজনের Instagram profile পাওয়া যায়নি। @username দিয়ে চেষ্টা করো।");
        senderName = p1.name || p1.username || "User 1";
        partner = { id: p2.userID || p2.id || p2.username, name: p2.name || p2.username || "User 2", gender: 0 };
        avt1 = p1.profilePicture || p1.thumbSrc || p1.profile_pic_url || null;
        avt2 = p2.profilePicture || p2.thumbSrc || p2.profile_pic_url || null;
        senderGender = 0;
      } else if (explicitTargets.length === 1) {
        const p2 = await resolvePairProfile(api, explicitTargets[0]);
        if (!p2) throw new Error("Instagram profile পাওয়া যায়নি। @username দিয়ে চেষ্টা করো।");
        const me = await usersData.get(senderID);
        senderName = me.name || "User";
        partner = { id: p2.userID || p2.id || p2.username, name: p2.name || p2.username || "User", gender: 0 };
        avt1 = await usersData.getAvatarUrl(senderID);
        avt2 = p2.profilePicture || p2.thumbSrc || p2.profile_pic_url || null;
        senderGender = me.gender || 0;
      } else {
        if (messageReply) {
          targetID = messageReply.senderID;
          try {
            const userData = await usersData.get(targetID);
            targetName = userData.name || "User";
          } catch { targetName = "User"; }
        }

        const [senderData, threadInfo] = await Promise.all([
          usersData.get(targetID),
          safeThreadInfo(api, threadID, event)
        ]);
        senderName = targetName || senderData.name || "User";
        const members = threadInfo.participantIDs.map(String).filter(uid => uid != String(targetID));
        const wanted = ["boy", "girl"].includes(String(args[0] || "").toLowerCase()) ? String(args[0]).toLowerCase() : null;
        let me;
        try {
          ({ me, partner } = await pickPartner(usersData, String(targetID), members, wanted));
        } catch (e) {
          if (e.friendly) return api.sendMessage("⚠️ " + e.message, threadID, messageID);
          throw e;
        }
        senderGender = me.gender;
        avt1 = await usersData.getAvatarUrl(targetID);
        avt2 = await usersData.getAvatarUrl(partner.id);
      }

      if (!avt1 || !avt2) throw new Error("Profile picture পাওয়া যায়নি; account public আছে কি না দেখো।");

      const match = Math.floor(Math.random() * 31) + 70;

      let x1 = 0.20, y1 = 0.55, x2 = 0.80, y2 = 0.55;
      if (args.length >= 4) {
        const parsed = args.slice(0, 4).map(Number);
        if (parsed.every(n => !isNaN(n) && n >= 0 && n <= 1)) {
          [x1, y1, x2, y2] = parsed;
        }
      }

      const randomBg = BACKGROUNDS[Math.floor(Math.random() * BACKGROUNDS.length)];

      const templateImg = await safeLoadBackground(Canvas, axios, randomBg);

      const loadImage = url => safeLoadImage(Canvas, axios, url);

      const [img1, img2] = await Promise.all([loadImage(avt1), loadImage(avt2)]);

      const canvas = Canvas.createCanvas(templateImg.width, templateImg.height);
      const ctx = canvas.getContext("2d");

      ctx.drawImage(templateImg, 0, 0, canvas.width, canvas.height);

      const W = canvas.width;
      const H = canvas.height;
      const centerX1 = W * x1;
      const centerY1 = H * y1;
      const centerX2 = W * x2;
      const centerY2 = H * y2;
      const radius = W * 0.14;

      function drawCircleProfile(img, cx, cy, r) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        const aspect = img.width / img.height;
        let drawW, drawH, dx, dy;
        if (aspect > 1) {
          drawW = r * 2;
          drawH = drawW / aspect;
          dx = cx - r;
          dy = cy - drawH / 2;
        } else {
          drawH = r * 2;
          drawW = drawH * aspect;
          dx = cx - drawW / 2;
          dy = cy - r;
        }
        ctx.drawImage(img, dx, dy, drawW, drawH);
        ctx.restore();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = "#d4af37";
        ctx.lineWidth = 4;
        ctx.stroke();
      }

      drawCircleProfile(img1, centerX1, centerY1, radius);
      drawCircleProfile(img2, centerX2, centerY2, radius);

      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.font = `bold ${Math.round(W * 0.035)}px 'Segoe UI', 'Arial'`;
      ctx.fillStyle = "#ffffff";
      ctx.shadowBlur = 10;
      ctx.shadowColor = "#000000";

      const nameY1 = centerY1 + radius + 16;
      const nameY2 = centerY2 + radius + 16;
      const maxNameWidth = W * 0.2;
      function truncateName(name) {
        let w = ctx.measureText(name).width;
        if (w > maxNameWidth) {
          while (ctx.measureText(name + "…").width > maxNameWidth && name.length > 1) {
            name = name.slice(0, -1);
          }
          name += "…";
        }
        return name;
      }

      const displayName1 = truncateName(senderName);
      const displayName2 = truncateName(partner.name);

      ctx.fillStyle = "#ffffff";
      ctx.shadowBlur = 15;
      ctx.shadowColor = "rgba(0,0,0,0.8)";
      ctx.fillText(displayName1, centerX1, nameY1);
      ctx.fillText(displayName2, centerX2, nameY2);

      const cacheDir = path.join(__dirname, "cache");
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }

      const filePath = path.join(cacheDir, `pair_${Date.now()}.png`);
      fs.writeFileSync(filePath, canvas.toBuffer());

      const emoji = match > 85 ? "💞" : match > 75 ? "💗" : "💕";
      const compatibility = match > 85 ? "Perfect" : match > 75 ? "Great" : "Good";
      const genderEmoji1 = senderGender === 1 ? "👦" : senderGender === 2 ? "👧" : "👤";
      const genderEmoji2 = partner.gender === 1 ? "👦" : partner.gender === 2 ? "👧" : "👤";

      const msg = `${emoji} 𝗣𝗮𝗶𝗿 𝗠𝗮𝘁𝗰𝗵

${genderEmoji1} ${senderName} ✦ ${genderEmoji2} ${partner.name}
📊 ${match}% ${compatibility} Match
💘 Status: Matched!`;

      return await api.sendMessage(
        {
          body: msg,
          attachment: fs.createReadStream(filePath)
        },
        threadID,
        () => {
          if (fs.existsSync(filePath)) {
            try {
              fs.unlinkSync(filePath);
            } catch {}
          }
        },
        messageID
      );

    } catch (err) {
      console.error("[pair] failed:", err && err.stack || err);
      return api.sendMessage(`❌ | Pair system failed: ${String((err && err.message) || err).slice(0, 200)}`, threadID, messageID);
    }
  }
};
