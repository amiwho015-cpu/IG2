# Changes in this build

- autodl: YouTube picks a video+audio format (never audio-only as .mp4); m./music.youtube.com supported; alldl -> alldlv2 backup
- ytb: toshiro downloader fallback when the remote API list is down
- nix: understands Bangla, Banglish, Hindi, Hinglish, Chittagonian, English (src/nixLang.js)
- adduser: rewritten (multi-target, follow+retry, already-in-group notice)
- welcome: join-event normalisation (src/bot.js), welcome card (config welcome.card), member-list fallback (events/onJoinScan.js)
- new commands: batslap, beautiful, horny, welcome, welcard, tiksearch (src/canvasApi.js learns the API parameter names)
- included: song-fix (sing, sing2, songDownload), nix-birthday (nix, birthday, githubSync, database)
- debug: unknown event types are logged once as "EVENT?"
