/**
 * File Name: pair.js
 * ICA: igbot-api
 * Author: Tanvir Ahmed (Tanvir143)
 * GitHub: www.github.com/143tanvir
 * WhatsApp: +8801750079773
 * Note: Project metadata only; original source credits and license notices are retained.
 */

"use strict";

const sharp = require("sharp");
const fontkit = require("fontkit");

const {
	resolveUserTarget,
	resolveProfile
} = require("../src/utils");

const REGULAR_FONT = fontkit.openSync(
	require.resolve(
		"@fontsource/roboto/files/roboto-latin-400-normal.woff"
	)
);

const BOLD_FONT = fontkit.openSync(
	require.resolve(
		"@fontsource/roboto/files/roboto-latin-700-normal.woff"
	)
);

module.exports = {
	config: {
		name: "pair",
		aliases: ["love", "gf", "bf", "couple", "partner", "tempu"],
		author: "Tanvir143",
		category: "Users Cmd",
		helpText: "Couple Image Gen",
		cooldown: 5,
		role: 0,
		description: {
			en: "Create a random pair card"
		},
		usage: {
			en: ".pair | reply + .pair | .pair @user | .pair @user1 @user2 | .pair random | .pair boy | .pair girl"
		}
	},

	onStart: async function ({
		message,
		args,
		event,
		api
	}) {
		try {
			const senderID = String(event.senderID);
			const threadID = String(event.threadID);
			const input = (args || []).map(String);
			const type = (input[0] || "").toLowerCase();

			/*
			 * =================================
			 * MONGODB REGISTRATION COMMANDS
			 * =================================
			 */

			if (["boy", "girl"].includes(type)) {
				const gender = type;
				const action = (input[1] || "").toLowerCase();
				const targets = await getTargetIDs(
					input.slice(action === "rmv" ? 2 : 1),
					event,
					api
				);

				const collection = await getPairCollection();

				if (!collection) {
					return message.reply(
						"❌ | MongoDB সংযোগ পাওয়া যায়নি।"
					);
				}

				await collection.updateOne(
					{ _id: threadID },
					{
						$setOnInsert: {
							boy: [],
							girl: []
						}
					},
					{ upsert: true }
				);

				/*
				 * REMOVE REGISTERED USERS
				 * .pair boy rmv @user
				 * .pair girl rmv @user
				 */
				if (action === "rmv") {
					if (!targets.length) {
						return message.reply(
							"❌ | কাকে রিমুভ করবে তাকে মেনশন করো।\n\n" +
							"উদাহরণ:\n" +
							".pair boy rmv @user\n" +
							".pair girl rmv @user"
						);
					}

					const result = await collection.updateOne(
						{ _id: threadID },
						{
							$pull: {
								[gender]: { $in: targets }
							}
						}
					);

					/*
					 * MongoDB $pull with an array of IDs.
					 * Remove matching IDs from the selected list.
					 */
					await collection.updateOne(
						{ _id: threadID },
						{
							$pull: {
								[gender]: {
									$in: targets
								}
							}
						}
					);

					return message.reply(
						`✅ | ${gender === "boy" ? "Boy" : "Girl"} তালিকা থেকে রিমুভ করার অনুরোধ সম্পন্ন।`
					);
				}

				/*
				 * SELF REGISTRATION:
				 * .pair boy
				 * .pair girl
				 *
				 * TARGET REGISTRATION:
				 * .pair boy @user1 @user2
				 * .pair girl @user1 @user2
				 */
				const registeringIDs = targets.length
					? targets
					: [senderID];

				let added = [];
				let duplicate = [];

				for (const id of [...new Set(registeringIDs.map(String))]) {
					if (!id || id === "undefined") continue;

					const existing = await collection.findOne(
						{ _id: threadID },
						{ projection: { boy: 1, girl: 1 } }
					);

					const boys = (existing?.boy || []).map(String);
					const girls = (existing?.girl || []).map(String);

					if (boys.includes(id) || girls.includes(id)) {
						duplicate.push(id);
						continue;
					}

					/*
					 * Conditional update prevents the same user
					 * from registering in both lists.
					 */
					const update = await collection.updateOne(
						{
							_id: threadID,
							boy: { $ne: id },
							girl: { $ne: id }
						},
						{
							$addToSet: {
								[gender]: id
							}
						}
					);

					if (update.modifiedCount > 0) {
						added.push(id);
					} else {
						duplicate.push(id);
					}
				}

				if (duplicate.length && !added.length) {
					return message.reply(
						"আপনার রেজিস্ট্রেশন ইতোমধ্যেই নিশ্চিত করা হয়েছে"
					);
				}

				if (!added.length) {
					return message.reply(
						"❌ | রেজিস্ট্রেশন করা যায়নি। আবার চেষ্টা করো।"
					);
				}

				return message.reply(
					`✅ | ${added.length} জন ${gender === "boy" ? "Boy" : "Girl"} হিসেবে রেজিস্ট্রেশন সম্পন্ন হয়েছে।` +
					(duplicate.length
						? `\n⚠️ ${duplicate.length} জন আগে থেকেই রেজিস্টার্ড।`
						: "")
				);
			}

			/*
			 * =================================
			 * PAIR HELP
			 * =================================
			 */

			if (
				type === "help" ||
				type === "info"
			) {
				return message.reply(
					"💌 PAIR COMMANDS\n\n" +
					".pair boy — নিজের Boy রেজিস্ট্রেশন\n" +
					".pair girl — নিজের Girl রেজিস্ট্রেশন\n" +
					".pair boy @user — Boy হিসেবে রেজিস্ট্রেশন\n" +
					".pair girl @user — Girl হিসেবে রেজিস্ট্রেশন\n" +
					".pair boy rmv @user — Boy তালিকা থেকে রিমুভ\n" +
					".pair girl rmv @user — Girl তালিকা থেকে রিমুভ\n" +
					".pair — রেজিস্টার্ড হলে বিপরীত লিঙ্গের সাথে Pair\n" +
					".pair random — আগের random pair\n" +
					".pair @user — নিজের সাথে Pair\n" +
					".pair @user1 @user2 — দুইজনকে Pair"
				);
			}

			/*
			 * =================================
			 * GET GROUP MEMBERS
			 * =================================
			 */

			const members = await getMembers(api, threadID);

			if (members.length < 2) {
				return message.reply(
					"❌ | Pair করার মতো যথেষ্ট member নেই।"
				);
			}

			let id1;
			let id2;

			/*
			 * =================================
			 * REPLY + PAIR
			 * =================================
			 */

			if (
				event.messageReply &&
				event.messageReply.senderID &&
				!input.length
			) {
				id1 = senderID;
				id2 = String(event.messageReply.senderID);

				if (id1 === id2) {
					return message.reply(
						"😂 | নিজের সাথে pair করা যাবে না!"
					);
				}
			}

			/*
			 * =================================
			 * TWO MENTIONS
			 * =================================
			 */

			else if (
				input.length >= 2 &&
				type !== "random"
			) {
				const foundIDs = await getTargetIDs(
					input,
					event,
					api
				);

				if (foundIDs.length < 2) {
					return message.reply(
						"❌ | দুইজন user মেনশন করো।\n\n" +
						"উদাহরণ:\n.pair @user1 @user2"
					);
				}

				id1 = foundIDs[0];
				id2 = foundIDs[1];

				if (id1 === id2) {
					return message.reply(
						"😂 | একই user-এর সাথে pair করা যাবে না!"
					);
				}
			}

			/*
			 * =================================
			 * RANDOM PAIR
			 * =================================
			 */

			else if (type === "random") {
				const shuffled = shuffle([...members]);

				id1 = shuffled[0];
				id2 = shuffled[1];
			}

			/*
			 * =================================
			 * ONE TARGET
			 * =================================
			 */

			else if (input.length) {
				const target = await resolveUserTarget(
					input,
					event,
					api
				);

				if (!target || !target.id) {
					return message.reply(
						"❌ | User পাওয়া যায়নি।\n\n" +
						"উদাহরণ: .pair @user"
					);
				}

				id1 = senderID;
				id2 = String(target.id);

				if (id1 === id2) {
					return message.reply(
						"😂 | নিজের সাথে pair করা যাবে না!"
					);
				}
			}

			/*
			 * =================================
			 * JUST .PAIR
			 *
			 * Registered boy -> random girl
			 * Registered girl -> random boy
			 * Unregistered -> registration prompt
			 * =================================
			 */

			else {
				const collection = await getPairCollection();

				if (!collection) {
					return message.reply(
						"❌ | MongoDB সংযোগ পাওয়া যায়নি।"
					);
				}

				const data = await collection.findOne({
					_id: threadID
				});

				const boys = (data?.boy || []).map(String);
				const girls = (data?.girl || []).map(String);

				if (boys.includes(senderID)) {
					const available = girls.filter(
						id => id !== senderID
					);

					if (!available.length) {
						return message.reply(
							"💌 | এখনো কোনো Girl রেজিস্টার করেনি।\n" +
							"Girl-দের বলো: .pair girl"
						);
					}

					id1 = senderID;
					id2 = available[
						Math.floor(Math.random() * available.length)
					];
				} else if (girls.includes(senderID)) {
					const available = boys.filter(
						id => id !== senderID
					);

					if (!available.length) {
						return message.reply(
							"💌 | এখনো কোনো Boy রেজিস্টার করেনি।\n" +
							"Boy-দের বলো: .pair boy"
						);
					}

					id1 = senderID;
					id2 = available[
						Math.floor(Math.random() * available.length)
					];
				} else {
					return message.reply(
						"💌 | Pair ব্যবহার করতে আগে রেজিস্ট্রেশন করো।\n\n" +
						"👦 Boy হলে: .pair boy\n" +
						"👧 Girl হলে: .pair girl"
					);
				}
			}

			/*
			 * =================================
			 * FINAL VALIDATION
			 * =================================
			 */

			if (
				!id1 ||
				!id2 ||
				String(id1) === String(id2)
			) {
				return message.reply(
					"❌ | Pair তৈরি করা যায়নি।"
				);
			}

			/*
			 * =================================
			 * LOAD BOTH PROFILES
			 * =================================
			 */

			const [profile1, profile2] = await Promise.all([
				getProfile(id1, event, api),
				getProfile(id2, event, api)
			]);

			if (!profile1 || !profile2) {
				return message.reply(
					"❌ | Profile load করা যায়নি।"
				);
			}

			const pic1 = profile1.profilePicture;
			const pic2 = profile2.profilePicture;

			if (!pic1 || !pic2) {
				return message.reply(
					"❌ | Profile picture পাওয়া যায়নি।"
				);
			}

			const username1 = cleanUsername(
				profile1.username || id1
			);

			const username2 = cleanUsername(
				profile2.username || id2
			);

			const percentage = Math.floor(
				Math.random() * 51
			) + 50;

			const status = getStatus(percentage);

			const card = await createPairCard({
				pic1,
				pic2,
				username1,
				username2,
				percentage,
				status
			});

			return message.reply({
				attachment: card,
				body:
					`💌 Group Couple 💌\n@${username1}\n@${username2}\n\n` +
					`💌 ${percentage}% Match\n` +
					`💌 ${status}\n\n` +
					`🎧 Enjoy using the bot !`
			});
		}
		catch (error) {
			console.error("[PAIR ERROR]", error);

			return message.reply(
				"❌ | Pair failed.\n\n" +
				(error.message || "Unknown error")
			);
		}
	}
};


