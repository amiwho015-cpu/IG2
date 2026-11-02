/**
 * File Name: index.js
 * ICA: igbot-api
 * Auhor: Tanvir Ahmed (Tanvir143)
 * GitHub: www.github.com/143tanvir
 * WhatsApp: +8801750079773
 * Note: Project metadata only; original source credits and license notices are retained.
 */
"use strict";

// Per-method descriptors: name, kind, args (with types), return type and a
// human-readable doc. Generated surface, grouped by area. Each file documents
// one api method so callers can discover parameters without reading the engine.
const MODULES = [
        require("./sendMessage"),
        require("./sendTypingIndicator"),
        require("./unsendMessage"),
        require("./editMessage"),
        require("./forwardAttachment"),
        require("./uploadAttachment"),
        require("./uploadGroupImage"),
        require("./getThreadList"),
        require("./getThreadInfo"),
        require("./getThreadHistory"),
        require("./getThreadPictures"),
        require("./getThreadMedia"),
        require("./getThreadData"),
        require("./getMessage"),
        require("./getUserInfo"),
        require("./getIGUserInfo"),
        require("./getUserID"),
        require("./getCurrentUserID"),
        require("./getFriendsList"),
        require("./getBotInfo"),
        require("./getProfileInfo"),
        require("./searchForThread"),
        require("./addUserToGroup"),
        require("./removeUserFromGroup"),
        require("./changeAdminStatus"),
        require("./changeGroupImage"),
        require("./changeNickname"),
        require("./changeNicknameSetting"),
        require("./createNewGroup"),
        require("./createPoll"),
        require("./deleteThread"),
        require("./deleteMessage"),
        require("./muteThread"),
        require("./setTitle"),
        require("./setMessageReaction"),
        require("./markAsRead"),
        require("./markAsSeen"),
        require("./markAsDelivered"),
        require("./markAsReadAll"),
        require("./handleMessageRequest"),
        require("./changeArchivedStatus"),
        require("./changeBlockedStatus"),
        require("./handleFriendRequest"),
        require("./unfriend"),
        require("./follow"),
        require("./unfollow"),
        require("./searchMusic"),
        require("./searchSessionTracking"),
        require("./sendMusicSticker"),
        require("./sendAvatarEffect"),
        require("./sendEffect"),
        require("./listEffects"),
        require("./listAvatarEffects"),
        require("./isAvatarSupported"),
        require("./threadColors"),
        require("./getEmojiUrl"),
        require("./changeBio"),
        require("./setBio"),
        require("./changeAvatar"),
        require("./changeProfilePicture"),
        require("./resolvePhotoUrl"),
        require("./getAppState"),
        require("./logout"),
        require("./refreshFb_dtsg"),
        require("./isChallenged"),
        require("./getChallenge"),
        require("./clearChallenge"),
        require("./setListenerOptions"),
        require("./getListenerOptions")// নতুন মেথডটি এখানে যুক্ত করা হলো
];

const BY_NAME = {};
for (const m of MODULES) BY_NAME[m.name] = m;

function get(name) {
        return BY_NAME[name] || null;
}

function list() {
        return MODULES.map(m => ({
                name: m.name,
                kind: m.kind,
                args: m.args,
                returns: m.returns,
                doc: m.doc
        }));
}

function names(kind) {
        if (!kind) return MODULES.map(m => m.name);
        return MODULES.filter(m => m.kind === kind).map(m => m.name);
}

module.exports = { MODULES, BY_NAME, get, list, names };
