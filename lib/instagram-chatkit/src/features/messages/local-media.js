import { readFile, stat } from 'node:fs/promises';
import { InstagramError, ValidationError } from '../../shared/errors.js';
import { text } from '../../shared/validation.js';

const maximumMediaBytes = 100 * 1024 * 1024;

export async function readMedia(filepath, signal) {
  const path = text(filepath, 'mediaPath');
  try {
    signal?.throwIfAborted();
    const file = await stat(path);
    if (!file.isFile() || file.size < 1 || file.size > maximumMediaBytes) {
      throw new ValidationError('Media must be a nonempty file of at most 100 MiB.');
    }
    const data = await readFile(path, { signal });
    if (!data.byteLength || data.byteLength > maximumMediaBytes) throw new ValidationError('Media must be nonempty and at most 100 MiB.');
    return data;
  } catch (error) {
    if (error instanceof ValidationError || signal?.aborted) throw signal?.reason ?? error;
    throw new InstagramError('Could not read the local media file.', { code: 'MEDIA_READ', cause: error });
  }
}
