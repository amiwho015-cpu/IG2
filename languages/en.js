/**
 * File Name: en.js
 * ICA: igbot-api
 * Auhor: Tanvir Ahmed (Tanvir143)
 * GitHub: www.github.com/143tanvir
 * WhatsApp: +8801750079773
 * Note: Project metadata only; original source credits and license notices are retained.
 */

"use strict";

/**
 * English UI strings for InstaBOT.
 * Author: Saifullah Al Neoaz (https://github.com/lazyneoaz)
 */

module.exports = {
	// dispatcher
	commandNotFound: "🐤",
	commandNotFoundSuggestion: "এই নামের কমান্ড নেই, \n ব্যবহার করুন:  {pn}%1 ",
	onlyAdmin: "শুধুমাত্র গ্রুপের এডমিনের জন্য এটি ( %1 )",
	onlyAdminBot: "শুধুমাত্র রোবট এর এডমিনের জন্য এটি ( %1 )",
	cooldown: "%1 সেকেন্ড পরে %2 ব্যবহার করুন।",
	userBanned: "তোমাকে বট থেকে ব্যান করা হয়েছে,\n সম্ভাব্য কারন: %2 করেছো",
	notWhitelisted: "তোমার অনুমোদন নেই এটি ব্যবহারের ( %1 )",
	errorOccurred: "An error occurred in %1:\n%2",
	onReplyFindCommandName: "This reply is not linked to a command.",
	onReplyCommandNotFound: "Command %1 no longer exists.",

	// events
	welcomeThread: "Thanks for adding me to \"%1\"!",
	leftThread: "Bot removed from \"%1\".",
	adminAdded: "%1 is now an admin.",

	// startup
	onlineAgain: "%1 is online again.",

	// commands
	pingProcessing: "Pinging...",
	pingResult: "Pong! %1ms",
	helpTitle: "── %1 COMMANDS ──",
	helpFooter: "Use %1help <command> for details.",
	helpCommandTitle: "── %1 ──",
	helpNotFound: "No command named \"%1\".",
	helpUsage: "Usage: %1",
	helpRole: "Role: %1",
	helpDescription: "Description: %1",
	helpCategory: "Category: %1",
	uidYourID: "%1",
	uidThreadID: "%1",
	uidRepliedUser: "%1",
	uidRepliedYourself: "%1",
	uidRepliedMessage: "%1",
	adminOnlyEnabled: "Admin-only mode is now %1.",
	adminAddedUser: "Added %1 as a bot admin.",
	adminRemovedUser: "Removed %1 from bot admins.",
	adminList: "Bot admins:\n%1",
	banSuccess: "Banned %1. Reason: %2",
	unbanSuccess: "Unbanned %1.",
	whitelistAdded: "Added %1 to the whitelist.",
	whitelistRemoved: "Removed %1 from the whitelist.",
	addUserSuccess: "Added %1 to this thread.",
	removeUserSuccess: "Removed %1 from this thread.",
	echoEmpty: "Give me something to say.",
	prefixCurrent: "| ROBOT PREFIX :  %1",
	prefixChanged: "Prefix changed to: %1",
	prefixOnlyAdmin: "The current prefix is: %1\nOnly bot admins can change it.",
	avatarChanged: "Profile picture updated.",
	avatarFailed: "Could not change the profile picture.",
	bioChanged: "Bio updated.",
	bioEmpty: "Give me the new bio text.",
	fact: "Random fact: %1",
	joke: "Random joke: %1"
};
