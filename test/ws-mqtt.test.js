"use strict";
// Run: node --test test/ws-mqtt.test.js   (needs the `ws` package: npm i)
const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const WebSocket = require("ws");

const lib = path.resolve(__dirname, "../lib/instachat-api/src/transport");
const WsMqttClient = require(path.join(lib, "ws-mqtt"));
const WsMqttTrigger = require(path.join(lib, "ws-mqtt-trigger"));

const publish = (topic, obj, qos = 0) => {
	const t = Buffer.from(topic), p = Buffer.from(JSON.stringify(obj));
	const body = Buffer.concat([Buffer.from([t.length >> 8, t.length & 255]), t, ...(qos ? [Buffer.from([0, 7])] : []), p]);
	return Buffer.concat([Buffer.from([0x30 | (qos << 1)]), WsMqttClient.encodeRemainingLength(body.length), body]);
};

function server() {
	return new Promise((resolve) => {
		const wss = new WebSocket.Server({ port: 0 }, () => resolve(wss));
	});
}
const session = { cookies: { sessionid: "123%3Aabc", ds_user_id: "123", csrftoken: "x" } };
const silent = { info() { }, warn() { }, debug() { }, error() { } };

test("varint round-trips beyond 127 bytes", () => {
	for (const n of [0, 127, 128, 16383, 16384, 2097151]) {
		const enc = WsMqttClient.encodeRemainingLength(n);
		assert.strictEqual(WsMqttClient.decodeRemainingLength(enc, 0).value, n);
	}
});

test("subscribes, parses large + coalesced PUBLISH packets, sends PUBACK", async () => {
	const wss = await server();
	const subs = [], acks = [], connects = [];
	wss.on("connection", (ws) => {
		ws.on("message", (d) => { if (d[0] === 0x10) { ws.send(Buffer.from([0x20, 0x02, 0x00, 0x00])); connects.push(d); } if (d[0] === 0x82) subs.push(d); if (d[0] === 0x40) acks.push(d); });
		const send = () => {
		const big = publish("/ig_message_sync", { pad: "x".repeat(500) });
		const small = publish("/pubsub", { a: 1 }, 1);
		ws.send(Buffer.concat([big, small])); // two packets in one frame
		};
		ws.on("message", (d) => { if (d[0] === 0x10) setTimeout(send, 30); });
	});
	const c = new WsMqttClient({ session, logger: silent, url: `ws://127.0.0.1:${wss.address().port}`, maxReconnects: 0 });
	const got = [];
	c.on("publish", (m) => got.push(m.topic));
	await c.connect();
	await new Promise((r) => setTimeout(r, 200));
	assert.deepStrictEqual(got, ["/ig_message_sync", "/pubsub"]);
	assert.strictEqual(subs.length, WsMqttClient.DEFAULT_TOPICS.length);
	assert.strictEqual(acks.length, 1);
	assert.strictEqual(connects.length, 1, "CONNECT must be sent");
	assert.ok(connects[0].includes(Buffer.from("MQIsdp")));
	assert.ok(connects[0].includes(Buffer.from('"u":"123"')));
	await c.disconnect(); wss.close();
});

test("trigger slows polling only after a real push, and restores on close", async () => {
	const wss = await server();
	let sock;
	wss.on("connection", (ws) => { sock = ws; });
	const calls = [];
	const realtime = { setPushActive: (a) => calls.push(a), wake: () => calls.push("wake") };
	const t = new WsMqttTrigger({ session, realtime, logger: silent, url: `ws://127.0.0.1:${wss.address().port}`, maxReconnects: 0 });
	await t.start();
	await new Promise((r) => setTimeout(r, 100));
	assert.deepStrictEqual(calls, [], "must not slow polling before a push is seen");
	sock.send(publish("/ig_message_sync", { x: 1 }));
	await new Promise((r) => setTimeout(r, 100));
	assert.deepStrictEqual(calls, [true, "wake"]);
	sock.close();
	await new Promise((r) => setTimeout(r, 100));
	assert.strictEqual(calls[calls.length - 1], false);
	await t.stop(); wss.close();
});
