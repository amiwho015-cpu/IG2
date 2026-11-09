import { boundedInteger } from '../../shared/validation.js';

function audienceValue(audience) {
  if (audience === 'followers') return 0;
  if (audience === 'closeFriends') return 1;
  return boundedInteger(audience, 'audience', 0, 1);
}

export function noteInput(content, audience, music = null) {
  return {
    additional_params: {
      note_create_params: {
        note_create_info: music ? { music_note_create_info: music } : null,
        note_style: music ? 1 : 0,
        text: content,
      },
    },
    audience: audienceValue(audience),
    inbox_tray_item_type: 'note',
  };
}

export function musicNoteInfo(track, { durationMs, startTimeMs }) {
  return {
    alacorn_session_id: track.alacorn_session_id,
    audio_asset_id: track.audio_asset_id,
    audio_cluster_id: track.audio_cluster_id,
    browse_session_id: track.browse_session_id,
    duration: durationMs,
    start_time: startTimeMs,
  };
}
