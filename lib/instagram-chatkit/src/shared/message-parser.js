import { positiveId } from './validation.js';

const MAX_ATTACHMENTS = 10;
const MAX_REACTIONS = 100;
const itemIdPattern = /^[A-Za-z0-9._$:-]{1,512}$/;

function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function token(value) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) return undefined;
  return ['string', 'number', 'bigint'].includes(typeof value) && itemIdPattern.test(String(value)) ? String(value) : undefined;
}
function accountId(value) {
  if (!['string', 'number', 'bigint'].includes(typeof value) || !/^\d{1,512}$/.test(String(value))) return undefined;
  try { return positiveId(value); } catch { return undefined; }
}
function finite(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined; }
function dimension(value) {
  if (typeof value === 'string' && /^\d{1,9}$/.test(value)) value = Number(value);
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}
function url(value) {
  if (typeof value !== 'string' || value.length > 8192) return undefined;
  try {
    const result = new URL(value);
    return ['http:', 'https:'].includes(result.protocol) && !result.username && !result.password ? value : undefined;
  } catch { return undefined; }
}
function firstUrl(...values) { return values.map(url).find(Boolean); }
function time(value, divisor = 1000n) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) return undefined;
  if (!['number', 'string', 'bigint'].includes(typeof value) || !/^\d{1,19}$/.test(String(value))) return undefined;
  const result = BigInt(value) / divisor;
  return result <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(result) : undefined;
}
function first(values) {
  return Array.isArray(values) ? values.slice(0, MAX_ATTACHMENTS).find(value => object(value) && url(value.url)) : undefined;
}

export function parseReactions(value) {
  if (!object(value)) return [];
  const reactions = [];
  const seen = new Set();
  for (const kind of ['likes', 'emojis']) {
    if (!Array.isArray(value[kind])) continue;
    for (const reaction of value[kind].slice(0, MAX_REACTIONS)) {
      if (!object(reaction)) continue;
      const senderId = accountId(reaction.sender_id);
      const emoji = reaction.emoji ?? (kind === 'likes' ? '❤️' : undefined);
      if (!senderId || typeof emoji !== 'string' || emoji.length > 128) continue;
      const key = senderId + ':' + emoji;
      if (seen.has(key)) continue;
      seen.add(key);
      reactions.push({ senderId, emoji, timestampMs: time(reaction.timestamp), raw: reaction });
      if (reactions.length === MAX_REACTIONS) return reactions;
    }
  }
  return reactions;
}

function regularMedia(media, type) {
  if (!object(media)) return undefined;
  const image = first(media.image_versions2?.candidates);
  const video = first(media.video_versions);
  type ??= video || media.media_type === 2 ? 'video' : 'photo';
  const source = type === 'photo' ? image : video;
  return {
    type, id: token(media.pk ?? media.id), url: url(source?.url), previewUrl: url(image?.url),
    width: dimension(source?.width ?? media.original_width), height: dimension(source?.height ?? media.original_height),
    duration: finite(media.video_duration), raw: media,
  };
}

function shareLink(code, reel) {
  return typeof code === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(code)
    ? `https://www.instagram.com/${reel ? 'reel' : 'p'}/${code}/` : undefined;
}

function irisMedia(item, itemType) {
  if (itemType === 'voice_media') {
    const media = item.voice_media?.media;
    const audio = object(media?.audio) ? media.audio : {};
    return {
      type: 'voice_media', id: token(media?.id), url: firstUrl(media?.audio_src, audio.audio_src, item.audio_src),
      duration: finite(media?.audio_duration) ?? (finite(audio.duration) === undefined ? undefined : audio.duration / 1000),
      raw: object(media) ? media : item,
    };
  }
  if (itemType === 'animated_media') {
    const media = object(item.animated_media) ? item.animated_media : {};
    const image = media.images?.fixed_height ?? media.images?.original ?? {};
    return { type: 'animated_media', id: token(media.id), url: firstUrl(image.url, image.webp, image.mp4),
      previewUrl: url(image.webp), width: dimension(image.width), height: dimension(image.height), raw: media };
  }
  if (['clip', 'clip_share', 'media_share'].includes(itemType)) {
    const media = item.clip?.clip ?? item.media_share;
    return { ...(regularMedia(media) ?? {}), type: itemType === 'clip_share' ? 'clip' : itemType,
      linkUrl: shareLink(media?.code, itemType !== 'media_share'), raw: object(media) ? media : item };
  }
  if (['media', 'photo', 'video', 'felix_share'].includes(itemType)) {
    return regularMedia(item.media ?? item.visual_media?.media ?? item, ['photo', 'video'].includes(itemType) ? itemType : undefined);
  }
  if (['xma_share', 'story_share', 'reel_share'].includes(itemType)) {
    return { ...(regularMedia(item.media) ?? {}), type: itemType,
      linkUrl: firstUrl(item.link_url, typeof item.xma_share === 'string' ? item.xma_share : item.xma_share?.target_url), raw: item };
  }
  return undefined;
}

