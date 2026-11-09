import { AccountApi } from '../features/account/account-api.js';
import { FriendshipsApi } from '../features/friendships/friendships-api.js';
import { UsersApi } from '../features/users/users-api.js';
import { ThreadsApi } from '../features/threads/threads-api.js';
import { MessagesApi } from '../features/messages/messages-api.js';
import { MediaApi } from '../features/media/media-api.js';
import { UploadsApi } from '../features/media/uploads-api.js';
import { FeedApi } from '../features/feed/feed-api.js';
import { StoriesApi } from '../features/stories/stories-api.js';
import { HighlightsApi } from '../features/highlights/highlights-api.js';
import { HashtagsApi } from '../features/hashtags/hashtags-api.js';
import { LocationsApi } from '../features/locations/locations-api.js';
import { SearchApi } from '../features/search/search-api.js';
import { LiveApi } from '../features/live/live-api.js';
import { NotesApi } from '../features/notes/notes-api.js';
import { getInstagramViewer } from '../auth/realtime-bootstrap.js';

export function createFeatures(http, { getBootstrap, getInboxContext, onLogout } = {}) {
  const getViewer = options => getInstagramViewer(http, options);
  const account = new AccountApi(http, { getWebUser: getViewer, onLogout });
  const friendships = new FriendshipsApi(http);
  const users = new UsersApi(http, friendships, { getViewer, getInboxContext });
  const threads = new ThreadsApi(http, undefined, { getBootstrap, getInboxContext, users });
  const media = new MediaApi(http, { getInboxContext });
  const uploads = new UploadsApi(http);
  const messages = new MessagesApi(http, undefined, { users, uploads, threads, getInboxContext });
  const highlights = new HighlightsApi(http);
  return {
    account, friendships, users, threads, media, uploads, messages, highlights,
    feed: new FeedApi(http, { users }),
    stories: new StoriesApi(http, { uploads, media, highlights }),
    hashtags: new HashtagsApi(http),
    locations: new LocationsApi(http),
    search: new SearchApi(http),
    live: new LiveApi(http),
    notes: new NotesApi(http),
  };
}
