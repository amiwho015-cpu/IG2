import { mkdir, open, readFile, rename, stat, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { InstagramError, ValidationError } from '../shared/errors.js';
import { setPrivatePermissions } from './private-file.js';
import { validateSessionSnapshot } from '../shared/session-snapshot.js';

const writes = new Map();

export class SessionStorage {
  format = 'snapshot';

  constructor(filepath = '.state/session.json') {
    this.filepath = resolve(filepath);
  }

  async load() {
    await writes.get(this.filepath);
    let text;
    try {
      const info = await stat(this.filepath);
      if (!info.isFile() || info.size > 1024 * 1024) {
        throw new InstagramError('Session file is invalid or too large.', { code: 'INVALID_STORAGE' });
      }
      await setPrivatePermissions(this.filepath);
      text = await readFile(this.filepath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      if (error instanceof InstagramError) throw error;
      throw new InstagramError('Could not read session.', { code: 'STORAGE_READ' });
    }
    try {
      if (Buffer.byteLength(text) > 1024 * 1024) throw new Error();
      return validateSessionSnapshot(JSON.parse(text.replace(/^\uFEFF/, '')));
    } catch {
      throw new InstagramError('Session must be a valid versioned JSON snapshot.', { code: 'INVALID_STORAGE' });
    }
  }

  save(snapshot) {
    const serialized = JSON.stringify(validateSessionSnapshot(snapshot), null, 2) + '\n';
    if (Buffer.byteLength(serialized) > 1024 * 1024) throw new ValidationError('Session snapshot is too large.');
    return this.#serialize(async () => {
      await mkdir(dirname(this.filepath), { recursive: true, mode: 0o700 });
      const temporary = `${this.filepath}.${randomUUID()}.tmp`;
      try {
        const handle = await open(temporary, 'wx', 0o600);
        try {
          await setPrivatePermissions(temporary);
          await handle.writeFile(serialized, 'utf8');
          await handle.sync();
        } finally { await handle.close(); }
        await rename(temporary, this.filepath);
      } finally {
        await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
      }
    });
  }

  clear() {
    return this.#serialize(() => unlink(this.filepath).catch(error => { if (error.code !== 'ENOENT') throw error; }));
  }

  #serialize(operation) {
    const next = (writes.get(this.filepath) ?? Promise.resolve()).catch(() => {}).then(operation);
    writes.set(this.filepath, next);
    next.finally(() => { if (writes.get(this.filepath) === next) writes.delete(this.filepath); }).catch(() => {});
    return next;
  }
}
