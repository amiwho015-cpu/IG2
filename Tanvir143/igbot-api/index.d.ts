/**
 * File Name: index.d.ts
 * ICA: igbot-api
 * Auhor: Tanvir Ahmed (Tanvir143)
 * GitHub: www.github.com/143tanvir
 * WhatsApp: +8801750079773
 * Note: Project metadata only; original source credits and license notices are retained.
 */

/*
 * @lazyneoaz/ig-chat-api
 * Author: Saifullah Al Neoaz
 * GitHub: https://github.com/lazyneoaz
 */
// Type definitions for @lazyneoaz/ig-chat-api
// Typed surface for the hosted ig-chat-api server so Goat-Bot-IG keeps
// type-checking after swapping the dependency.

export interface AppStateCookie {
        key?: string;
        name?: string;
        value: string;
        domain?: string;
        path?: string;
}

export interface LoginData {
        appState?: AppStateCookie[] | string;
        cookies?: AppStateCookie[] | string;
        session?: AppStateCookie[] | string;
        userID?: string | number;
        username?: string;
        skipVerify?: boolean;
        allowInvalidSession?: boolean;
}

export interface LoginOptions {
        selfListen?: boolean;
        selfListenEvent?: boolean;
        listenEvents?: boolean;
        listenTyping?: boolean;
        updatePresence?: boolean;
        forceLogin?: boolean;
        autoMarkDelivery?: boolean;
        autoMarkRead?: boolean;
        autoReconnect?: boolean;
        logLevel?: "silent" | "error" | "warn" | "info" | "verbose";
        logRecordSize?: number;
        online?: boolean;
        emitReady?: boolean;
        userAgent?: string;
        proxy?: string;
        retryCount?: number;
        /**
         * Minimum delay (ms) between API calls. Spaces bot bursts out so
         * Instagram does not see an inhuman request rate and checkpoint the
         * account. 0 disables pacing (default). Values around 250-500 are a
         * good production floor.
         */
        minRequestInterval?: number;
        keepAliveInterval?: number;
        tokenRefreshInterval?: number;
        language?: string;
        /** Realtime keep-alive ping interval in seconds. Default: 20. */
        realtimeKeepAlive?: number;
        /**
         * Realtime transport selector. Accepts the legacy engine values
         * ("mqtt", "dgw", "lightspeed", "native") and is forwarded to the
         * server, which selects the matching transport.
         */
        realtimeTransport?: "mqtt" | "dgw" | "lightspeed" | "native";
        /** Realtime transport implementation: "web" | "native" | "auto". Default: auto. */
        dgwTransport?: "web" | "native" | "auto";
        /** Optional realtime stream-group selector. Applied by the server. */
        dgwStreamGroup?: string;
        /**
         * Engine-internal realtime identity. Accepted for compatibility but NOT
         * forwarded: the server owns the gateway host, application id and device
         * id so a caller can never redirect traffic or leak a fingerprint.
         */
        dgwHost?: string;
        dgwAppId?: string;
        dgwDeviceId?: string;
        /** Open the auxiliary realtime socket used for typing. Default: true. */
        dgwStreamController?: boolean;

        /**
         * Hosted server URL. Optional: the published client bundles the official
         * server URL, so bot owners never set this. Override for self-hosting.
         */
        serverUrl?: string;
        /**
         * API key for the hosted server. Optional: the published client bundles
         * the shared key, so bot owners never set this. Override for self-hosting.
         */
        apiKey?: string;
        /** Per-request timeout in ms (default 30000). */
        timeoutMs?: number;
        /** Transport retry count (default 2). */
        maxRetries?: number;
}

export interface CookieJar {
        cookies: Record<string, string>;
        setCookie(cookieStr: string, url?: string): void;
        getCookieString(): string;
}

/**
 * Engine-shaped utility surface. `checkLiveCookie` runs server-side against the
 * real engine; `getJar`/`makeDefaults` are shims so bot code written against the
 * full engine runs unchanged.
 */
export interface Utils {
        normalizeAppState(input: AppStateCookie[] | Record<string, unknown>[] | string): AppStateCookie[];
        looksLikeSession(input: AppStateCookie[] | Record<string, unknown>[] | string): boolean;
        getJar(): CookieJar;
        makeDefaults(...args: unknown[]): Record<string, unknown>;
        checkLiveCookie(
                appStateOrCtx: AppStateCookie[] | string | { jar?: CookieJar },
                options?: { serverUrl?: string; url?: string; apiKey?: string }
        ): Promise<boolean>;
}

export interface Attachment {
        type: string;
        ID?: string;
        url?: string;
        filename?: string;
}

/**
 * Message payload accepted by `sendMessage`, plus the Instagram-specific
 * avatar/effect/music sugar.
 */
