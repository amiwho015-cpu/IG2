# Changes in this build

- autodl: YouTube picks a video+audio format (never audio-only as .mp4); m./music.youtube.com supported; alldl -> alldlv2 backup
- ytb: toshiro downloader fallback when the remote API list is down
- nix: understands Bangla, Banglish, Hindi, Hinglish, Chittagonian, English (src/nixLang.js)
- adduser: rewritten (multi-target, follow+retry, already-in-group notice)
- welcome: join-event normalisation (src/bot.js), welcome card (config welcome.card), member-list fallback (events/onJoinScan.js)
- new commands: batslap, beautiful, horny, welcome, welcard, tiksearch (src/canvasApi.js learns the API parameter names)
- included: song-fix (sing, sing2, songDownload), nix-birthday (nix, birthday, githubSync, database)
- debug: unknown event types are logged once as "EVENT?"

## instagram-chat-api (ICA) added
- Vendored `jarif098/instagram-chat-api` in `lib/instagram-chat-api`.
- New login mode `ica` (`IG_FORCE_MODE=1 IG_MODE=ica`). Default is now `ica`; `instachat` remains available via IG_FORCE_MODE=1 IG_MODE=instachat.
- ICA lib was upgraded with throttle, adaptive polling, participant events, checkSession, sendHuman, awaitMessage and the command handler, so mode `ica` supports everything `instachat` does.

## instagram-chatkit added (now the default)
- Vendored `ttkienn/instagram-chatkit` 3.1.1 in `lib/instagram-chatkit` (ESM, real MQTT realtime instead of polling).
- `src/chatkitClient.js` adapts it to the client surface igAdapter already uses, so no command changed.
- New login mode `chatkit` is the default (hardcoded in `src/config.js` + `config.json`). `ica` and `instachat` stay available via `IG_FORCE_MODE=1 IG_MODE=ica|instachat`.
- Needs Node 22+ (Dockerfile moved to node:22; canvas is compiled there). New deps: `mqtt`, `ws`.
- Things chatkit cannot do natively are routed to a lazily created, never-connected `lib/instagram-chat-api` client with the same cookies: remove member, decline message request, delete thread, @mentions, gif, sticker (nickname falls back to it too).
- `changeBio` and `changeThreadEmoji` now work in chatkit mode. Still unsupported everywhere: profile picture, sending Instagram music. Media captions are sent as a separate text message.