/* =================================
   GET PAIRDATA COLLECTION
================================= */

async function getPairCollection() {
	const database = global.database;

	if (!database) {
		throw new Error(
			"global.database পাওয়া যায়নি।"
		);
	}

	if (database.ready) {
		await database.ready;
	}

	/*
	 * Reuse the already connected MongoDB database
	 * from the existing users collection.
	 */
	const usersCollection =
		database.users &&
		database.users.collection;

	if (
		!usersCollection ||
		!usersCollection.db ||
		typeof usersCollection.db.collection !== "function"
	) {
		return null;
	}

	return usersCollection.db.collection("PairData");
}


/* =================================
   GET TARGET IDS
================================= */

async function getTargetIDs(args, event, api) {
	const ids = [];

	for (const arg of args || []) {
		if (!arg || String(arg).toLowerCase() === "rmv") {
			continue;
		}

		try {
			const target = await resolveUserTarget(
				[arg],
				event,
				api
			);

			if (target && target.id) {
				const id = String(target.id);

				if (!ids.includes(id)) {
					ids.push(id);
				}
			}
		} catch (error) {
			console.error(
				"[PAIR TARGET ERROR]",
				arg,
				error.message
			);
		}
	}

	/*
	 * Mention IDs are used only when the command
	 * arguments could not resolve enough targets.
	 */
	if (
		ids.length < 2 &&
		event.mentions
	) {
		for (const id of Object.keys(event.mentions)) {
			const value = String(id);

			if (!ids.includes(value)) {
				ids.push(value);
			}
		}
	}

	return [...new Set(ids)];
}