export interface MessageOptions {
        body?: string;
        attachment?: unknown | unknown[];
        url?: string;
        sticker?: boolean | "gif" | string;
        emoji?: string;
        emojiSize?: "small" | "medium" | "large";
        mentions?: Array<{ tag: string; id?: string; fromIndex?: number }>;
        location?: { latitude: number; longitude: number; venueId?: string };
        gifId?: string;
        gif?: string;
        /** Avatar power-up: love | anger | laugh | cry, an alias, or "random". */
        avatar?: string;
        avatarEffect?: string;
        avatarName?: string;
        /** Text power-up: a name (love/fire/...), a numeric style, or { style, text }. */
        effect?: string | number | { style?: number; text?: string; effect?: string; name?: string };
        /** Music sticker: pass the audio asset id from searchMusic. */
        audioAssetId?: string;
        audio_asset_id?: string;
        music?: { audioAssetId?: string; audio_asset_id?: string; id?: string };
}

export interface Message {
        type: string;
        senderID: string;
        body: string;
        threadID: string;
        messageID: string;
        attachments: Attachment[];
        mentions: Record<string, unknown>;
        timestamp: string;
        isGroup: boolean;
        participantIDs: string[];
        itemType?: string;
        clientContext?: string | null;
}

export interface EffectInfo {
        tag: string;
        id: number;
        style: number;
        label: string;
        emoji: string;
        aliases: string[];
}

export interface AvatarEffectInfo {
        name: string;
        effect: string;
        style: number;
        label: string;
        file: string;
        available: boolean;
}

export interface ListenStopper {
        (): void;
        stopListening(): void;
        stopListeningAsync(): Promise<void>;
        realtime: unknown;
        channel: unknown;
}

export interface ListenEmitter {
        on(event: string, listener: (arg: unknown) => void): ListenEmitter;
        once(event: string, listener: (arg: unknown) => void): ListenEmitter;
        off(event: string, listener: (arg: unknown) => void): ListenEmitter;
        emit(event: string, ...args: unknown[]): boolean;
        stopListening(): void;
        stopListeningAsync(): Promise<void>;
        realtime: unknown;
}

export interface AppState {
        getCurrentUserID(): string;
        /** Legacy alias used by older bot event handlers. */
        _userID: string;
        getCurrentUser(): { userID: string; username: string | null };
        getHealth(): { authenticated: boolean; listening: boolean; mqtt: { connected: boolean; reconnectAttempts: number }; transport: { serverUrl: string | null } };
        getInbox(options?: { limit?: number; timestamp?: unknown; tags?: unknown }, callback?: Function): Promise<unknown[]>;
        getUserInfoByUsername(username: string, callback?: Function): Promise<unknown>;
        replyToMessage(threadID: string, text: string, replyToMessageID: string, callback?: Function): Promise<unknown>;
        sendReaction(emoji: string, messageID: string, callback?: Function): Promise<unknown>;
        stopTypingIndicator(threadID: string, callback?: Function): Promise<unknown>;
        sendPhoto(threadID: string, file: unknown, callback?: Function): Promise<unknown>;
        sendPhotoFromUrl(threadID: string, url: string, callback?: Function): Promise<unknown>;
        sendVideo(threadID: string, file: unknown, callback?: Function): Promise<unknown>;
        sendVideoFromUrl(threadID: string, url: string, callback?: Function): Promise<unknown>;
        sendVoice(threadID: string, file: unknown, callback?: Function): Promise<unknown>;
        sendVoiceFromUrl(threadID: string, url: string, callback?: Function): Promise<unknown>;
        sendGIF(threadID: string, url: string, callback?: Function): Promise<unknown>;
        /** Legacy InstaBot/GoatBot method aliases. */
        sendImage(source: unknown, threadID: string | number, caption?: string | Function, callback?: Function, replyToMessageID?: string): Promise<unknown>;
        sendAudio(source: unknown, threadID: string | number, callback?: Function, replyToMessageID?: string): Promise<unknown>;
        sendVideo(source: unknown, threadID: string | number, callback?: Function, replyToMessageID?: string): Promise<unknown>;
        sendMusic(threadID: string | number, track: unknown, callback?: Function): Promise<unknown>;
        musicSearch(query: string, callback?: Function): Promise<unknown>;
        sendTextEffect(text: string, threadID: string | number, effect: unknown, callback?: Function): Promise<unknown>;
        sendAvatarTextEffect(text: string, threadID: string | number, effect: unknown, callback?: Function): Promise<unknown>;
        addUserToThread(userID: string | string[], threadID: string | number, callback?: Function): Promise<unknown>;
        removeUserFromThread(userID: string | string[], threadID: string | number, callback?: Function): Promise<unknown>;
        on(event: "connected" | "disconnected" | "error", listener: (value: unknown) => void): this;
        getAppState(): AppStateCookie[];
        getAppState(callback: (err: unknown, cookies?: AppStateCookie[]) => void): void;
        setOptions(options: LoginOptions): void;
        getCtx(): unknown;
        /** True while Instagram is holding the session behind a challenge. */
        isChallenged(): boolean;
        /** The latched challenge error, or null. */
        getChallenge(): unknown;
        /** Reset the challenge latch after clearing it in a browser. */
        clearChallenge(): void;

