import { readFile } from 'node:fs/promises';
import { setPrivatePermissions } from '../storage/private-file.js';

export async function loadConfig({ path = 'config.json', env = process.env } = {}) {
  let config = {};
  try {
    config = JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
    await setPrivatePermissions(path);
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Không đọc được config.json hoặc JSON không hợp lệ.', { cause: error });
  }
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Cấu hình phải là JSON object.');
  const cookies = env.IGCHAT_COOKIES || config.cookies;
  if (typeof cookies !== 'string' || !cookies.trim() || cookies.includes('PASTE_')) throw new Error('Điền cookies trong config.json hoặc biến IGCHAT_COOKIES.');
  const admins = env.IGCHAT_ADMINS ? env.IGCHAT_ADMINS.split(',').map(id => id.trim()).filter(Boolean) : config.admins ?? [];
  const transport = env.IGCHAT_TRANSPORT || config.transport || 'mqtt';
  if (transport !== 'mqtt') throw new Error('transport chỉ hỗ trợ mqtt.');
  return { cookies, admins, prefix: config.prefix ?? '/', transport, realtime: config.realtime ?? {} };
}
