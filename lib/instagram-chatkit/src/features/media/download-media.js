import { open, mkdir, stat, unlink } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { ConnectionError, InstagramError, TimeoutError, ValidationError } from '../../shared/errors.js';
import { text } from '../../shared/validation.js';

function cdnUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new ValidationError('Media URL must be an Instagram CDN HTTPS URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      !['cdninstagram.com', 'fbcdn.net', 'fbsbx.com'].some(domain => url.hostname === domain || url.hostname.endsWith('.' + domain))) {
    throw new ValidationError('Media URL must be an Instagram CDN HTTPS URL.');
  }
  return url;
}

async function destination(url, path) {
  const name = basename(url.pathname).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 180);
  const filename = !name || /^\.+$/.test(name) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) ? 'media.bin' : name;
  if (path === undefined) return resolve(filename);
  const target = text(path, 'path');
  let directory = /[\\/]$/.test(target);
  try { directory ||= (await stat(target)).isDirectory(); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  return resolve(directory ? join(target, filename) : target);
}

export async function downloadMedia(fetch, value, { path, signal, maxBytes = 100 * 1024 * 1024, timeoutMs = 30000 } = {}) {
  if (typeof fetch !== 'function') throw new ValidationError('fetch must be a function.');
  for (const [name, size] of Object.entries({ maxBytes, timeoutMs })) {
    if (!Number.isSafeInteger(size) || size < 1) throw new ValidationError(name + ' must be a positive integer.');
  }
  if (timeoutMs > 2147483647) throw new ValidationError('timeoutMs must be at most 2147483647.');
  let url = cdnUrl(value);
  const output = await destination(url, path);
  const timeout = AbortSignal.timeout(timeoutMs);
  const abort = AbortSignal.any([timeout, ...(signal ? [signal] : [])]);
  let response;
  let file;
  let reader;
  let created = false;
  let complete = false;
  try {
    for (let redirects = 0; ; redirects++) {
      abort.throwIfAborted();
      response = await fetch(url, { method: 'GET', redirect: 'manual', credentials: 'omit', referrerPolicy: 'no-referrer', headers: { accept: '*/*' }, signal: abort });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      await response.body?.cancel();
      if (redirects >= 5) throw new InstagramError('Media download exceeded the redirect limit.', { code: 'DOWNLOAD_REDIRECT' });
      const location = response.headers.get('location');
      if (!location || location.length > 8192) throw new InstagramError('Media download returned an invalid redirect.', { code: 'DOWNLOAD_REDIRECT' });
      url = cdnUrl(new URL(location, url).href);
    }
    if (!response.ok) throw new InstagramError('Instagram CDN rejected the media download.', { code: 'DOWNLOAD_FAILED', status: response.status });
    const length = Number(response.headers.get('content-length'));
    if (Number.isFinite(length) && length > maxBytes) throw new InstagramError('Media exceeds the download size limit.', { code: 'MEDIA_TOO_LARGE' });
    if (!response.body) throw new InstagramError('Instagram CDN did not return media bytes.', { code: 'INVALID_RESPONSE' });
    await mkdir(dirname(output), { recursive: true });
    file = await open(output, 'wx');
    created = true;
    reader = response.body.getReader();
    let size = 0;
    for (;;) {
      abort.throwIfAborted();
      const { done, value: chunk } = await reader.read();
      if (done) break;
      size += chunk.byteLength;
      if (size > maxBytes) throw new InstagramError('Media exceeds the download size limit.', { code: 'MEDIA_TOO_LARGE' });
      await file.writeFile(chunk);
    }
    if (!size) throw new InstagramError('Instagram CDN returned an empty file.', { code: 'INVALID_RESPONSE' });
    abort.throwIfAborted();
    complete = true;
    return output;
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    if (timeout.aborted) throw new TimeoutError('Media download timed out.');
    if (error instanceof InstagramError) throw error;
    if (error.code === 'EEXIST') throw new InstagramError('The download destination already exists.', { code: 'FILE_EXISTS' });
    throw new ConnectionError('Could not download the media file.', { code: 'DOWNLOAD_FAILED', cause: error });
  } finally {
    try { if (reader) await reader.cancel(); else await response?.body?.cancel(); } catch {}
    let closeError;
    try { await file?.close(); } catch (error) { closeError = error; }
    if (created && (!complete || closeError)) await unlink(output).catch(() => {});
    if (complete && closeError) throw new InstagramError('Could not finish the media file.', { code: 'DOWNLOAD_FAILED', cause: closeError });
  }
}
