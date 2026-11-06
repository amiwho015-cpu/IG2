"use strict";

/**
 * Makes EVERY canvas image in the bot sharper, without touching each command:
 *  - high-quality image smoothing on every 2D context (node-canvas defaults to a
 *    low-quality resampler, which makes scaled-down profile pictures look rough/blurry),
 *  - JPEG output defaults to quality 0.95 instead of node-canvas' 0.75.
 * Load this once, before the commands are loaded.
 */

let patched = false;

function install() {
	if (patched) return;
	let Canvas;
	try { ({ Canvas } = require("canvas")); }
	catch (_) { return; } // canvas not installed: nothing to improve
	if (!Canvas || !Canvas.prototype) return;
	patched = true;

	const getContext = Canvas.prototype.getContext;
	Canvas.prototype.getContext = function (type, ...rest) {
		const ctx = getContext.call(this, type, ...rest);
		if (ctx && (type === "2d" || type === undefined)) {
			try { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high"; }
			catch (_) { /* older canvas builds */ }
		}
		return ctx;
	};

	const toBuffer = Canvas.prototype.toBuffer;
	Canvas.prototype.toBuffer = function (...args) {
		if (args[0] === "image/jpeg" && (args[1] == null || typeof args[1] === "object" && args[1].quality == null))
			args[1] = Object.assign({ quality: 0.95 }, args[1] || {});
		return toBuffer.apply(this, args);
	};
}

module.exports = { install };
