import { chmod } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { InstagramError } from '../shared/errors.js';

const runFile = promisify(execFile);

export async function setPrivatePermissions(path) {
  if (process.platform !== 'win32') return chmod(path, 0o600);
  const script = fileURLToPath(new URL('../../scripts/set-private-permissions.ps1', import.meta.url));
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => name.toLowerCase() !== 'psmodulepath'));
  try {
    await runFile('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-LiteralPath', path,
    ], { windowsHide: true, env, timeout: 15_000 });
  } catch {
    throw new InstagramError('Could not restrict session file permissions.', { code: 'STORAGE_PERMISSIONS' });
  }
}