/* =================================
   GET GROUP MEMBERS
================================= */

function getMembers(api, threadID) {
	return new Promise(resolve => {
		api.getThreadInfo(
			threadID,
			(error, info) => {
				if (
					error ||
					!info ||
					!Array.isArray(info.participantIDs)
				) {
					return resolve([]);
				}

				const ids = info.participantIDs
					.map(String)
					.filter(Boolean);

				resolve([...new Set(ids)]);
			}
		);
	});
}


/* =================================
   GET PROFILE
================================= */

async function getProfile(id, event, api) {
	try {
		const fakeEvent = {
			...event,
			senderID: String(id),
			messageReply: null,
			mentions: {}
		};

		return await resolveProfile(
			[String(id)],
			fakeEvent,
			api
		);
	} catch (error) {
		console.error(
			"[PROFILE ERROR]",
			id,
			error
		);

		return null;
	}
}


/* =================================
   CREATE PAIR CARD
================================= */

async function createPairCard({
	pic1,
	pic2,
	username1,
	username2,
	percentage,
	status
}) {
	const WIDTH = 1080;
	const HEIGHT = 720;

	const image1 = await downloadImage(pic1);
	const image2 = await downloadImage(pic2);

	const avatarSize = 270;

	const avatar1 = await makeCircle(
		image1,
		avatarSize
	);

	const avatar2 = await makeCircle(
		image2,
		avatarSize
	);

	const progressWidth = 300;

	const progressFill = Math.max(
		0,
		Math.min(
			progressWidth,
			(progressWidth * percentage) / 100
		)
	);

	const textSVG = `
		${makeText("Tanvir143 IgBot", 540, 80, 42, "#FFFFFF", true)}

		${makeFittedText(`@${username1}`, 285, 550, 335, 36, 20, "#FFFFFF", true)}

		${makeFittedText(`@${username2}`, 795, 550, 335, 36, 20, "#FFFFFF", true)}

		${makeText(`${percentage}%`, 540, 610, 72, "url(#textGradient)", true)}

		<rect x="390" y="625" width="${progressWidth}" height="10" rx="5" fill="#FFFFFF" fill-opacity="0.10"/>

		<rect x="390" y="625" width="${progressFill}" height="10" rx="5" fill="url(#barGradient)"/>

		${makeFittedText(status, 540, 690, 520, 58, 32, "#FFFFFF", true)}
	`;

	const svg = `
	<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
		<defs>
			<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
				<stop offset="0%" stop-color="#080414"/>
				<stop offset="45%" stop-color="#17072B"/>
				<stop offset="100%" stop-color="#05030D"/>
			</linearGradient>

			<radialGradient id="pinkGlow">
				<stop offset="0%" stop-color="#FF2D9B" stop-opacity="0.50"/>
				<stop offset="100%" stop-color="#FF2D9B" stop-opacity="0"/>
			</radialGradient>

			<radialGradient id="blueGlow">
				<stop offset="0%" stop-color="#6B5CFF" stop-opacity="0.45"/>
				<stop offset="100%" stop-color="#6B5CFF" stop-opacity="0"/>
			</radialGradient>

			<linearGradient id="ringGradient" x1="0" y1="0" x2="1" y2="1">
				<stop offset="0%" stop-color="#FF4DA6"/>
				<stop offset="50%" stop-color="#B86CFF"/>
				<stop offset="100%" stop-color="#5C7CFF"/>
			</linearGradient>

			<linearGradient id="textGradient" x1="0" y1="0" x2="1" y2="0">
				<stop offset="0%" stop-color="#FF67B7"/>
				<stop offset="50%" stop-color="#FFFFFF"/>
				<stop offset="100%" stop-color="#8B8CFF"/>
			</linearGradient>

			<linearGradient id="barGradient" x1="0" y1="0" x2="1" y2="0">
				<stop offset="0%" stop-color="#FF3DAE"/>
				<stop offset="50%" stop-color="#B46CFF"/>
				<stop offset="100%" stop-color="#637CFF"/>
			</linearGradient>

			<filter id="glow" x="-100%" y="-100%" width="300%" height="300%">
				<feGaussianBlur stdDeviation="12" result="blur"/>
				<feMerge>
					<feMergeNode in="blur"/>
					<feMergeNode in="SourceGraphic"/>
				</feMerge>
			</filter>

			<filter id="smallGlow" x="-100%" y="-100%" width="300%" height="300%">
				<feGaussianBlur stdDeviation="4" result="blur"/>
				<feMerge>
					<feMergeNode in="blur"/>
					<feMergeNode in="SourceGraphic"/>
				</feMerge>
			</filter>

			<clipPath id="clip1">
				<circle cx="285" cy="315" r="135"/>
			</clipPath>

			<clipPath id="clip2">
				<circle cx="795" cy="315" r="135"/>
			</clipPath>
		</defs>

		<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>

		<circle cx="120" cy="90" r="300" fill="url(#pinkGlow)"/>
		<circle cx="960" cy="120" r="320" fill="url(#blueGlow)"/>
		<circle cx="540" cy="700" r="300" fill="url(#pinkGlow)" opacity="0.16"/>

		<rect x="35" y="30" width="1010" height="655" rx="42" fill="#FFFFFF" fill-opacity="0.045" stroke="#FFFFFF" stroke-opacity="0.10" stroke-width="1.5"/>

		<g fill="#FFFFFF" opacity="0.65">
			<circle cx="105" cy="175" r="2"/>
			<circle cx="165" cy="115" r="3"/>
			<circle cx="930" cy="185" r="2"/>
			<circle cx="975" cy="100" r="3"/>
			<circle cx="75" cy="390" r="2"/>
			<circle cx="1005" cy="395" r="2"/>
			<circle cx="520" cy="155" r="2"/>
			<circle cx="565" cy="145" r="3"/>
		</g>

		<circle cx="285" cy="315" r="154" fill="none" stroke="#FF3DAE" stroke-width="18" opacity="0.18" filter="url(#glow)"/>
		<circle cx="795" cy="315" r="154" fill="none" stroke="#687CFF" stroke-width="18" opacity="0.18" filter="url(#glow)"/>

		<circle cx="285" cy="315" r="150" fill="none" stroke="url(#ringGradient)" stroke-width="6"/>
		<circle cx="795" cy="315" r="150" fill="none" stroke="url(#ringGradient)" stroke-width="6"/>

		<circle cx="285" cy="315" r="139" fill="#10091C"/>
		<circle cx="795" cy="315" r="139" fill="#10091C"/>

		<image x="150" y="180" width="${avatarSize}" height="${avatarSize}" href="data:image/jpeg;base64,${avatar1.toString("base64")}" xlink:href="data:image/jpeg;base64,${avatar1.toString("base64")}" clip-path="url(#clip1)" preserveAspectRatio="xMidYMid slice"/>

		<image x="660" y="180" width="${avatarSize}" height="${avatarSize}" href="data:image/jpeg;base64,${avatar2.toString("base64")}" xlink:href="data:image/jpeg;base64,${avatar2.toString("base64")}" clip-path="url(#clip2)" preserveAspectRatio="xMidYMid slice"/>

		<rect x="105" y="510" width="360" height="55" rx="27.5" fill="#FFFFFF" fill-opacity="0.055" stroke="#FF62B7" stroke-opacity="0.22"/>
		<rect x="615" y="510" width="360" height="55" rx="27.5" fill="#FFFFFF" fill-opacity="0.055" stroke="#7181FF" stroke-opacity="0.22"/>

		<line x1="445" y1="315" x2="635" y2="315" stroke="#FFFFFF" stroke-opacity="0.18" stroke-width="2" stroke-dasharray="7 10"/>

		<g transform="translate(540 315)" filter="url(#smallGlow)">
			<path d="M 0 35 C -15 20 -55 -2 -55 -30 C -55 -50 -33 -62 -15 -52 C -7 -48 0 -40 0 -32 C 0 -40 7 -48 15 -52 C 33 -62 55 -50 55 -30 C 55 -2 15 20 0 35 Z" fill="url(#textGradient)"/>
		</g>

		${textSVG}
	</svg>
	`;

	return sharp(Buffer.from(svg))
		.png()
		.toBuffer();
}


