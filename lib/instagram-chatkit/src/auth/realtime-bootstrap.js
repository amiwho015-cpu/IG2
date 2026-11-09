import { AuthenticationError, ConnectionError, InstagramError } from '../shared/errors.js';
import { parseCookies } from '../shared/cookies.js';
import { id, positiveId } from '../shared/validation.js';
import { parseInstagramJson } from '../transport/http/response.js';

const MODULES = new Set(['DTSGInitialData', 'LSD', 'SiteData', 'IGDMqttWebDeviceID', 'PolarisViewer']);
const INBOX_QUERY_ID = '27909866362025854';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const INBOX_CONTEXT_TTL_MS = 60_000;

function invalidResponse() {
  return new InstagramError('Instagram did not return a valid realtime bootstrap response.', { code: 'INVALID_RESPONSE' });
}

function authenticationIdentity(cookies) {
  const parsed = parseCookies(cookies);
  return JSON.stringify([parsed.get('ds_user_id') ?? '', parsed.get('sessionid') ?? '']);
}

function checkCurrentSession(http, identity, signal) {
  signal?.throwIfAborted();
  if (authenticationIdentity(http.cookies) !== identity) {
    throw new ConnectionError('Account session changed during realtime bootstrap.', { code: 'SESSION_CHANGED', retryable: false });
  }
}

function bootstrapModules(html) {
  const modules = new Map();
  let visited = 0;
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (!/\btype\s*=\s*(?:"application\/json"|'application\/json'|application\/json(?:\s|$))/i.test(match[1])) continue;
    let parsed;
    try {
      parsed = parseInstagramJson(`{"value":${match[2]}}`).value;
    } catch { continue; }
    const stack = [[parsed, 0]];
    while (stack.length) {
      const [value, depth] = stack.pop();
      if (!value || typeof value !== 'object' || depth > 100) continue;
      if (++visited > 100_000) throw invalidResponse();
      if (Array.isArray(value) && MODULES.has(value[0]) && value[2] && typeof value[2] === 'object' && !Array.isArray(value[2])) {
        modules.set(value[0], value[2]);
      }
      const children = Object.values(value);
      for (let index = children.length - 1; index >= 0; index--) {
        if (children[index] && typeof children[index] === 'object') stack.push([children[index], depth + 1]);
      }
    }
  }
  return modules;
}

function sessionFields(html) {
  const modules = bootstrapModules(html);
  const token = modules.get('DTSGInitialData')?.token;
  const lsd = modules.get('LSD')?.token;
  const deviceId = modules.get('IGDMqttWebDeviceID')?.clientId;
  const site = modules.get('SiteData');
  const validToken = value => typeof value === 'string' && value.length > 0 && value.length <= 8192 && !/[\u0000-\u001f\u007f]/.test(value);
  if (!validToken(token) || !validToken(lsd) || !deviceId || !site || !modules.get('PolarisViewer')?.data?.fbid) {
    throw new AuthenticationError('Instagram did not return the web realtime session fields.');
  }
  if (typeof deviceId !== 'string' || !UUID.test(deviceId)) throw invalidResponse();
  let actorId, revision, hsi;
  try {
    actorId = positiveId(modules.get('PolarisViewer').data.fbid, 'actorId');
    revision = positiveId(site.client_revision, 'clientRevision');
    hsi = site.hsi == null ? '' : id(site.hsi, 'hsi');
  } catch { throw invalidResponse(); }
  return { token, lsd, deviceId, actorId, revision, hsi };
}

export async function getInstagramViewer(http, { signal } = {}) {
  signal?.throwIfAborted();
  const cookies = parseCookies(http.cookies);
  let accountPk;
  try {
    if (!cookies.get('sessionid')) throw new Error();
    accountPk = positiveId(cookies.get('ds_user_id'), 'account PK');
  } catch {
    throw new AuthenticationError('The current web account requires authenticated browser cookies.');
  }

  const identity = authenticationIdentity(http.cookies);
  const html = await http.getText('/direct/inbox/', { signal });
  checkCurrentSession(http, identity, signal);
  const viewer = bootstrapModules(html).get('PolarisViewer')?.data;
  if (!viewer || typeof viewer !== 'object' || Array.isArray(viewer)) {
    throw new AuthenticationError('Instagram did not return the authenticated web account.');
  }

  let viewerPk;
  try { viewerPk = positiveId(viewer.id ?? viewer.pk, 'viewer PK'); }
  catch {
    throw new InstagramError('Instagram returned an invalid current account.', { code: 'INVALID_RESPONSE' });
  }
  if (viewerPk !== accountPk) {
    throw new AuthenticationError('The web account and session cookies identify different accounts.');
  }
  if (typeof viewer.username !== 'string' || !/^[A-Za-z0-9._]{1,30}$/.test(viewer.username) ||
      (viewer.full_name !== undefined && typeof viewer.full_name !== 'string')) {
    throw new InstagramError('Instagram returned an invalid current account.', { code: 'INVALID_RESPONSE' });
  }
  return { ...viewer, id: viewerPk, pk: viewerPk };
}

