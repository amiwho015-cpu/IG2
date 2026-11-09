import { randomInt } from 'node:crypto';
import WebSocket from 'ws';
import { AuthenticationError, ConnectionError, ValidationError } from '../../shared/errors.js';
import { parseCookies } from '../../shared/cookies.js';
import { positiveId, text } from '../../shared/validation.js';

const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

export function normalizeInstagramPuback(frame) {
  if (Buffer.isBuffer(frame) && frame.length === 4 && frame[0] === 0x42 && frame[1] === 2) frame[0] = 0x40;
  return frame;
}

function createInstagramWebSocket(address, _protocols, options) {
  const socket = new WebSocket(address, undefined, options.wsOptions);
  socket.on('message', normalizeInstagramPuback);
  socket.on('unexpected-response', (request, response) => {
    const status = response.statusCode;
    const failure = [401, 403].includes(status)
      ? new AuthenticationError('Instagram rejected the realtime session.', { code: 'auth_required', status })
      : new ConnectionError('Instagram rejected the WebSocket upgrade.', {
        code: 'websocket_upgrade_failed', status,
        retryable: status === 408 || status === 429 || status >= 500,
      });
    response.resume();
    request.destroy(failure);
  });
  return socket;
}

export function connectionOptions(session, connectTimeout, { deviceId, actorId } = {}) {
  if (!Number.isSafeInteger(connectTimeout) || connectTimeout <= 0) throw new ValidationError('connectTimeout must be a positive integer.');
  if (!parseCookies(session?.cookieIGS).get('sessionid')) throw new AuthenticationError('Realtime requires an Instagram session cookie.');
  const device = text(deviceId, 'deviceId', { max: 128 });
  if (!/^[A-Za-z0-9._:-]+$/.test(device)) throw new ValidationError('Invalid realtime device ID.');
  const actor = positiveId(actorId, 'actorId');
  const sessionId = randomInt(1, 2 ** 48);
  const username = {
    u: actor, s: sessionId, chat_on: true, fg: true, d: device, ct: 'cookie_auth',
    aid: 936619743392459, st: [], a: userAgent, asi: { 'Accept-Language': 'en-US' },
  };
  return {
    url: `wss://edge-chat.instagram.com/chat?sid=${sessionId}&cid=${encodeURIComponent(device)}`,
    options: {
      clientId: 'mqttwsclient', clean: true, protocolId: 'MQIsdp', protocolVersion: 3,
      username: JSON.stringify(username), reconnectPeriod: 0, connectTimeout, keepalive: 15,
      manualConnect: true, resubscribe: false, rejectUnauthorized: true,
      wsOptions: {
        headers: {
          Cookie: session.cookieIGS, Origin: 'https://www.instagram.com',
          Referer: 'https://www.instagram.com/direct/inbox/', 'User-Agent': userAgent,
        },
        rejectUnauthorized: true,
      },
      createWebsocket: createInstagramWebSocket,
    },
  };
}