        sendMessage(
                message: string | MessageOptions,
                threadID: string | number | Array<string | number>,
                callback?: (err: unknown, info?: { messageID: string; threadID: string; timestamp: string; messageIDs?: string[]; attachmentCount?: number }) => void,
                replyToMessage?: string,
                isGroup?: boolean
        ): Promise<{ messageID: string; threadID: string; timestamp: string; messageIDs?: string[]; attachmentCount?: number }>;

        uploadAttachment(attachments: unknown, callback?: Function): Promise<Array<{ media_id: string }>>;
        uploadGroupImage(image: unknown, callback?: Function): Promise<string>;
        sendTypingIndicator(threadID: string, isTyping?: boolean | Function, callback?: Function): Promise<unknown>;
        unsendMessage(messageID: string, callback?: Function): Promise<unknown>;
        editMessage(text: string, messageID: string, callback?: Function, threadID?: string): Promise<unknown>;
        forwardAttachment(attachmentID: string, threadID: string, callback?: Function): Promise<unknown>;

        getThreadList(limit?: number, timestamp?: unknown, tags?: unknown, callback?: Function): Promise<unknown[]>;
        getThreadInfo(threadID: string | string[], callback?: Function): Promise<unknown>;
        getThreadHistory(threadID: string, amount?: number, timestamp?: unknown, callback?: Function): Promise<Message[]>;
        getThreadPictures(threadID: string, offset?: number, limit?: number, callback?: Function): Promise<unknown[]>;
        getMessage(messageID: string, callback?: Function): Promise<Message>;
        getUserInfo(id: string | string[], callback?: Function): Promise<Record<string, unknown>>;
        getUserID(name: string, callback?: Function): Promise<string>;
        getCurrentUserIDLegacy(): string;
        getFriendsList(userID?: string, callback?: Function): Promise<unknown[]>;
        searchForThread(name: string, callback?: Function): Promise<unknown[]>;

        addUserToGroup(userID: string | string[], threadID: string, callback?: Function): Promise<unknown>;
        removeUserFromGroup(userID: string | string[], threadID: string, callback?: Function): Promise<unknown>;
        changeAdminStatus(threadID: string, adminIDs: string | string[], adminStatus: boolean, callback?: Function): Promise<unknown>;
        changeGroupImage(image: unknown, threadID: string, callback?: Function): Promise<unknown>;
        changeNickname(nickname: string, threadID: string, participantID: string, callback?: Function): Promise<unknown>;
        changeNickname(opts: { nickname?: string; threadID?: string; threadId?: string; participantID?: string; userID?: string; participant_id?: string }, callback?: Function): Promise<unknown>;
        /** Instagram-only: set who may change nicknames (PEOPLE_YOU_FOLLOW | ONLY_YOU | EVERYONE). */
        changeNicknameSetting(setting: string, threadID: string, callback?: Function): Promise<unknown>;
        createNewGroup(participantIDs: string[], title?: string, callback?: Function): Promise<string>;
        createPoll(title: string, threadID: string, options: string[], callback?: Function): Promise<unknown>;
        deleteThread(threadOrThreads: string | string[], callback?: Function): Promise<unknown>;
        deleteMessage(messageOrMessages: string | string[], callback?: Function): Promise<unknown>;
        muteThread(threadID: string, muteSeconds?: number, callback?: Function): Promise<unknown>;
        setTitle(newTitle: string, threadID: string, callback?: Function): Promise<unknown>;
        setMessageReaction(reaction: string | Record<string, unknown>, messageID: string, callback?: Function, forceCustomReaction?: boolean): Promise<unknown>;
        markAsRead(threadID: string, messageID?: string, callback?: Function): Promise<unknown>;
        markAsSeen(threadID: string, messageID?: string, callback?: Function): Promise<unknown>;
        markAsDelivered(threadID: string, messageID?: string, callback?: Function): Promise<unknown>;
        markAsReadAll(callback?: Function): Promise<unknown[]>;
        handleMessageRequest(threadID: string | string[], accept?: boolean, callback?: Function): Promise<unknown>;
        changeArchivedStatus(threadOrThreads: string | string[], archive?: boolean, callback?: Function): Promise<unknown>;
        changeBlockedStatus(userID: string, block?: boolean, callback?: Function): Promise<unknown>;
        handleFriendRequest(userID: string, accept?: boolean, callback?: Function): Promise<unknown>;
        unfriend(userID: string, callback?: Function): Promise<unknown>;