/* =================================
   FITTED TEXT
================================= */

function makeFittedText(
	text,
	centerX,
	baselineY,
	maxWidth,
	maxSize,
	minSize,
	fill,
	bold = false
) {
	let size = maxSize;

	while (size > minSize) {
		if (getTextWidth(text, size, bold) <= maxWidth) {
			break;
		}

		size--;
	}

	return makeText(
		text,
		centerX,
		baselineY,
		size,
		fill,
		bold
	);
}


/* =================================
   TEXT
================================= */

function makeText(
	text,
	centerX,
	baselineY,
	fontSize,
	fill,
	bold = false,
	align = "center"
) {
	const font = bold ? BOLD_FONT : REGULAR_FONT;
	const run = font.layout(String(text));
	const scale = fontSize / font.unitsPerEm;

	let width = 0;

	for (const position of run.positions) {
		width += position.xAdvance * scale;
	}

	let x = align === "right"
		? centerX - width
		: centerX - width / 2;

	const paths = [];
	let cursorX = x;

	for (let i = 0; i < run.glyphs.length; i++) {
		const glyph = run.glyphs[i];
		const position = run.positions[i];

		if (glyph && glyph.path) {
			paths.push(`
				<g transform="translate(${cursorX},${baselineY}) scale(${scale},${-scale})">
					<path d="${glyph.path.toSVG()}" fill="${fill}"/>
				</g>
			`);
		}

		cursorX += position.xAdvance * scale;
	}

	return paths.join("\n");
}


