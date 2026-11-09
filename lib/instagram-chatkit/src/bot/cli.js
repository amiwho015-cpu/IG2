import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { InstagramClient } from '../index.js';
import { loadConfig } from './config.js';
import { SimpleBot } from './simple-bot.js';

export async function main() {
  const config = await loadConfig({ path: process.env.IGCHAT_CONFIG || 'config.json' });
  const client = new InstagramClient({ cookies: config.cookies });
  const bot = new SimpleBot({ ...config, client, logger: (type, data) => console.log(JSON.stringify({ type, ...data })) });
  let stopping;
  const stop = () => stopping ??= bot.close().catch(() => { process.exitCode = 1; });
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    await client.login();
    await bot.start();
  } catch (error) {
    await stop();
    throw error;
  }
  return bot;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error('Không khởi động được bot. Kiểm tra config, cookie và kết nối MQTT; chi tiết nhạy cảm đã được ẩn.');
    process.exitCode = 1;
  });
}
