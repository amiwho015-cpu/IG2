import { randomUUID } from 'node:crypto';
import { InstagramError, ValidationError } from '../../shared/errors.js';
import { positiveId } from '../../shared/validation.js';
import { checked } from '../shared/response.js';

const maximumPhotoBytes = 100 * 1024 * 1024;

export function validateWebPhoto(data, mimeType = 'image/jpeg') {
  if (!(data instanceof Uint8Array) || !data.byteLength || data.byteLength > maximumPhotoBytes) {
    throw new ValidationError('Photo data must be nonempty bytes of at most 100 MiB.');
  }
  const jpeg = data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => data[index] === byte);
  if (!((mimeType === 'image/jpeg' && jpeg) || (mimeType === 'image/png' && png))) {
    throw new ValidationError('Photo bytes must match the JPEG or PNG MIME type.');
  }
  return png ? 'photo.png' : 'photo.jpg';
}

export async function uploadWebPhoto(http, data, { form = {}, headers, signal, mimeType = 'image/jpeg' } = {}) {
  const filename = validateWebPhoto(data, mimeType);
  signal?.throwIfAborted();
  const body = new FormData();
  for (const [key, value] of Object.entries(form)) {
    if (value !== undefined && value !== null) body.set(key, String(value));
  }
  body.set('upload_id', randomUUID());
  body.set('farr', new Blob([data], { type: mimeType }), filename);
  const requestHeaders = new Headers(headers);
  requestHeaders.delete('content-type');
  requestHeaders.set('x-fb-friendly-name', 'FileMercuryUploadService');
  requestHeaders.set('x-ig-d', 'www');
  requestHeaders.set('x-asbd-id', '359341');
  const response = checked(await http.multipart('/ajax/mercury/upload.php', body, {
    headers: Object.fromEntries(requestHeaders), signal,
  }));
  const metadata = response.payload?.metadata?.['0'];
  const attachmentId = metadata?.fbid ?? metadata?.image_id;
  if (attachmentId === undefined || attachmentId === null || attachmentId === '') {
    throw new InstagramError('Instagram did not confirm the uploaded photo.', { code: 'UNCONFIRMED_OPERATION' });
  }
  return { attachmentId: positiveId(attachmentId, 'attachmentId') };
}
