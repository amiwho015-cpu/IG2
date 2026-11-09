import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { InstagramError, ValidationError } from '../shared/errors.js';
import { setPrivatePermissions } from './private-file.js';
import { validateStoredCookies } from './validate-cookies.js';

const writesByPath = new Map();

export class FileSessionStorage {
  format = 'cookies';

  constructor(filepath = 'config.json', { key = 'cookies' } = {}) {
    this.filepath = resolve(filepath);
    if (typeof key !== 'string' || !key || ['__proto__', 'constructor', 'prototype'].includes(key)) {
      throw new ValidationError('Invalid session storage key.');
    }
    this.key = key;
  }

  async load() {
    await writesByPath.get(this.filepath);
    const data = await this.#read();
    if (!data) return null;
    await setPrivatePermissions(this.filepath);
    const cookies = data[this.key];
    return typeof cookies === 'string' && cookies.trim() ? cookies : null;
  }

  save(cookies) {
    validateStoredCookies(cookies);
    return this.#update(data => ({ ...data, [this.key]: cookies }));
  }

  clear() {
    return this.#update(data => {
      if (!data || !Object.hasOwn(data, this.key)) return null;
      delete data[this.key];
      return data;
    });
  }

  async #read() {
    let text;
    try {
      text = await readFile(this.filepath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw new InstagramError('Could not read session file.', { code: 'STORAGE_READ' });
    }
    try {
      const data = JSON.parse(text.replace(/^\uFEFF/, ''));
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
      return data;
    } catch {
      throw new InstagramError('Session file must contain a valid JSON object. The existing file was preserved.', { code: 'INVALID_STORAGE' });
    }
  }

  #update(transform) {
    const previous = writesByPath.get(this.filepath) ?? Promise.resolve();
    const operation = previous.catch(() => {}).then(async () => {
      const updated = transform(await this.#read());
      if (updated !== null) await this.#write(updated);
    });
    writesByPath.set(this.filepath, operation);
    operation.finally(() => {
      if (writesByPath.get(this.filepath) === operation) writesByPath.delete(this.filepath);
    }).catch(() => {});
    return operation;
  }

  async #write(data) {
    await mkdir(dirname(this.filepath), { recursive: true, mode: 0o700 });
    const temporary = `${this.filepath}.${randomUUID()}.tmp`;
    try {
      const handle = await open(temporary, 'wx', 0o600);
      try {
        await handle.writeFile(JSON.stringify(data, null, 2) + '\n', 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }
      await setPrivatePermissions(temporary);
      await rename(temporary, this.filepath);
    } finally {
      await unlink(temporary).catch(error => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
  }
}
