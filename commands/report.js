/**
 * File Name: report.js
 * ICA: igbot-api
 * Author: Tanvir Ahmed (Tanvir143)
 * GitHub: www.github.com/143tanvir
 * WhatsApp: +8801750079773
 */

"use strict";

const axios = require("axios");

module.exports = {
	config: {
		name: "report",
		aliases: ["rpt"],
		version: "0.0.7",
		author: "Tanvir Ahmed",
		cooldown: 5,
		role: 2,
		description: {
			en: "Report Instagram user profile multiple times for harassment"
		},
		category: "Admin cmds",
		guide: {
			en: "{pn} @mention\n{pn} username\nReply to a message with {pn} to report its sender."
		}
	},

	onStart: async function ({ api, event, args, message }) {
		const targets = [];
		const mentions = event.mentions || {};

		if (event.messageReply && event.messageReply.senderID) {
			targets.push({
				id: String(event.messageReply.senderID),
				label: String(event.messageReply.senderID)
			});
		} else if (Object.keys(mentions).length > 0) {
			for (const id of Object.keys(mentions)) {
				targets.push({
					id: String(id),
					label: String(mentions[id] || id).replace(/^@/, "")
				});
			}
		} else if (args.length > 0) {
			const findUid = global.utils && global.utils.findUid;

			if (typeof findUid !== "function") {
				return message.reply(
					"❌ Username lookup is unavailable. Please mention or reply to the user."
				);
			}

			for (const arg of args) {
				try {
					const cleanArg = arg.replace("@", "");
					const id = await findUid(cleanArg);

					if (!id) {
						targets.push({ error: true, label: cleanArg });
					} else {
						targets.push({
							id: String(id),
							label: cleanArg
						});
					}
				} catch (error) {
					targets.push({ error: true, label: arg });
				}
			}
		} else {
			return message.reply(
				"⚠️ Mention a user, reply to their message, or provide a username to report."
			);
		}

		for (const target of targets) {
			if (target.error) {
				return message.reply(`❌ Could not find user: ${target.label}`);
			}

			try {
				await message.reply(`[+] Target @${target.label} er biruddhe reporting shuru hocche... (Total 10 ta, 2 sec gap)`);

				let successCount = 0;
				const totalReports = 10;
				let lastErrorMessage = "";

				// JSON cookie theke convert kora string cookie
				let cookies = "csrftoken=9VXp4ZX8sH78dcc7S2n3g1EXTHNwCHch; datr=2BuHatC0B5utjJDz83TqOJem; dpr=2.6875; ds_user_id=62599140277; ig_did=23C32A60-B780-404F-B9F8-86061BE49ABF; mid=aocb2AABAAGDjFfsK3WAtDfP_GSv; ps_l=1; ps_n=1; rur=CCO%2C17841462528334892%2C1793894930%3A01ff14ebb434a5e9063f4e9103ab6950056ed28114ab7cf98cdabcbbb9cf8e2fc9ac76e6; sessionid=62599140277%3ANLEZoQUaKH8Emk%3A10%3AAYkqLmEINhVCWfXMgeCwR1r2pzVNErUh-vpk0NxPHA; wd=402x805;";

				// Cookie theke csrftoken alada kore ber kora header-er jonno
				const csrfMatch = cookies.match(/csrftoken=([^;]+)/);
				const csrfToken = csrfMatch ? csrfMatch[1] : "9VXp4ZX8sH78dcc7S2n3g1EXTHNwCHch";

				// লুপ চালিয়ে সঠিক ২ সেকেন্ড বিরতিতে ১০টি রিপোর্ট সাবমিট করা
				for (let i = 1; i <= totalReports; i++) {
					try {
						const url = 'https://www.instagram.com/api/v1/web/reports/get_frx_prompt/';
						const formData = new URLSearchParams();
						formData.append('container_module', 'profilePage');
						formData.append('entry_point', '1');
						formData.append('location', '2');
						formData.append('object_id', target.id);
						formData.append('object_type', '5');
						formData.append('frx_prompt_request_type', '1');

						const response = await axios.post(url, formData, {
							headers: {
								'Content-Type': 'application/x-www-form-urlencoded',
								'X-Requested-With': 'XMLHttpRequest',
								'X-IG-App-ID': '936619743392459',
								'X-CSRFToken': csrfToken,
								...(cookies ? { 'Cookie': cookies } : {})
							}
						});

						// Response HTML (login page) ashle setake error hisabe dhorbo
						if (typeof response.data === 'string' && response.data.includes('<html')) {
							throw new Error("Session expired or invalid cookie (Redirected to Login)");
						}

						successCount++;

					} catch (err) {
						lastErrorMessage = err.response?.data?.message || err.response?.data?.detail || err.message || String(err);
					}

					// শেষ রিপোর্টের পরেও যেন অতিরিক্ত ২ সেকেন্ড ওয়েটিং টাইম না নেয়
					if (i < totalReports) {
						await new Promise(resolve => setTimeout(resolve, 2000));
					}
				}

				if (successCount > 0 && !lastErrorMessage) {
					return message.reply(`[✔] Report Done: ${successCount}/${totalReports} successful for @${target.label}`);
				} else {
					return message.reply(`❌ Report failed for @${target.label}! Reason: ${lastErrorMessage || "Invalid response from Instagram"}`);
				}

			} catch (error) {
				const reason = error.error || error.message || String(error);
				return message.reply(`❌ Error: ${reason}`);
			}
		}
	}
};
