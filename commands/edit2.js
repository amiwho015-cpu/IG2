"use strict";

/**
 * edit2 — same editor as `edit`, but the default model is GPT Image 2 (Toshiro, model 14).
 *   -edit2 <prompt>            (reply to a photo)       -> GPT Image 2
 *   -edit2 <prompt> --m 15     (reply to a photo)       -> Midjourney edit
 * Every other --m number works exactly like in `edit`.
 */

const base = require("./edit");

module.exports = {
	config: Object.assign({}, base.config, {
		name: "edit2",
		aliases: ["gptedit"],
		version: "1.0",
		shortDescription: "AI Image Editor (GPT Image 2 / Midjourney)",
		guide: "{pn} <prompt>   (reply to a photo)  -> GPT Image 2\n{pn} <prompt> --m 15   -> Midjourney\n{pn} models   -> list every model"
	}),

	onStart: async function (ctx) {
		const args = Array.isArray(ctx.args) ? ctx.args.slice() : [];
		const hasModel = args.some(a => ["--m", "--model"].includes(String(a).toLowerCase()));
		const asksList = args.length && ["models", "model", "list", "--models"].includes(String(args[0]).toLowerCase());
		if (args.length && !hasModel && !asksList) args.push("--m", "14");
		// The loader wraps `edit` in place, so call its original handler (the wrapper would wrap twice).
		const run = (base.__goat && base.__goat.onStart) || base.onStart;
		return run.call(base, Object.assign({}, ctx, { args, commandName: "edit2" }));
	}
};