export async function getInstagramInboxContext(http, { signal } = {}) {
  signal?.throwIfAborted();
  const identity = authenticationIdentity(http.cookies);
  const checkSession = (options = { signal }) => checkCurrentSession(http, identity, options.signal);
  const html = await http.getText('/direct/inbox/', { signal });
  checkSession();
  const fields = sessionFields(html);
  const now = Date.now();
  const variables = {
    device_id_for_iris_subscription: fields.deviceId,
    __relay_internal__pv__IGDIsProfessionalAccountGKrelayprovider: false,
    __relay_internal__pv__IGDPinnedThreadsRenderEnabledGKrelayprovider: true,
    __relay_internal__pv__IGDMaxUnreadMessagesCountrelayprovider: 5,
    __relay_internal__pv__IGDThreadListActionsEnabledGKrelayprovider: true,
  };
  const form = {
    av: '0', __user: '0', __a: '1', __d: 'www', __comet_req: '7', __jssesw: '1', __req: '1',
    __rev: fields.revision, __hsi: fields.hsi,
    __spin_r: fields.revision, __spin_b: 'trunk', __spin_t: String(Math.floor(now / 1000)),
    fb_dtsg: fields.token,
    jazoest: '2' + [...fields.token].reduce((sum, character) => sum + character.codePointAt(0), 0),
    lsd: fields.lsd,
    server_timestamps: 'true',
  };
  const headers = {
    'x-fb-lsd': fields.lsd,
    'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty',
    referer: 'https://www.instagram.com/direct/inbox/',
  };
  const result = await http.post('/api/graphql', {
    ...form,
    fb_api_caller_class: 'RelayModern', fb_api_req_friendly_name: 'PolarisDirectInboxQuery',
    doc_id: INBOX_QUERY_ID, variables: JSON.stringify(variables),
  }, {
    signal,
    headers: { ...headers, 'x-fb-friendly-name': 'PolarisDirectInboxQuery' },
  });
  checkSession();
  return { result, form, headers, checkSession, deviceId: fields.deviceId, actorId: fields.actorId };
}

export function createInboxContextProvider(http, { clock = Date.now } = {}) {
  let cached;
  let cachedAt = 0;
  return async ({ signal, refresh = false } = {}) => {
    signal?.throwIfAborted();
    const now = clock();
    if (!refresh && cached && now >= cachedAt && now - cachedAt < INBOX_CONTEXT_TTL_MS) {
      try {
        cached.checkSession({ signal });
        const context = cached;
        return { ...context, checkSession: () => context.checkSession({ signal }) };
      } catch (error) {
        cached = undefined;
        if (signal?.aborted || error?.code !== 'SESSION_CHANGED') throw error;
      }
    }
    cached = undefined;
    const context = await getInstagramInboxContext(http, { signal });
    bootstrapFromContext(context);
    context.checkSession({ signal });
    cached = context;
    cachedAt = clock();
    return { ...context, checkSession: () => context.checkSession({ signal }) };
  };
}

export async function getInstagramBootstrap(http, options = {}, getContext) {
  const context = getContext
    ? await getContext({ ...options, refresh: true })
    : await getInstagramInboxContext(http, options);
  return bootstrapFromContext(context);
}

function bootstrapFromContext({ result, deviceId, actorId }) {
  const rawSequence = result?.data?.get_slide_mailbox_for_iris_subscription?.iris_inactive_subscription_uq_seq_id;
  let sequenceId;
  try { sequenceId = id(rawSequence, 'sequenceId'); }
  catch { throw invalidResponse(); }
  const rawSnapshot = result.extensions?.server_metadata?.request_start_time_ms;
  const snapshotAtMs = rawSnapshot == null ? Date.now() : Number(rawSnapshot);
  if ((rawSnapshot != null && !['number', 'string'].includes(typeof rawSnapshot)) ||
      (typeof rawSnapshot === 'string' && !/^\d+$/.test(rawSnapshot)) ||
      !Number.isSafeInteger(snapshotAtMs) || snapshotAtMs <= 0) throw invalidResponse();
  return { sequenceId, snapshotAtMs, deviceId, actorId };
}