/* =================================
   TEXT WIDTH
================================= */

function getTextWidth(
	text,
	fontSize,
	bold = false
) {
	const font = bold ? BOLD_FONT : REGULAR_FONT;
	const run = font.layout(String(text));
	const scale = fontSize / font.unitsPerEm;

	let width = 0;

	for (const position of run.positions) {
		width += position.xAdvance * scale;
	}

	return width;
}


/* =================================
   CIRCLE IMAGE
================================= */

async function makeCircle(buffer, size) {
	return sharp(buffer)
		.resize(size, size, {
			fit: "cover",
			position: "centre"
		})
		.jpeg({ quality: 90 })
		.toBuffer();
}


/* =================================
   DOWNLOAD IMAGE
================================= */

async function downloadImage(url) {
	const response = await fetch(url);

	if (!response.ok) {
		throw new Error(
			`Image download failed: ${response.status}`
		);
	}

	return Buffer.from(
		await response.arrayBuffer()
	);
}


/* =================================
   CLEAN USERNAME
================================= */

function cleanUsername(value) {
	let username = String(value || "")
		.trim()
		.replace(/^@+/, "")
		.replace(/\s+/g, "");

	if (!username) {
		return "unknown";
	}

	if (username.length > 24) {
		username = username.slice(0, 21) + "...";
	}

	return username;
}


/* =================================
   STATUS
================================= */

function getStatus(percentage) {
	if (percentage >= 95) return "ICONIC DUO";
	if (percentage >= 90) return "POWER DUO";
	if (percentage >= 80) return "MAIN CHARACTER VIBES";
	if (percentage >= 70) return "VIBE MATCH";
	if (percentage >= 60) return "LOWKEY MATCH";

	return "RANDOM DUO";
}


/* =================================
   SHUFFLE
================================= */

function shuffle(array) {
	for (let i = array.length - 1; i > 0; i--) {
		const j = Math.floor(
			Math.random() * (i + 1)
		);

		[array[i], array[j]] = [
			array[j],
			array[i]
		];
	}

	return array;
					}
