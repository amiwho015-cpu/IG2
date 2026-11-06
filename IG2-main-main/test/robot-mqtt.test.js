const net = require('net');
const mqttot = require('../lib/instachat-api/src/transport/robot-mqttot.js');
const Trigger = require('../lib/instachat-api/src/transport/robot-mqtt-trigger.js');

const seen = { connect: false, publishTopics: [] };
let pushed = false;
const server = net.createServer((sock) => {
  let buf = Buffer.alloc(0);
  sock.on('data', (c) => {
    buf = Buffer.concat([buf, c]);
    while (buf.length >= 2) {
      let i = 1, rem = 0, mul = 1, done = false;
      for (; i < buf.length && i <= 4; i++) { const d = buf[i]; rem += (d & 0x7f) * mul; mul *= 128; if (!(d & 0x80)) { i++; done = true; break; } }
      if (!done || buf.length < i + rem) return;
      const frame = buf.slice(0, i + rem); buf = buf.slice(i + rem);
      const p = mqttot.decodePacket(frame);
      if (p.packetType === 'publish') {
        seen.publishTopics.push(p.topic);
        if (p.qos === 1) sock.write(mqttot.pubackPacket(p.packetId));
        if (p.topic === '134' && !pushed) {
          pushed = true;
          // server push on Iris topic 146
          sock.write(mqttot.publishPacket('146', Buffer.from('{"seq_id":1}'), 0));
        }
      }
      if (frame[0] >> 4 === 1) { seen.connect = true; sock.write(Buffer.from([0x20, 0x02, 0x00, 0x00])); }
      if (p.packetType === 'pingreq') sock.write(Buffer.from([0xd0, 0x00]));
    }
  });
});

server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  const calls = { wake: 0, push: [] };
  const realtime = { wake() { calls.wake++; }, setPushActive(a, ms) { calls.push.push([a, ms]); } };
  const logs = [];
  const logger = { info: (m) => logs.push(m), warn: (m) => logs.push('WARN ' + m), debug() {}, success: () => {} };
  const t = new Trigger({
    session: { userId: '12345', cookies: { sessionid: 'abc%3Adef', ds_user_id: '12345' } },
    realtime, logger, host: '127.0.0.1', port, tls: false, safetyIntervalMs: 3000,
  });
  const ok = await t.start();
  await new Promise((r) => setTimeout(r, 800));
  console.log('start() returned:', ok);
  console.log('server got CONNECT:', seen.connect);
  console.log('client published topics:', seen.publishTopics);
  console.log('wake() calls:', calls.wake, ' setPushActive:', JSON.stringify(calls.push));
  console.log('logs:', logs);
  const pass = ok && seen.connect && seen.publishTopics.includes('134') && calls.wake >= 1 && calls.push.length >= 1;
  console.log(pass ? 'RESULT: PASS' : 'RESULT: FAIL');
  await t.stop(); server.close(); process.exit(pass ? 0 : 1);
});
