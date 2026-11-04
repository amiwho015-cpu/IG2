const fs = require("fs");
const path = require("path");
const moment = require("moment-timezone");

const OWNER_VIDEO = path.join(__dirname, "..", "assets", "owner.mp4");

module.exports = {
  config: {
    name: "owner",
    aliases: ["admininfo", "ownerinfo"],
    version: "3.0",
    author: "Shihab",
    countDown: 5,
    role: 0,
    shortDescription: { en: "Show owner information" },
    category: "owner",
    guide: { en: "{pn}" }
  },

  onStart: async function ({ api, event, message }) {

    const ownerName = "Arfatul Islam Shihab";
    const ownerAge = "18+";
    const fbName = "loading";
    const messenger = "https://www.facebook.com/profile.php?id=100094063186003";
    const whatsapp = "016133853**";
    const telegram = "Ekon use Kori na😢";
    const address = "Chandanaish, Chittagong, Bangladesh";
    const religion = "Islam";
    const relationship = "Single"
    const timeBD = moment().tz("Asia/Dhaka");
    const study = "Hsc-result e mara kawar opoekka..😓";
    
    const infoMsg = 
`『 𝗢𝗪𝗡𝗘𝗥 𝗜𝗡𝗙𝗢𝗥𝗠𝗔𝗧𝗜𝗢𝗡 』
━━━━━━━━━━━━━━━━━━━━━

👤 𝗔𝗕𝗢𝗨𝗧 𝗠𝗘:
● Name: ${ownerName}
● Age: ${ownerAge}
● Relationship: ${relationship}
● Religion: ${religion}
● Address: ${address}
● study: ${study}

📞 𝗖𝗢𝗡𝗧𝗔𝗖𝗧 𝗗𝗘𝗧𝗔𝗜𝗟𝗦:
● Facebook: ${fbName}
● Fb Link: ${messenger}
● WhatsApp: ${whatsapp}
● Telegram: ${telegram}


⏰ 𝗗𝗔𝗧𝗘 & 𝗧𝗜𝗠𝗘 (𝗕𝗗):
● ${timeBD.format("DD MMMM, YYYY")}
● ${timeBD.format("hh:mm:ss A")}
━━━━━━━━━━━━━━━━━━━━━`;

    await message.reply(infoMsg);

    // Owner video goes last, after the info text.
    if (fs.existsSync(OWNER_VIDEO)) {
      try { await message.reply({ attachment: fs.createReadStream(OWNER_VIDEO) }); }
      catch (_) { /* info text already sent; ignore video failure */ }
    }
  },

  onChat: async function ({ event, message }) {
    if (event.body?.toLowerCase() === "info") {
      return this.onStart({ message, event });
    }
  }
};
