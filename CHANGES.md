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

## Login fix
- lib/*/src/client.js: connect() and checkSession() used https://www.instagram.com/data/shared_data/, which Instagram now redirects to the login page, so even valid cookies gave "session is invalid, expired, or logged out". The session is now verified with the inbox request instead (both lib/instagram-chat-api and lib/instachat-api).
- .dockerignore: removed `Dockerfile` and `.dockerignore` entries (Render failed with "failed to read dockerfile: open Dockerfile: no such file or directory").
