"use strict";
// Run: node --test test/ica-mqtt.test.js  (no network / no mqtt package needed: the client is stubbed)
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const EventEmitter = require("events");

const dir = path.resolve(__dirname, "../lib/instachat-api/src/transport");
class FakeClient extends EventEmitter {
	constructor() { super(); FakeClient.last = this; }
	async connect() { this.emit("connected", {}); }
	disconnect() { this.gone = true; }
}
require.cache[require.resolve(path.join(dir, "ica-mqtt.js").replace(/\.js$/, "")) ] = undefined;
const Module = require("module");
const origLoad = Module._load;
Module._load = function (req, parent, ...r) {
	if (req === "./ica-mqtt") return FakeClient;
	return origLoad.call(this, req, parent, ...r);
};
const Trigger = require(path.join(dir, "ica-mqtt-trigger"));
Module._load = origLoad;

const silent = { info() { }, warn() { }, debug() { }, error() { } };
const mkRealtime = () => ({ active: null, wakes: 0, setPushActive(a, ms) { this.active = a; this.ms = ms; }, handlePush() { return 0; }, wake() { this.wakes++; } });

test("polling is slowed only after a real push, restored when the socket drops", async () => {
	const rt = mkRealtime();
	const t = new Trigger({ session: {}, realtime: rt, logger: silent });
	assert.strictEqual(await t.start(), true);
	assert.strictEqual(rt.active, null, "connect alone must not slow polling");
	FakeClient.last.emit("publish", { topic: "/pubsub" });
	assert.strictEqual(rt.active, null, "non-message topics must not mark DM push healthy");
	assert.strictEqual(rt.wakes, 0);
	FakeClient.last.emit("publish", { topic: "/ig_message_sync", payload: { data: [] } });
	assert.strictEqual(rt.active, true);
	assert.strictEqual(rt.ms, 1500);
	assert.strictEqual(rt.wakes, 1);
	FakeClient.last.emit("disconnected");
	assert.strictEqual(rt.active, false);
	await t.stop();
	assert.ok(FakeClient.last.gone);
});
