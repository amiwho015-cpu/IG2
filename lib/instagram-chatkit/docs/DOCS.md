# instagram-chatkit API

[README](https://github.com/ttkienn/instagram-chatkit#readme) · **[API](https://github.com/ttkienn/instagram-chatkit/blob/main/docs/DOCS.md)** · [Code structure](https://github.com/ttkienn/instagram-chatkit/blob/main/docs/ARCHITECTURE.md)

Version 3.1.1. See the [README](https://github.com/ttkienn/instagram-chatkit#readme) to install and log in. In the tables, `options?` means optional; methods that send requests usually accept `{ signal }` to cancel the operation.

| Messages | Content | Handling |
| --- | --- | --- |
| [Send](https://github.com/ttkienn/instagram-chatkit/blob/main/docs/DOCS.md#send-messages) · [Receive](https://github.com/ttkienn/instagram-chatkit/blob/main/docs/DOCS.md#receive-messages-and-events) | [Media](https://github.com/ttkienn/instagram-chatkit/blob/main/docs/DOCS.md#media) · [Threads](https://github.com/ttkienn/instagram-chatkit/blob/main/docs/DOCS.md#threads) | [Filters](https://github.com/ttkienn/instagram-chatkit/blob/main/docs/DOCS.md#filters) · [Errors](https://github.com/ttkienn/instagram-chatkit/blob/main/docs/DOCS.md#errors) |

## Client

| Method | Purpose |
| --- | --- |
| `new InstagramClient(options)` | Create a client without logging in |
| `login(options?)`, `InstagramClient.connect(options)` | Log in; the second method also creates the client |
| `isLoggedIn()`, `isSessionValid(options?)` | Check cookies locally / check the session with Instagram |
| `saveSession()`, `loadSession(data)` | Export/load login data as `{ version: 2, cookies }` |
| `saveSessionToFile(path)`, `loadSessionFromFile(path)` | Save/load a file; loading returns `false` if the file is missing |
| `connectRealtime(options?)`, `disconnectRealtime()` | Open/close MQTT while keeping the HTTP session |
| `logout(options?)` | Clear cookies, session storage, and connections; does not revoke the session on Instagram |
| `close()` | Cancel pending requests and close the client; this client cannot be reused |

Common options: `cookies`, `storage`, `timeoutMs`, `receiving`, `logger`, `logLevel`. See the [API declarations](https://github.com/ttkienn/instagram-chatkit/blob/main/types/index.d.ts) for parameter details.

`SessionStorage(path)` saves login data to a file, defaulting to `.state/session.json`. `FileSessionStorage(path, { key: 'cookies' })` uses an existing configuration file. `EnvSessionStorage('IGCHAT_COOKIES')` only changes the running process's environment variable, not the `.env` file.

## ID types

Keep IDs as strings. Do not convert them to `Number`.

| Name | Meaning |
| --- | --- |
| `userPk` | Instagram account ID |
| `userFbid` | User ID in the messaging system |
| `nativeThreadId`, `threadId` | Direct/Iris conversation ID |
| `threadFbid` | Thread ID used by web Direct; the `id` returned by `threads.inbox()` |
| `itemId` | Iris message ID |
| `messageId`, web MID | Web message ID, used to edit, unsend, or react |

These IDs are not interchangeable. Do not infer an FBID from a Direct thread ID's length. `cursor/next_max_id` identifies the next page; use the exact value returned by the method.

## Send messages

| Method | Input |
| --- | --- |
| `messages.send(threadFbid, text, options?)` | Messaging FBID; options include `replyToMessageId/replyToUserId` to quote a message |
| `messages.edit(threadFbid, messageId, text, options?)` | Messaging FBID and web MID |
| `messages.unsend(threadFbid, messageId, options?)` | Messaging FBID and web MID |
| `messages.react(threadFbid, messageId, emoji, options?)` | Web MID; use `remove: true` to remove a reaction |
| `messages.sendToUser(username, text, options?)` | Find the exact username; may open a new DM |
| `messages.sendToGroup(nativeThreadId, text, options?)` | Direct thread ID; also works for DMs |
| `messages.markSeen/deleteItem(nativeThreadId, messageId, options?)` | Mark as read/unsend; requires a web MID |
| `messages.broadcast(options)` | `item: 'text'`, `form: { text }`, and exactly one of `threadIds/userIds` |

`send()` returns `{ messageId, offlineThreadingId }`; sending by username/thread returns an object containing `payload.message_id`. Broadcast accepts one thread or one list of user PKs per call.

The object returned by `connectRealtime()` accepts **Direct thread IDs**:

| Method | Purpose |
| --- | --- |
| `sendText(nativeThreadId, text, options?)` | Send text; options include `replyToId/replyToClientContext/clientContext` |
| `sendLike(nativeThreadId, options?)` | Send a heart |
| `sendMediaShare(nativeThreadId, mediaId, options?)` | Share a post; use `isClip: true` for a reel |
| `indicateTyping(nativeThreadId, active, options?)` | Turn the typing indicator on/off; it does not turn off automatically |

Send methods wait for confirmation from Instagram and return a message ID. If you supply `clientContext`, use a string containing a positive integer. On `DELIVERY_UNKNOWN`, check the conversation before sending again.

## Receive messages and events

```js
import { filters } from 'instagram-chatkit';

client.onMessage(filters.incoming, async function (message) {
  if (message.text === '/ping') {
    await message.replyText('Pong!');
  }
});
await client.connectRealtime();
```

Registration methods accept `(handler, options?)` or `(filter, handler, options?)`. Handlers receive `(data, client)` and may be async. Registration returns a function that removes the handler.

| Method | Receives |
| --- | --- |
| `onMessage/onMessageEdit/onMessageDelete` | New/edited/unsent messages |
| `onThreadUpdate/onUnseenCount/onRawDelta` | Thread changes/unseen counts/Iris data |
| `onHandlerError(handler)` | Errors from filters or handlers |
| `waitForHandlers()` | Wait for already received, queued data to finish processing |

Options include `group`, defaulting to 0. For each event, only the first matching handler in each group runs, ordered by ascending group number and then registration order. Use different groups to let multiple handlers receive the same message.

Your own messages are included by default; use `filters.incoming` or `receiving: { receiveOwnMessages: false }` to skip them. The default queue size is 1000, with at most 256 registered handlers. When the queue is full, new data is dropped.

### Message data

A message may include `text/senderId/nativeThreadId/threadFbid/itemId/messageId/fromMe/isGroup/attachments/raw`. Methods on the message:

| Method | Purpose |
| --- | --- |
| `replyText(text, options?)`, `getThread(options?)` | Reply in the same thread without quoting / get thread details |
| `markSeen(options?)`, `react(emoji, options?)` | Require a real web MID; react accepts `remove: true` to remove the reaction |
| `downloadMedia(options?)` | Download from an available URL; does not search history for one |

`messageId` may be a fallback item ID; methods that require a MID reject the call until a real web MID is available. After cookies or accounts change, methods on old messages report `SESSION_CHANGED`.

### Connection events

`client.on('state', handler)` receives `state/attempt/nextRetryIn/reason`. `client.on('listenerError', handler)` receives connection errors. `client.on('event', handler)` receives `{ type, data }`, including messages, reactions, readReceipt, and thread changes when Iris sends them. Use `onMessage/onHandlerError` to have the library catch errors from async handlers.

## Filters

| Filter | Matches |
| --- | --- |
| `text/photo/video/voice/gif/link/like/reel/post/media` | Content type |
| `self/me/incoming` | Your own messages / messages from others |
| `private/group` | DMs/groups; may make an HTTP request to determine the type |
| `chat(threadId)`, `fromUser(userPk)` | Thread/sender |
| `regex(pattern, flags?)` | Text matching the pattern |
| `command(nameOrNames, options?)` | Command names; defaults to prefix `/` and is case-insensitive |
| `all(...filters)`, `any(...filters)`, `not(filter)` | All/any/inverted conditions |
| `create(predicate)` | Your own function returning true/false; may be async |

The library awaits async filters. If you call a combined filter outside a registration method, use `await`.

## Media

```js
import { readFile } from 'node:fs/promises';

const image = await readFile('./photo.jpg');
await client.messages.sendPhoto(nativeThreadId, image, {
  mimeType: 'image/jpeg',
});
```

| Method | Purpose |
| --- | --- |
| `messages.sendPhoto/sendVideo/sendVoice(nativeThreadId, bytes, options?)` | Send JPEG/PNG, video, or voice; default MIME types are `image/jpeg`, `video/mp4`, `audio/mp4` |
| `messages.sendImageToUser(username, path, options?)` | Send an image file to a DM |
| `messages.sendVideoToUser(username, path, options?)` | Send a video; options include `durationMs/width/height/clientContext` |
| `messages.upload(bytes, options?)` | Upload a file and return `{ uploadId, mediaType }`; options include `mimeType/voice` |
| `messages.sendAttachment(threadFbid, options)` | `attachmentId: uploadId`, `type: 'image'/'video'/'audio'/'gif'/'file'`; accepts `replyToMessageId/clientContext` |
| `media.info/like/unlike/likers(target, options?)` | Get details/like/unlike/list users who liked it |
| `media.comment(target, text, options?)` | Add a comment; use `replyToCommentId` to reply |
| `media.deleteComment(target, commentId, options?)` | Delete a comment |
| `media.comments(target, maxId, options?)` | `comments/next_max_id/has_more_comments` |
| `media.save(target, enabled, options?)` | Save/unsave; `enabled` defaults to true |
| `media.download(url, options?)` | Download from a CDN and return the path; options include `path/maxBytes/timeoutMs/signal` |

Sending by Direct thread ID requires a matching FBID in the current inbox; it does not page through older threads. If none is found, it reports `THREAD_NOT_FOUND` before uploading the file. Media captions are not supported; send one attachment at a time. The library does not convert video or audio formats.

`target` accepts an ID, a post shortcode, or an Instagram link. Use `next_max_id` to read more comments. Downloads default to 100 MiB/30 seconds and accept only allowed HTTPS CDNs, without sending cookies or overwriting files. Received messages may lack a download URL.

## Threads

| Method | ID |
| --- | --- |
| `threads.inbox(options?)`, `threads.requests(options?)` | Return `{ threads, countThread, pageInfo }`; a thread's `id` is a messaging FBID |
| `threads.get(threadId, options?)`, `threads.list(cursor, options?)` | Direct thread ID; omit the cursor or pass null for the first page |
| `threads.history(threadId, options?)` | Direct thread ID; options include `cursor/limit` |
| `threads.getByParticipants(userPks, options?)` | Instagram user PKs |
| `threads.createGroup(userPks, title, options?)` | At least two people other than the logged-in account |
| `threads.approve/mute/unmute/leave(threadId, options?)` | Direct thread ID |
| `threads.addMembers(threadId, userPks, options?)`, `threads.updateTitle(threadId, title, options?)` | Direct thread ID |
| `threads.accept(threadFbid, options?)`, `threads.rename(threadFbid, name, options?)` | Messaging FBID |
| `threads.nickname(threadFbid, userFbid, name, options?)`, `threads.emoji(threadFbid, value, options?)` | Messaging FBID; older web endpoints, not rechecked with a live session |
| `threads.admin(threadFbid, userPk, enabled, options?)` | Messaging FBID; enabled defaults to true |
| `threads.getSyncSequence(options?)` | Return the Iris sync position as a string |

`history()` returns `{ messages, pageInfo: { hasNextPage, endCursor } }`, newest first, with a limit of 1–100. Use `endCursor` for the next page. History is not replayed through message handlers.

`get()` searches up to three pages of the inbox/message requests. If group creation reports `DELIVERY_UNKNOWN`, check the inbox before creating it again. `requests` accepts a cursor; inbox `folder: 'ARCHIVED'` has not been verified.

## Users, account, and Notes

| Method | Purpose |
| --- | --- |
| `account.currentUser(options?)`, `account.logout(options?)` | Current account `{ status: 'ok', user }` / local logout |
| `users.info(userPk, options?)`, `users.infoByUsername(username, options?)` | Profile details |
| `users.search/searchContacts(query, options?)` | Array of users/messaging users |
| `users.profile(target, options?)` | Username or messaging user FBID; does not accept an Instagram PK |
| `users.getFollowers/getFollowing(userPk, maxId, options?)` | `users/next_max_id/more_available` |
| `users.follow/unfollow(userPk, options?)`, `users.bio(text, options?)`, `users.notifications(options?)` | Follow/unfollow, change bio, read notifications |
| `friendships.create/destroy/show/approve/ignore(userPk, options?)` | Follow/unfollow, status, accept/ignore requests |
| `friendships.showMany(userPks, options?)`, `friendships.getPendingRequests(options?)` | Multiple users' statuses / pending requests |
| `notes.list(options?)`, `notes.create(text, options?)`, `notes.delete(noteId, options?)` | Read/create/delete notes |
| `notes.searchMusic(query, options?)`, `notes.createMusic(trackOrQuery, options?)` | Find tracks/create music notes |

Text notes allow up to 80 Unicode characters; audience accepts `followers/closeFriends` or `0/1`. Music notes accept a full track from `searchMusic()` or a search query, not a cluster ID alone. Options include `text/durationMs/startTimeMs/audience/signal`. Creating a note returns `{ noteId, data }`.

## Feed and search

| Method | Result |
| --- | --- |
| `feed.getFeed(maxId, options?)` | Home feed containing `feed_items` |
| `feed.getUserFeed(userPk, maxId, options?)`, `feed.getReelsFeed(maxId, options?)` | `items/next_max_id/more_available` |
| `search.all(query, options?)` | `users/hashtags/places`; options include `count/rankToken/searchType/signal` |
| `search.users/hashtags(query, count, options?)` | Users/hashtags |
| `search.locations(query, null, null, count, options?)` | Places; coordinates are not supported |
| `hashtags.search(query, options?)`, `locations.search(query, null, null, options?)` | Keyword search |

For the first page, omit maxId or pass null. Use `next_max_id` to read more. Search count defaults to 30 and accepts 1–100; searchType only accepts `'blended'`. Hashtag/place searches may return empty arrays.

## Logging

Logging is off by default. Pass `logger: function (record) { console.log(record); }` and `logLevel: 'info'` to enable it. Logs include `time/level/event` and state/error details, without cookies, tokens, or message content. Your app can add colors or write logs to files.

## Errors

| Error code | Action |
| --- | --- |
| `AUTHENTICATION_REQUIRED` | Check login/verification in the browser and update cookies |
| `RATE_LIMITED` | Wait and reduce the request rate |
| `THREAD_NOT_FOUND` | Check the ID type and whether the thread is in the inbox |
| `DELIVERY_UNKNOWN` | Check the actual result before retrying |
| `SESSION_CHANGED`, `HANDLER_QUEUE_FULL` | Get fresh data after changing sessions / reduce waiting in handlers |
| `UNSUPPORTED_OPERATION` | The method is not supported yet |

## Not supported yet

| Area | Not supported |
| --- | --- |
| Login | Username/password, bearer tokens instead of cookies |
| `account` | `login/encryptPassword/syncLoginExperiments/sendRecoveryFlowEmail/sendRecoveryFlowSms` |
| `users/friendships` | Block/unblock, removeFollower, mute/unmute relationships |
| `threads` | `rankedRecipients/presence/decline/theme/themes`; no kick/removeMember |
| `media` | `delete/edit/seen/publishPhoto/deleteCometStory/archiveCometStory` |
| `feed` | Publishing posts, `getTag/getLiked/getSaved/getLocation/getExploreFeed` |
| `uploads/stories/highlights/live` | All methods; `messages.upload` for Direct still works |
| `search/hashtags/locations` | Search history/suggestions, coordinates; hashtags/locations only support search |
| `messages` | Media captions, multiple attachments, media broadcasts, or older signed/query options |

## Examples

Examples: [send messages](https://github.com/ttkienn/instagram-chatkit/blob/main/examples/send-message.js), [receive messages](https://github.com/ttkienn/instagram-chatkit/blob/main/examples/receive-message.js), [SimpleBot](https://github.com/ttkienn/instagram-chatkit/blob/main/examples/optional/bot.js). `SimpleBot` from `instagram-chatkit/bot` uses `start()/close()`; type `/` to see commands. It skips the bot's own messages, so test with another account.
