import { randomUUID } from 'node:crypto';
import { InstagramError, ValidationError } from '../../shared/errors.js';
import { boundedInteger, id, text } from '../../shared/validation.js';
import { checked } from '../shared/response.js';
import { musicNoteInfo, noteInput } from './note-payloads.js';

function createdNote(payload) {
  checked(payload);
  const responses = Object.values(payload.data ?? {}).filter(value => value && typeof value === 'object' && !Array.isArray(value) && value.inbox_tray_item);
  const response = responses.length === 1 ? responses[0] : null;
  const item = response?.inbox_tray_item;
  const rawId = item?.inbox_tray_item_id ?? item?.note_dict?.note_id;
  if (!response || (Object.hasOwn(response, 'success') && response.success !== true) || !item || typeof item !== 'object' || Array.isArray(item) || !rawId) {
    throw new InstagramError('Instagram did not confirm the created note.', { code: 'UNCONFIRMED_OPERATION' });
  }
  let noteId;
  try { noteId = id(rawId, 'noteId', { numeric: false }); }
  catch { throw new InstagramError('Instagram did not confirm the created note.', { code: 'UNCONFIRMED_OPERATION' }); }
  return { noteId, data: item };
}

export class NotesApi {
  #http;

  constructor(http) {
    this.#http = http;
  }

  async list({ signal } = {}) {
    const payload = checked(await this.#http.graphql('29231580869776032', {}, {
      friendlyName: 'IGDInboxTrayQuery',
      signal,
    }));
    const responses = Object.values(payload.data ?? {}).filter(value => value && typeof value === 'object' && Array.isArray(value.inbox_tray_items));
    const items = responses.length === 1 ? responses[0].inbox_tray_items : null;
    if (!Array.isArray(items)) throw new InstagramError('Instagram did not return notes.', { code: 'INVALID_RESPONSE' });
    return items
      .filter(item => item && [undefined, null, 'note'].includes(item.inbox_tray_item_type))
      .map(item => ({
        id: String(item.inbox_tray_item_id || item.id || ''),
        text: item.note_dict?.text || item.text || '',
        user: item.pog_info?.pog_users?.[0] || item.user || null,
        data: item,
      }));
  }

  async create(content, { audience = 'followers', signal } = {}) {
    const input = noteInput(text(content, 'note', { max: 80 }).trim(), audience);
    return createdNote(await this.#http.graphql('28592645767037889', { input }, {
      friendlyName: 'usePolarisCreateInboxTrayItemSubmitMutation',
      signal,
    }));
  }

  async delete(noteId, { signal } = {}) {
    const payload = checked(await this.#http.graphql('28419182984337833', { inbox_tray_item_id: id(noteId, 'noteId', { numeric: false }) }, {
      friendlyName: 'usePolarisDeleteInboxTrayItemSubmitMutation',
      signal,
    }));
    if (payload.data?.xdt_delete_inbox_tray_item?.success !== true) {
      throw new InstagramError('Instagram did not confirm note deletion.', { code: 'UNCONFIRMED_OPERATION' });
    }
    return payload.data.xdt_delete_inbox_tray_item;
  }

  async searchMusic(query, { signal } = {}) {
    const browseSessionId = randomUUID();
    const parameters = {
      browse_session_id: browseSessionId,
      product: 'IG_MUSIC_NOTES',
      q: text(query, 'query').trim(),
    };
    const payload = checked(await this.#http.graphql('27152225807728809', { params: parameters }, {
      friendlyName: 'IGDComposerRichContentMusicSearchQuery',
      signal,
    }));
    const search = payload.data?.xfb_ig_audio_search;
    if (!Array.isArray(search?.items)) throw new InstagramError('Instagram did not return music search results.', { code: 'INVALID_RESPONSE' });
    return search.items
      .filter(item => item?.track?.audio_cluster_id)
      .map(({ track, metadata }) => ({
        ...track,
        audio_cluster_id: String(track.audio_cluster_id),
        audio_asset_id: String(track.audio_asset_id || track.id || track.audio_cluster_id),
        browse_session_id: browseSessionId,
        alacorn_session_id: search.alacorn_session_id || randomUUID(),
        allow_media_creation_with_music: metadata?.allow_media_creation_with_music !== false,
      }));
  }

  async createMusic(target, { text: content = '', durationMs = 30000, startTimeMs = 0, audience = 'followers', signal } = {}) {
    text(content, 'note', { empty: true, max: 80 });
    boundedInteger(durationMs, 'durationMs', 1000, 30000);
    boundedInteger(startTimeMs, 'startTimeMs', 0, Number.MAX_SAFE_INTEGER);
    noteInput(content, audience);
    const suppliedTrack = target && typeof target === 'object' && !Array.isArray(target);
    let track = suppliedTrack ? { ...target } : null;
    if (!suppliedTrack) {
      const query = text(target, 'track query').trim();
      if (/^[+-]?\d+$/.test(query)) {
        throw new ValidationError('An audio cluster ID alone is incomplete. Pass a full track returned by searchMusic() or a song search query.');
      }
      const tracks = await this.searchMusic(query, { signal });
      track = tracks.find(item => item.allow_media_creation_with_music);
      if (!track) throw new InstagramError('No usable music track was found.', { code: 'NOT_FOUND' });
    }
    if (track.allow_media_creation_with_music === false) throw new ValidationError('The selected track does not allow music note creation.');
    for (const field of ['audio_cluster_id', 'audio_asset_id', 'browse_session_id', 'alacorn_session_id']) {
      const value = text(track[field], `track.${field}`, { max: 512 });
      if (/[\u0000-\u001f\u007f]/.test(value)) throw new ValidationError('Music track metadata contains invalid characters.');
    }
    if (track.duration_in_ms && startTimeMs + durationMs > track.duration_in_ms) {
      throw new ValidationError('Music segment exceeds the track duration.');
    }
    const music = musicNoteInfo(track, { durationMs, startTimeMs });
    const input = noteInput(content, audience, music);
    return createdNote(await this.#http.graphql('28592645767037889', { input }, {
      friendlyName: 'usePolarisCreateInboxTrayItemSubmitMutation',
      signal,
    }));
  }
}