        follow(userID: string, callback?: Function): Promise<unknown>;
        unfollow(userID: string, callback?: Function): Promise<unknown>;
        searchMusic(query: string, callback?: Function): Promise<unknown>;
        searchSessionTracking(audioAssetId: string, alacornSessionId?: string | Function, callback?: Function): Promise<unknown>;
        sendMusicSticker(
                music: { audioAssetId: string; text?: string } | string,
                threadID: string,
                callback?: Function
        ): Promise<unknown>;
        /** Send a Messenger avatar power-up. `avatar` is love|anger|laugh|cry (or "random"). */
        sendAvatarEffect(avatar: string | { avatar?: string; name?: string; body?: string; message?: string; threadID?: string }, message?: string | Function, threadID?: string | Function, callback?: Function): Promise<unknown>;
        sendEffect(effect: unknown, threadID: string, callback?: Function): Promise<unknown>;
        listEffects(): EffectInfo[];
        effects: {
                list(): EffectInfo[];
                listEffects(): EffectInfo[];
                listAvatarEffects(): AvatarEffectInfo[];
                avatars: ReadonlyArray<AvatarEffectInfo>;
        };

        changeBio(bio: string, publish?: boolean | Function, callback?: Function): Promise<unknown>;
        changeAvatar(image: unknown, caption?: string | Function, expirationAfter?: number | Function, callback?: Function): Promise<unknown>;
        changeProfilePicture(image: unknown, caption?: string | Function, expirationAfter?: number | Function, callback?: Function): Promise<unknown>;

        threadColors: Record<string, unknown>;
        getEmojiUrl(c: string, size?: number, pixelRatio?: number): string;

        logout(callback?: Function): Promise<unknown>;
        refreshFb_dtsg(obj?: unknown, callback?: Function): Promise<unknown>;

        stopListening(callback?: () => void): void;
        stopListeningAsync(): Promise<void>;
        listenMqtt(callback: (err: unknown, event: unknown) => void, options?: LoginOptions): ListenStopper;
        listenMqtt(options?: LoginOptions): ListenEmitter;
        listen(callback: (err: unknown, event: unknown) => void, options?: LoginOptions): ListenStopper;
        listen(options?: LoginOptions): ListenEmitter;

        httpGet(url: string, form?: unknown, callback?: Function): Promise<unknown>;
        httpPost(url: string, form?: unknown, callback?: Function): Promise<unknown>;
        httpPostFormData(url: string, form?: unknown, callback?: Function): Promise<unknown>;

        /** Per-method descriptors installed from lib/methods: name, kind, args, returns, doc. */
        methods: Array<{
                name: string;
                kind: "engine" | "sync" | "server";
                args: Array<{ name: string; type: string; optional: boolean; description?: string }>;
                returns: string;
                doc: string;
        }>;

        /**
         * Turn realtime event types on/off for this session. Stored server-side
         * and applied to the engine listener (which starts with every event off).
         * Engine-internal keys (proxy, dgwHost, userAgent, ...) are ignored.
         */
        setListenerOptions(options: LoginOptions): Promise<{ updated: string[] }>;
        setListenerOptions(options: LoginOptions, callback: (err: unknown, res?: { updated: string[] }) => void): void;
        /** Read the sanitized realtime options stored for this session. */
        getListenerOptions(): Promise<{ options: LoginOptions }>;
        getListenerOptions(callback: (err: unknown, res?: { options: LoginOptions }) => void): void;

        keepAlive: { stop: () => void };
}

declare function login(loginData: LoginData, options?: LoginOptions): Promise<AppState>;
declare function login(loginData: LoginData, options: LoginOptions, callback: (err: unknown, api: AppState | null) => void): void;

declare namespace login {
        const login: typeof import("./index");
        const Api: unknown;
        function setOptions(options: LoginOptions): void;
        const utils: Utils;
        const CONSTANTS: { API_VERSION: string; SERVER_URL: string };
        const connect: typeof login;
        /** Per-method descriptors: name, kind, args, returns, doc. */
        const methods: Array<{
                name: string;
                kind: "engine" | "sync" | "server";
                args: Array<{ name: string; type: string; optional: boolean; description?: string }>;
                returns: string;
                doc: string;
        }>;
        const config: {
                DEFAULT_SERVER_URL: string;
                DEFAULT_API_KEY: string;
                resolve(options?: LoginOptions): {
                        serverUrl: string;
                        apiKey: string;
                        timeoutMs: number;
                        maxRetries: number;
                        engineOptions: LoginOptions;
                };
        };
}

export = login;
export default login;
