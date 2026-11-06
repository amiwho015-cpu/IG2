- realtime push: Tanvir143 realtime MQTT (raw TLS to edge-mqtt.facebook.com, MQTToT + thrift CONNECT) added as mode `robot`: lib/instachat-api/src/transport/robot-mqtt.js, robot-mqtt-trigger.js, robot-mqttot.js. No extra npm packages. Now the default (`instachat.mqtt: true`, `instachat.mqttMode: "robot"`); auto order is robot -> ica -> native -> library. Test: node test (mock broker) in test/robot-mqtt.test.js.

# Changes in this build

- realtime push: InstaBOT's MQTT-over-WebSocket client (mqtt library, wss://edge-chat.instagram.com/chat, cookie auth, relaxed mqtt-packet flags, endpoint fallback, backoff reconnect, Iris sync) added as a third push mode: lib/instachat-api/src/transport/ica-mqtt.js + ica-mqtt-trigger.js. Needs `mqtt` and `duplexify` (added to package.json -> run `npm install`). `instachat.mqtt: true`, `instachat.mqttMode`: auto (default: ica -> native -> library) | ica | native | library. Polling stays as the safety net: it is slowed only after a real push arrives and returns to fast polling when the socket drops. Test: `node --test test/ica-mqtt.test.js`.

- realtime push: native MQTT-over-WebSocket client ported from insta-chat-api (lib/instachat-api/src/transport/ws-mqtt.js, ws-mqtt-trigger.js). Needs only the `ws` package. Enable with `instachat.mqtt: true` in config.json (or IG_MQTT=1); `instachat.mqttMode`: native (default) | library (instagram_mqtt) | auto. Polling is only slowed after a real push arrives and returns to fast polling if the socket drops.

- autodl: YouTube picks a video+audio format (never audio-only as .mp4); m./music.youtube.com supported; alldl -> alldlv2 backup
- ytb: toshiro downloader fallback when the remote API list is down
- nix: understands Bangla, Banglish, Hindi, Hinglish, Chittagonian, English (src/nixLang.js)
- adduser: rewritten (multi-target, follow+retry, already-in-group notice)
- welcome: join-event normalisation (src/bot.js), welcome card (config welcome.card), member-list fallback (events/onJoinScan.js)
- new commands: batslap, beautiful, horny, welcome, welcard, tiksearch (src/canvasApi.js learns the API parameter names)
- included: song-fix (sing, sing2, songDownload), nix-birthday (nix, birthday, githubSync, database)
- debug: unknown event types are logged once as "EVENT?"

## Media send / unsend / react fixes (vendor/tanvir-ica-compat.js)
- sendImage / sendVideo / sendAudio now accept Buffer, stream, local path, URL string, or { buffer | stream | path | url }.
  Sources are normalised to { path } or { url } before reaching tanvir-mqtt, which only understood those two.
  Fixes "tanvir-mqtt: media send needs { path } or { url }" (gcimg and every Buffer-based command).
- sendVideo accepts the caption slot (sendVideo(src, tid, caption, cb, reply)) used by the video retry path.
- unsendMessage and setMessageReaction accept (id, threadID, cb) as well as (id, cb). Previously the threadID was
  taken as the callback, so unsend/react callbacks never fired.
- Messages sent by the bot are remembered with their thread, so unsend/react can find them without a prior listen event.

## Reply media bridge + reaction fix (vendor/tanvir-ica-compat.js)
- In tanvir-ica mode the vendored listener only sets event.replyTo (id + author). The bot reads
  event.repliedToMessage / messageReply, which was never set, so every reply command (pattu add, edit,
  reply-target commands) saw no media. listenMqtt now fills repliedToMessage: attachments come from a cache of
  recently seen items, or from the thread history when the replied message is older.
- api.setMessageReaction no longer calls itself (it used to recurse via the replaced method).
- Boot log prints "[ICA-COMPAT] v2 loaded" so it is easy to confirm the deployed build includes these fixes.