export function parseIrisMessage(item, { nativeThreadId, itemId } = {}) {
  if (!object(item) || !accountId(nativeThreadId) || !token(itemId) ||
      (item.item_id !== undefined && token(item.item_id) !== itemId)) return null;
  const senderId = accountId(item.user_id);
  const threadId = accountId(nativeThreadId);
  const text = typeof item.text === 'string' ? item.text : typeof item.link?.text === 'string' ? item.link.text : '';
  if (!senderId || text.length > 100_000) return null;
  const itemType = typeof item.item_type === 'string' && /^[a-z_]{1,64}$/.test(item.item_type) ? item.item_type : 'text';
  const media = irisMedia(item, itemType);
  const attachments = media ? [media] : [];
  if (itemType === 'link') {
    const linkUrl = firstUrl(item.link?.link_context?.link_url, item.link_url);
    if (linkUrl) attachments.push({ type: 'link', url: linkUrl, raw: item.link ?? item });
  }
  if (Array.isArray(item.attachments)) attachments.push(...item.attachments.slice(0, MAX_ATTACHMENTS).filter(object));
  return {
    id: itemId, messageId: token(item.message_id) ?? itemId, itemId,
    threadId, nativeThreadId: threadId, senderId, text, itemType,
    clientContext: token(item.client_context ?? item.otid) ?? null, nativeDirect: true,
    timestampMs: time(item.timestamp), fromMe: item.is_sent_by_viewer === true || item.fromMe === true,
    ...(typeof item.is_group === 'boolean' ? { isGroup: item.is_group } : {}),
    media, attachments: attachments.slice(0, MAX_ATTACHMENTS),
    reactions: parseReactions(item.reactions ?? item.preview_reactions), raw: item,
  };
}

function slideAttachment(attachment, type) {
  if (!object(attachment)) return undefined;
  return {
    type, id: token(attachment.attachment_fbid ?? attachment.id),
    url: firstUrl(attachment.attachment_cdn_url, attachment.attachment_cdn_fallback_url,
      attachment.attachment_webp_url, attachment.attachment_mp4_url, attachment.url),
    previewUrl: firstUrl(attachment.preview_cdn_url, attachment.preview_cdn_fallback_url),
    width: dimension(attachment.preview_width), height: dimension(attachment.preview_height),
    duration: finite(attachment.playable_duration_ms) === undefined ? undefined : attachment.playable_duration_ms / 1000,
    raw: attachment,
  };
}

function slideMedia(content) {
  if (!object(content)) return [];
  if (object(content.xma)) {
    const xma = content.xma;
    const target = url(xma.target_url);
    let type = 'xma_share';
    if (target) {
      const link = new URL(target);
      if (link.hostname === 'instagram.com' || link.hostname.endsWith('.instagram.com')) {
        if (link.pathname.startsWith('/reel/')) type = 'clip';
        else if (link.pathname.startsWith('/p/')) type = 'media_share';
      }
    }
    return [{ type, id: token(xma.target_id), linkUrl: target,
      previewUrl: firstUrl(xma.preview_image?.url, xma.xmaPreviewImage?.url), raw: content }];
  }
  const typename = typeof content.__typename === 'string' ? content.__typename.toLowerCase() : '';
  const type = typename.includes('video') ? 'video' : typename.includes('audio') || typename.includes('voice') ? 'voice_media'
    : typename.includes('animated') ? 'animated_media' : 'photo';
  const candidates = [content.ordered_photo_video_attachments, content.attachments, content.videos, content.audio_attachments,
    content.animated_media, content.attachment].find(value => Array.isArray(value) ? value.length > 0 : object(value));
  const attachments = Array.isArray(candidates) ? candidates.slice(0, MAX_ATTACHMENTS) : [candidates];
  return attachments.filter(object).map(attachment => {
    const mediaType = candidates === content.ordered_photo_video_attachments
      ? (/video/i.test(String(attachment.__typename)) ? 'video' : /image/i.test(String(attachment.__typename)) ? 'photo' : 'media') : type;
    return slideAttachment(attachment, mediaType);
  });
}

export function parseSlideMessage(node, { nativeThreadId, threadFbid, viewerId, isGroup } = {}) {
  if (!object(node)) return null;
  const id = token(node.message_id ?? node.id);
  const senderId = accountId(node.sender?.igid ?? node.sender?.user_dict?.id);
  if (!id || !senderId) return null;
  const content = object(node.content) ? node.content : {};
  const text = node.text_body ?? content.text_body ?? content.xma_text_body ?? '';
  if (typeof text !== 'string' || text.length > 100_000) return null;
  const attachments = slideMedia(content);
  const media = attachments[0];
  const thread = accountId(nativeThreadId);
  return {
    id, messageId: id,
    ...(thread ? { threadId: thread, nativeThreadId: thread } : {}),
    threadFbid: accountId(threadFbid ?? node.thread_fbid), senderId, text,
    itemType: media?.type ?? (content.__typename === 'SlideMessageAdminText' ? 'placeholder' : 'text'),
    clientContext: token(node.offline_threading_id) ?? null,
    timestampMs: time(node.timestamp_ms, 1n), fromMe: !!accountId(viewerId) && senderId === String(viewerId),
    ...(typeof isGroup === 'boolean' ? { isGroup } : {}),
    media, attachments, reactions: parseReactions(node.reactions), raw: node,
  };
}
