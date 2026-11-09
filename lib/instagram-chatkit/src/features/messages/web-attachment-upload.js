import { randomUUID } from 'node:crypto';
import { InstagramError, ValidationError } from '../../shared/errors.js';
import { positiveId } from '../../shared/validation.js';
import { checked } from '../shared/response.js';
import { uploadWebPhoto } from '../media/mercury-upload.js';

export function validateAttachment(data, mimeType, voice) {
  if (!(data instanceof Uint8Array) || !data.byteLength || data.byteLength > 100 * 1024 * 1024) {
    throw new ValidationError('Attachment data must be nonempty bytes of at most 100 MiB.');
  }
  if (typeof mimeType !== 'string' || !/^(image|video|audio)\/[A-Za-z0-9.+-]+$/.test(mimeType)) throw new ValidationError('Unsupported media MIME type.');
  if (typeof voice !== 'boolean' || (voice && !mimeType.startsWith('audio/'))) throw new ValidationError('Voice attachments require an audio MIME type.');
}

export async function uploadWebAttachment(http, data, { context, mimeType = 'image/jpeg', voice = false, signal } = {}) {
  validateAttachment(data, mimeType, voice);
  signal?.throwIfAborted();
  if (mimeType.startsWith('image/')) return uploadWebPhoto(http, data, { ...context, mimeType, signal });
  const body = new FormData();
  for (const [key, value] of Object.entries(context.form)) if (value != null) body.set(key, String(value));
  body.set('upload_id', randomUUID());
  if (voice) body.set('voice_clip', 'true');
  const extension = mimeType.split('/')[1].replace(/[^A-Za-z0-9]/g, '');
  body.set('farr', new Blob([data], { type: mimeType }), `attachment.${extension}`);
  const response = checked(await http.multipart('/ajax/mercury/upload.php', body, {
    signal, headers: { ...context.headers, 'x-fb-friendly-name': 'FileMercuryUploadService', 'x-ig-d': 'www', 'x-asbd-id': '359341' },
  }));
  const metadata = response.payload?.metadata?.['0'];
  const attachment = metadata?.fbid ?? metadata?.video_id ?? metadata?.audio_id ?? metadata?.file_id;
  if (attachment == null || attachment === '') throw new InstagramError('Instagram did not confirm the attachment upload.', { code: 'UNCONFIRMED_OPERATION' });
  return { attachmentId: positiveId(attachment, 'attachmentId') };
}
