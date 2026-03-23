import { A as getEnabledLarkAccounts, M as getLarkAccountIds, O as createAccountScopedConfig, T as getTicket, c as AppScopeCheckFailedError, j as getLarkAccount, k as getDefaultLarkAccountId, w as larkLogger, x as getUserAgent, y as LarkClient } from "./user-name-cache-Bw1VQ2E0.mjs";
import { $ as nonBotMentions, A as wwwDomain, B as getAppGrantedScopes, C as formatDiagReportCli, D as resolveAnyEnabledToolsConfig, E as traceByMessageId, F as getMessageFeishu, G as buildMentionedCardContent, H as sendCardFeishu, I as parseMessageEvent, J as formatMentionAllForCard, K as buildMentionedMessage, L as buildConvertContextFromItem, M as filterSensitiveScopes, N as getStoredToken, O as mcpDomain, P as checkMessageGate, Q as mentionedBot, R as convertMessageContent, S as analyzeTrace, T as runDiagnosis, U as sendMessageFeishu, V as editMessageFeishu, W as updateCardFeishu, X as formatMentionForCard, Y as formatMentionAllForText, Z as formatMentionForText, _ as createToolContext, a as triggerOnboarding, at as formatLarkError, b as registerTool, c as StringEnum, ct as sendImageLark, d as json, dt as uploadImageLark, et as resolveFeishuGroupToolPolicy, f as parseTimeToRFC3339, ft as validateLocalMediaRoots, g as handleInvokeErrorWithAutoAuth, gt as resolveReceiveIdType, h as unixTimestampToISO8601, ht as parseFeishuRouteTarget, i as isMessageExpired, it as assertLarkOk$2, j as probeFeishu, k as openPlatformDomain, l as convertTimeRange, lt as uploadAndSendMediaLark, m as parseTimeToTimestampMs, mt as normalizeFeishuTarget, nt as sendMediaLark, o as executeAuthorize, ot as sendAudioLark, p as parseTimeToTimestamp, pt as looksLikeFeishuId, q as extractMessageBody, r as handleFeishuReaction, rt as sendTextLark, s as registerFeishuOAuthTool, st as sendFileLark, t as monitorFeishuProvider, tt as sendCardLark, u as isInvokeError, ut as uploadFileLark, v as formatToolResult, w as formatTraceOutput, x as registerCommands, y as getFirstAccount, z as extractMentionOpenId } from "./monitor-CvIfHTzy.mjs";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk/account-id";
import { PAIRING_APPROVED_MESSAGE } from "openclaw/plugin-sdk/channel-status";
import * as path$1 from "node:path";
import path from "node:path";
import fs, { createReadStream } from "node:fs";
import * as os from "node:os";
import { extractToolSend } from "openclaw/plugin-sdk/tool-send";
import { readStringParam } from "openclaw/plugin-sdk/param-readers";
import { Type } from "@sinclair/typebox";
import * as fs$1 from "node:fs/promises";
import { toJSONSchema, z } from "zod";
import * as fs$2 from "fs/promises";
import * as path$2 from "path";
import { imageSize } from "image-size";
import { buildRandomTempFilePath } from "openclaw/plugin-sdk/temp-path";
//#region src/channel/directory.ts
/** Case-insensitive substring match on id and optional name. */
function matchesQuery(id, name, query) {
	if (!query) return true;
	return id.toLowerCase().includes(query) || (name?.toLowerCase().includes(query) ?? false);
}
/** Filter items and apply optional limit. */
function applyLimitSlice(items, limit) {
	return limit && limit > 0 ? items.slice(0, limit) : items;
}
/**
* List users known from the channel config (allowFrom + dms fields).
*
* Does not make any API calls -- useful when the bot is not yet
* connected or when credentials are unavailable.
*/
async function listFeishuDirectoryPeers(params) {
	const feishuCfg = getLarkAccount(params.cfg, params.accountId).config;
	const q = params.query?.trim().toLowerCase() || "";
	const ids = /* @__PURE__ */ new Set();
	for (const entry of feishuCfg?.allowFrom ?? []) {
		const trimmed = String(entry).trim();
		if (trimmed && trimmed !== "*") ids.add(trimmed);
	}
	for (const userId of Object.keys(feishuCfg?.dms ?? {})) {
		const trimmed = userId.trim();
		if (trimmed) ids.add(trimmed);
	}
	return applyLimitSlice(Array.from(ids).map((raw) => raw.trim()).filter(Boolean).map((raw) => normalizeFeishuTarget(raw) ?? raw).filter((id) => matchesQuery(id, void 0, q)).map((id) => ({
		kind: "user",
		id
	})), params.limit);
}
/**
* List groups known from the channel config (groups + groupAllowFrom).
*/
async function listFeishuDirectoryGroups(params) {
	const feishuCfg = getLarkAccount(params.cfg, params.accountId).config;
	const q = params.query?.trim().toLowerCase() || "";
	const ids = /* @__PURE__ */ new Set();
	for (const groupId of Object.keys(feishuCfg?.groups ?? {})) {
		const trimmed = groupId.trim();
		if (trimmed && trimmed !== "*") ids.add(trimmed);
	}
	for (const entry of feishuCfg?.groupAllowFrom ?? []) {
		const trimmed = String(entry).trim();
		if (trimmed && trimmed !== "*") ids.add(trimmed);
	}
	return applyLimitSlice(Array.from(ids).map((raw) => raw.trim()).filter(Boolean).filter((id) => matchesQuery(id, void 0, q)).map((id) => ({
		kind: "group",
		id
	})), params.limit);
}
/**
* List users via the Feishu contact/v3/users API.
*
* Falls back to config-based listing when credentials are missing or
* the API call fails.
*/
async function listFeishuDirectoryPeersLive(params) {
	const account = getLarkAccount(params.cfg, params.accountId);
	if (!account.configured) return listFeishuDirectoryPeers(params);
	try {
		const client = LarkClient.fromAccount(account).sdk;
		const peers = [];
		const limit = params.limit ?? 50;
		if (limit <= 0) return [];
		const q = params.query?.trim().toLowerCase() || "";
		let pageToken;
		do {
			const remaining = limit - peers.length;
			const response = await client.contact.user.list({ params: {
				page_size: Math.min(remaining, 50),
				page_token: pageToken
			} });
			if (response.code !== 0 || !response.data?.items) break;
			for (const user of response.data.items) {
				if (user.open_id && matchesQuery(user.open_id, user.name, q)) peers.push({
					kind: "user",
					id: user.open_id,
					name: user.name || void 0
				});
				if (peers.length >= limit) break;
			}
			pageToken = response.data?.page_token;
		} while (pageToken && peers.length < limit);
		return peers;
	} catch {
		return listFeishuDirectoryPeers(params);
	}
}
/**
* List groups via the Feishu im/v1/chats API.
*
* Falls back to config-based listing when credentials are missing or
* the API call fails.
*/
async function listFeishuDirectoryGroupsLive(params) {
	const account = getLarkAccount(params.cfg, params.accountId);
	if (!account.configured) return listFeishuDirectoryGroups(params);
	try {
		const client = LarkClient.fromAccount(account).sdk;
		const groups = [];
		const limit = params.limit ?? 50;
		if (limit <= 0) return [];
		const q = params.query?.trim().toLowerCase() || "";
		let pageToken;
		do {
			const remaining = limit - groups.length;
			const response = await client.im.chat.list({ params: {
				page_size: Math.min(remaining, 100),
				page_token: pageToken
			} });
			if (response.code !== 0 || !response.data?.items) break;
			for (const chat of response.data.items) {
				if (chat.chat_id && matchesQuery(chat.chat_id, chat.name, q)) groups.push({
					kind: "group",
					id: chat.chat_id,
					name: chat.name || void 0
				});
				if (groups.length >= limit) break;
			}
			pageToken = response.data?.page_token;
		} while (pageToken && groups.length < limit);
		return groups;
	} catch {
		return listFeishuDirectoryGroups(params);
	}
}
//#endregion
//#region src/messaging/outbound/outbound.ts
const log$4 = larkLogger("outbound/outbound");
/**
* Map adapter-level parameters to internal send context.
*
* Mirrors the pattern used by Telegram (`resolveTelegramSendContext`) and
* Slack (`sendSlackOutboundMessage`) to centralise parameter mapping.
*/
function resolveFeishuSendContext(params) {
	const routeTarget = parseFeishuRouteTarget(params.to);
	const explicitThreadId = params.threadId != null && String(params.threadId).trim() !== "" ? String(params.threadId).trim() : void 0;
	const explicitReplyToId = params.replyToId?.trim() || void 0;
	const replyToMessageId = explicitReplyToId ?? routeTarget.replyToMessageId;
	const replyInThread = Boolean(explicitThreadId ?? routeTarget.threadId);
	if (!explicitReplyToId && routeTarget.replyToMessageId) log$4.info("resolved reply target from encoded originating route");
	return {
		cfg: params.cfg,
		to: routeTarget.target,
		replyToMessageId,
		replyInThread,
		accountId: params.accountId ?? void 0
	};
}
const feishuOutbound = {
	deliveryMode: "direct",
	chunker: (text, limit) => LarkClient.runtime.channel.text.chunkMarkdownText(text, limit),
	chunkerMode: "markdown",
	textChunkLimit: 15e3,
	sendText: async ({ cfg, to, text, accountId, replyToId, threadId }) => {
		log$4.info(`sendText: target=${to}, textLength=${text.length}`);
		const ctx = resolveFeishuSendContext({
			cfg,
			to,
			accountId,
			replyToId,
			threadId
		});
		return {
			channel: "feishu",
			...await sendTextLark({
				...ctx,
				to: ctx.to,
				text
			})
		};
	},
	sendMedia: async ({ cfg, to, text, mediaUrl, mediaLocalRoots, accountId, replyToId, threadId }) => {
		log$4.info(`sendMedia: target=${to}, hasText=${Boolean(text?.trim())}, mediaUrl=${mediaUrl ?? "(none)"}`);
		const ctx = resolveFeishuSendContext({
			cfg,
			to,
			accountId,
			replyToId,
			threadId
		});
		if (text?.trim()) await sendTextLark({
			...ctx,
			to: ctx.to,
			text
		});
		if (!mediaUrl) {
			log$4.info("sendMedia: no mediaUrl provided, falling back to text-only");
			return {
				channel: "feishu",
				...await sendTextLark({
					...ctx,
					to: ctx.to,
					text: text ?? ""
				})
			};
		}
		const result = await sendMediaLark({
			...ctx,
			to: ctx.to,
			mediaUrl,
			mediaLocalRoots
		});
		return {
			channel: "feishu",
			messageId: result.messageId,
			chatId: result.chatId,
			...result.warning ? { meta: { warnings: [result.warning] } } : {}
		};
	},
	sendPayload: async ({ cfg, to, payload, mediaLocalRoots, accountId, replyToId, threadId }) => {
		const ctx = resolveFeishuSendContext({
			cfg,
			to,
			accountId,
			replyToId,
			threadId
		});
		const feishuData = payload.channelData?.feishu;
		const text = payload.text ?? "";
		const mediaUrls = payload.mediaUrls?.length ? payload.mediaUrls : payload.mediaUrl ? [payload.mediaUrl] : [];
		log$4.info(`sendPayload: target=${to}, textLength=${text.length}, mediaCount=${mediaUrls.length}, hasCard=${Boolean(feishuData?.card)}`);
		if (feishuData?.card) {
			if (text.trim()) await sendTextLark({
				...ctx,
				to: ctx.to,
				text
			});
			const cardResult = await sendCardLark({
				...ctx,
				to: ctx.to,
				card: feishuData.card
			});
			const warnings = [];
			for (const mediaUrl of mediaUrls) {
				const mediaResult = await sendMediaLark({
					...ctx,
					to: ctx.to,
					mediaUrl,
					mediaLocalRoots
				});
				if (mediaResult.warning) warnings.push(mediaResult.warning);
			}
			return {
				channel: "feishu",
				messageId: cardResult.messageId,
				chatId: cardResult.chatId,
				...warnings.length > 0 ? { meta: { warnings } } : {}
			};
		}
		if (mediaUrls.length === 0) return {
			channel: "feishu",
			...await sendTextLark({
				...ctx,
				to: ctx.to,
				text
			})
		};
		if (text.trim()) await sendTextLark({
			...ctx,
			to: ctx.to,
			text
		});
		const warnings = [];
		let lastResult;
		for (const mediaUrl of mediaUrls) {
			lastResult = await sendMediaLark({
				...ctx,
				to: ctx.to,
				mediaUrl,
				mediaLocalRoots
			});
			if (lastResult.warning) warnings.push(lastResult.warning);
		}
		return {
			channel: "feishu",
			...lastResult ?? {
				messageId: "",
				chatId: ""
			},
			...warnings.length > 0 ? { meta: { warnings } } : {}
		};
	}
};
//#endregion
//#region src/core/sdk-compat.ts
/**
* Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
* SPDX-License-Identifier: MIT
*
* Local shim for symbols removed from openclaw/plugin-sdk in 2026.3.14.
* Provides jsonResult and readReactionParams with correct typing.
*/
/**
* Wrap an object as an AgentToolResult-compatible text result.
* Returns the { content, details } shape expected by pi-agent-core.
*/
function jsonResult(obj) {
	return {
		content: [{
			type: "text",
			text: JSON.stringify(obj)
		}],
		details: obj
	};
}
/**
* Extract reaction parameters from raw action params.
* Returns emoji, remove flag, and isEmpty indicator.
*/
function readReactionParams(params, opts) {
	const raw = params.emoji ?? params.reaction ?? params.type;
	const emoji = typeof raw === "string" ? raw.trim() : "";
	const remove = Boolean(params.remove ?? params.unreact);
	const isEmpty = !emoji && !remove;
	if (remove && !emoji && opts?.removeErrorMessage) throw new Error(opts.removeErrorMessage);
	return {
		emoji,
		remove,
		isEmpty
	};
}
//#endregion
//#region src/messaging/outbound/reactions.ts
/**
* Well-known Feishu emoji type strings.
*
* This is a convenience map so consumers do not need to memorise the
* exact string identifiers. It is intentionally non-exhaustive --
* Feishu supports many more emoji types. Any valid emoji type string
* can be passed directly to the API functions.
*/
const FeishuEmoji = {
	THUMBSUP: "THUMBSUP",
	THUMBSDOWN: "THUMBSDOWN",
	HEART: "HEART",
	SMILE: "SMILE",
	JOYFUL: "JOYFUL",
	FROWN: "FROWN",
	BLUSH: "BLUSH",
	OK: "OK",
	CLAP: "CLAP",
	FIREWORKS: "FIREWORKS",
	PARTY: "PARTY",
	MUSCLE: "MUSCLE",
	FIRE: "FIRE",
	EYES: "EYES",
	THINKING: "THINKING",
	PRAISE: "PRAISE",
	PRAY: "PRAY",
	ROCKET: "ROCKET",
	DONE: "DONE",
	SKULL: "SKULL",
	HUNDREDPOINTS: "HUNDREDPOINTS",
	FACEPALM: "FACEPALM",
	CHECK: "CHECK",
	CROSSMARK: "CrossMark",
	COOL: "COOL",
	TYPING: "Typing",
	SPEECHLESS: "SPEECHLESS"
};
/**
* Complete set of valid Feishu emoji type strings for reactions.
*
* Sourced from the official Feishu emoji documentation.
* Unlike `FeishuEmoji` (a convenience subset), this set is exhaustive
* and can be used for validation and error reporting.
*
* @see https://go.feishu.cn/s/670vFWbA804
*/
const VALID_FEISHU_EMOJI_TYPES = new Set([
	"OK",
	"THUMBSUP",
	"THANKS",
	"MUSCLE",
	"FINGERHEART",
	"APPLAUSE",
	"FISTBUMP",
	"JIAYI",
	"DONE",
	"SMILE",
	"BLUSH",
	"LAUGH",
	"SMIRK",
	"LOL",
	"FACEPALM",
	"LOVE",
	"WINK",
	"PROUD",
	"WITTY",
	"SMART",
	"SCOWL",
	"THINKING",
	"SOB",
	"CRY",
	"ERROR",
	"NOSEPICK",
	"HAUGHTY",
	"SLAP",
	"SPITBLOOD",
	"TOASTED",
	"GLANCE",
	"DULL",
	"INNOCENTSMILE",
	"JOYFUL",
	"WOW",
	"TRICK",
	"YEAH",
	"ENOUGH",
	"TEARS",
	"EMBARRASSED",
	"KISS",
	"SMOOCH",
	"DROOL",
	"OBSESSED",
	"MONEY",
	"TEASE",
	"SHOWOFF",
	"COMFORT",
	"CLAP",
	"PRAISE",
	"STRIVE",
	"XBLUSH",
	"SILENT",
	"WAVE",
	"WHAT",
	"FROWN",
	"SHY",
	"DIZZY",
	"LOOKDOWN",
	"CHUCKLE",
	"WAIL",
	"CRAZY",
	"WHIMPER",
	"HUG",
	"BLUBBER",
	"WRONGED",
	"HUSKY",
	"SHHH",
	"SMUG",
	"ANGRY",
	"HAMMER",
	"SHOCKED",
	"TERROR",
	"PETRIFIED",
	"SKULL",
	"SWEAT",
	"SPEECHLESS",
	"SLEEP",
	"DROWSY",
	"YAWN",
	"SICK",
	"PUKE",
	"BETRAYED",
	"HEADSET",
	"EatingFood",
	"MeMeMe",
	"Sigh",
	"Typing",
	"SLIGHT",
	"TONGUE",
	"EYESCLOSED",
	"RoarForYou",
	"CALF",
	"BEAR",
	"BULL",
	"RAINBOWPUKE",
	"Lemon",
	"ROSE",
	"HEART",
	"PARTY",
	"LIPS",
	"BEER",
	"CAKE",
	"GIFT",
	"CUCUMBER",
	"Drumstick",
	"Pepper",
	"CANDIEDHAWS",
	"BubbleTea",
	"Coffee",
	"Get",
	"LGTM",
	"OnIt",
	"OneSecond",
	"VRHeadset",
	"YouAreTheBest",
	"SALUTE",
	"SHAKE",
	"HIGHFIVE",
	"UPPERLEFT",
	"ThumbsDown",
	"Yes",
	"No",
	"OKR",
	"CheckMark",
	"CrossMark",
	"MinusOne",
	"Hundred",
	"AWESOMEN",
	"Pin",
	"Alarm",
	"Loudspeaker",
	"Trophy",
	"Fire",
	"BOMB",
	"Music",
	"XmasTree",
	"Snowman",
	"XmasHat",
	"FIREWORKS",
	"2022",
	"REDPACKET",
	"FORTUNE",
	"LUCK",
	"FIRECRACKER",
	"StickyRiceBalls",
	"HEARTBROKEN",
	"POOP",
	"StatusFlashOfInspiration",
	"18X",
	"CLEAVER",
	"Soccer",
	"Basketball",
	"GeneralDoNotDisturb",
	"Status_PrivateMessage",
	"GeneralInMeetingBusy",
	"StatusReading",
	"StatusInFlight",
	"GeneralBusinessTrip",
	"GeneralWorkFromHome",
	"StatusEnjoyLife",
	"GeneralTravellingCar",
	"StatusBus",
	"GeneralSun",
	"GeneralMoonRest",
	"MoonRabbit",
	"Mooncake",
	"JubilantRabbit",
	"TV",
	"Movie",
	"Pumpkin",
	"BeamingFace",
	"Delighted",
	"ColdSweat",
	"FullMoonFace",
	"Partying",
	"GoGoGo",
	"ThanksFace",
	"SaluteFace",
	"Shrug",
	"ClownFace",
	"HappyDragon"
]);
/**
* Add an emoji reaction to a Feishu message.
*
* @param params.cfg       - Plugin configuration with Feishu credentials.
* @param params.messageId - The message to react to.
* @param params.emojiType - The emoji type string (e.g. "THUMBSUP").
* @param params.accountId - Optional account identifier for multi-account setups.
* @returns An object containing the platform-assigned reaction ID.
*/
async function addReactionFeishu(params) {
	const { cfg, messageId, emojiType, accountId } = params;
	const client = LarkClient.fromCfg(cfg, accountId).sdk;
	let response;
	try {
		response = await client.im.messageReaction.create({
			path: { message_id: messageId },
			data: { reaction_type: { emoji_type: emojiType } }
		});
	} catch (err) {
		const e = err;
		if ((e.code ?? e.response?.data?.code) === 231001) {
			const validTypes = Array.from(VALID_FEISHU_EMOJI_TYPES).join(", ");
			throw new Error(`Emoji type "${emojiType}" is not a valid Feishu reaction. Valid types: ${validTypes}`);
		}
		throw err;
	}
	const reactionId = response?.data?.reaction_id;
	if (!reactionId) throw new Error(`[feishu-reactions] Failed to add reaction "${emojiType}" to message ${messageId}: no reaction_id returned`);
	return { reactionId };
}
/**
* Remove a specific reaction from a Feishu message by its reaction ID.
*
* Unlike the outbound module's `removeReaction` (which looks up the
* reaction by emoji type), this function takes the exact reaction ID
* for direct deletion.
*
* @param params.cfg        - Plugin configuration with Feishu credentials.
* @param params.messageId  - The message the reaction belongs to.
* @param params.reactionId - The platform-assigned reaction ID to delete.
* @param params.accountId  - Optional account identifier for multi-account setups.
*/
async function removeReactionFeishu(params) {
	const { cfg, messageId, reactionId, accountId } = params;
	await LarkClient.fromCfg(cfg, accountId).sdk.im.messageReaction.delete({ path: {
		message_id: messageId,
		reaction_id: reactionId
	} });
}
/**
* List reactions on a Feishu message, optionally filtered by emoji type.
*
* Paginates through all results and returns a flat array of
* {@link FeishuReaction} objects.
*
* @param params.cfg       - Plugin configuration with Feishu credentials.
* @param params.messageId - The message whose reactions to list.
* @param params.emojiType - Optional emoji type filter (e.g. "THUMBSUP").
*                           When omitted, all reaction types are returned.
* @param params.accountId - Optional account identifier for multi-account setups.
* @returns An array of reactions matching the criteria.
*/
async function listReactionsFeishu(params) {
	const { cfg, messageId, emojiType, accountId } = params;
	const client = LarkClient.fromCfg(cfg, accountId).sdk;
	const reactions = [];
	let pageToken;
	let hasMore = true;
	while (hasMore) {
		const requestParams = { page_size: 50 };
		if (emojiType) requestParams.reaction_type = emojiType;
		if (pageToken) requestParams.page_token = pageToken;
		const response = await client.im.messageReaction.list({
			path: { message_id: messageId },
			params: requestParams
		});
		const items = response?.data?.items;
		if (items && items.length > 0) for (const item of items) reactions.push({
			reactionId: item.reaction_id ?? "",
			emojiType: item.reaction_type?.emoji_type ?? "",
			operatorType: item.operator?.operator_type === "app" ? "app" : "user",
			operatorId: item.operator?.operator_id ?? ""
		});
		pageToken = response?.data?.page_token ?? void 0;
		hasMore = response?.data?.has_more === true && !!pageToken;
	}
	return reactions;
}
//#endregion
//#region src/messaging/outbound/actions.ts
const log$3 = larkLogger("outbound/actions");
/** Assert that a Lark SDK response has code === 0 (or no code field). */
function assertLarkOk$1(res, context) {
	const code = res?.code;
	if (code !== void 0 && code !== 0) {
		const msg = res?.msg ?? "unknown error";
		throw new Error(`[feishu-actions] ${context}: code=${code}, msg=${msg}`);
	}
}
const SUPPORTED_ACTIONS = new Set([
	"send",
	"react",
	"reactions",
	"delete",
	"unsend"
]);
/** Try to resolve a card param to a plain object. Accepts objects directly or JSON strings. */
function parseCardParam(raw) {
	if (raw == null) return void 0;
	if (typeof raw === "object" && !Array.isArray(raw)) return raw;
	if (typeof raw === "string") {
		const trimmed = raw.trim();
		if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
			log$3.warn("params.card is a string but not a JSON object, ignoring");
			return;
		}
		try {
			const parsed = JSON.parse(trimmed);
			if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
				log$3.info("params.card was a JSON string, parsed successfully");
				return parsed;
			}
			log$3.warn("params.card JSON parsed but is not a plain object, ignoring");
			return;
		} catch {
			log$3.warn("params.card is a string but failed to JSON.parse, ignoring");
			return;
		}
	}
	log$3.warn(`params.card has unexpected type "${typeof raw}", ignoring`);
}
/**
* Extract and normalise all send-related parameters from the raw action params.
* When `toolContext` is provided, thread context is inherited so that replies
* are routed to the correct thread.
*/
function readFeishuSendParams(params, toolContext) {
	const to = readStringParam(params, "to") ?? "";
	const text = readStringParam(params, "message", { allowEmpty: true }) ?? readStringParam(params, "text", { allowEmpty: true }) ?? "";
	const mediaUrl = readStringParam(params, "media") ?? readStringParam(params, "path") ?? readStringParam(params, "filePath") ?? readStringParam(params, "url");
	const fileName = readStringParam(params, "fileName") ?? readStringParam(params, "name");
	const replyInThread = (!to || to === toolContext?.currentChannelId) && Boolean(toolContext?.currentThreadTs);
	const replyToMessageId = readStringParam(params, "replyTo") ?? (replyInThread && toolContext?.currentMessageId ? String(toolContext.currentMessageId) : void 0);
	const card = parseCardParam(params.card);
	return {
		to,
		text,
		mediaUrl: mediaUrl ?? void 0,
		fileName: fileName ?? void 0,
		replyToMessageId: replyToMessageId ?? void 0,
		replyInThread,
		card
	};
}
const feishuMessageActions = {
	describeMessageTool: ({ cfg }) => {
		if (getEnabledLarkAccounts(cfg).length === 0) return {
			actions: [],
			capabilities: [],
			schema: null
		};
		return {
			actions: Array.from(SUPPORTED_ACTIONS),
			capabilities: ["cards"],
			schema: null
		};
	},
	supportsAction: ({ action }) => SUPPORTED_ACTIONS.has(action),
	extractToolSend: ({ args }) => extractToolSend(args, "sendMessage"),
	handleAction: async (ctx) => {
		const { action, params, cfg, accountId, toolContext } = ctx;
		const aid = accountId ?? void 0;
		log$3.info(`handleAction: action=${action}, accountId=${aid ?? "default"}`);
		try {
			switch (action) {
				case "send": return await deliverMessage(cfg, readFeishuSendParams(params, toolContext), aid, ctx.mediaLocalRoots);
				case "react": return await handleReact(cfg, params, aid);
				case "reactions": return await handleReactions(cfg, params, aid);
				case "delete":
				case "unsend": return await handleDelete(cfg, params, aid);
				default: throw new Error(`Action "${action}" is not supported for Feishu. Supported actions: ${Array.from(SUPPORTED_ACTIONS).join(", ")}.`);
			}
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			log$3.error(`handleAction failed: action=${action}, error=${errMsg}`);
			throw err;
		}
	}
};
/**
* Unified message delivery — handles text, card, and media payloads with
* optional reply-to and thread routing.
*
* Supports `fileName` for named file uploads via `uploadAndSendMediaLark`.
* On media upload failure, falls back to sending the URL as a text link.
*/
async function deliverMessage(cfg, sp, accountId, mediaLocalRoots) {
	const { to, text, mediaUrl, fileName, replyToMessageId, replyInThread, card } = sp;
	const payloadType = card ? "card" : mediaUrl ? "media" : "text";
	const target = to || replyToMessageId || "unknown";
	log$3.info(`deliverMessage: type=${payloadType}, target=${target}, isReply=${Boolean(replyToMessageId)}, replyInThread=${replyInThread}, textLen=${text.trim().length}, hasMedia=${Boolean(mediaUrl)}, fileName=${fileName ?? "(none)"}`);
	if (!text.trim() && !card && !mediaUrl) {
		log$3.warn("deliverMessage: no payload, rejecting");
		throw new Error("send requires at least one of: message, card, or media.");
	}
	const sendCtx = {
		cfg,
		to,
		replyToMessageId,
		replyInThread,
		accountId
	};
	if (text.trim() && (card || mediaUrl)) {
		log$3.info(`deliverMessage: sending preceding text (${text.length} chars) before ${payloadType}`);
		await sendTextLark({
			...sendCtx,
			text
		});
	}
	if (card) {
		const result = await sendCardLark({
			...sendCtx,
			card
		});
		log$3.info(`deliverMessage: card sent, messageId=${result.messageId}`);
		return jsonResult({
			ok: true,
			messageId: result.messageId,
			chatId: result.chatId
		});
	}
	if (mediaUrl) return await deliverMedia(cfg, sp, accountId, mediaLocalRoots);
	const result = await sendTextLark({
		...sendCtx,
		text
	});
	log$3.info(`deliverMessage: text sent, messageId=${result.messageId}`);
	return jsonResult({
		ok: true,
		messageId: result.messageId,
		chatId: result.chatId
	});
}
/**
* Upload and send a media file with text-link fallback on failure.
*/
async function deliverMedia(cfg, sp, accountId, mediaLocalRoots) {
	const { to, mediaUrl, fileName, replyToMessageId, replyInThread } = sp;
	log$3.info(`deliverMedia: url=${mediaUrl}, fileName=${fileName ?? "(auto)"}`);
	try {
		const result = await uploadAndSendMediaLark({
			cfg,
			to,
			mediaUrl,
			fileName,
			replyToMessageId,
			replyInThread,
			accountId,
			mediaLocalRoots
		});
		log$3.info(`deliverMedia: sent, messageId=${result.messageId}`);
		return jsonResult({
			ok: true,
			messageId: result.messageId,
			chatId: result.chatId
		});
	} catch (err) {
		const errMsg = err instanceof Error ? err.message : String(err);
		log$3.error(`deliverMedia: upload failed for "${mediaUrl}": ${errMsg}`);
		log$3.info("deliverMedia: falling back to text link");
		const fallback = await sendTextLark({
			cfg,
			to,
			text: `> ${mediaUrl}`,
			replyToMessageId,
			replyInThread,
			accountId
		});
		return jsonResult({
			ok: true,
			messageId: fallback.messageId,
			chatId: fallback.chatId,
			warning: `Media upload failed (${errMsg}). A text link was sent instead.`
		});
	}
}
async function handleReact(cfg, params, accountId) {
	const messageId = readStringParam(params, "messageId", { required: true });
	const { emoji, remove, isEmpty } = readReactionParams(params, { removeErrorMessage: "Emoji is required to remove a Feishu reaction." });
	if (remove || isEmpty) {
		log$3.info(`react: removing emoji=${emoji || "all"} from messageId=${messageId}`);
		const botReactions = (await listReactionsFeishu({
			cfg,
			messageId,
			emojiType: emoji || void 0,
			accountId
		})).filter((r) => r.operatorType === "app");
		for (const r of botReactions) await removeReactionFeishu({
			cfg,
			messageId,
			reactionId: r.reactionId,
			accountId
		});
		log$3.info(`react: removed ${botReactions.length} bot reaction(s)`);
		return jsonResult({
			ok: true,
			removed: botReactions.length
		});
	}
	log$3.info(`react: adding emoji=${emoji} to messageId=${messageId}`);
	const { reactionId } = await addReactionFeishu({
		cfg,
		messageId,
		emojiType: emoji,
		accountId
	});
	log$3.info(`react: added reactionId=${reactionId}`);
	return jsonResult({
		ok: true,
		reactionId
	});
}
async function handleReactions(cfg, params, accountId) {
	return jsonResult({
		ok: true,
		reactions: (await listReactionsFeishu({
			cfg,
			messageId: readStringParam(params, "messageId", { required: true }),
			emojiType: readStringParam(params, "emoji") || void 0,
			accountId
		})).map((r) => ({
			reactionId: r.reactionId,
			emoji: r.emojiType,
			operatorType: r.operatorType,
			operatorId: r.operatorId
		}))
	});
}
async function handleDelete(cfg, params, accountId) {
	const messageId = readStringParam(params, "messageId", { required: true });
	log$3.info(`delete: messageId=${messageId}`);
	assertLarkOk$1(await LarkClient.fromCfg(cfg, accountId).sdk.im.message.delete({ path: { message_id: messageId } }), `delete message ${messageId}`);
	log$3.info(`delete: done, messageId=${messageId}`);
	return jsonResult({
		ok: true,
		messageId,
		deleted: true
	});
}
//#endregion
//#region src/core/security-check.ts
function collectIsolationWarnings(_cfg) {
	return [];
}
//#endregion
//#region src/channel/config-adapter.ts
/** Generic Feishu account config merge. */
function mergeFeishuAccountConfig(cfg, accountId, patch) {
	if (!accountId || accountId === DEFAULT_ACCOUNT_ID) return {
		...cfg,
		channels: {
			...cfg.channels,
			feishu: {
				...cfg.channels?.feishu,
				...patch
			}
		}
	};
	const feishuCfg = cfg.channels?.feishu;
	return {
		...cfg,
		channels: {
			...cfg.channels,
			feishu: {
				...feishuCfg,
				accounts: {
					...feishuCfg?.accounts,
					[accountId]: {
						...feishuCfg?.accounts?.[accountId],
						...patch
					}
				}
			}
		}
	};
}
/** Set the `enabled` flag on a Feishu account. */
function setAccountEnabled(cfg, accountId, enabled) {
	return mergeFeishuAccountConfig(cfg, accountId, { enabled });
}
/** Apply an arbitrary config patch to a Feishu account. */
function applyAccountConfig(cfg, accountId, patch) {
	return mergeFeishuAccountConfig(cfg, accountId, patch);
}
/** Delete a Feishu account entry from the config. */
function deleteAccount(cfg, accountId) {
	if (!accountId || accountId === DEFAULT_ACCOUNT_ID) {
		const next = { ...cfg };
		const nextChannels = { ...cfg.channels };
		delete nextChannels.feishu;
		if (Object.keys(nextChannels).length > 0) next.channels = nextChannels;
		else delete next.channels;
		return next;
	}
	const feishuCfg = cfg.channels?.feishu;
	const accounts = { ...feishuCfg?.accounts };
	delete accounts[accountId];
	return {
		...cfg,
		channels: {
			...cfg.channels,
			feishu: {
				...feishuCfg,
				accounts: Object.keys(accounts).length > 0 ? accounts : void 0
			}
		}
	};
}
/** Collect security warnings for a Feishu account. */
function collectFeishuSecurityWarnings(params) {
	const { cfg, accountId } = params;
	const warnings = [];
	const account = getLarkAccount(cfg, accountId);
	const feishuCfg = account.config;
	const defaultGroupPolicy = (cfg.channels?.defaults)?.groupPolicy;
	if ((feishuCfg?.groupPolicy ?? defaultGroupPolicy ?? "allowlist") === "open") warnings.push(`- Feishu[${account.accountId}] groups: groupPolicy="open" allows any group to interact (mention-gated). To restrict which groups are allowed, set groupPolicy="allowlist" and list group IDs in channels.feishu.groups. To restrict which senders can trigger the bot, set channels.feishu.groupAllowFrom with user open_ids (ou_xxx).`);
	const allIds = getLarkAccountIds(cfg);
	if (allIds.length === 0 || accountId === allIds[0]) for (const w of collectIsolationWarnings(cfg)) warnings.push(w);
	return warnings;
}
//#endregion
//#region src/core/config-schema.ts
/**
* Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
* SPDX-License-Identifier: MIT
*
* Zod-based configuration schema for the OpenClaw Lark/Feishu channel plugin.
*
* Provides runtime validation, sensible defaults, and cross-field refinements
* so that every consuming module can rely on well-typed configuration objects.
*/
const DmPolicyEnum = z.enum([
	"open",
	"pairing",
	"allowlist",
	"disabled"
]);
const GroupPolicyEnum = z.enum([
	"open",
	"allowlist",
	"disabled"
]);
const ConnectionModeEnum = z.enum(["websocket", "webhook"]);
const ReplyModeValue = z.enum([
	"auto",
	"static",
	"streaming"
]);
const ReplyModeSchema = z.union([ReplyModeValue, z.object({
	default: ReplyModeValue.optional(),
	group: ReplyModeValue.optional(),
	direct: ReplyModeValue.optional()
})]).optional();
const ChunkModeEnum = z.enum([
	"newline",
	"paragraph",
	"none"
]);
const DomainSchema = z.union([
	z.literal("feishu"),
	z.literal("lark"),
	z.string().regex(/^https:\/\//)
]).optional();
const AllowFromSchema = z.union([z.string(), z.array(z.string())]).optional().transform((v) => {
	if (v === void 0 || v === null) return void 0;
	return Array.isArray(v) ? v : [v];
});
const ToolPolicySchema = z.object({
	allow: z.array(z.string()).optional(),
	deny: z.array(z.string()).optional()
}).optional();
const FeishuToolsFlagSchema = z.object({
	doc: z.boolean().optional(),
	wiki: z.boolean().optional(),
	drive: z.boolean().optional(),
	perm: z.boolean().optional(),
	scopes: z.boolean().optional()
}).optional();
const FeishuFooterSchema = z.object({
	status: z.boolean().optional(),
	elapsed: z.boolean().optional()
}).optional();
const BlockStreamingCoalesceSchema = z.object({
	minChars: z.number().optional(),
	maxChars: z.number().optional(),
	idleMs: z.number().optional()
}).optional();
const MarkdownConfigSchema = z.object({ tables: z.enum([
	"off",
	"bullets",
	"code"
]).optional() }).optional();
const HeartbeatSchema = z.object({
	every: z.string().optional(),
	activeHours: z.object({
		start: z.string().optional(),
		end: z.string().optional(),
		timezone: z.string().optional()
	}).optional(),
	target: z.string().optional(),
	to: z.string().optional(),
	prompt: z.string().optional(),
	accountId: z.string().optional()
}).optional();
const CapabilitiesSchema = z.object({
	image: z.boolean().optional(),
	audio: z.boolean().optional(),
	video: z.boolean().optional()
}).optional();
const DedupSchema = z.object({
	ttlMs: z.number().optional(),
	maxEntries: z.number().optional()
}).optional();
const ReactionNotificationModeSchema = z.enum([
	"off",
	"own",
	"all"
]).optional();
const UATConfigSchema = z.object({
	enabled: z.boolean().optional(),
	allowedScopes: z.array(z.string()).optional(),
	blockedScopes: z.array(z.string()).optional()
}).optional();
const DmConfigSchema = z.object({ historyLimit: z.number().optional() }).optional();
const FeishuGroupSchema = z.object({
	groupPolicy: GroupPolicyEnum.optional(),
	requireMention: z.boolean().optional(),
	tools: ToolPolicySchema,
	skills: z.array(z.string()).optional(),
	enabled: z.boolean().optional(),
	allowFrom: AllowFromSchema,
	systemPrompt: z.string().optional()
});
const FeishuAccountConfigSchema = z.object({
	appId: z.string().optional(),
	appSecret: z.string().optional(),
	encryptKey: z.string().optional(),
	verificationToken: z.string().optional(),
	name: z.string().optional(),
	enabled: z.boolean().optional(),
	domain: DomainSchema,
	connectionMode: ConnectionModeEnum.optional(),
	webhookPath: z.string().optional(),
	webhookPort: z.number().optional(),
	dmPolicy: DmPolicyEnum.optional(),
	allowFrom: AllowFromSchema,
	groupPolicy: GroupPolicyEnum.optional(),
	groupAllowFrom: AllowFromSchema,
	requireMention: z.boolean().optional(),
	groups: z.record(z.string(), FeishuGroupSchema).optional(),
	historyLimit: z.number().optional(),
	dmHistoryLimit: z.number().optional(),
	dms: DmConfigSchema,
	textChunkLimit: z.number().optional(),
	chunkMode: ChunkModeEnum.optional(),
	blockStreamingCoalesce: BlockStreamingCoalesceSchema,
	mediaMaxMb: z.number().optional(),
	heartbeat: HeartbeatSchema,
	replyMode: ReplyModeSchema,
	streaming: z.boolean().optional(),
	blockStreaming: z.boolean().optional(),
	tools: FeishuToolsFlagSchema,
	footer: FeishuFooterSchema,
	markdown: MarkdownConfigSchema,
	configWrites: z.boolean().optional(),
	capabilities: CapabilitiesSchema,
	dedup: DedupSchema,
	reactionNotifications: ReactionNotificationModeSchema,
	threadSession: z.boolean().optional(),
	uat: UATConfigSchema
});
/**
* JSON Schema derived from FeishuConfigSchema.
*
* - `io: "input"` exposes the input type for `.transform()` schemas (e.g. AllowFromSchema).
* - `unrepresentable: "any"` degrades `.superRefine()` constraints to `{}`.
* - `target: "draft-07"` matches the plugin system's expected JSON Schema version.
*/
const FEISHU_CONFIG_JSON_SCHEMA = toJSONSchema(FeishuAccountConfigSchema.extend({ accounts: z.record(z.string(), FeishuAccountConfigSchema).optional() }).superRefine((data, ctx) => {
	if (data.dmPolicy === "open") {
		const list = data.allowFrom;
		if (!(Array.isArray(list) && list.includes("*"))) ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: ["allowFrom"],
			message: "When dmPolicy is \"open\", allowFrom must include \"*\" to permit all senders."
		});
	}
}), {
	target: "draft-07",
	io: "input",
	unrepresentable: "any"
});
//#endregion
//#region src/channel/plugin.ts
const pluginLog = larkLogger("channel/plugin");
/** 状态轮询的探针结果缓存时长（10 分钟）。 */
const PROBE_CACHE_TTL_MS = 600 * 1e3;
/** Convert nullable SDK params to optional params for directory functions. */
function adaptDirectoryParams(params) {
	return {
		cfg: params.cfg,
		query: params.query ?? void 0,
		limit: params.limit ?? void 0,
		accountId: params.accountId ?? void 0
	};
}
const feishuPlugin = {
	id: "feishu",
	meta: {
		id: "feishu",
		label: "Feishu",
		selectionLabel: "Lark/Feishu (飞书)",
		docsPath: "/channels/feishu",
		docsLabel: "feishu",
		blurb: "飞书/Lark enterprise messaging.",
		aliases: ["lark"],
		order: 70
	},
	pairing: {
		idLabel: "feishuUserId",
		normalizeAllowEntry: (entry) => entry.replace(/^(feishu|user|open_id):/i, ""),
		notifyApproval: async ({ cfg, id }) => {
			const accountId = getDefaultLarkAccountId(cfg);
			pluginLog.info("notifyApproval called", {
				id,
				accountId
			});
			await sendMessageFeishu({
				cfg,
				to: id,
				text: PAIRING_APPROVED_MESSAGE,
				accountId
			});
			try {
				await triggerOnboarding({
					cfg,
					userOpenId: id,
					accountId
				});
				pluginLog.info("onboarding completed", { id });
			} catch (err) {
				pluginLog.warn("onboarding failed", {
					id,
					error: String(err)
				});
			}
		}
	},
	capabilities: {
		chatTypes: ["direct", "group"],
		media: true,
		reactions: true,
		threads: true,
		polls: false,
		nativeCommands: true,
		blockStreaming: true
	},
	agentPrompt: { messageToolHints: () => [
		"- Feishu targeting: omit `target` to reply to the current conversation (auto-inferred). Explicit targets: `user:open_id` or `chat:chat_id`.",
		"- Feishu supports interactive cards for rich messages.",
		"- Feishu reactions use UPPERCASE emoji type names (e.g. `OK`,`THUMBSUP`,`THANKS`,`MUSCLE`,`FINGERHEART`,`APPLAUSE`,`FISTBUMP`,`JIAYI`,`DONE`,`SMILE`,`BLUSH` ), not Unicode emoji characters.",
		"- Feishu `action=delete`/`action=unsend` only deletes messages sent by the bot. When the user quotes a message and says 'delete this', use the **quoted message's** message_id, not the user's own message_id."
	] },
	groups: { resolveToolPolicy: resolveFeishuGroupToolPolicy },
	reload: { configPrefixes: ["channels.feishu"] },
	configSchema: { schema: FEISHU_CONFIG_JSON_SCHEMA },
	config: {
		listAccountIds: (cfg) => getLarkAccountIds(cfg),
		resolveAccount: (cfg, accountId) => getLarkAccount(cfg, accountId),
		defaultAccountId: (cfg) => getDefaultLarkAccountId(cfg),
		setAccountEnabled: ({ cfg, accountId, enabled }) => {
			return setAccountEnabled(cfg, accountId, enabled);
		},
		deleteAccount: ({ cfg, accountId }) => {
			return deleteAccount(cfg, accountId);
		},
		isConfigured: (account) => account.configured,
		describeAccount: (account) => ({
			accountId: account.accountId,
			enabled: account.enabled,
			configured: account.configured,
			name: account.name,
			appId: account.appId,
			brand: account.brand
		}),
		resolveAllowFrom: ({ cfg, accountId }) => {
			return (getLarkAccount(cfg, accountId).config?.allowFrom ?? []).map((entry) => String(entry));
		},
		formatAllowFrom: ({ allowFrom }) => allowFrom.map((entry) => String(entry).trim()).filter(Boolean).map((entry) => entry.toLowerCase())
	},
	security: { collectWarnings: ({ cfg, accountId }) => collectFeishuSecurityWarnings({
		cfg,
		accountId: accountId ?? DEFAULT_ACCOUNT_ID
	}) },
	setup: {
		resolveAccountId: () => DEFAULT_ACCOUNT_ID,
		applyAccountConfig: ({ cfg, accountId }) => {
			return applyAccountConfig(cfg, accountId, { enabled: true });
		}
	},
	messaging: {
		normalizeTarget: (raw) => normalizeFeishuTarget(raw) ?? void 0,
		targetResolver: {
			looksLikeId: looksLikeFeishuId,
			hint: "<chatId|user:openId|chat:chatId>"
		}
	},
	directory: {
		self: async () => null,
		listPeers: async (p) => listFeishuDirectoryPeers(adaptDirectoryParams(p)),
		listGroups: async (p) => listFeishuDirectoryGroups(adaptDirectoryParams(p)),
		listPeersLive: async (p) => listFeishuDirectoryPeersLive(adaptDirectoryParams(p)),
		listGroupsLive: async (p) => listFeishuDirectoryGroupsLive(adaptDirectoryParams(p))
	},
	outbound: feishuOutbound,
	threading: { buildToolContext: ({ context, hasRepliedRef }) => ({
		currentChannelId: normalizeFeishuTarget(context.To ?? "") ?? void 0,
		currentThreadTs: context.MessageThreadId != null ? String(context.MessageThreadId) : void 0,
		currentMessageId: context.CurrentMessageId,
		hasRepliedRef
	}) },
	actions: feishuMessageActions,
	status: {
		defaultRuntime: {
			accountId: DEFAULT_ACCOUNT_ID,
			running: false,
			lastStartAt: null,
			lastStopAt: null,
			lastError: null,
			port: null
		},
		buildChannelSummary: ({ snapshot }) => ({
			configured: snapshot.configured ?? false,
			running: snapshot.running ?? false,
			lastStartAt: snapshot.lastStartAt ?? null,
			lastStopAt: snapshot.lastStopAt ?? null,
			lastError: snapshot.lastError ?? null,
			port: snapshot.port ?? null,
			probe: snapshot.probe,
			lastProbeAt: snapshot.lastProbeAt ?? null
		}),
		probeAccount: async ({ account }) => {
			return await LarkClient.fromAccount(account).probe({ maxAgeMs: PROBE_CACHE_TTL_MS });
		},
		buildAccountSnapshot: ({ account, runtime, probe }) => ({
			accountId: account.accountId,
			enabled: account.enabled,
			configured: account.configured,
			name: account.name,
			appId: account.appId,
			brand: account.brand,
			running: runtime?.running ?? false,
			lastStartAt: runtime?.lastStartAt ?? null,
			lastStopAt: runtime?.lastStopAt ?? null,
			lastError: runtime?.lastError ?? null,
			port: runtime?.port ?? null,
			probe
		})
	},
	gateway: {
		startAccount: async (ctx) => {
			const { monitorFeishuProvider } = await import("./monitor-CvIfHTzy.mjs").then((n) => n.n);
			const account = getLarkAccount(ctx.cfg, ctx.accountId);
			const port = account.config?.webhookPort ?? null;
			ctx.setStatus({
				accountId: ctx.accountId,
				port
			});
			ctx.log?.info(`starting feishu[${ctx.accountId}] (mode: ${account.config?.connectionMode ?? "websocket"})`);
			return monitorFeishuProvider({
				config: ctx.cfg,
				runtime: ctx.runtime,
				abortSignal: ctx.abortSignal,
				accountId: ctx.accountId
			});
		},
		stopAccount: async (ctx) => {
			ctx.log?.info(`stopping feishu[${ctx.accountId}]`);
			await LarkClient.clearCache(ctx.accountId);
			ctx.log?.info(`stopped feishu[${ctx.accountId}]`);
		}
	}
};
//#endregion
//#region src/tools/oapi/calendar/calendar.ts
const FeishuCalendarCalendarSchema = Type.Union([
	Type.Object({
		action: Type.Literal("list"),
		page_size: Type.Optional(Type.Number({ description: "Number of calendars to return per page (default: 50, max: 1000)" })),
		page_token: Type.Optional(Type.String({ description: "Pagination token for next page" }))
	}),
	Type.Object({
		action: Type.Literal("get"),
		calendar_id: Type.String({ description: "Calendar ID" })
	}),
	Type.Object({ action: Type.Literal("primary") })
]);
function registerFeishuCalendarCalendarTool(api) {
	if (!api.config) return;
	const cfg = api.config;
	const { toolClient, log } = createToolContext(api, "feishu_calendar_calendar");
	registerTool(api, {
		name: "feishu_calendar_calendar",
		label: "Feishu Calendar Management",
		description: "【以用户身份】飞书日历管理工具。用于查询日历列表、获取日历信息、查询主日历。Actions: list（查询日历列表）, get（查询指定日历信息）, primary（查询主日历信息）。",
		parameters: FeishuCalendarCalendarSchema,
		async execute(_toolCallId, params) {
			const p = params;
			try {
				const client = toolClient();
				switch (p.action) {
					case "list": {
						log.info(`list: page_size=${p.page_size ?? 50}, page_token=${p.page_token ?? "none"}`);
						const res = await client.invoke("feishu_calendar_calendar.list", (sdk, opts) => sdk.calendar.calendar.list({ params: {
							page_size: p.page_size,
							page_token: p.page_token
						} }, opts), { as: "user" });
						assertLarkOk$2(res);
						const data = res.data;
						const calendars = data?.calendar_list ?? [];
						log.info(`list: returned ${calendars.length} calendars`);
						return json({
							calendars,
							has_more: data?.has_more ?? false,
							page_token: data?.page_token
						});
					}
					case "get": {
						if (!p.calendar_id) return json({ error: "calendar_id is required for 'get' action" });
						log.info(`get: calendar_id=${p.calendar_id}`);
						const res = await client.invoke("feishu_calendar_calendar.get", (sdk, opts) => sdk.calendar.calendar.get({ path: { calendar_id: p.calendar_id } }, opts), { as: "user" });
						assertLarkOk$2(res);
						log.info(`get: retrieved calendar ${p.calendar_id}`);
						const data = res.data;
						return json({ calendar: data?.calendar ?? res.data });
					}
					case "primary": {
						log.info(`primary: querying primary calendar`);
						const res = await client.invoke("feishu_calendar_calendar.primary", (sdk, opts) => sdk.calendar.calendar.primary({}, opts), { as: "user" });
						assertLarkOk$2(res);
						const calendars = res.data?.calendars ?? [];
						log.info(`primary: returned ${calendars.length} primary calendars`);
						return json({ calendars });
					}
				}
			} catch (err) {
				return await handleInvokeErrorWithAutoAuth(err, cfg);
			}
		}
	}, { name: "feishu_calendar_calendar" });
}
//#endregion
//#region src/tools/oapi/calendar/event.ts
const FeishuCalendarEventSchema = Type.Union([
	Type.Object({
		action: Type.Literal("create"),
		start_time: Type.String({ description: "开始时间（必填）。ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'" }),
		end_time: Type.String({ description: "结束时间（必填）。格式同 start_time。如果用户未指定时长，默认为开始时间后1小时。" }),
		summary: Type.Optional(Type.String({ description: "日程标题（可选，但强烈建议提供）" })),
		user_open_id: Type.Optional(Type.String({ description: "当前请求用户的 open_id（可选，但强烈建议提供）。从消息上下文的 SenderId 字段获取，格式为 ou_xxx。日程创建在应用日历上，必须通过此参数将用户加为参会人，日程才会出现在用户的飞书日历中。" })),
		calendar_id: Type.Optional(Type.String({ description: "Calendar ID (optional; primary calendar used if omitted)" })),
		description: Type.Optional(Type.String({ description: "日程描述" })),
		attendees: Type.Optional(Type.Array(Type.Object({
			type: StringEnum([
				"user",
				"chat",
				"resource",
				"third_party"
			]),
			id: Type.String({ description: "Attendee open_id, chat_id, resource_id, or email" })
		}), { description: "参会人列表（强烈建议提供，否则日程只在应用日历上，用户看不到）。type='user' 时 id 填 open_id，type='third_party' 时 id 填邮箱。" })),
		vchat: Type.Optional(Type.Object({
			vc_type: Type.Optional(StringEnum([
				"vc",
				"third_party",
				"no_meeting"
			], { description: "视频会议类型：vc（飞书视频会议）、third_party（第三方链接）、no_meeting（无视频会议）。默认为空，首次添加参与人时自动生成飞书视频会议。" })),
			icon_type: Type.Optional(StringEnum([
				"vc",
				"live",
				"default"
			], { description: "第三方视频会议 icon 类型（仅 vc_type=third_party 时有效）。" })),
			description: Type.Optional(Type.String({ description: "第三方视频会议文案（仅 vc_type=third_party 时有效）。" })),
			meeting_url: Type.Optional(Type.String({ description: "第三方视频会议链接（仅 vc_type=third_party 时有效）。" }))
		}, { description: "视频会议信息。不传则默认在首次添加参与人时自动生成飞书视频会议。" })),
		visibility: Type.Optional(StringEnum([
			"default",
			"public",
			"private"
		], { description: "日程公开范围。default（默认，跟随日历权限）、public（公开详情）、private（私密，仅自己可见）。默认值：default。" })),
		attendee_ability: Type.Optional(StringEnum([
			"none",
			"can_see_others",
			"can_invite_others",
			"can_modify_event"
		], { description: "参与人权限。none（无法编辑、邀请、查看）、can_see_others（可查看参与人列表）、can_invite_others（可邀请其他人）、can_modify_event（可编辑日程）。默认值：none。" })),
		free_busy_status: Type.Optional(StringEnum(["busy", "free"], { description: "日程占用的忙闲状态。busy（忙碌）、free（空闲）。默认值：busy。" })),
		location: Type.Optional(Type.Object({
			name: Type.Optional(Type.String({ description: "地点名称" })),
			address: Type.Optional(Type.String({ description: "地点地址" })),
			latitude: Type.Optional(Type.Number({ description: "地点坐标纬度（国内采用 GCJ-02 标准，海外采用 WGS84 标准）" })),
			longitude: Type.Optional(Type.Number({ description: "地点坐标经度（国内采用 GCJ-02 标准，海外采用 WGS84 标准）" }))
		}, { description: "日程地点信息" })),
		reminders: Type.Optional(Type.Array(Type.Object({ minutes: Type.Number({ description: "日程提醒时间的偏移量（分钟）。正数表示在日程开始前提醒，负数表示在日程开始后提醒。范围：-20160 ~ 20160。" }) }), { description: "日程提醒列表" })),
		recurrence: Type.Optional(Type.String({ description: "重复日程的重复性规则（RFC5545 RRULE 格式）。例如：'FREQ=DAILY;INTERVAL=1' 表示每天重复。" }))
	}),
	Type.Object({
		action: Type.Literal("list"),
		start_time: Type.String({ description: "开始时间。ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'。注意：start_time 与 end_time 之间的时间区间需要小于 40 天。" }),
		end_time: Type.String({ description: "结束时间。格式同 start_time。注意：start_time 与 end_time 之间的时间区间需要小于 40 天。" }),
		calendar_id: Type.Optional(Type.String({ description: "Calendar ID (optional; primary calendar used if omitted)" }))
	}),
	Type.Object({
		action: Type.Literal("get"),
		event_id: Type.String({ description: "Event ID" }),
		calendar_id: Type.Optional(Type.String({ description: "Calendar ID (optional; primary calendar used if omitted)" }))
	}),
	Type.Object({
		action: Type.Literal("patch"),
		event_id: Type.String({ description: "Event ID" }),
		calendar_id: Type.Optional(Type.String({ description: "Calendar ID (optional; primary calendar used if omitted)" })),
		summary: Type.Optional(Type.String({ description: "新的日程标题" })),
		description: Type.Optional(Type.String({ description: "新的日程描述" })),
		start_time: Type.Optional(Type.String({ description: "新的开始时间（ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'）" })),
		end_time: Type.Optional(Type.String({ description: "新的结束时间（ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'）" })),
		location: Type.Optional(Type.String({ description: "新的地点" }))
	}),
	Type.Object({
		action: Type.Literal("delete"),
		event_id: Type.String({ description: "Event ID" }),
		calendar_id: Type.Optional(Type.String({ description: "Calendar ID (optional; primary calendar used if omitted)" })),
		need_notification: Type.Optional(Type.Boolean({ description: "是否通知参会人（默认 true）" }))
	}),
	Type.Object({
		action: Type.Literal("search"),
		query: Type.String({ description: "搜索关键词" }),
		calendar_id: Type.Optional(Type.String({ description: "Calendar ID (optional; primary calendar used if omitted)" })),
		page_size: Type.Optional(Type.Number({ description: "每页数量" })),
		page_token: Type.Optional(Type.String({ description: "分页标记" }))
	}),
	Type.Object({
		action: Type.Literal("reply"),
		event_id: Type.String({ description: "Event ID" }),
		calendar_id: Type.Optional(Type.String({ description: "Calendar ID (optional; primary calendar used if omitted)" })),
		rsvp_status: StringEnum([
			"accept",
			"decline",
			"tentative"
		])
	}),
	Type.Object({
		action: Type.Literal("instances"),
		event_id: Type.String({ description: "重复日程的 Event ID" }),
		calendar_id: Type.Optional(Type.String({ description: "Calendar ID (optional; primary calendar used if omitted)" })),
		start_time: Type.String({ description: "查询起始时间（ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'）" }),
		end_time: Type.String({ description: "查询结束时间（ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'）" }),
		page_size: Type.Optional(Type.Number({ description: "每页数量" })),
		page_token: Type.Optional(Type.String({ description: "分页标记" }))
	}),
	Type.Object({
		action: Type.Literal("instance_view"),
		start_time: Type.String({ description: "查询起始时间（ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'）" }),
		end_time: Type.String({ description: "查询结束时间（ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'）" }),
		calendar_id: Type.Optional(Type.String({ description: "Calendar ID (optional; primary calendar used if omitted)" })),
		page_size: Type.Optional(Type.Number({ description: "每页数量" })),
		page_token: Type.Optional(Type.String({ description: "分页标记" }))
	})
]);
function normalizeCalendarTimeValue(value) {
	if (value === null || value === void 0) return void 0;
	if (typeof value === "string") return unixTimestampToISO8601(value) ?? value;
	if (typeof value !== "object") return void 0;
	const timeObj = value;
	const fromTimestamp = unixTimestampToISO8601(timeObj.timestamp);
	if (fromTimestamp) return fromTimestamp;
	if (typeof timeObj.date === "string") return timeObj.date;
}
function normalizeEventTimeFields(event) {
	if (!event) return event;
	const normalized = { ...event };
	const startTime = normalizeCalendarTimeValue(event.start_time);
	if (startTime) normalized.start_time = startTime;
	const endTime = normalizeCalendarTimeValue(event.end_time);
	if (endTime) normalized.end_time = endTime;
	const createTime = unixTimestampToISO8601(event.create_time);
	if (createTime) normalized.create_time = createTime;
	return normalized;
}
function normalizeEventListTimeFields(events) {
	if (!events) return events;
	return events.map((item) => normalizeEventTimeFields(item));
}
function registerFeishuCalendarEventTool(api) {
	if (!api.config) return;
	const cfg = api.config;
	const { toolClient, log } = createToolContext(api, "feishu_calendar_event");
	const resolveCalendarId = async (client) => {
		const cid = (await client.invoke("feishu_calendar_calendar.primary", (sdk, opts) => sdk.calendar.calendar.primary({}, opts), { as: "user" })).data?.calendars?.[0]?.calendar?.calendar_id;
		if (cid) {
			log.info(`resolveCalendarId: primary() returned calendar_id=${cid}`);
			return cid;
		}
		return null;
	};
	const resolveCalendarIdOrFail = async (calendarId, client) => {
		if (calendarId) return calendarId;
		const resolved = await resolveCalendarId(client);
		if (!resolved) throw new Error("Could not determine primary calendar");
		return resolved;
	};
	registerTool(api, {
		name: "feishu_calendar_event",
		label: "Feishu Calendar Events",
		description: "【以用户身份】飞书日程管理工具。当用户要求查看日程、创建会议、约会议、修改日程、删除日程、搜索日程、回复日程邀请时使用。Actions: create（创建日历事件）, list（查询时间范围内的日程，自动展开重复日程）, get（获取日程详情）, patch（更新日程）, delete（删除日程）, search（搜索日程）, reply（回复日程邀请）, instances（获取重复日程的实例列表，仅对重复日程有效）, instance_view（查看展开后的日程列表）。【重要】create 时必须传 user_open_id 参数，值为消息上下文中的 SenderId（格式 ou_xxx），否则日程只在应用日历上，用户完全看不到。list 操作使用 instance_view 接口，会自动展开重复日程为多个实例，时间区间不能超过40天，返回实例数量上限1000。时间参数使用ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'。",
		parameters: FeishuCalendarEventSchema,
		async execute(_toolCallId, params) {
			const p = params;
			try {
				const client = toolClient();
				switch (p.action) {
					case "create": {
						if (!p.summary) return json({ error: "summary is required" });
						if (!p.start_time) return json({ error: "start_time is required" });
						if (!p.end_time) return json({ error: "end_time is required" });
						const startTs = parseTimeToTimestamp(p.start_time);
						const endTs = parseTimeToTimestamp(p.end_time);
						if (!startTs || !endTs) return json({
							error: "Invalid time format. Must use ISO 8601 / RFC 3339 with timezone, e.g. '2024-01-01T00:00:00+08:00' or '2026-02-25 14:00:00'. Do not pass Unix timestamp numbers.",
							received_start: p.start_time,
							received_end: p.end_time
						});
						log.info(`create: summary=${p.summary}, start_time=${p.start_time} -> ts=${startTs}, end_time=${p.end_time} -> ts=${endTs}, user_open_id=${p.user_open_id ?? "MISSING"}, attendees=${JSON.stringify(p.attendees ?? [])}, vchat=${p.vchat?.vc_type ?? "auto"}, location=${p.location?.name ?? "none"}`);
						const calendarId = await resolveCalendarIdOrFail(p.calendar_id, client);
						const eventData = {
							summary: p.summary,
							start_time: { timestamp: startTs },
							end_time: { timestamp: endTs },
							need_notification: true,
							attendee_ability: p.attendee_ability ?? "can_modify_event"
						};
						if (p.description) eventData.description = p.description;
						if (p.vchat) {
							eventData.vchat = {};
							if (p.vchat.vc_type) eventData.vchat.vc_type = p.vchat.vc_type;
							if (p.vchat.icon_type) eventData.vchat.icon_type = p.vchat.icon_type;
							if (p.vchat.description) eventData.vchat.description = p.vchat.description;
							if (p.vchat.meeting_url) eventData.vchat.meeting_url = p.vchat.meeting_url;
						}
						if (p.visibility) eventData.visibility = p.visibility;
						if (p.free_busy_status) eventData.free_busy_status = p.free_busy_status;
						if (p.location) {
							eventData.location = {};
							if (p.location.name) eventData.location.name = p.location.name;
							if (p.location.address) eventData.location.address = p.location.address;
							if (p.location.latitude !== void 0) eventData.location.latitude = p.location.latitude;
							if (p.location.longitude !== void 0) eventData.location.longitude = p.location.longitude;
						}
						if (p.reminders) eventData.reminders = p.reminders.map((r) => ({ minutes: r.minutes }));
						if (p.recurrence) eventData.recurrence = p.recurrence;
						const res = await client.invoke("feishu_calendar_event.create", (sdk, opts) => sdk.calendar.calendarEvent.create({
							path: { calendar_id: calendarId },
							data: eventData
						}, opts), { as: "user" });
						assertLarkOk$2(res);
						log.info(`event created: event_id=${res.data?.event?.event_id}`);
						const allAttendees = [...p.attendees ?? []];
						if (p.user_open_id) {
							if (!allAttendees.some((a) => a.type === "user" && a.id === p.user_open_id)) allAttendees.push({
								type: "user",
								id: p.user_open_id
							});
						}
						log.info(`allAttendees=${JSON.stringify(allAttendees)}`);
						let attendeeError;
						const operateId = p.user_open_id ?? p.attendees?.find((a) => a.type === "user")?.id;
						if (allAttendees.length > 0 && res.data?.event?.event_id) {
							const attendeeData = allAttendees.map((a) => ({
								type: a.type,
								user_id: a.type === "user" ? a.id : void 0,
								chat_id: a.type === "chat" ? a.id : void 0,
								room_id: a.type === "resource" ? a.id : void 0,
								third_party_email: a.type === "third_party" ? a.id : void 0,
								operate_id: operateId
							}));
							try {
								const attendeeRes = await client.invoke("feishu_calendar_event.create", (sdk, opts) => sdk.calendar.calendarEventAttendee.create({
									path: {
										calendar_id: calendarId,
										event_id: res.data?.event?.event_id
									},
									params: { user_id_type: "open_id" },
									data: {
										attendees: attendeeData,
										need_notification: true
									}
								}, opts), { as: "user" });
								assertLarkOk$2(attendeeRes);
								log.info(`attendee API response: ${JSON.stringify(attendeeRes.data)}`);
							} catch (attendeeErr) {
								attendeeError = formatLarkError(attendeeErr);
								log.info(`attendee add FAILED: ${attendeeError}`);
							}
						}
						const appLink = (res.data?.event)?.app_link;
						const result = {
							event: res.data?.event ? {
								event_id: res.data.event.event_id,
								summary: res.data.event.summary,
								app_link: appLink,
								start_time: unixTimestampToISO8601(startTs) ?? p.start_time,
								end_time: unixTimestampToISO8601(endTs) ?? p.end_time
							} : void 0,
							attendees: allAttendees.map((a) => ({
								type: a.type,
								id: a.id
							})),
							_debug: {
								calendar_id: calendarId,
								operate_id: operateId,
								start_input: p.start_time,
								start_iso8601: unixTimestampToISO8601(startTs) ?? p.start_time,
								end_input: p.end_time,
								end_iso8601: unixTimestampToISO8601(endTs) ?? p.end_time,
								attendees_count: allAttendees.length
							}
						};
						if (attendeeError) result.warning = `日程已创建，但添加参会人失败：${attendeeError}`;
						else if (allAttendees.length === 0) result.error = "日程已创建在应用日历上，但未添加任何参会人，用户看不到此日程。请重新调用时传入 user_open_id 参数。";
						else result.note = `已成功添加 ${allAttendees.length} 位参会人，日程应出现在参会人的飞书日历中。`;
						return json(result);
					}
					case "list": {
						if (!p.start_time) return json({ error: "start_time is required" });
						if (!p.end_time) return json({ error: "end_time is required" });
						const startTs = parseTimeToTimestamp(p.start_time);
						const endTs = parseTimeToTimestamp(p.end_time);
						if (!startTs || !endTs) return json({
							error: "Invalid time format. Must use ISO 8601 / RFC 3339 with timezone, e.g. '2024-01-01T00:00:00+08:00' or '2026-02-25 14:00:00'. Do not pass Unix timestamps.",
							received_start: p.start_time,
							received_end: p.end_time
						});
						const calendarId = await resolveCalendarIdOrFail(p.calendar_id, client);
						log.info(`list: calendar_id=${calendarId}, start_time=${startTs}, end_time=${endTs} (using instance_view)`);
						const res = await client.invoke("feishu_calendar_event.instance_view", (sdk, opts) => sdk.calendar.calendarEvent.instanceView({
							path: { calendar_id: calendarId },
							params: {
								start_time: startTs,
								end_time: endTs,
								user_id_type: "open_id"
							}
						}, opts), { as: "user" });
						assertLarkOk$2(res);
						const data = res.data;
						log.info(`list: returned ${data?.items?.length ?? 0} event instances`);
						return json({
							events: normalizeEventListTimeFields(data?.items),
							has_more: data?.has_more ?? false,
							page_token: data?.page_token
						});
					}
					case "get": {
						if (!p.event_id) return json({ error: "event_id is required" });
						const calendarId = await resolveCalendarIdOrFail(p.calendar_id, client);
						log.info(`get: calendar_id=${calendarId}, event_id=${p.event_id}`);
						const res = await client.invoke("feishu_calendar_event.get", (sdk, opts) => sdk.calendar.calendarEvent.get({ path: {
							calendar_id: calendarId,
							event_id: p.event_id
						} }, opts), { as: "user" });
						assertLarkOk$2(res);
						log.info(`get: retrieved event ${p.event_id}`);
						return json({ event: normalizeEventTimeFields(res.data?.event) });
					}
					case "patch": {
						if (!p.event_id) return json({ error: "event_id is required" });
						const calendarId = await resolveCalendarIdOrFail(p.calendar_id, client);
						const updateData = {};
						if (p.start_time) {
							const startTs = parseTimeToTimestamp(p.start_time);
							if (!startTs) return json({
								error: "start_time 格式错误！必须使用ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'",
								received: p.start_time
							});
							updateData.start_time = { timestamp: startTs };
						}
						if (p.end_time) {
							const endTs = parseTimeToTimestamp(p.end_time);
							if (!endTs) return json({
								error: "end_time 格式错误！必须使用ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'",
								received: p.end_time
							});
							updateData.end_time = { timestamp: endTs };
						}
						if (p.summary) updateData.summary = p.summary;
						if (p.description) updateData.description = p.description;
						if (p.location) updateData.location = { name: p.location };
						log.info(`patch: calendar_id=${calendarId}, event_id=${p.event_id}, fields=${Object.keys(updateData).join(",")}`);
						const res = await client.invoke("feishu_calendar_event.patch", (sdk, opts) => sdk.calendar.calendarEvent.patch({
							path: {
								calendar_id: calendarId,
								event_id: p.event_id
							},
							data: updateData
						}, opts), { as: "user" });
						assertLarkOk$2(res);
						log.info(`patch: updated event ${p.event_id}`);
						return json({ event: normalizeEventTimeFields(res.data?.event) });
					}
					case "delete": {
						if (!p.event_id) return json({ error: "event_id is required" });
						const calendarId = await resolveCalendarIdOrFail(p.calendar_id, client);
						log.info(`delete: calendar_id=${calendarId}, event_id=${p.event_id}, notify=${p.need_notification ?? true}`);
						assertLarkOk$2(await client.invoke("feishu_calendar_event.delete", (sdk, opts) => sdk.calendar.calendarEvent.delete({
							path: {
								calendar_id: calendarId,
								event_id: p.event_id
							},
							params: { need_notification: p.need_notification ?? true }
						}, opts), { as: "user" }));
						log.info(`delete: deleted event ${p.event_id}`);
						return json({
							success: true,
							event_id: p.event_id
						});
					}
					case "search": {
						if (!p.query) return json({ error: "query is required" });
						const calendarId = await resolveCalendarIdOrFail(p.calendar_id, client);
						log.info(`search: calendar_id=${calendarId}, query=${p.query}, page_size=${p.page_size ?? 50}`);
						const res = await client.invoke("feishu_calendar_event.search", (sdk, opts) => sdk.calendar.calendarEvent.search({
							path: { calendar_id: calendarId },
							params: {
								page_size: p.page_size,
								page_token: p.page_token
							},
							data: { query: p.query }
						}, opts), { as: "user" });
						assertLarkOk$2(res);
						const data = res.data;
						log.info(`search: found ${data?.items?.length ?? 0} events`);
						return json({
							events: normalizeEventListTimeFields(data?.items),
							has_more: data?.has_more ?? false,
							page_token: data?.page_token
						});
					}
					case "reply": {
						if (!p.event_id) return json({ error: "event_id is required" });
						if (!p.rsvp_status) return json({ error: "rsvp_status is required" });
						const calendarId = await resolveCalendarIdOrFail(p.calendar_id, client);
						log.info(`reply: calendar_id=${calendarId}, event_id=${p.event_id}, rsvp=${p.rsvp_status}`);
						assertLarkOk$2(await client.invoke("feishu_calendar_event.reply", (sdk, opts) => sdk.calendar.calendarEvent.reply({
							path: {
								calendar_id: calendarId,
								event_id: p.event_id
							},
							data: { rsvp_status: p.rsvp_status }
						}, opts), { as: "user" }));
						log.info(`reply: replied to event ${p.event_id} with ${p.rsvp_status}`);
						return json({
							success: true,
							event_id: p.event_id,
							rsvp_status: p.rsvp_status
						});
					}
					case "instances": {
						if (!p.event_id) return json({ error: "event_id is required" });
						if (!p.start_time) return json({ error: "start_time is required" });
						if (!p.end_time) return json({ error: "end_time is required" });
						const calendarId = await resolveCalendarIdOrFail(p.calendar_id, client);
						const startTs = parseTimeToTimestamp(p.start_time);
						const endTs = parseTimeToTimestamp(p.end_time);
						if (!startTs || !endTs) return json({
							error: "Invalid time format. Must use ISO 8601 / RFC 3339 with timezone, e.g. '2024-01-01T00:00:00+08:00'",
							received_start: p.start_time,
							received_end: p.end_time
						});
						log.info(`instances: calendar_id=${calendarId}, event_id=${p.event_id}, start=${startTs}, end=${endTs}`);
						const res = await client.invoke("feishu_calendar_event.instances", (sdk, opts) => sdk.calendar.calendarEvent.instances({
							path: {
								calendar_id: calendarId,
								event_id: p.event_id
							},
							params: {
								start_time: startTs,
								end_time: endTs,
								page_size: p.page_size,
								page_token: p.page_token
							}
						}, opts), { as: "user" });
						assertLarkOk$2(res);
						const data = res.data;
						log.info(`instances: returned ${data?.items?.length ?? 0} instances`);
						return json({
							instances: normalizeEventListTimeFields(data?.items),
							has_more: data?.has_more ?? false,
							page_token: data?.page_token
						});
					}
					case "instance_view": {
						if (!p.start_time) return json({ error: "start_time is required" });
						if (!p.end_time) return json({ error: "end_time is required" });
						const calendarId = await resolveCalendarIdOrFail(p.calendar_id, client);
						const startTs = parseTimeToTimestamp(p.start_time);
						const endTs = parseTimeToTimestamp(p.end_time);
						if (!startTs || !endTs) return json({
							error: "Invalid time format. Must use ISO 8601 / RFC 3339 with timezone, e.g. '2024-01-01T00:00:00+08:00'",
							received_start: p.start_time,
							received_end: p.end_time
						});
						log.info(`instance_view: calendar_id=${calendarId}, start=${startTs}, end=${endTs}`);
						const res = await client.invoke("feishu_calendar_event.instance_view", (sdk, opts) => sdk.calendar.calendarEvent.instanceView({
							path: { calendar_id: calendarId },
							params: {
								start_time: startTs,
								end_time: endTs,
								user_id_type: "open_id"
							}
						}, opts), { as: "user" });
						assertLarkOk$2(res);
						const data = res.data;
						log.info(`instance_view: returned ${data?.items?.length ?? 0} events`);
						return json({
							events: normalizeEventListTimeFields(data?.items),
							has_more: data?.has_more ?? false,
							page_token: data?.page_token
						});
					}
				}
			} catch (err) {
				return await handleInvokeErrorWithAutoAuth(err, cfg);
			}
		}
	}, { name: "feishu_calendar_event" });
}
//#endregion
//#region src/tools/oapi/calendar/event-attendee.ts
const FeishuCalendarEventAttendeeSchema = Type.Union([Type.Object({
	action: Type.Literal("create"),
	calendar_id: Type.String({ description: "日历 ID" }),
	event_id: Type.String({ description: "日程 ID" }),
	attendees: Type.Array(Type.Object({
		type: StringEnum([
			"user",
			"chat",
			"resource",
			"third_party"
		]),
		attendee_id: Type.String({ description: "参会人 ID。type=user 时为 open_id，type=chat 时为 chat_id，type=resource 时为会议室 ID，type=third_party 时为邮箱地址" })
	}), { description: "参会人列表" }),
	need_notification: Type.Optional(Type.Boolean({ description: "是否给参会人发送通知（默认 true）" })),
	attendee_ability: Type.Optional(StringEnum([
		"none",
		"can_see_others",
		"can_invite_others",
		"can_modify_event"
	]))
}), Type.Object({
	action: Type.Literal("list"),
	calendar_id: Type.String({ description: "日历 ID" }),
	event_id: Type.String({ description: "日程 ID" }),
	page_size: Type.Optional(Type.Number({ description: "每页数量（默认 50，最大 500）" })),
	page_token: Type.Optional(Type.String({ description: "分页标记" })),
	user_id_type: Type.Optional(StringEnum([
		"open_id",
		"union_id",
		"user_id"
	]))
})]);
function registerFeishuCalendarEventAttendeeTool(api) {
	if (!api.config) return;
	const cfg = api.config;
	const { toolClient, log } = createToolContext(api, "feishu_calendar_event_attendee");
	registerTool(api, {
		name: "feishu_calendar_event_attendee",
		label: "Feishu Calendar Event Attendees",
		description: "飞书日程参会人管理工具。当用户要求邀请/添加参会人、查看参会人列表时使用。Actions: create（添加参会人）, list（查询参会人列表）。",
		parameters: FeishuCalendarEventAttendeeSchema,
		async execute(_toolCallId, params) {
			const p = params;
			try {
				const client = toolClient();
				switch (p.action) {
					case "create": {
						if (!p.attendees || p.attendees.length === 0) return json({ error: "attendees is required and cannot be empty" });
						log.info(`create: calendar_id=${p.calendar_id}, event_id=${p.event_id}, attendees_count=${p.attendees.length}`);
						const attendeeData = p.attendees.map((a) => {
							const base = {
								type: a.type,
								is_optional: false
							};
							if (a.type === "user") base.user_id = a.attendee_id;
							else if (a.type === "chat") base.chat_id = a.attendee_id;
							else if (a.type === "resource") base.room_id = a.attendee_id;
							else if (a.type === "third_party") base.third_party_email = a.attendee_id;
							return base;
						});
						const res = await client.invoke("feishu_calendar_event.create", (sdk, opts) => sdk.calendar.calendarEventAttendee.create({
							path: {
								calendar_id: p.calendar_id,
								event_id: p.event_id
							},
							params: { user_id_type: "open_id" },
							data: {
								attendees: attendeeData,
								need_notification: p.need_notification ?? true
							}
						}, opts), { as: "user" });
						assertLarkOk$2(res);
						log.info(`create: added ${p.attendees.length} attendees to event ${p.event_id}`);
						return json({ attendees: res.data?.attendees });
					}
					case "list": {
						log.info(`list: calendar_id=${p.calendar_id}, event_id=${p.event_id}, page_size=${p.page_size ?? 50}`);
						const res = await client.invoke("feishu_calendar_event_attendee.list", (sdk, opts) => sdk.calendar.calendarEventAttendee.list({
							path: {
								calendar_id: p.calendar_id,
								event_id: p.event_id
							},
							params: {
								page_size: p.page_size,
								page_token: p.page_token,
								user_id_type: p.user_id_type || "open_id"
							}
						}, opts), { as: "user" });
						assertLarkOk$2(res);
						const data = res.data;
						log.info(`list: returned ${data?.items?.length ?? 0} attendees`);
						return json({
							attendees: data?.items,
							has_more: data?.has_more ?? false,
							page_token: data?.page_token
						});
					}
				}
			} catch (err) {
				return await handleInvokeErrorWithAutoAuth(err, cfg);
			}
		}
	}, { name: "feishu_calendar_event_attendee" });
}
//#endregion
//#region src/tools/oapi/calendar/freebusy.ts
const FeishuCalendarFreebusySchema = Type.Object({
	action: Type.Literal("list"),
	time_min: Type.String({ description: "查询起始时间（ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'）" }),
	time_max: Type.String({ description: "查询结束时间（ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'）" }),
	user_ids: Type.Array(Type.String({ description: "用户 open_id" }), {
		description: "要查询忙闲的用户 ID 列表（1-10 个用户）",
		minItems: 1,
		maxItems: 10
	})
});
function registerFeishuCalendarFreebusyTool(api) {
	if (!api.config) return;
	const cfg = api.config;
	const { toolClient, log } = createToolContext(api, "feishu_calendar_freebusy");
	registerTool(api, {
		name: "feishu_calendar_freebusy",
		label: "Feishu Calendar Free/Busy Status",
		description: "【以用户身份】飞书日历忙闲查询工具。当用户要求查询某时间段内某人是否空闲、查看忙闲状态时使用。支持批量查询 1-10 个用户的主日历忙闲信息，用于安排会议时间。",
		parameters: FeishuCalendarFreebusySchema,
		async execute(_toolCallId, params) {
			const p = params;
			log.info(`[FREEBUSY] Execute called with params: ${JSON.stringify(p)}`);
			try {
				const client = toolClient();
				if (p.action !== "list") {
					log.warn(`[FREEBUSY] Unknown action: ${p.action}`);
					return json({ error: `Unknown action: ${p.action}` });
				}
				if (!p.user_ids || p.user_ids.length === 0) {
					log.warn(`[FREEBUSY] user_ids is empty`);
					return json({ error: "user_ids is required (1-10 user IDs)" });
				}
				if (p.user_ids.length > 10) {
					log.warn(`[FREEBUSY] user_ids exceeds limit: ${p.user_ids.length}`);
					return json({ error: `user_ids count exceeds limit, maximum 10 users (current: ${p.user_ids.length})` });
				}
				log.info(`[FREEBUSY] Validation passed, user_ids count: ${p.user_ids.length}`);
				const timeMin = parseTimeToRFC3339(p.time_min);
				const timeMax = parseTimeToRFC3339(p.time_max);
				if (!timeMin || !timeMax) {
					log.warn(`[FREEBUSY] Time format error: time_min=${p.time_min}, time_max=${p.time_max}`);
					return json({
						error: "Invalid time format. Must use ISO 8601 / RFC 3339 with timezone, e.g. '2024-01-01T00:00:00+08:00' or '2026-02-25 14:00:00'.",
						received_time_min: p.time_min,
						received_time_max: p.time_max
					});
				}
				log.info(`[FREEBUSY] Calling batch API: time_min=${p.time_min} -> ${timeMin}, time_max=${p.time_max} -> ${timeMax}, user_ids=${p.user_ids.length}`);
				const res = await client.invoke("feishu_calendar_freebusy.list", (sdk, opts) => sdk.calendar.freebusy.batch({ data: {
					time_min: timeMin,
					time_max: timeMax,
					user_ids: p.user_ids,
					include_external_calendar: true,
					only_busy: true
				} }, opts), { as: "user" });
				assertLarkOk$2(res);
				const freebusyLists = res.data?.freebusy_lists ?? [];
				log.info(`[FREEBUSY] Success: returned ${freebusyLists.length} user(s) freebusy data`);
				return json({
					freebusy_lists: freebusyLists,
					_debug: {
						time_min_input: p.time_min,
						time_min_rfc3339: timeMin,
						time_max_input: p.time_max,
						time_max_rfc3339: timeMax,
						user_count: p.user_ids.length
					}
				});
			} catch (err) {
				return await handleInvokeErrorWithAutoAuth(err, cfg);
			}
		}
	}, { name: "feishu_calendar_freebusy" });
}
//#endregion
//#region src/tools/oapi/task/task.ts
const FeishuTaskTaskSchema = Type.Union([
	Type.Object({
		action: Type.Literal("create"),
		summary: Type.String({ description: "任务标题" }),
		current_user_id: Type.Optional(Type.String({ description: "当前用户的 open_id（强烈建议，从消息上下文的 SenderId 获取）。如果 members 中不包含此用户，工具会自动添加为 follower，确保创建者可以编辑任务。" })),
		description: Type.Optional(Type.String({ description: "任务描述" })),
		due: Type.Optional(Type.Object({
			timestamp: Type.String({ description: "截止时间（ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'）" }),
			is_all_day: Type.Optional(Type.Boolean({ description: "是否为全天任务" }))
		})),
		start: Type.Optional(Type.Object({
			timestamp: Type.String({ description: "开始时间（ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'）" }),
			is_all_day: Type.Optional(Type.Boolean({ description: "是否为全天" }))
		})),
		members: Type.Optional(Type.Array(Type.Object({
			id: Type.String({ description: "成员 open_id" }),
			role: Type.Optional(StringEnum(["assignee", "follower"]))
		}), { description: "任务成员列表（assignee=负责人，follower=关注人）" })),
		repeat_rule: Type.Optional(Type.String({ description: "重复规则（RRULE 格式）" })),
		tasklists: Type.Optional(Type.Array(Type.Object({
			tasklist_guid: Type.String({ description: "清单 GUID" }),
			section_guid: Type.Optional(Type.String({ description: "分组 GUID" }))
		}), { description: "任务所属清单列表" })),
		user_id_type: Type.Optional(StringEnum([
			"open_id",
			"union_id",
			"user_id"
		]))
	}),
	Type.Object({
		action: Type.Literal("get"),
		task_guid: Type.String({ description: "Task GUID" }),
		user_id_type: Type.Optional(StringEnum([
			"open_id",
			"union_id",
			"user_id"
		]))
	}),
	Type.Object({
		action: Type.Literal("list"),
		page_size: Type.Optional(Type.Number({ description: "每页数量（默认 50，最大 100）。" })),
		page_token: Type.Optional(Type.String({ description: "分页标记" })),
		completed: Type.Optional(Type.Boolean({ description: "是否筛选已完成任务" })),
		user_id_type: Type.Optional(StringEnum([
			"open_id",
			"union_id",
			"user_id"
		]))
	}),
	Type.Object({
		action: Type.Literal("patch"),
		task_guid: Type.String({ description: "Task GUID" }),
		summary: Type.Optional(Type.String({ description: "新的任务标题" })),
		description: Type.Optional(Type.String({ description: "新的任务描述" })),
		due: Type.Optional(Type.Object({
			timestamp: Type.String({ description: "新的截止时间（ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'）" }),
			is_all_day: Type.Optional(Type.Boolean({ description: "是否为全天任务" }))
		})),
		start: Type.Optional(Type.Object({
			timestamp: Type.String({ description: "新的开始时间（ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'）" }),
			is_all_day: Type.Optional(Type.Boolean({ description: "是否为全天" }))
		})),
		completed_at: Type.Optional(Type.String({ description: "完成时间。支持三种格式：1) ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'（设为已完成）；2) '0'（反完成，任务变为未完成）；3) 毫秒时间戳字符串。" })),
		members: Type.Optional(Type.Array(Type.Object({
			id: Type.String({ description: "成员 open_id" }),
			role: Type.Optional(StringEnum(["assignee", "follower"]))
		}), { description: "新的任务成员列表" })),
		repeat_rule: Type.Optional(Type.String({ description: "新的重复规则（RRULE 格式）" })),
		user_id_type: Type.Optional(StringEnum([
			"open_id",
			"union_id",
			"user_id"
		]))
	})
]);
function registerFeishuTaskTaskTool(api) {
	if (!api.config) return;
	const cfg = api.config;
	const { toolClient, log } = createToolContext(api, "feishu_task_task");
	registerTool(api, {
		name: "feishu_task_task",
		label: "Feishu Task Management",
		description: "【以用户身份】飞书任务管理工具。用于创建、查询、更新任务。Actions: create（创建任务）, get（获取任务详情）, list（查询任务列表，仅返回我负责的任务）, patch（更新任务）。时间参数使用ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'。",
		parameters: FeishuTaskTaskSchema,
		async execute(_toolCallId, params) {
			const p = params;
			try {
				const client = toolClient();
				switch (p.action) {
					case "create": {
						log.info(`create: summary=${p.summary}`);
						const taskData = { summary: p.summary };
						if (p.description) taskData.description = p.description;
						if (p.due?.timestamp) {
							const dueTs = parseTimeToTimestampMs(p.due.timestamp);
							if (!dueTs) return json({
								error: "due 时间格式错误！必须使用ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'，例如 '2026-02-25 18:00'。",
								received: p.due.timestamp
							});
							taskData.due = {
								timestamp: dueTs,
								is_all_day: p.due.is_all_day ?? false
							};
							log.info(`create: due time converted: ${p.due.timestamp} -> ${dueTs}ms`);
						}
						if (p.start?.timestamp) {
							const startTs = parseTimeToTimestampMs(p.start.timestamp);
							if (!startTs) return json({
								error: "start 时间格式错误！必须使用ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'。",
								received: p.start.timestamp
							});
							taskData.start = {
								timestamp: startTs,
								is_all_day: p.start.is_all_day ?? false
							};
						}
						if (p.members) taskData.members = p.members;
						if (p.repeat_rule) taskData.repeat_rule = p.repeat_rule;
						if (p.tasklists) taskData.tasklists = p.tasklists;
						const res = await client.invoke("feishu_task_task.create", (sdk, opts) => sdk.task.v2.task.create({
							data: taskData,
							params: { user_id_type: p.user_id_type || "open_id" }
						}, opts), { as: "user" });
						assertLarkOk$2(res);
						const data = res.data;
						log.info(`create: task created: task_guid=${data?.task?.guid}`);
						return json({ task: res.data?.task });
					}
					case "get": {
						log.info(`get: task_guid=${p.task_guid}`);
						const res = await client.invoke("feishu_task_task.get", (sdk, opts) => sdk.task.v2.task.get({
							path: { task_guid: p.task_guid },
							params: { user_id_type: p.user_id_type || "open_id" }
						}, opts), { as: "user" });
						assertLarkOk$2(res);
						log.info(`get: retrieved task ${p.task_guid}`);
						return json({ task: res.data?.task });
					}
					case "list": {
						log.info(`list: page_size=${p.page_size ?? 50}, completed=${p.completed ?? false}`);
						const res = await client.invoke("feishu_task_task.list", (sdk, opts) => sdk.task.v2.task.list({ params: {
							page_size: p.page_size,
							page_token: p.page_token,
							completed: p.completed,
							user_id_type: p.user_id_type || "open_id"
						} }, opts), { as: "user" });
						assertLarkOk$2(res);
						const data = res.data;
						log.info(`list: returned ${data?.items?.length ?? 0} tasks`);
						return json({
							tasks: data?.items,
							has_more: data?.has_more ?? false,
							page_token: data?.page_token
						});
					}
					case "patch": {
						log.info(`patch: task_guid=${p.task_guid}`);
						const updateData = {};
						if (p.summary) updateData.summary = p.summary;
						if (p.description !== void 0) updateData.description = p.description;
						if (p.due?.timestamp) {
							const dueTs = parseTimeToTimestampMs(p.due.timestamp);
							if (!dueTs) return json({
								error: "due 时间格式错误！必须使用ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'。",
								received: p.due.timestamp
							});
							updateData.due = {
								timestamp: dueTs,
								is_all_day: p.due.is_all_day ?? false
							};
						}
						if (p.start?.timestamp) {
							const startTs = parseTimeToTimestampMs(p.start.timestamp);
							if (!startTs) return json({
								error: "start 时间格式错误！必须使用ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'。",
								received: p.start.timestamp
							});
							updateData.start = {
								timestamp: startTs,
								is_all_day: p.start.is_all_day ?? false
							};
						}
						if (p.completed_at !== void 0) if (p.completed_at === "0") updateData.completed_at = "0";
						else if (/^\d+$/.test(p.completed_at)) updateData.completed_at = p.completed_at;
						else {
							const completedTs = parseTimeToTimestampMs(p.completed_at);
							if (!completedTs) return json({
								error: "completed_at 格式错误！支持：1) ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'；2) '0'（反完成）；3) 毫秒时间戳字符串。",
								received: p.completed_at
							});
							updateData.completed_at = completedTs;
						}
						if (p.members) updateData.members = p.members;
						if (p.repeat_rule) updateData.repeat_rule = p.repeat_rule;
						const updateFields = Object.keys(updateData);
						const res = await client.invoke("feishu_task_task.patch", (sdk, opts) => sdk.task.v2.task.patch({
							path: { task_guid: p.task_guid },
							data: {
								task: updateData,
								update_fields: updateFields
							},
							params: { user_id_type: p.user_id_type || "open_id" }
						}, opts), { as: "user" });
						assertLarkOk$2(res);
						log.info(`patch: task ${p.task_guid} updated`);
						return json({ task: res.data?.task });
					}
				}
			} catch (err) {
				return await handleInvokeErrorWithAutoAuth(err, cfg);
			}
		}
	}, { name: "feishu_task_task" });
}
//#endregion
//#region src/tools/oapi/task/tasklist.ts
const FeishuTaskTasklistSchema = Type.Union([
	Type.Object({
		action: Type.Literal("create"),
		name: Type.String({ description: "清单名称" }),
		members: Type.Optional(Type.Array(Type.Object({
			id: Type.String({ description: "成员 open_id" }),
			role: Type.Optional(StringEnum(["editor", "viewer"]))
		}), { description: "清单成员列表（editor=可编辑，viewer=可查看）。注意：创建人自动成为 owner，如在 members 中也指定创建人，该用户最终成为 owner 并从 members 中移除（同一用户只能有一个角色）" }))
	}),
	Type.Object({
		action: Type.Literal("get"),
		tasklist_guid: Type.String({ description: "清单 GUID" })
	}),
	Type.Object({
		action: Type.Literal("list"),
		page_size: Type.Optional(Type.Number({ description: "每页数量，默认 50，最大 100" })),
		page_token: Type.Optional(Type.String({ description: "分页标记" }))
	}),
	Type.Object({
		action: Type.Literal("tasks"),
		tasklist_guid: Type.String({ description: "清单 GUID" }),
		page_size: Type.Optional(Type.Number({ description: "每页数量，默认 50，最大 100" })),
		page_token: Type.Optional(Type.String({ description: "分页标记" })),
		completed: Type.Optional(Type.Boolean({ description: "是否只返回已完成的任务（默认返回所有）" }))
	}),
	Type.Object({
		action: Type.Literal("patch"),
		tasklist_guid: Type.String({ description: "清单 GUID" }),
		name: Type.Optional(Type.String({ description: "新的清单名称" }))
	}),
	Type.Object({
		action: Type.Literal("add_members"),
		tasklist_guid: Type.String({ description: "清单 GUID" }),
		members: Type.Array(Type.Object({
			id: Type.String({ description: "成员 open_id" }),
			role: Type.Optional(StringEnum(["editor", "viewer"]))
		}), { description: "要添加的成员列表" })
	})
]);
function registerFeishuTaskTasklistTool(api) {
	if (!api.config) return;
	const cfg = api.config;
	const { toolClient, log } = createToolContext(api, "feishu_task_tasklist");
	registerTool(api, {
		name: "feishu_task_tasklist",
		label: "Feishu Task Lists",
		description: "【以用户身份】飞书任务清单管理工具。当用户要求创建/查询/管理清单、查看清单内的任务时使用。Actions: create（创建清单）, get（获取清单详情）, list（列出所有可读取的清单，包括我创建的和他人共享给我的）, tasks（列出清单内的任务）, patch（更新清单）, add_members（添加成员）。",
		parameters: FeishuTaskTasklistSchema,
		async execute(_toolCallId, params) {
			const p = params;
			try {
				const client = toolClient();
				switch (p.action) {
					case "create": {
						log.info(`create: name=${p.name}, members_count=${p.members?.length ?? 0}`);
						const data = { name: p.name };
						if (p.members && p.members.length > 0) data.members = p.members.map((m) => ({
							id: m.id,
							type: "user",
							role: m.role || "editor"
						}));
						const res = await client.invoke("feishu_task_tasklist.create", (sdk, opts) => sdk.task.v2.tasklist.create({
							params: { user_id_type: "open_id" },
							data
						}, opts), { as: "user" });
						assertLarkOk$2(res);
						log.info(`create: created tasklist ${res.data?.tasklist?.guid}`);
						return json({ tasklist: res.data?.tasklist });
					}
					case "get": {
						log.info(`get: tasklist_guid=${p.tasklist_guid}`);
						const res = await client.invoke("feishu_task_tasklist.get", (sdk, opts) => sdk.task.v2.tasklist.get({
							path: { tasklist_guid: p.tasklist_guid },
							params: { user_id_type: "open_id" }
						}, opts), { as: "user" });
						assertLarkOk$2(res);
						log.info(`get: returned tasklist ${p.tasklist_guid}`);
						return json({ tasklist: res.data?.tasklist });
					}
					case "list": {
						log.info(`list: page_size=${p.page_size ?? 50}`);
						const res = await client.invoke("feishu_task_tasklist.list", (sdk, opts) => sdk.task.v2.tasklist.list({ params: {
							page_size: p.page_size,
							page_token: p.page_token,
							user_id_type: "open_id"
						} }, opts), { as: "user" });
						assertLarkOk$2(res);
						const data = res.data;
						log.info(`list: returned ${data?.items?.length ?? 0} tasklists`);
						return json({
							tasklists: data?.items,
							has_more: data?.has_more ?? false,
							page_token: data?.page_token
						});
					}
					case "tasks": {
						log.info(`tasks: tasklist_guid=${p.tasklist_guid}, completed=${p.completed ?? "all"}`);
						const res = await client.invoke("feishu_task_tasklist.tasks", (sdk, opts) => sdk.task.v2.tasklist.tasks({
							path: { tasklist_guid: p.tasklist_guid },
							params: {
								page_size: p.page_size,
								page_token: p.page_token,
								completed: p.completed,
								user_id_type: "open_id"
							}
						}, opts), { as: "user" });
						assertLarkOk$2(res);
						const data = res.data;
						log.info(`tasks: returned ${data?.items?.length ?? 0} tasks`);
						return json({
							tasks: data?.items,
							has_more: data?.has_more ?? false,
							page_token: data?.page_token
						});
					}
					case "patch": {
						log.info(`patch: tasklist_guid=${p.tasklist_guid}, name=${p.name}`);
						const tasklistData = {};
						const updateFields = [];
						if (p.name !== void 0) {
							tasklistData.name = p.name;
							updateFields.push("name");
						}
						if (updateFields.length === 0) return json({ error: "No fields to update" });
						const res = await client.invoke("feishu_task_tasklist.patch", (sdk, opts) => sdk.task.v2.tasklist.patch({
							path: { tasklist_guid: p.tasklist_guid },
							params: { user_id_type: "open_id" },
							data: {
								tasklist: tasklistData,
								update_fields: updateFields
							}
						}, opts), { as: "user" });
						assertLarkOk$2(res);
						log.info(`patch: updated tasklist ${p.tasklist_guid}`);
						return json({ tasklist: res.data?.tasklist });
					}
					case "add_members": {
						if (!p.members || p.members.length === 0) return json({ error: "members is required and cannot be empty" });
						log.info(`add_members: tasklist_guid=${p.tasklist_guid}, members_count=${p.members.length}`);
						const memberData = p.members.map((m) => ({
							id: m.id,
							type: "user",
							role: m.role || "editor"
						}));
						const res = await client.invoke("feishu_task_tasklist.add_members", (sdk, opts) => sdk.task.v2.tasklist.addMembers({
							path: { tasklist_guid: p.tasklist_guid },
							params: { user_id_type: "open_id" },
							data: { members: memberData }
						}, opts), { as: "user" });
						assertLarkOk$2(res);
						log.info(`add_members: added ${p.members.length} members to tasklist ${p.tasklist_guid}`);
						return json({ tasklist: res.data?.tasklist });
					}
				}
			} catch (err) {
				return await handleInvokeErrorWithAutoAuth(err, cfg);
			}
		}
	}, { name: "feishu_task_tasklist" });
}
//#endregion
//#region src/tools/oapi/task/comment.ts
const FeishuTaskCommentSchema = Type.Union([
	Type.Object({
		action: Type.Literal("create"),
		task_guid: Type.String({ description: "任务 GUID" }),
		content: Type.String({ description: "评论内容（纯文本，最长 3000 字符）" }),
		reply_to_comment_id: Type.Optional(Type.String({ description: "要回复的评论 ID（用于回复评论）" }))
	}),
	Type.Object({
		action: Type.Literal("list"),
		resource_id: Type.String({ description: "要获取评论的资源 ID（任务 GUID）" }),
		direction: Type.Optional(StringEnum(["asc", "desc"], { description: "排序方式（asc=从旧到新，desc=从新到旧，默认 asc）" })),
		page_size: Type.Optional(Type.Number({ description: "每页数量，默认 50，最大 100" })),
		page_token: Type.Optional(Type.String({ description: "分页标记" }))
	}),
	Type.Object({
		action: Type.Literal("get"),
		comment_id: Type.String({ description: "评论 ID" })
	})
]);
function registerFeishuTaskCommentTool(api) {
	if (!api.config) return;
	const cfg = api.config;
	const { toolClient, log } = createToolContext(api, "feishu_task_comment");
	registerTool(api, {
		name: "feishu_task_comment",
		label: "Feishu Task Comments",
		description: "【以用户身份】飞书任务评论管理工具。当用户要求添加/查询任务评论、回复评论时使用。Actions: create（添加评论）, list（列出任务的所有评论）, get（获取单个评论详情）。",
		parameters: FeishuTaskCommentSchema,
		async execute(_toolCallId, params) {
			const p = params;
			try {
				const client = toolClient();
				switch (p.action) {
					case "create": {
						log.info(`create: task_guid=${p.task_guid}, reply_to=${p.reply_to_comment_id ?? "none"}`);
						const data = {
							content: p.content,
							resource_type: "task",
							resource_id: p.task_guid
						};
						if (p.reply_to_comment_id) data.reply_to_comment_id = p.reply_to_comment_id;
						const res = await client.invoke("feishu_task_comment.create", (sdk, opts) => sdk.task.v2.comment.create({
							params: { user_id_type: "open_id" },
							data
						}, opts), { as: "user" });
						assertLarkOk$2(res);
						log.info(`create: created comment ${res.data?.comment?.id}`);
						return json({ comment: res.data?.comment });
					}
					case "list": {
						log.info(`list: resource_id=${p.resource_id}, direction=${p.direction ?? "asc"}, page_size=${p.page_size ?? 50}`);
						const res = await client.invoke("feishu_task_comment.list", (sdk, opts) => sdk.task.v2.comment.list({ params: {
							resource_type: "task",
							resource_id: p.resource_id,
							direction: p.direction,
							page_size: p.page_size,
							page_token: p.page_token,
							user_id_type: "open_id"
						} }, opts), { as: "user" });
						assertLarkOk$2(res);
						const data = res.data;
						log.info(`list: returned ${data?.items?.length ?? 0} comments`);
						return json({
							comments: data?.items,
							has_more: data?.has_more ?? false,
							page_token: data?.page_token
						});
					}
					case "get": {
						log.info(`get: comment_id=${p.comment_id}`);
						const res = await client.invoke("feishu_task_comment.get", (sdk, opts) => sdk.task.v2.comment.get({
							path: { comment_id: p.comment_id },
							params: { user_id_type: "open_id" }
						}, opts), { as: "user" });
						assertLarkOk$2(res);
						log.info(`get: returned comment ${p.comment_id}`);
						return json({ comment: res.data?.comment });
					}
				}
			} catch (err) {
				return await handleInvokeErrorWithAutoAuth(err, cfg);
			}
		}
	}, { name: "feishu_task_comment" });
}
//#endregion
//#region src/tools/oapi/task/subtask.ts
const FeishuTaskSubtaskSchema = Type.Union([Type.Object({
	action: Type.Literal("create"),
	task_guid: Type.String({ description: "父任务 GUID" }),
	summary: Type.String({ description: "子任务标题" }),
	description: Type.Optional(Type.String({ description: "子任务描述" })),
	due: Type.Optional(Type.Object({
		timestamp: Type.String({ description: "截止时间（ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'）" }),
		is_all_day: Type.Optional(Type.Boolean({ description: "是否为全天任务" }))
	})),
	start: Type.Optional(Type.Object({
		timestamp: Type.String({ description: "开始时间（ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'）" }),
		is_all_day: Type.Optional(Type.Boolean({ description: "是否为全天" }))
	})),
	members: Type.Optional(Type.Array(Type.Object({
		id: Type.String({ description: "成员 open_id" }),
		role: Type.Optional(StringEnum(["assignee", "follower"]))
	}), { description: "子任务成员列表（assignee=负责人，follower=关注人）" }))
}), Type.Object({
	action: Type.Literal("list"),
	task_guid: Type.String({ description: "父任务 GUID" }),
	page_size: Type.Optional(Type.Number({ description: "每页数量，默认 50，最大 100" })),
	page_token: Type.Optional(Type.String({ description: "分页标记" }))
})]);
function registerFeishuTaskSubtaskTool(api) {
	if (!api.config) return;
	const cfg = api.config;
	const { toolClient, log } = createToolContext(api, "feishu_task_subtask");
	registerTool(api, {
		name: "feishu_task_subtask",
		label: "Feishu Task Subtasks",
		description: "【以用户身份】飞书任务的子任务管理工具。当用户要求创建子任务、查询任务的子任务列表时使用。Actions: create（创建子任务）, list（列出任务的所有子任务）。",
		parameters: FeishuTaskSubtaskSchema,
		async execute(_toolCallId, params) {
			const p = params;
			try {
				const client = toolClient();
				switch (p.action) {
					case "create": {
						log.info(`create: task_guid=${p.task_guid}, summary=${p.summary}`);
						const data = { summary: p.summary };
						if (p.description) data.description = p.description;
						if (p.due) {
							const dueTs = parseTimeToTimestampMs(p.due.timestamp);
							if (!dueTs) return json({ error: `时间格式错误！due.timestamp 必须使用ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'，当前值：${p.due.timestamp}` });
							data.due = {
								timestamp: dueTs,
								is_all_day: p.due.is_all_day ?? false
							};
						}
						if (p.start) {
							const startTs = parseTimeToTimestampMs(p.start.timestamp);
							if (!startTs) return json({ error: `时间格式错误！start.timestamp 必须使用ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'，当前值：${p.start.timestamp}` });
							data.start = {
								timestamp: startTs,
								is_all_day: p.start.is_all_day ?? false
							};
						}
						if (p.members && p.members.length > 0) data.members = p.members.map((m) => ({
							id: m.id,
							type: "user",
							role: m.role || "assignee"
						}));
						const res = await client.invoke("feishu_task_subtask.create", (sdk, opts) => sdk.task.v2.taskSubtask.create({
							path: { task_guid: p.task_guid },
							params: { user_id_type: "open_id" },
							data
						}, opts), { as: "user" });
						assertLarkOk$2(res);
						log.info(`create: created subtask ${res.data?.subtask?.guid ?? "unknown"}`);
						return json({ subtask: res.data?.subtask });
					}
					case "list": {
						log.info(`list: task_guid=${p.task_guid}, page_size=${p.page_size ?? 50}`);
						const res = await client.invoke("feishu_task_subtask.list", (sdk, opts) => sdk.task.v2.taskSubtask.list({
							path: { task_guid: p.task_guid },
							params: {
								page_size: p.page_size,
								page_token: p.page_token,
								user_id_type: "open_id"
							}
						}, opts), { as: "user" });
						assertLarkOk$2(res);
						const data = res.data;
						log.info(`list: returned ${data?.items?.length ?? 0} subtasks`);
						return json({
							subtasks: data?.items,
							has_more: data?.has_more ?? false,
							page_token: data?.page_token
						});
					}
				}
			} catch (err) {
				return await handleInvokeErrorWithAutoAuth(err, cfg);
			}
		}
	}, { name: "feishu_task_subtask" });
}
//#endregion
//#region src/tools/oapi/bitable/app.ts
const FeishuBitableAppSchema = Type.Union([
	Type.Object({
		action: Type.Literal("create"),
		name: Type.String({ description: "多维表格名称" }),
		folder_token: Type.Optional(Type.String({ description: "所在文件夹 token（默认创建在我的空间）" }))
	}),
	Type.Object({
		action: Type.Literal("get"),
		app_token: Type.String({ description: "多维表格的唯一标识 token" })
	}),
	Type.Object({
		action: Type.Literal("list"),
		folder_token: Type.Optional(Type.String({ description: "文件夹 token（默认列出我的空间）" })),
		page_size: Type.Optional(Type.Number({ description: "每页数量，默认 50，最大 200" })),
		page_token: Type.Optional(Type.String({ description: "分页标记" }))
	}),
	Type.Object({
		action: Type.Literal("patch"),
		app_token: Type.String({ description: "多维表格 token" }),
		name: Type.Optional(Type.String({ description: "新的名称" })),
		is_advanced: Type.Optional(Type.Boolean({ description: "是否开启高级权限" }))
	}),
	Type.Object({
		action: Type.Literal("copy"),
		app_token: Type.String({ description: "源多维表格 token" }),
		name: Type.String({ description: "新的名称" }),
		folder_token: Type.Optional(Type.String({ description: "目标文件夹 token" }))
	})
]);
function registerFeishuBitableAppTool(api) {
	if (!api.config) return;
	const cfg = api.config;
	const { toolClient, log } = createToolContext(api, "feishu_bitable_app");
	registerTool(api, {
		name: "feishu_bitable_app",
		label: "Feishu Bitable Apps",
		description: "【以用户身份】飞书多维表格应用管理工具。当用户要求创建/查询/管理多维表格时使用。Actions: create（创建多维表格）, get（获取多维表格元数据）, list（列出多维表格）, patch（更新元数据）, delete（删除多维表格）, copy（复制多维表格）。",
		parameters: FeishuBitableAppSchema,
		async execute(_toolCallId, params) {
			const p = params;
			try {
				const client = toolClient();
				switch (p.action) {
					case "create": {
						log.info(`create: name=${p.name}, folder_token=${p.folder_token ?? "my_space"}`);
						const data = { name: p.name };
						if (p.folder_token) data.folder_token = p.folder_token;
						const res = await client.invoke("feishu_bitable_app.create", (sdk, opts) => sdk.bitable.app.create({ data }, opts), { as: "user" });
						assertLarkOk$2(res);
						log.info(`create: created app ${res.data?.app?.app_token}`);
						return json({ app: res.data?.app });
					}
					case "get": {
						log.info(`get: app_token=${p.app_token}`);
						const res = await client.invoke("feishu_bitable_app.get", (sdk, opts) => sdk.bitable.app.get({ path: { app_token: p.app_token } }, opts), { as: "user" });
						assertLarkOk$2(res);
						log.info(`get: returned app ${p.app_token}`);
						return json({ app: res.data?.app });
					}
					case "list": {
						log.info(`list: folder_token=${p.folder_token ?? "my_space"}, page_size=${p.page_size ?? 50}`);
						const res = await client.invoke("feishu_bitable_app.list", (sdk, opts) => sdk.drive.v1.file.list({ params: {
							folder_token: p.folder_token || "",
							page_size: p.page_size,
							page_token: p.page_token
						} }, opts), { as: "user" });
						assertLarkOk$2(res);
						const data = res.data;
						const bitables = data?.files?.filter((f) => f.type === "bitable") || [];
						log.info(`list: returned ${bitables.length} bitable apps`);
						return json({
							apps: bitables,
							has_more: data?.has_more ?? false,
							page_token: data?.page_token
						});
					}
					case "patch": {
						log.info(`patch: app_token=${p.app_token}, name=${p.name}, is_advanced=${p.is_advanced}`);
						const updateData = {};
						if (p.name !== void 0) updateData.name = p.name;
						if (p.is_advanced !== void 0) updateData.is_advanced = p.is_advanced;
						const res = await client.invoke("feishu_bitable_app.patch", (sdk, opts) => sdk.bitable.app.update({
							path: { app_token: p.app_token },
							data: updateData
						}, opts), { as: "user" });
						assertLarkOk$2(res);
						log.info(`patch: updated app ${p.app_token}`);
						return json({ app: res.data?.app });
					}
					case "copy": {
						log.info(`copy: app_token=${p.app_token}, name=${p.name}, folder_token=${p.folder_token ?? "my_space"}`);
						const data = { name: p.name };
						if (p.folder_token) data.folder_token = p.folder_token;
						const res = await client.invoke("feishu_bitable_app.copy", (sdk, opts) => sdk.bitable.app.copy({
							path: { app_token: p.app_token },
							data
						}, opts), { as: "user" });
						assertLarkOk$2(res);
						log.info(`copy: created copy ${res.data?.app?.app_token}`);
						return json({ app: res.data?.app });
					}
				}
			} catch (err) {
				return await handleInvokeErrorWithAutoAuth(err, cfg);
			}
		}
	}, { name: "feishu_bitable_app" });
}
//#endregion
//#region src/tools/oapi/bitable/app-table.ts
const FeishuBitableAppTableSchema = Type.Union([
	Type.Object({
		action: Type.Literal("create"),
		app_token: Type.String({ description: "多维表格 token" }),
		table: Type.Object({
			name: Type.String({ description: "数据表名称" }),
			default_view_name: Type.Optional(Type.String({ description: "默认视图名称" })),
			fields: Type.Optional(Type.Array(Type.Object({
				field_name: Type.String({ description: "字段名称" }),
				type: Type.Number({ description: "字段类型（1=文本，2=数字，3=单选，4=多选，5=日期，7=复选框，11=人员，13=电话，15=超链接，17=附件，1001=创建时间，1002=修改时间等）" }),
				property: Type.Optional(Type.Any({ description: "字段属性配置（根据类型而定）" }))
			}), { description: "字段列表（可选，但强烈建议在创建表时就传入所有字段，避免后续逐个添加）。不传则创建空表。" }))
		})
	}),
	Type.Object({
		action: Type.Literal("list"),
		app_token: Type.String({ description: "多维表格 token" }),
		page_size: Type.Optional(Type.Number({ description: "每页数量，默认 50，最大 100" })),
		page_token: Type.Optional(Type.String({ description: "分页标记" }))
	}),
	Type.Object({
		action: Type.Literal("patch"),
		app_token: Type.String({ description: "多维表格 token" }),
		table_id: Type.String({ description: "数据表 ID" }),
		name: Type.Optional(Type.String({ description: "新的表名" }))
	}),
	Type.Object({
		action: Type.Literal("batch_create"),
		app_token: Type.String({ description: "多维表格 token" }),
		tables: Type.Array(Type.Object({ name: Type.String({ description: "数据表名称" }) }), { description: "要批量创建的数据表列表" })
	})
]);
function registerFeishuBitableAppTableTool(api) {
	if (!api.config) return;
	const cfg = api.config;
	const { toolClient, log } = createToolContext(api, "feishu_bitable_app_table");
	registerTool(api, {
		name: "feishu_bitable_app_table",
		label: "Feishu Bitable Tables",
		description: "【以用户身份】飞书多维表格数据表管理工具。当用户要求创建/查询/管理数据表时使用。\n\nActions: create（创建数据表，可选择在创建时传入 fields 数组定义字段，或后续逐个添加）, list（列出所有数据表）, patch（更新数据表）, batch_create（批量创建）。\n\n【字段定义方式】支持两种模式：1) 明确需求时，在 create 中通过 table.fields 一次性定义所有字段（减少 API 调用）；2) 探索式场景时，使用默认表 + feishu_bitable_app_table_field 逐步修改字段（更稳定，易调整）。",
		parameters: FeishuBitableAppTableSchema,
		async execute(_toolCallId, params) {
			const p = params;
			try {
				const client = toolClient();
				switch (p.action) {
					case "create": {
						log.info(`create: app_token=${p.app_token}, table_name=${p.table.name}, fields_count=${p.table.fields?.length ?? 0}`);
						const tableData = { ...p.table };
						if (tableData.fields) tableData.fields = tableData.fields.map((field) => {
							if ((field.type === 7 || field.type === 15) && field.property !== void 0) {
								const fieldTypeName = field.type === 15 ? "URL" : "Checkbox";
								log.warn(`create: ${fieldTypeName} field (type=${field.type}, name="${field.field_name}") detected with property parameter. Removing property to avoid API error. ${fieldTypeName} fields must omit the property parameter entirely.`);
								const { property: _property, ...fieldWithoutProperty } = field;
								return fieldWithoutProperty;
							}
							return field;
						});
						const res = await client.invoke("feishu_bitable_app_table.create", (sdk, opts) => sdk.bitable.appTable.create({
							path: { app_token: p.app_token },
							data: { table: tableData }
						}, opts), { as: "user" });
						assertLarkOk$2(res);
						log.info(`create: created table ${res.data?.table_id}`);
						return json({
							table_id: res.data?.table_id,
							default_view_id: res.data?.default_view_id,
							field_id_list: res.data?.field_id_list
						});
					}
					case "list": {
						log.info(`list: app_token=${p.app_token}, page_size=${p.page_size ?? 50}`);
						const res = await client.invoke("feishu_bitable_app_table.list", (sdk, opts) => sdk.bitable.appTable.list({
							path: { app_token: p.app_token },
							params: {
								page_size: p.page_size,
								page_token: p.page_token
							}
						}, opts), { as: "user" });
						assertLarkOk$2(res);
						const data = res.data;
						log.info(`list: returned ${data?.items?.length ?? 0} tables`);
						return json({
							tables: data?.items,
							has_more: data?.has_more ?? false,
							page_token: data?.page_token
						});
					}
					case "patch": {
						log.info(`patch: app_token=${p.app_token}, table_id=${p.table_id}, name=${p.name}`);
						const res = await client.invoke("feishu_bitable_app_table.patch", (sdk, opts) => sdk.bitable.appTable.patch({
							path: {
								app_token: p.app_token,
								table_id: p.table_id
							},
							data: { name: p.name }
						}, opts), { as: "user" });
						assertLarkOk$2(res);
						log.info(`patch: updated table ${p.table_id}`);
						return json({ name: res.data?.name });
					}
					case "batch_create": {
						if (!p.tables || p.tables.length === 0) return json({ error: "tables is required and cannot be empty" });
						log.info(`batch_create: app_token=${p.app_token}, tables_count=${p.tables.length}`);
						const res = await client.invoke("feishu_bitable_app_table.batch_create", (sdk, opts) => sdk.bitable.appTable.batchCreate({
							path: { app_token: p.app_token },
							data: { tables: p.tables }
						}, opts), { as: "user" });
						assertLarkOk$2(res);
						log.info(`batch_create: created ${p.tables.length} tables in app ${p.app_token}`);
						return json({ table_ids: res.data?.table_ids });
					}
				}
			} catch (err) {
				return await handleInvokeErrorWithAutoAuth(err, cfg);
			}
		}
	}, { name: "feishu_bitable_app_table" });
}
//#endregion
//#region src/tools/oapi/bitable/app-table-record.ts
const FeishuBitableAppTableRecordSchema = Type.Union([
	Type.Object({
		action: Type.Literal("create"),
		app_token: Type.String({ description: "多维表格 token" }),
		table_id: Type.String({ description: "数据表 ID" }),
		fields: Type.Object({}, {
			additionalProperties: true,
			description: "记录字段（单条记录）。键为字段名，值根据字段类型而定：\n- 文本：string\n- 数字：number\n- 单选：string（选项名）\n- 多选：string[]（选项名数组）\n- 日期：number（毫秒时间戳，如 1740441600000）\n- 复选框：boolean\n- 人员：[{id: 'ou_xxx'}]\n- 附件：[{file_token: 'xxx'}]\n⚠️ 注意：create 只创建单条记录；批量创建请使用 batch_create"
		})
	}),
	Type.Object({
		action: Type.Literal("update"),
		app_token: Type.String({ description: "多维表格 token" }),
		table_id: Type.String({ description: "数据表 ID" }),
		record_id: Type.String({ description: "记录 ID" }),
		fields: Type.Object({}, {
			additionalProperties: true,
			description: "要更新的字段"
		})
	}),
	Type.Object({
		action: Type.Literal("delete"),
		app_token: Type.String({ description: "多维表格 token" }),
		table_id: Type.String({ description: "数据表 ID" }),
		record_id: Type.String({ description: "记录 ID" })
	}),
	Type.Object({
		action: Type.Literal("batch_create"),
		app_token: Type.String({ description: "多维表格 token" }),
		table_id: Type.String({ description: "数据表 ID" }),
		records: Type.Array(Type.Object({ fields: Type.Object({}, { additionalProperties: true }) }), { description: "要批量创建的记录列表（最多 500 条）" })
	}),
	Type.Object({
		action: Type.Literal("batch_update"),
		app_token: Type.String({ description: "多维表格 token" }),
		table_id: Type.String({ description: "数据表 ID" }),
		records: Type.Array(Type.Object({
			record_id: Type.String(),
			fields: Type.Object({}, { additionalProperties: true })
		}), { description: "要批量更新的记录列表（最多 500 条）" })
	}),
	Type.Object({
		action: Type.Literal("batch_delete"),
		app_token: Type.String({ description: "多维表格 token" }),
		table_id: Type.String({ description: "数据表 ID" }),
		record_ids: Type.Array(Type.String(), { description: "要删除的记录 ID 列表（最多 500 条）" })
	}),
	Type.Object({
		action: Type.Literal("list"),
		app_token: Type.String({ description: "多维表格 token" }),
		table_id: Type.String({ description: "数据表 ID" }),
		view_id: Type.Optional(Type.String({ description: "视图 ID（可选，建议指定以获得更好的性能）" })),
		field_names: Type.Optional(Type.Array(Type.String(), { description: "要返回的字段名列表（可选，不指定则返回所有字段）" })),
		filter: Type.Optional(Type.Object({
			conjunction: StringEnum(["and", "or"], { description: "条件逻辑：and（全部满足）or（任一满足）" }),
			conditions: Type.Array(Type.Object({
				field_name: Type.String({ description: "字段名" }),
				operator: StringEnum([
					"is",
					"isNot",
					"contains",
					"doesNotContain",
					"isEmpty",
					"isNotEmpty",
					"isGreater",
					"isGreaterEqual",
					"isLess",
					"isLessEqual"
				], { description: "运算符" }),
				value: Type.Optional(Type.Array(Type.String(), { description: "条件值（isEmpty/isNotEmpty 时可省略）" }))
			}), { description: "筛选条件列表" })
		}, { description: "筛选条件（必须是结构化对象）。示例：{conjunction: 'and', conditions: [{field_name: '文本', operator: 'is', value: ['测试']}]}" })),
		sort: Type.Optional(Type.Array(Type.Object({
			field_name: Type.String({ description: "排序字段名" }),
			desc: Type.Boolean({ description: "是否降序" })
		}), { description: "排序规则" })),
		automatic_fields: Type.Optional(Type.Boolean({ description: "是否返回自动字段（created_time, last_modified_time, created_by, last_modified_by），默认 false" })),
		page_size: Type.Optional(Type.Number({ description: "每页数量，默认 50，最大 500" })),
		page_token: Type.Optional(Type.String({ description: "分页标记" }))
	})
]);
function registerFeishuBitableAppTableRecordTool(api) {
	if (!api.config) return;
	const cfg = api.config;
	const { toolClient, log } = createToolContext(api, "feishu_bitable_app_table_record");
	registerTool(api, {
		name: "feishu_bitable_app_table_record",
		label: "Feishu Bitable Records",
		description: "【以用户身份】飞书多维表格记录（行）管理工具。当用户要求创建/查询/更新/删除记录、搜索数据时使用。\n\nActions:\n- create（创建单条记录，使用 fields 参数）\n- batch_create（批量创建记录，使用 records 数组参数）\n- list（列出/搜索记录）\n- update（更新记录）\n- delete（删除记录）\n- batch_update（批量更新）\n- batch_delete（批量删除）\n\n⚠️ 注意参数区别：\n- create 使用 'fields' 对象（单条）\n- batch_create 使用 'records' 数组（批量）",
		parameters: FeishuBitableAppTableRecordSchema,
		async execute(_toolCallId, params) {
			const p = params;
			try {
				const client = toolClient();
				switch (p.action) {
					case "create": {
						if (p.records) return json({
							error: "create action does not accept 'records' parameter",
							hint: "Use 'fields' for single record creation. For batch creation, use action: 'batch_create' with 'records' parameter.",
							correct_format: {
								action: "create",
								fields: { 字段名: "字段值" }
							},
							batch_create_format: {
								action: "batch_create",
								records: [{ fields: { 字段名: "字段值" } }]
							}
						});
						if (!p.fields || Object.keys(p.fields).length === 0) return json({
							error: "fields is required and cannot be empty",
							hint: "create action requires 'fields' parameter, e.g. { 'field_name': 'value', ... }"
						});
						log.info(`create: app_token=${p.app_token}, table_id=${p.table_id}`);
						const res = await client.invoke("feishu_bitable_app_table_record.create", (sdk, opts) => sdk.bitable.appTableRecord.create({
							path: {
								app_token: p.app_token,
								table_id: p.table_id
							},
							params: { user_id_type: "open_id" },
							data: { fields: p.fields }
						}, opts), { as: "user" });
						assertLarkOk$2(res);
						log.info(`create: created record ${res.data?.record?.record_id}`);
						return json({ record: res.data?.record });
					}
					case "update": {
						if (p.records) return json({
							error: "update action does not accept 'records' parameter",
							hint: "Use 'record_id' + 'fields' for single record update. For batch update, use action: 'batch_update' with 'records' parameter.",
							correct_format: {
								action: "update",
								record_id: "recXXX",
								fields: { 字段名: "字段值" }
							},
							batch_update_format: {
								action: "batch_update",
								records: [{
									record_id: "recXXX",
									fields: { 字段名: "字段值" }
								}]
							}
						});
						log.info(`update: app_token=${p.app_token}, table_id=${p.table_id}, record_id=${p.record_id}`);
						const res = await client.invoke("feishu_bitable_app_table_record.update", (sdk, opts) => sdk.bitable.appTableRecord.update({
							path: {
								app_token: p.app_token,
								table_id: p.table_id,
								record_id: p.record_id
							},
							params: { user_id_type: "open_id" },
							data: { fields: p.fields }
						}, opts), { as: "user" });
						assertLarkOk$2(res);
						log.info(`update: updated record ${p.record_id}`);
						return json({ record: res.data?.record });
					}
					case "delete":
						log.info(`delete: app_token=${p.app_token}, table_id=${p.table_id}, record_id=${p.record_id}`);
						assertLarkOk$2(await client.invoke("feishu_bitable_app_table_record.delete", (sdk, opts) => sdk.bitable.appTableRecord.delete({ path: {
							app_token: p.app_token,
							table_id: p.table_id,
							record_id: p.record_id
						} }, opts), { as: "user" }));
						log.info(`delete: deleted record ${p.record_id}`);
						return json({ success: true });
					case "batch_create": {
						if (p.fields) return json({
							error: "batch_create action does not accept 'fields' parameter",
							hint: "Use 'records' array for batch creation. For single record, use action: 'create' with 'fields' parameter.",
							correct_format: {
								action: "batch_create",
								records: [{ fields: { 字段名: "字段值" } }]
							},
							single_create_format: {
								action: "create",
								fields: { 字段名: "字段值" }
							}
						});
						if (!p.records || p.records.length === 0) return json({
							error: "records is required and cannot be empty",
							hint: "batch_create requires 'records' array, e.g. [{ fields: {...} }, ...]"
						});
						if (p.records.length > 500) return json({
							error: "records count exceeds limit (maximum 500)",
							received_count: p.records.length
						});
						log.info(`batch_create: app_token=${p.app_token}, table_id=${p.table_id}, records_count=${p.records.length}`);
						const res = await client.invoke("feishu_bitable_app_table_record.batch_create", (sdk, opts) => sdk.bitable.appTableRecord.batchCreate({
							path: {
								app_token: p.app_token,
								table_id: p.table_id
							},
							params: { user_id_type: "open_id" },
							data: { records: p.records }
						}, opts), { as: "user" });
						assertLarkOk$2(res);
						log.info(`batch_create: created ${p.records.length} records in table ${p.table_id}`);
						return json({ records: res.data?.records });
					}
					case "batch_update": {
						if (p.record_id || p.fields) return json({
							error: "batch_update action does not accept 'record_id' or 'fields' parameters",
							hint: "Use 'records' array for batch update. For single record, use action: 'update' with 'record_id' + 'fields' parameters.",
							correct_format: {
								action: "batch_update",
								records: [{
									record_id: "recXXX",
									fields: { 字段名: "字段值" }
								}]
							},
							single_update_format: {
								action: "update",
								record_id: "recXXX",
								fields: { 字段名: "字段值" }
							}
						});
						if (!p.records || p.records.length === 0) return json({
							error: "records is required and cannot be empty",
							hint: "batch_update requires 'records' array, e.g. [{ record_id: 'recXXX', fields: {...} }, ...]"
						});
						if (p.records.length > 500) return json({ error: "records cannot exceed 500 items" });
						log.info(`batch_update: app_token=${p.app_token}, table_id=${p.table_id}, records_count=${p.records.length}`);
						const res = await client.invoke("feishu_bitable_app_table_record.batch_update", (sdk, opts) => sdk.bitable.appTableRecord.batchUpdate({
							path: {
								app_token: p.app_token,
								table_id: p.table_id
							},
							params: { user_id_type: "open_id" },
							data: { records: p.records }
						}, opts), { as: "user" });
						assertLarkOk$2(res);
						log.info(`batch_update: updated ${p.records.length} records in table ${p.table_id}`);
						return json({ records: res.data?.records });
					}
					case "batch_delete":
						if (!p.record_ids || p.record_ids.length === 0) return json({ error: "record_ids is required and cannot be empty" });
						if (p.record_ids.length > 500) return json({ error: "record_ids cannot exceed 500 items" });
						log.info(`batch_delete: app_token=${p.app_token}, table_id=${p.table_id}, record_ids_count=${p.record_ids.length}`);
						assertLarkOk$2(await client.invoke("feishu_bitable_app_table_record.batch_delete", (sdk, opts) => sdk.bitable.appTableRecord.batchDelete({
							path: {
								app_token: p.app_token,
								table_id: p.table_id
							},
							data: { records: p.record_ids }
						}, opts), { as: "user" }));
						log.info(`batch_delete: deleted ${p.record_ids.length} records from table ${p.table_id}`);
						return json({ success: true });
					case "list": {
						log.info(`list: app_token=${p.app_token}, table_id=${p.table_id}, view_id=${p.view_id ?? "none"}, field_names=${p.field_names?.length ?? 0}, filter=${p.filter ? "yes" : "no"}`);
						const searchData = {};
						if (p.view_id !== void 0) searchData.view_id = p.view_id;
						if (p.field_names !== void 0) searchData.field_names = p.field_names;
						if (p.filter !== void 0) {
							const filter = { ...p.filter };
							if (filter.conditions) filter.conditions = filter.conditions.map((cond) => {
								if ((cond.operator === "isEmpty" || cond.operator === "isNotEmpty") && !cond.value) {
									log.warn(`list: ${cond.operator} operator detected without value. Auto-adding value=[] to avoid API error.`);
									return {
										...cond,
										value: []
									};
								}
								return cond;
							});
							searchData.filter = filter;
						}
						if (p.sort !== void 0) searchData.sort = p.sort;
						if (p.automatic_fields !== void 0) searchData.automatic_fields = p.automatic_fields;
						const res = await client.invoke("feishu_bitable_app_table_record.list", (sdk, opts) => sdk.bitable.appTableRecord.search({
							path: {
								app_token: p.app_token,
								table_id: p.table_id
							},
							params: {
								user_id_type: "open_id",
								page_size: p.page_size,
								page_token: p.page_token
							},
							data: searchData
						}, opts), { as: "user" });
						assertLarkOk$2(res);
						const data = res.data;
						log.info(`list: returned ${data?.items?.length ?? 0} records`);
						return json({
							records: data?.items,
							has_more: data?.has_more ?? false,
							page_token: data?.page_token,
							total: data?.total
						});
					}
					default: return json({ error: `Unknown action: ${p.action}` });
				}
			} catch (err) {
				return await handleInvokeErrorWithAutoAuth(err, cfg);
			}
		}
	}, { name: "feishu_bitable_app_table_record" });
}
//#endregion
//#region src/tools/oapi/bitable/app-table-field.ts
const FeishuBitableAppTableFieldSchema = Type.Union([
	Type.Object({
		action: Type.Literal("create"),
		app_token: Type.String({ description: "多维表格 token" }),
		table_id: Type.String({ description: "数据表 ID" }),
		field_name: Type.String({ description: "字段名称" }),
		type: Type.Number({ description: "字段类型（1=文本，2=数字，3=单选，4=多选，5=日期，7=复选框，11=人员，13=电话，15=超链接，17=附件，1001=创建时间，1002=修改时间等）" }),
		property: Type.Optional(Type.Any({ description: "字段属性配置（根据类型而定，例如单选/多选需要options，数字需要formatter等）。⚠️ 重要：超链接字段（type=15）必须完全省略此参数，传空对象 {} 也会报错（URLFieldPropertyError）。" }))
	}),
	Type.Object({
		action: Type.Literal("list"),
		app_token: Type.String({ description: "多维表格 token" }),
		table_id: Type.String({ description: "数据表 ID" }),
		view_id: Type.Optional(Type.String({ description: "视图 ID（可选）" })),
		page_size: Type.Optional(Type.Number({ description: "每页数量，默认 50，最大 100" })),
		page_token: Type.Optional(Type.String({ description: "分页标记" }))
	}),
	Type.Object({
		action: Type.Literal("update"),
		app_token: Type.String({ description: "多维表格 token" }),
		table_id: Type.String({ description: "数据表 ID" }),
		field_id: Type.String({ description: "字段 ID" }),
		field_name: Type.Optional(Type.String({ description: "字段名（可选，不传则不修改）" })),
		type: Type.Optional(Type.Number({ description: "字段类型（可选，不传则自动查询）：1=文本, 2=数字, 3=单选, 4=多选, 5=日期, 7=复选框, 11=人员, 13=电话, 15=超链接, 17=附件等" })),
		property: Type.Optional(Type.Any({ description: "字段属性配置（可选，不传则自动查询）" }))
	}),
	Type.Object({
		action: Type.Literal("delete"),
		app_token: Type.String({ description: "多维表格 token" }),
		table_id: Type.String({ description: "数据表 ID" }),
		field_id: Type.String({ description: "字段 ID" })
	})
]);
function registerFeishuBitableAppTableFieldTool(api) {
	if (!api.config) return;
	const cfg = api.config;
	const { toolClient, log } = createToolContext(api, "feishu_bitable_app_table_field");
	registerTool(api, {
		name: "feishu_bitable_app_table_field",
		label: "Feishu Bitable Fields",
		description: "【以用户身份】飞书多维表格字段（列）管理工具。当用户要求创建/查询/更新/删除字段、调整表结构时使用。Actions: create（创建字段）, list（列出所有字段）, update（更新字段，支持只传 field_name 改名）, delete（删除字段）。",
		parameters: FeishuBitableAppTableFieldSchema,
		async execute(_toolCallId, params) {
			const p = params;
			try {
				const client = toolClient();
				switch (p.action) {
					case "create": {
						log.info(`create: app_token=${p.app_token}, table_id=${p.table_id}, field_name=${p.field_name}, type=${p.type}`);
						let propertyToSend = p.property;
						if ((p.type === 15 || p.type === 7) && p.property !== void 0) {
							const fieldTypeName = p.type === 15 ? "URL" : "Checkbox";
							log.warn(`create: ${fieldTypeName} field (type=${p.type}) detected with property parameter. Removing property to avoid API error. ${fieldTypeName} fields must omit the property parameter entirely.`);
							propertyToSend = void 0;
						}
						const res = await client.invoke("feishu_bitable_app_table_field.create", (sdk, opts) => sdk.bitable.appTableField.create({
							path: {
								app_token: p.app_token,
								table_id: p.table_id
							},
							data: {
								field_name: p.field_name,
								type: p.type,
								property: propertyToSend
							}
						}, opts), { as: "user" });
						assertLarkOk$2(res);
						const data = res.data;
						log.info(`create: created field ${data?.field?.field_id ?? "unknown"}`);
						return json({ field: data?.field ?? res.data });
					}
					case "list": {
						log.info(`list: app_token=${p.app_token}, table_id=${p.table_id}, view_id=${p.view_id ?? "none"}`);
						const res = await client.invoke("feishu_bitable_app_table_field.list", (sdk, opts) => sdk.bitable.appTableField.list({
							path: {
								app_token: p.app_token,
								table_id: p.table_id
							},
							params: {
								view_id: p.view_id,
								page_size: p.page_size,
								page_token: p.page_token
							}
						}, opts), { as: "user" });
						assertLarkOk$2(res);
						const data = res.data;
						log.info(`list: returned ${data?.items?.length ?? 0} fields`);
						return json({
							fields: data?.items,
							has_more: data?.has_more ?? false,
							page_token: data?.page_token
						});
					}
					case "update": {
						log.info(`update: app_token=${p.app_token}, table_id=${p.table_id}, field_id=${p.field_id}`);
						let finalFieldName = p.field_name;
						let finalType = p.type;
						let finalProperty = p.property;
						if (!finalType || !finalFieldName) {
							log.info(`update: missing type or field_name, auto-querying field info`);
							const listRes = await client.invoke("feishu_bitable_app_table_field.update", (sdk, opts) => sdk.bitable.appTableField.list({
								path: {
									app_token: p.app_token,
									table_id: p.table_id
								},
								params: { page_size: 500 }
							}, opts), { as: "user" });
							assertLarkOk$2(listRes);
							const currentField = listRes.data?.items?.find((f) => f.field_id === p.field_id);
							if (!currentField) return json({
								error: `field ${p.field_id} does not exist`,
								hint: "Please verify field_id is correct. Use list action to view all fields."
							});
							finalFieldName = p.field_name || currentField.field_name;
							finalType = p.type ?? currentField.type;
							finalProperty = p.property !== void 0 ? p.property : currentField.property;
							log.info(`update: auto-filled type=${finalType}, field_name=${finalFieldName}`);
						}
						const updateData = {
							field_name: finalFieldName,
							type: finalType
						};
						if (finalProperty !== void 0) updateData.property = finalProperty;
						const res = await client.invoke("feishu_bitable_app_table_field.update", (sdk, opts) => sdk.bitable.appTableField.update({
							path: {
								app_token: p.app_token,
								table_id: p.table_id,
								field_id: p.field_id
							},
							data: updateData
						}, opts), { as: "user" });
						assertLarkOk$2(res);
						log.info(`update: updated field ${p.field_id}`);
						const updateData2 = res.data;
						return json({ field: updateData2?.field ?? res.data });
					}
					case "delete":
						log.info(`delete: app_token=${p.app_token}, table_id=${p.table_id}, field_id=${p.field_id}`);
						assertLarkOk$2(await client.invoke("feishu_bitable_app_table_field.delete", (sdk, opts) => sdk.bitable.appTableField.delete({ path: {
							app_token: p.app_token,
							table_id: p.table_id,
							field_id: p.field_id
						} }, opts), { as: "user" }));
						log.info(`delete: deleted field ${p.field_id}`);
						return json({ success: true });
				}
			} catch (err) {
				return await handleInvokeErrorWithAutoAuth(err, cfg);
			}
		}
	}, { name: "feishu_bitable_app_table_field" });
}
//#endregion
//#region src/tools/oapi/bitable/app-table-view.ts
const FeishuBitableAppTableViewSchema = Type.Union([
	Type.Object({
		action: Type.Literal("create"),
		app_token: Type.String({ description: "多维表格 token" }),
		table_id: Type.String({ description: "数据表 ID" }),
		view_name: Type.String({ description: "视图名称" }),
		view_type: Type.Optional(Type.Union([
			Type.Literal("grid"),
			Type.Literal("kanban"),
			Type.Literal("gallery"),
			Type.Literal("gantt"),
			Type.Literal("form")
		]))
	}),
	Type.Object({
		action: Type.Literal("get"),
		app_token: Type.String({ description: "多维表格 token" }),
		table_id: Type.String({ description: "数据表 ID" }),
		view_id: Type.String({ description: "视图 ID" })
	}),
	Type.Object({
		action: Type.Literal("list"),
		app_token: Type.String({ description: "多维表格 token" }),
		table_id: Type.String({ description: "数据表 ID" }),
		page_size: Type.Optional(Type.Number({ description: "每页数量，默认 50，最大 100" })),
		page_token: Type.Optional(Type.String({ description: "分页标记" }))
	}),
	Type.Object({
		action: Type.Literal("patch"),
		app_token: Type.String({ description: "多维表格 token" }),
		table_id: Type.String({ description: "数据表 ID" }),
		view_id: Type.String({ description: "视图 ID" }),
		view_name: Type.Optional(Type.String({ description: "新的视图名称" }))
	})
]);
function registerFeishuBitableAppTableViewTool(api) {
	if (!api.config) return;
	const cfg = api.config;
	const { toolClient, log } = createToolContext(api, "feishu_bitable_app_table_view");
	registerTool(api, {
		name: "feishu_bitable_app_table_view",
		label: "Feishu Bitable Views",
		description: "【以用户身份】飞书多维表格视图管理工具。当用户要求创建/查询/更新视图、切换展示方式时使用。Actions: create（创建视图）, get（获取视图详情）, list（列出所有视图）, patch（更新视图）。",
		parameters: FeishuBitableAppTableViewSchema,
		async execute(_toolCallId, params) {
			const p = params;
			try {
				const client = toolClient();
				switch (p.action) {
					case "create": {
						log.info(`create: app_token=${p.app_token}, table_id=${p.table_id}, view_name=${p.view_name}, view_type=${p.view_type ?? "grid"}`);
						const res = await client.invoke("feishu_bitable_app_table_view.create", (sdk, opts) => sdk.bitable.appTableView.create({
							path: {
								app_token: p.app_token,
								table_id: p.table_id
							},
							data: {
								view_name: p.view_name,
								view_type: p.view_type || "grid"
							}
						}, opts), { as: "user" });
						assertLarkOk$2(res);
						log.info(`create: created view ${res.data?.view?.view_id}`);
						return json({ view: res.data?.view });
					}
					case "get": {
						log.info(`get: app_token=${p.app_token}, table_id=${p.table_id}, view_id=${p.view_id}`);
						const res = await client.invoke("feishu_bitable_app_table_view.get", (sdk, opts) => sdk.bitable.appTableView.get({ path: {
							app_token: p.app_token,
							table_id: p.table_id,
							view_id: p.view_id
						} }, opts), { as: "user" });
						assertLarkOk$2(res);
						log.info(`get: returned view ${p.view_id}`);
						return json({ view: res.data?.view });
					}
					case "list": {
						log.info(`list: app_token=${p.app_token}, table_id=${p.table_id}`);
						const res = await client.invoke("feishu_bitable_app_table_view.list", (sdk, opts) => sdk.bitable.appTableView.list({
							path: {
								app_token: p.app_token,
								table_id: p.table_id
							},
							params: {
								page_size: p.page_size,
								page_token: p.page_token
							}
						}, opts), { as: "user" });
						assertLarkOk$2(res);
						const data = res.data;
						log.info(`list: returned ${data?.items?.length ?? 0} views`);
						return json({
							views: data?.items,
							has_more: data?.has_more ?? false,
							page_token: data?.page_token
						});
					}
					case "patch": {
						log.info(`patch: app_token=${p.app_token}, table_id=${p.table_id}, view_id=${p.view_id}, view_name=${p.view_name}`);
						const res = await client.invoke("feishu_bitable_app_table_view.patch", (sdk, opts) => sdk.bitable.appTableView.patch({
							path: {
								app_token: p.app_token,
								table_id: p.table_id,
								view_id: p.view_id
							},
							data: { view_name: p.view_name }
						}, opts), { as: "user" });
						assertLarkOk$2(res);
						log.info(`patch: updated view ${p.view_id}`);
						return json({ view: res.data?.view });
					}
				}
			} catch (err) {
				return await handleInvokeErrorWithAutoAuth(err, cfg);
			}
		}
	}, { name: "feishu_bitable_app_table_view" });
}
//#endregion
//#region src/tools/oapi/common/get-user.ts
const GetUserSchema = Type.Object({
	user_id: Type.Optional(Type.String({ description: "用户 ID（格式如 ou_xxx）。若不传入，则获取当前用户自己的信息" })),
	user_id_type: Type.Optional(StringEnum([
		"open_id",
		"union_id",
		"user_id"
	]))
});
function registerGetUserTool(api) {
	if (!api.config) return;
	const cfg = api.config;
	const { toolClient, log } = createToolContext(api, "feishu_get_user");
	registerTool(api, {
		name: "feishu_get_user",
		label: "Feishu: Get User Info",
		description: "获取用户信息。不传 user_id 时获取当前用户自己的信息；传 user_id 时获取指定用户的信息。返回用户姓名、头像、邮箱、手机号、部门等信息。",
		parameters: GetUserSchema,
		async execute(_toolCallId, params) {
			const p = params;
			try {
				const client = toolClient();
				if (!p.user_id) {
					log.info("get_user: fetching current user info");
					try {
						const res = await client.invoke("feishu_get_user.default", (sdk, opts) => sdk.authen.userInfo.get({}, opts), { as: "user" });
						assertLarkOk$2(res);
						log.info("get_user: current user fetched successfully");
						return json({ user: res.data });
					} catch (invokeErr) {
						if (invokeErr && typeof invokeErr === "object") {
							if (invokeErr.response?.data?.code === 41050) return json({ error: "无权限查询该用户信息。\n\n说明：使用用户身份调用通讯录 API 时，可操作的权限范围不受应用的通讯录权限范围影响，而是受当前用户的组织架构可见范围影响。该范围限制了用户在企业内可见的组织架构数据范围。" });
						}
						throw invokeErr;
					}
				}
				log.info(`get_user: fetching user ${p.user_id}`);
				const userIdType = p.user_id_type || "open_id";
				try {
					const res = await client.invoke("feishu_get_user.default", (sdk, opts) => sdk.contact.v3.user.get({
						path: { user_id: p.user_id },
						params: { user_id_type: userIdType }
					}, opts), { as: "user" });
					assertLarkOk$2(res);
					log.info(`get_user: user ${p.user_id} fetched successfully`);
					return json({ user: res.data?.user });
				} catch (invokeErr) {
					if (invokeErr && typeof invokeErr === "object") {
						if (invokeErr.response?.data?.code === 41050) return json({ error: "无权限查询该用户信息。\n\n说明：使用用户身份调用通讯录 API 时，可操作的权限范围不受应用的通讯录权限范围影响，而是受当前用户的组织架构可见范围影响。该范围限制了用户在企业内可见的组织架构数据范围。\n\n建议：请联系管理员调整当前用户的组织架构可见范围，或使用应用身份（tenant_access_token）调用 API。" });
					}
					throw invokeErr;
				}
			} catch (err) {
				return await handleInvokeErrorWithAutoAuth(err, cfg);
			}
		}
	}, { name: "feishu_get_user" });
}
//#endregion
//#region src/tools/oapi/common/search-user.ts
const SearchUserSchema = Type.Object({
	query: Type.String({ description: "搜索关键词，用于匹配用户名（必填）" }),
	page_size: Type.Optional(Type.Integer({
		description: "分页大小，控制每次返回的用户数量（默认20，最大200）",
		minimum: 1,
		maximum: 200
	})),
	page_token: Type.Optional(Type.String({ description: "分页标识。首次请求无需填写；当返回结果中包含 page_token 时，可传入该值继续请求下一页" }))
});
function registerSearchUserTool(api) {
	if (!api.config) return;
	const cfg = api.config;
	const { toolClient, log } = createToolContext(api, "feishu_search_user");
	registerTool(api, {
		name: "feishu_search_user",
		label: "Feishu: Search User",
		description: "搜索员工信息（通过关键词搜索姓名、手机号、邮箱）。返回匹配的员工列表，包含姓名、部门、open_id 等信息。",
		parameters: SearchUserSchema,
		async execute(_toolCallId, params) {
			const p = params;
			try {
				const client = toolClient();
				log.info(`search_user: query="${p.query}", page_size=${p.page_size ?? 20}`);
				const requestQuery = {
					query: p.query,
					page_size: String(p.page_size ?? 20)
				};
				if (p.page_token) requestQuery.page_token = p.page_token;
				const res = await client.invokeByPath("feishu_search_user.default", "/open-apis/search/v1/user", {
					method: "GET",
					query: requestQuery,
					as: "user"
				});
				assertLarkOk$2(res);
				const data = res.data;
				const users = data?.users ?? [];
				const userCount = users.length;
				log.info(`search_user: found ${userCount} users`);
				return json({
					users,
					has_more: data?.has_more ?? false,
					page_token: data?.page_token
				});
			} catch (err) {
				return await handleInvokeErrorWithAutoAuth(err, cfg);
			}
		}
	}, { name: "feishu_search_user" });
}
//#endregion
//#region src/tools/oapi/search/doc-search.ts
const TimeRangeSchema = Type.Object({
	start: Type.Optional(Type.String({ description: "时间范围的起始时间，ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'" })),
	end: Type.Optional(Type.String({ description: "时间范围的截止时间，ISO 8601 / RFC 3339 格式（包含时区），例如 '2024-01-01T00:00:00+08:00'" }))
});
const DocTypeEnum = StringEnum([
	"DOC",
	"SHEET",
	"BITABLE",
	"MINDNOTE",
	"FILE",
	"WIKI",
	"DOCX",
	"FOLDER",
	"CATALOG",
	"SLIDES",
	"SHORTCUT"
]);
const SortTypeEnum = StringEnum([
	"DEFAULT_TYPE",
	"OPEN_TIME",
	"EDIT_TIME",
	"EDIT_TIME_ASC",
	"CREATE_TIME"
], { description: "排序方式。EDIT_TIME=编辑时间降序（最新文档在前，推荐），EDIT_TIME_ASC=编辑时间升序，CREATE_TIME=按文档创建时间排序，OPEN_TIME=打开时间，DEFAULT_TYPE=默认排序" });
const FeishuSearchDocWikiSchema = Type.Object({
	action: Type.Literal("search"),
	query: Type.Optional(Type.String({
		description: "搜索关键词（可选）。不传或传空字符串表示空搜，也可以支持排序规则与筛选，默认根据最近浏览时间返回结果",
		maxLength: 50
	})),
	filter: Type.Optional(Type.Object({
		creator_ids: Type.Optional(Type.Array(Type.String(), {
			description: "创建者 OpenID 列表（最多 20 个）",
			maxItems: 20
		})),
		doc_types: Type.Optional(Type.Array(DocTypeEnum, {
			description: "文档类型列表：DOC（文档）、SHEET（表格）、BITABLE（多维表格）、MINDNOTE（思维导图）、FILE（文件）、WIKI（维基）、DOCX（新版文档）、FOLDER（space文件夹）、CATALOG（wiki2.0文件夹）、SLIDES（新版幻灯片）、SHORTCUT（快捷方式）",
			maxItems: 10
		})),
		only_title: Type.Optional(Type.Boolean({ description: "仅搜索标题（默认 false，搜索标题和正文）" })),
		open_time: Type.Optional(TimeRangeSchema),
		sort_type: Type.Optional(SortTypeEnum),
		create_time: Type.Optional(TimeRangeSchema)
	}, { description: "搜索过滤条件（可选）。不传则搜索所有文档和 Wiki；传了则同时对文档和 Wiki 应用相同的过滤条件。" })),
	page_token: Type.Optional(Type.String({ description: "分页标记。首次请求不填；当返回结果中 has_more 为 true 时，可传入返回的 page_token 继续请求下一页" })),
	page_size: Type.Optional(Type.Integer({
		description: "分页大小（默认 15，最大 20）",
		minimum: 0,
		maximum: 20
	}))
});
function normalizeSearchResultTimeFields(value, converted) {
	if (Array.isArray(value)) return value.map((item) => normalizeSearchResultTimeFields(item, converted));
	if (!value || typeof value !== "object") return value;
	const source = value;
	const normalized = {};
	for (const [key, item] of Object.entries(source)) {
		if (key.endsWith("_time")) {
			const iso = unixTimestampToISO8601(item);
			if (iso) {
				normalized[key] = iso;
				converted.count += 1;
				continue;
			}
		}
		normalized[key] = normalizeSearchResultTimeFields(item, converted);
	}
	return normalized;
}
function registerFeishuSearchDocWikiTool(api) {
	if (!api.config) return false;
	const cfg = api.config;
	const { toolClient, log } = createToolContext(api, "feishu_search_doc_wiki");
	return registerTool(api, {
		name: "feishu_search_doc_wiki",
		label: "Feishu Document & Wiki Search",
		description: "【以用户身份】飞书文档与 Wiki 统一搜索工具。同时搜索云空间文档和知识库 Wiki。Actions: search。【重要】query 参数是搜索关键词（必填），filter 参数可选。【重要】filter 不传时，搜索所有文档和 Wiki；传了则同时对文档和 Wiki 应用相同的过滤条件。【重要】支持按文档类型、创建者、创建时间、打开时间等多维度筛选。【重要】返回结果包含标题和摘要高亮（<h>标签包裹匹配关键词）。",
		parameters: FeishuSearchDocWikiSchema,
		async execute(_toolCallId, params) {
			const p = params;
			try {
				const client = toolClient();
				switch (p.action) {
					case "search": {
						const query = p.query ?? "";
						log.info(`search: query="${query}", has_filter=${!!p.filter}, page_size=${p.page_size ?? 15}`);
						const requestData = {
							query,
							page_size: p.page_size,
							page_token: p.page_token
						};
						if (p.filter) {
							const filter = { ...p.filter };
							if (filter.open_time) filter.open_time = convertTimeRange(filter.open_time);
							if (filter.create_time) filter.create_time = convertTimeRange(filter.create_time);
							requestData.doc_filter = { ...filter };
							requestData.wiki_filter = { ...filter };
							log.info(`search: applying filter to both doc and wiki: doc_types=${filter.doc_types?.join(",") || "all"}, only_title=${filter.only_title ?? false}`);
						} else {
							requestData.doc_filter = {};
							requestData.wiki_filter = {};
							log.info(`search: no filter provided, using empty filters (required by API)`);
						}
						const res = await client.invoke("feishu_search_doc_wiki.search", async (sdk, _opts, uat) => {
							return sdk.request({
								method: "POST",
								url: "/open-apis/search/v2/doc_wiki/search",
								data: requestData,
								headers: {
									Authorization: `Bearer ${uat}`,
									"Content-Type": "application/json; charset=utf-8"
								}
							}, _opts);
						}, { as: "user" });
						if (res.code !== 0) throw new Error(`API Error: code=${res.code}, msg=${res.msg}`);
						const data = res.data || {};
						log.info(`search: found ${data.res_units?.length ?? 0} results, total=${data.total ?? 0}, has_more=${data.has_more ?? false}`);
						const converted = { count: 0 };
						const normalizedResults = normalizeSearchResultTimeFields(data.res_units, converted);
						log.info(`search: normalized ${converted.count} timestamp fields to ISO8601`);
						return json({
							total: data.total,
							has_more: data.has_more,
							results: normalizedResults,
							page_token: data.page_token
						});
					}
				}
			} catch (err) {
				return await handleInvokeErrorWithAutoAuth(err, cfg);
			}
		}
	}, { name: "feishu_search_doc_wiki" });
}
//#endregion
//#region src/tools/oapi/search/index.ts
/**
* 注册所有 Search 工具
*/
function registerFeishuSearchTools(api) {
	if (!api.config) {
		api.logger.debug?.("feishu_search: No config available, skipping");
		return;
	}
	const accounts = getEnabledLarkAccounts(api.config);
	if (accounts.length === 0) {
		api.logger.debug?.("feishu_search: No Feishu accounts configured, skipping");
		return;
	}
	if (!resolveAnyEnabledToolsConfig(accounts).doc) {
		api.logger.debug?.("feishu_search: search tool disabled in all accounts (controlled by doc config)");
		return;
	}
	if (registerFeishuSearchDocWikiTool(api)) api.logger.info?.("feishu_search: Registered feishu_search_doc_wiki");
}
//#endregion
//#region src/tools/oapi/drive/file.ts
const SMALL_FILE_THRESHOLD = 15 * 1024 * 1024;
const FeishuDriveFileSchema = Type.Union([
	Type.Object({
		action: Type.Literal("list"),
		folder_token: Type.Optional(Type.String({ description: "文件夹 token（可选）。不填写或填空字符串时，获取用户云空间根目录下的清单（注意：根目录模式不支持分页和返回快捷方式）" })),
		page_size: Type.Optional(Type.Integer({
			description: "分页大小（默认 200，最大 200）",
			minimum: 1,
			maximum: 200
		})),
		page_token: Type.Optional(Type.String({ description: "分页标记。首次请求无需填写" })),
		order_by: Type.Optional(StringEnum(["EditedTime", "CreatedTime"], { description: "排序方式：EditedTime（编辑时间）、CreatedTime（创建时间）" })),
		direction: Type.Optional(StringEnum(["ASC", "DESC"], { description: "排序方向：ASC（升序）、DESC（降序）" }))
	}),
	Type.Object({
		action: Type.Literal("get_meta"),
		request_docs: Type.Array(Type.Object({
			doc_token: Type.String({ description: "文档 token（从浏览器 URL 中获取，如 spreadsheet_token、doc_token 等）" }),
			doc_type: Type.Union([
				Type.Literal("doc"),
				Type.Literal("sheet"),
				Type.Literal("file"),
				Type.Literal("bitable"),
				Type.Literal("docx"),
				Type.Literal("folder"),
				Type.Literal("mindnote"),
				Type.Literal("slides")
			], { description: "文档类型：doc、sheet、file、bitable、docx、folder、mindnote、slides" })
		}), {
			description: "要查询的文档列表（批量查询，最多 50 个）。示例：[{doc_token: 'Z1FjxxxxxxxxxxxxxxxxxxxtnAc', doc_type: 'sheet'}]",
			minItems: 1,
			maxItems: 50
		})
	}),
	Type.Object({
		action: Type.Literal("copy"),
		file_token: Type.String({ description: "文件 token（必填）" }),
		name: Type.String({ description: "目标文件名（必填）" }),
		type: Type.Union([
			Type.Literal("doc"),
			Type.Literal("sheet"),
			Type.Literal("file"),
			Type.Literal("bitable"),
			Type.Literal("docx"),
			Type.Literal("folder"),
			Type.Literal("mindnote"),
			Type.Literal("slides")
		], { description: "文档类型（必填）" }),
		folder_token: Type.Optional(Type.String({ description: "目标文件夹 token。不传则复制到「我的空间」根目录" })),
		parent_node: Type.Optional(Type.String({ description: "【folder_token 的别名】目标文件夹 token（为兼容性保留，建议使用 folder_token）" }))
	}),
	Type.Object({
		action: Type.Literal("move"),
		file_token: Type.String({ description: "文件 token（必填）" }),
		type: Type.Union([
			Type.Literal("doc"),
			Type.Literal("sheet"),
			Type.Literal("file"),
			Type.Literal("bitable"),
			Type.Literal("docx"),
			Type.Literal("folder"),
			Type.Literal("mindnote"),
			Type.Literal("slides")
		], { description: "文档类型（必填）" }),
		folder_token: Type.String({ description: "目标文件夹 token（必填）" })
	}),
	Type.Object({
		action: Type.Literal("delete"),
		file_token: Type.String({ description: "文件 token（必填）" }),
		type: Type.Union([
			Type.Literal("doc"),
			Type.Literal("sheet"),
			Type.Literal("file"),
			Type.Literal("bitable"),
			Type.Literal("docx"),
			Type.Literal("folder"),
			Type.Literal("mindnote"),
			Type.Literal("slides")
		], { description: "文档类型（必填）" })
	}),
	Type.Object({
		action: Type.Literal("upload"),
		parent_node: Type.Optional(Type.String({ description: "父节点 token（可选）。explorer 类型填文件夹 token，bitable 类型填 app_token。不填写或填空字符串时，上传到云空间根目录" })),
		file_path: Type.Optional(Type.String({ description: "本地文件路径（与 file_content_base64 二选一）。优先使用此参数，会自动读取文件内容、计算大小、提取文件名。" })),
		file_content_base64: Type.Optional(Type.String({ description: "文件内容的 Base64 编码（与 file_path 二选一）。当不提供 file_path 时使用。" })),
		file_name: Type.Optional(Type.String({ description: "文件名（可选）。如果提供了 file_path，会自动从路径中提取文件名；如果使用 file_content_base64，则必须提供此参数。" })),
		size: Type.Optional(Type.Integer({ description: "文件大小（字节，可选）。如果提供了 file_path，会自动计算；如果使用 file_content_base64，则必须提供此参数。" }))
	}),
	Type.Object({
		action: Type.Literal("download"),
		file_token: Type.String({ description: "文件 token（必填）" }),
		output_path: Type.Optional(Type.String({ description: "本地保存的完整文件路径（可选）。必须包含文件名和扩展名，例如 '/tmp/file.pdf'。如果不提供，则返回 Base64 编码的文件内容。" }))
	})
]);
function registerFeishuDriveFileTool(api) {
	if (!api.config) return false;
	const cfg = api.config;
	const { toolClient, log } = createToolContext(api, "feishu_drive_file");
	return registerTool(api, {
		name: "feishu_drive_file",
		label: "Feishu Drive Files",
		description: "【以用户身份】飞书云空间文件管理工具。当用户要求查看云空间(云盘)中的文件列表、获取文件信息、复制/移动/删除文件、上传/下载文件时使用。消息中的文件读写**禁止**使用该工具!\n\nActions:\n- list（列出文件）：列出文件夹下的文件。不提供 folder_token 时获取根目录清单\n- get_meta（批量获取元数据）：批量查询文档元信息，使用 request_docs 数组参数，格式：[{doc_token: '...', doc_type: 'sheet'}]\n- copy（复制文件）：复制文件到指定位置\n- move（移动文件）：移动文件到指定文件夹\n- delete（删除文件）：删除文件\n- upload（上传文件）：上传本地文件到云空间。提供 file_path（本地文件路径）或 file_content_base64（Base64 编码）\n- download（下载文件）：下载文件到本地。提供 output_path（本地保存路径）则保存到本地，否则返回 Base64 编码\n\n【重要】copy/move/delete 操作需要 file_token 和 type 参数。get_meta 使用 request_docs 数组参数。\n【重要】upload 优先使用 file_path（自动读取文件、提取文件名和大小），也支持 file_content_base64（需手动提供 file_name 和 size）。\n【重要】download 提供 output_path 时保存到本地（可以是文件路径或文件夹路径+file_name），不提供则返回 Base64。",
		parameters: FeishuDriveFileSchema,
		async execute(_toolCallId, params) {
			const p = params;
			try {
				const client = toolClient();
				switch (p.action) {
					case "list": {
						log.info(`list: folder_token=${p.folder_token || "(root)"}, page_size=${p.page_size ?? 200}`);
						const res = await client.invoke("feishu_drive_file.list", (sdk, opts) => sdk.drive.file.list({ params: {
							folder_token: p.folder_token,
							page_size: p.page_size,
							page_token: p.page_token,
							order_by: p.order_by,
							direction: p.direction
						} }, opts), { as: "user" });
						assertLarkOk$2(res);
						log.info(`list: returned ${res.data?.files?.length ?? 0} files`);
						const data = res.data;
						return json({
							files: data?.files,
							has_more: data?.has_more,
							page_token: data?.next_page_token
						});
					}
					case "get_meta": {
						if (!p.request_docs || !Array.isArray(p.request_docs) || p.request_docs.length === 0) return json({ error: "request_docs must be a non-empty array. Correct format: {action: 'get_meta', request_docs: [{doc_token: '...', doc_type: 'sheet'}]}" });
						log.info(`get_meta: querying ${p.request_docs.length} documents`);
						const res = await client.invoke("feishu_drive_file.get_meta", (sdk, opts) => sdk.drive.meta.batchQuery({ data: { request_docs: p.request_docs } }, opts), { as: "user" });
						assertLarkOk$2(res);
						log.info(`get_meta: returned ${res.data?.metas?.length ?? 0} metas`);
						return json({ metas: res.data?.metas ?? [] });
					}
					case "copy": {
						const targetFolderToken = p.folder_token || p.parent_node;
						log.info(`copy: file_token=${p.file_token}, name=${p.name}, type=${p.type}, folder_token=${targetFolderToken ?? "(root)"}`);
						const res = await client.invoke("feishu_drive_file.copy", (sdk, opts) => sdk.drive.file.copy({
							path: { file_token: p.file_token },
							data: {
								name: p.name,
								type: p.type,
								folder_token: targetFolderToken
							}
						}, opts), { as: "user" });
						assertLarkOk$2(res);
						const data = res.data;
						log.info(`copy: new file_token=${data?.file?.token ?? "unknown"}`);
						return json({ file: data?.file });
					}
					case "move": {
						log.info(`move: file_token=${p.file_token}, type=${p.type}, folder_token=${p.folder_token}`);
						const res = await client.invoke("feishu_drive_file.move", (sdk, opts) => sdk.drive.file.move({
							path: { file_token: p.file_token },
							data: {
								type: p.type,
								folder_token: p.folder_token
							}
						}, opts), { as: "user" });
						assertLarkOk$2(res);
						const data = res.data;
						log.info(`move: success${data?.task_id ? `, task_id=${data.task_id}` : ""}`);
						return json({
							success: true,
							...data?.task_id ? { task_id: data.task_id } : {},
							file_token: p.file_token,
							target_folder_token: p.folder_token
						});
					}
					case "delete": {
						log.info(`delete: file_token=${p.file_token}, type=${p.type}`);
						const res = await client.invoke("feishu_drive_file.delete", (sdk, opts) => sdk.drive.file.delete({
							path: { file_token: p.file_token },
							params: { type: p.type }
						}, opts), { as: "user" });
						assertLarkOk$2(res);
						const data = res.data;
						log.info(`delete: success${data?.task_id ? `, task_id=${data.task_id}` : ""}`);
						return json({
							success: true,
							...data?.task_id ? { task_id: data.task_id } : {},
							file_token: p.file_token
						});
					}
					case "upload": {
						let fileBuffer;
						let fileName;
						let fileSize;
						if (p.file_path) {
							log.info(`upload: reading from local file: ${p.file_path}`);
							try {
								fileBuffer = await fs$2.readFile(p.file_path);
								fileName = p.file_name || path$2.basename(p.file_path);
								fileSize = p.size || fileBuffer.length;
								log.info(`upload: file_name=${fileName}, size=${fileSize}, parent=${p.parent_node || "(root)"}`);
							} catch (err) {
								return json({ error: `failed to read local file: ${err instanceof Error ? err.message : String(err)}` });
							}
						} else if (p.file_content_base64) {
							if (!p.file_name || !p.size) return json({ error: "file_name and size are required when using file_content_base64" });
							log.info(`upload: using base64 content, file_name=${p.file_name}, size=${p.size}, parent=${p.parent_node}`);
							fileBuffer = Buffer.from(p.file_content_base64, "base64");
							fileName = p.file_name;
							fileSize = p.size;
						} else return json({ error: "either file_path or file_content_base64 is required" });
						if (fileSize <= SMALL_FILE_THRESHOLD) {
							log.info(`upload: using upload_all (file size ${fileSize} <= 15MB)`);
							const res = await client.invoke("feishu_drive_file.upload", (sdk, opts) => sdk.drive.file.uploadAll({ data: {
								file_name: fileName,
								parent_type: "explorer",
								parent_node: p.parent_node || "",
								size: fileSize,
								file: fileBuffer
							} }, opts), { as: "user" });
							assertLarkOk$2(res);
							log.info(`upload: file_token=${res.data?.file_token}`);
							return json({
								file_token: res.data?.file_token,
								file_name: fileName,
								size: fileSize
							});
						} else {
							log.info(`upload: using chunked upload (file size ${fileSize} > 15MB)`);
							log.info(`upload: step 1 - prepare upload`);
							const prepareRes = await client.invoke("feishu_drive_file.upload", (sdk, opts) => sdk.drive.file.uploadPrepare({ data: {
								file_name: fileName,
								parent_type: "explorer",
								parent_node: p.parent_node || "",
								size: fileSize
							} }, opts), { as: "user" });
							log.info(`upload: prepareRes = ${JSON.stringify(prepareRes)}`);
							if (!prepareRes) return json({ error: "pre-upload failed: empty response" });
							assertLarkOk$2(prepareRes);
							const { upload_id, block_size, block_num } = prepareRes.data;
							log.info(`upload: got upload_id=${upload_id}, block_num=${block_num}, block_size=${block_size}`);
							log.info(`upload: step 2 - uploading ${block_num} chunks`);
							for (let seq = 0; seq < block_num; seq++) {
								const start = seq * block_size;
								const end = Math.min(start + block_size, fileSize);
								const chunkBuffer = fileBuffer.subarray(start, end);
								log.info(`upload: uploading chunk ${seq + 1}/${block_num} (${chunkBuffer.length} bytes)`);
								await client.invoke("feishu_drive_file.upload", (sdk, opts) => sdk.drive.file.uploadPart({ data: {
									upload_id: String(upload_id),
									seq: Number(seq),
									size: Number(chunkBuffer.length),
									file: chunkBuffer
								} }, opts), { as: "user" });
								log.info(`upload: chunk ${seq + 1}/${block_num} uploaded successfully`);
							}
							log.info(`upload: step 3 - finish upload`);
							const finishRes = await client.invoke("feishu_drive_file.upload", (sdk, opts) => sdk.drive.file.uploadFinish({ data: {
								upload_id,
								block_num
							} }, opts), { as: "user" });
							assertLarkOk$2(finishRes);
							log.info(`upload: file_token=${finishRes.data?.file_token}`);
							return json({
								file_token: finishRes.data?.file_token,
								file_name: fileName,
								size: fileSize,
								upload_method: "chunked",
								chunks_uploaded: block_num
							});
						}
					}
					case "download": {
						log.info(`download: file_token=${p.file_token}`);
						const stream = (await client.invoke("feishu_drive_file.download", (sdk, opts) => sdk.drive.file.download({ path: { file_token: p.file_token } }, opts), { as: "user" })).getReadableStream();
						const chunks = [];
						for await (const chunk of stream) chunks.push(chunk);
						const fileBuffer = Buffer.concat(chunks);
						log.info(`download: file size=${fileBuffer.length} bytes`);
						if (p.output_path) try {
							await fs$2.mkdir(path$2.dirname(p.output_path), { recursive: true });
							await fs$2.writeFile(p.output_path, fileBuffer);
							log.info(`download: saved to ${p.output_path}`);
							return json({
								saved_path: p.output_path,
								size: fileBuffer.length
							});
						} catch (err) {
							return json({ error: `failed to save file: ${err instanceof Error ? err.message : String(err)}` });
						}
						else return json({
							file_content_base64: fileBuffer.toString("base64"),
							size: fileBuffer.length
						});
					}
				}
			} catch (err) {
				return await handleInvokeErrorWithAutoAuth(err, cfg);
			}
		}
	}, { name: "feishu_drive_file" });
}
//#endregion
//#region src/tools/oapi/drive/doc-comments.ts
const ReplyElementSchema = Type.Object({
	type: StringEnum([
		"text",
		"mention",
		"link"
	]),
	text: Type.Optional(Type.String({ description: "文本内容(type=text时必填)" })),
	open_id: Type.Optional(Type.String({ description: "被@用户的open_id(type=mention时必填)" })),
	url: Type.Optional(Type.String({ description: "链接URL(type=link时必填)" }))
});
const DocCommentsSchema = Type.Object({
	action: StringEnum([
		"list",
		"create",
		"patch"
	]),
	file_token: Type.String({ description: "云文档token或wiki节点token(可从文档URL获取)。如果是wiki token，会自动转换为实际文档的obj_token" }),
	file_type: StringEnum([
		"doc",
		"docx",
		"sheet",
		"file",
		"slides",
		"wiki"
	], { description: "文档类型。wiki类型会自动解析为实际文档类型(docx/sheet/bitable等)" }),
	is_whole: Type.Optional(Type.Boolean({ description: "是否只获取全文评论(action=list时可选)" })),
	is_solved: Type.Optional(Type.Boolean({ description: "是否只获取已解决的评论(action=list时可选)" })),
	page_size: Type.Optional(Type.Integer({ description: "分页大小" })),
	page_token: Type.Optional(Type.String({ description: "分页标记" })),
	elements: Type.Optional(Type.Array(ReplyElementSchema, { description: "评论内容元素数组(action=create时必填)。支持text(纯文本)、mention(@用户)、link(超链接)三种类型" })),
	comment_id: Type.Optional(Type.String({ description: "评论ID(action=patch时必填)" })),
	is_solved_value: Type.Optional(Type.Boolean({ description: "解决状态:true=解决,false=恢复(action=patch时必填)" })),
	user_id_type: Type.Optional(StringEnum([
		"open_id",
		"union_id",
		"user_id"
	]))
});
function convertElementsToSDKFormat(elements) {
	return elements.map((el) => {
		if (el.type === "text") return {
			type: "text_run",
			text_run: { text: el.text }
		};
		else if (el.type === "mention") return {
			type: "person",
			person: { user_id: el.open_id }
		};
		else if (el.type === "link") return {
			type: "docs_link",
			docs_link: { url: el.url }
		};
		return {
			type: "text_run",
			text_run: { text: "" }
		};
	});
}
/**
* 组装评论和回复数据
* 获取评论列表API会返回部分回复,但可能不完整
* 此函数会为每个评论获取完整的回复列表
*/
async function assembleCommentsWithReplies(client, file_token, file_type, comments, user_id_type, log) {
	const result = [];
	for (const comment of comments) {
		const assembled = { ...comment };
		if (comment.reply_list?.replies?.length > 0 || comment.has_more) try {
			const replies = [];
			let pageToken = void 0;
			let hasMore = true;
			while (hasMore) {
				const replyRes = await client.invoke("drive.v1.fileCommentReply.list", (sdk, opts) => sdk.drive.v1.fileCommentReply.list({
					path: {
						file_token,
						comment_id: comment.comment_id
					},
					params: {
						file_type,
						page_token: pageToken,
						page_size: 50,
						user_id_type
					}
				}, opts), { as: "user" });
				const replyData = replyRes.data;
				if (replyRes.code === 0 && replyData?.items) {
					replies.push(...replyData.items || []);
					hasMore = replyData.has_more || false;
					pageToken = replyData.page_token;
				} else break;
			}
			assembled.reply_list = { replies };
			log.info(`Assembled ${replies.length} replies for comment ${comment.comment_id}`);
		} catch (err) {
			log.warn(`Failed to fetch replies for comment ${comment.comment_id}: ${err}`);
		}
		result.push(assembled);
	}
	return result;
}
function registerDocCommentsTool(api) {
	if (!api.config) return false;
	const cfg = api.config;
	const { toolClient, log } = createToolContext(api, "feishu_doc_comments");
	return registerTool(api, {
		name: "feishu_doc_comments",
		label: "Feishu: Doc Comments",
		description: "【以用户身份】管理云文档评论。支持: (1) list - 获取评论列表(含完整回复); (2) create - 添加全文评论(支持文本、@用户、超链接); (3) patch - 解决/恢复评论。支持 wiki token。",
		parameters: DocCommentsSchema,
		async execute(_toolCallId, params) {
			const p = params;
			try {
				const client = toolClient();
				const userIdType = p.user_id_type || "open_id";
				let actualFileToken = p.file_token;
				let actualFileType = p.file_type;
				if (p.file_type === "wiki") {
					log.info(`doc_comments: detected wiki token="${p.file_token}", converting to obj_token...`);
					try {
						const wikiNodeRes = await client.invoke("feishu_wiki_space_node.get", (sdk, opts) => sdk.wiki.space.getNode({ params: {
							token: p.file_token,
							obj_type: "wiki"
						} }, opts), { as: "user" });
						assertLarkOk$2(wikiNodeRes);
						const node = wikiNodeRes.data?.node;
						if (!node || !node.obj_token || !node.obj_type) return json({
							error: `failed to resolve wiki token "${p.file_token}" to document object (may be a folder node rather than a document)`,
							wiki_node: node
						});
						actualFileToken = node.obj_token;
						actualFileType = node.obj_type;
						log.info(`doc_comments: wiki token converted: obj_token="${actualFileToken}", obj_type="${actualFileType}"`);
					} catch (err) {
						log.error(`doc_comments: failed to convert wiki token: ${err}`);
						return json({ error: `failed to resolve wiki token "${p.file_token}": ${err}` });
					}
				}
				if (p.action === "list") {
					log.info(`doc_comments.list: file_token="${actualFileToken}", file_type=${actualFileType}`);
					const res = await client.invoke("feishu_doc_comments.list", (sdk, opts) => sdk.drive.v1.fileComment.list({
						path: { file_token: actualFileToken },
						params: {
							file_type: actualFileType,
							is_whole: p.is_whole,
							is_solved: p.is_solved,
							page_size: p.page_size || 50,
							page_token: p.page_token,
							user_id_type: userIdType
						}
					}, opts), { as: "user" });
					assertLarkOk$2(res);
					const items = res.data?.items || [];
					log.info(`doc_comments.list: found ${items.length} comments`);
					return json({
						items: await assembleCommentsWithReplies(client, actualFileToken, actualFileType, items, userIdType, log),
						has_more: res.data?.has_more ?? false,
						page_token: res.data?.page_token
					});
				}
				if (p.action === "create") {
					if (!p.elements || p.elements.length === 0) return json({ error: "elements 参数必填且不能为空" });
					log.info(`doc_comments.create: file_token="${actualFileToken}", elements=${p.elements.length}`);
					const sdkElements = convertElementsToSDKFormat(p.elements);
					const res = await client.invoke("feishu_doc_comments.create", (sdk, opts) => sdk.drive.v1.fileComment.create({
						path: { file_token: actualFileToken },
						params: {
							file_type: actualFileType,
							user_id_type: userIdType
						},
						data: { reply_list: { replies: [{ content: { elements: sdkElements } }] } }
					}, opts), { as: "user" });
					assertLarkOk$2(res);
					log.info(`doc_comments.create: created comment ${res.data?.comment_id}`);
					return json(res.data);
				}
				if (p.action === "patch") {
					if (!p.comment_id) return json({ error: "comment_id 参数必填" });
					if (p.is_solved_value === void 0) return json({ error: "is_solved_value 参数必填" });
					log.info(`doc_comments.patch: comment_id="${p.comment_id}", is_solved=${p.is_solved_value}`);
					assertLarkOk$2(await client.invoke("feishu_doc_comments.patch", (sdk, opts) => sdk.drive.v1.fileComment.patch({
						path: {
							file_token: actualFileToken,
							comment_id: p.comment_id
						},
						params: { file_type: actualFileType },
						data: { is_solved: p.is_solved_value }
					}, opts), { as: "user" }));
					log.info(`doc_comments.patch: success`);
					return json({ success: true });
				}
				return json({ error: `未知的 action: ${p.action}` });
			} catch (err) {
				return await handleInvokeErrorWithAutoAuth(err, cfg);
			}
		}
	}, { name: "feishu_doc_comments" });
}
//#endregion
//#region src/tools/oapi/drive/doc-media.ts
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ALIGN_MAP = {
	left: 1,
	center: 2,
	right: 3
};
/** 插入时的媒体类型配置 */
const MEDIA_CONFIG = {
	image: {
		block_type: 27,
		block_data: { image: {} },
		parent_type: "docx_image",
		label: "图片"
	},
	file: {
		block_type: 23,
		block_data: { file: { token: "" } },
		parent_type: "docx_file",
		label: "文件"
	}
};
/** MIME type → 扩展名映射 */
const MIME_TO_EXT$2 = {
	"image/png": ".png",
	"image/jpeg": ".jpg",
	"image/jpg": ".jpg",
	"image/gif": ".gif",
	"image/webp": ".webp",
	"image/svg+xml": ".svg",
	"image/bmp": ".bmp",
	"image/tiff": ".tiff",
	"video/mp4": ".mp4",
	"video/mpeg": ".mpeg",
	"video/quicktime": ".mov",
	"video/x-msvideo": ".avi",
	"video/webm": ".webm",
	"application/pdf": ".pdf",
	"application/msword": ".doc",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
	"application/vnd.ms-excel": ".xls",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
	"application/vnd.ms-powerpoint": ".ppt",
	"application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
	"application/zip": ".zip",
	"application/x-rar-compressed": ".rar",
	"text/plain": ".txt",
	"application/json": ".json"
};
/**
* 从文档 URL 或纯 ID 中提取 document_id
*/
function extractDocumentId(input) {
	const trimmed = input.trim();
	const urlMatch = trimmed.match(/\/docx\/([A-Za-z0-9]+)/);
	if (urlMatch) return urlMatch[1];
	return trimmed;
}
const DocMediaSchema = Type.Union([Type.Object({
	action: Type.Literal("insert"),
	doc_id: Type.String({ description: "文档 ID 或文档 URL（必填）。支持从 URL 自动提取 document_id" }),
	file_path: Type.String({ description: "本地文件的绝对路径（必填）。图片支持 jpg/png/gif/webp 等，文件支持任意格式，最大 20MB" }),
	type: Type.Optional(StringEnum(["image", "file"], { description: "媒体类型：\"image\"（图片，默认）或 \"file\"（文件附件）" })),
	align: Type.Optional(StringEnum([
		"left",
		"center",
		"right"
	], { description: "对齐方式（仅图片生效）：\"center\"（默认居中）、\"left\"（居左）、\"right\"（居右）" })),
	caption: Type.Optional(Type.String({ description: "图片描述/标题（可选，仅图片生效）" }))
}), Type.Object({
	action: Type.Literal("download"),
	resource_token: Type.String({ description: "资源的唯一标识（file_token 用于文档素材，whiteboard_id 用于画板）" }),
	resource_type: StringEnum(["media", "whiteboard"], { description: "资源类型：media（文档素材：图片、视频、文件等）或 whiteboard（画板缩略图）" }),
	output_path: Type.String({ description: "保存文件的完整本地路径。可以包含扩展名（如 /tmp/image.png），也可以不带扩展名，系统会根据 Content-Type 自动添加" })
})]);
async function handleInsert(p, client, log) {
	const documentId = extractDocumentId(p.doc_id);
	const mediaType = p.type ?? "image";
	const config = MEDIA_CONFIG[mediaType];
	const filePath = p.file_path;
	const DOC_MEDIA_ALLOWED_ROOTS = [os.tmpdir()];
	validateLocalMediaRoots(path$1.resolve(filePath), DOC_MEDIA_ALLOWED_ROOTS);
	let fileSize;
	try {
		fileSize = (await fs$1.stat(filePath)).size;
	} catch (err) {
		return json({ error: `failed to read file: ${err instanceof Error ? err.message : String(err)}` });
	}
	if (fileSize > MAX_FILE_SIZE) return json({ error: `file ${(fileSize / 1024 / 1024).toFixed(1)}MB exceeds 20MB limit` });
	const fileName = path$1.basename(filePath);
	log.info(`insert: doc=${documentId}, type=${mediaType}, file=${fileName}, size=${fileSize}`);
	const createRes = await client.invoke("feishu_doc_media.insert", (sdk, opts) => sdk.docx.documentBlockChildren.create({
		path: {
			document_id: documentId,
			block_id: documentId
		},
		data: { children: [{
			block_type: config.block_type,
			...config.block_data
		}] },
		params: { document_revision_id: -1 }
	}, opts), { as: "user" });
	assertLarkOk$2(createRes);
	let blockId;
	if (mediaType === "file") blockId = createRes.data?.children?.[0]?.children?.[0];
	else blockId = createRes.data?.children?.[0]?.block_id;
	if (!blockId) return json({ error: `failed to create ${config.label} block: no block_id returned` });
	log.info(`insert: created ${mediaType} block ${blockId}`);
	const uploadRes = await client.invoke("feishu_doc_media.insert", (sdk, opts) => sdk.drive.v1.media.uploadAll({ data: {
		file_name: fileName,
		parent_type: config.parent_type,
		parent_node: blockId,
		size: fileSize,
		file: createReadStream(filePath),
		extra: JSON.stringify({ drive_route_token: documentId })
	} }, opts), { as: "user" });
	const fileToken = uploadRes?.file_token ?? uploadRes?.data?.file_token;
	if (!fileToken) return json({ error: `failed to upload ${config.label} media: no file_token returned` });
	log.info(`insert: uploaded media, file_token=${fileToken}`);
	const patchRequest = { block_id: blockId };
	if (mediaType === "image") {
		const alignNum = ALIGN_MAP[p.align ?? "center"];
		let width;
		let height;
		try {
			const dims = imageSize(await fs$1.readFile(filePath));
			if (dims.width && dims.height) {
				width = dims.width;
				height = dims.height;
				log.info(`insert: detected image size ${width}x${height}`);
			}
		} catch {
			log.info("insert: could not detect image dimensions, skipping");
		}
		patchRequest.replace_image = {
			token: fileToken,
			align: alignNum,
			...width != null ? { width } : {},
			...height != null ? { height } : {},
			...p.caption ? { caption: { content: p.caption } } : {}
		};
	} else patchRequest.replace_file = { token: fileToken };
	assertLarkOk$2(await client.invoke("feishu_doc_media.insert", (sdk, opts) => sdk.docx.documentBlock.batchUpdate({
		path: { document_id: documentId },
		data: { requests: [patchRequest] },
		params: { document_revision_id: -1 }
	}, opts), { as: "user" }));
	log.info(`insert: patched ${mediaType} block with file_token`);
	return json({
		success: true,
		type: mediaType,
		document_id: documentId,
		block_id: blockId,
		file_token: fileToken,
		file_name: fileName
	});
}
async function handleDownload(p, client, log) {
	log.info(`download: resource_type=${p.resource_type}, token="${p.resource_token}"`);
	let res;
	if (p.resource_type === "media") res = await client.invoke("feishu_doc_media.download", (sdk, opts) => sdk.drive.v1.media.download({ path: { file_token: p.resource_token } }, opts), { as: "user" });
	else res = await client.invoke("feishu_doc_media.download", (sdk, opts) => sdk.board.v1.whiteboard.downloadAsImage({ path: { whiteboard_id: p.resource_token } }, opts), { as: "user" });
	const stream = res.getReadableStream();
	const chunks = [];
	for await (const chunk of stream) chunks.push(chunk);
	const buffer = Buffer.concat(chunks);
	log.info(`download: received ${buffer.length} bytes`);
	const contentType = res.headers?.["content-type"] || "";
	let finalPath = p.output_path;
	if (!path$1.extname(p.output_path) && contentType) {
		const mimeType = contentType.split(";")[0].trim();
		const defaultExt = p.resource_type === "whiteboard" ? ".png" : void 0;
		const suggestedExt = MIME_TO_EXT$2[mimeType] || defaultExt;
		if (suggestedExt) {
			finalPath = p.output_path + suggestedExt;
			log.info(`download: auto-detected extension ${suggestedExt}`);
		}
	}
	await fs$1.mkdir(path$1.dirname(finalPath), { recursive: true });
	try {
		await fs$1.writeFile(finalPath, buffer);
		log.info(`download: saved to ${finalPath}`);
	} catch (err) {
		return json({ error: `failed to save file: ${err instanceof Error ? err.message : String(err)}` });
	}
	return json({
		resource_type: p.resource_type,
		resource_token: p.resource_token,
		size_bytes: buffer.length,
		content_type: contentType,
		saved_path: finalPath
	});
}
function registerDocMediaTool(api) {
	if (!api.config) return false;
	const cfg = api.config;
	const { toolClient, log } = createToolContext(api, "feishu_doc_media");
	return registerTool(api, {
		name: "feishu_doc_media",
		label: "Feishu: Document Media",
		description: "【以用户身份】文档媒体管理工具。支持两种操作：(1) insert - 在飞书文档末尾插入本地图片或文件（需要文档 ID + 本地文件路径）；(2) download - 下载文档素材或画板缩略图到本地（需要资源 token + 输出路径）。\n\n【重要】insert 仅支持本地文件路径。URL 图片请使用 create-doc/update-doc 的 <image url=\"...\"/> 语法。",
		parameters: DocMediaSchema,
		async execute(_toolCallId, params) {
			const p = params;
			try {
				const client = toolClient();
				if (p.action === "insert") return await handleInsert(p, client, log);
				if (p.action === "download") return await handleDownload(p, client, log);
				return json({ error: `unknown action: ${p.action}` });
			} catch (err) {
				return await handleInvokeErrorWithAutoAuth(err, cfg);
			}
		}
	}, { name: "feishu_doc_media" });
}
//#endregion
//#region src/tools/oapi/drive/index.ts
/**
* 注册所有 Drive 工具
*/
function registerFeishuDriveTools(api) {
	if (!api.config) {
		api.logger.debug?.("feishu_drive: No config available, skipping");
		return;
	}
	const accounts = getEnabledLarkAccounts(api.config);
	if (accounts.length === 0) {
		api.logger.debug?.("feishu_drive: No Feishu accounts configured, skipping");
		return;
	}
	if (!resolveAnyEnabledToolsConfig(accounts).drive) {
		api.logger.debug?.("feishu_drive: drive tool disabled in all accounts");
		return;
	}
	const registered = [];
	if (registerFeishuDriveFileTool(api)) registered.push("feishu_drive_file");
	if (registerDocCommentsTool(api)) registered.push("feishu_doc_comments");
	if (registerDocMediaTool(api)) registered.push("feishu_doc_media");
	if (registered.length > 0) api.logger.info?.(`feishu_drive: Registered ${registered.join(", ")}`);
}
//#endregion
//#region src/tools/oapi/wiki/space.ts
const FeishuWikiSpaceSchema = Type.Union([
	Type.Object({
		action: Type.Literal("list"),
		page_size: Type.Optional(Type.Integer({
			description: "分页大小（默认 10，最大 50）",
			minimum: 1,
			maximum: 50
		})),
		page_token: Type.Optional(Type.String({ description: "分页标记。首次请求无需填写" }))
	}),
	Type.Object({
		action: Type.Literal("get"),
		space_id: Type.String({ description: "知识空间 ID（必填）" })
	}),
	Type.Object({
		action: Type.Literal("create"),
		name: Type.Optional(Type.String({ description: "知识空间名称" })),
		description: Type.Optional(Type.String({ description: "知识空间描述" }))
	})
]);
function registerFeishuWikiSpaceTool(api) {
	if (!api.config) return false;
	const cfg = api.config;
	const { toolClient, log } = createToolContext(api, "feishu_wiki_space");
	return registerTool(api, {
		name: "feishu_wiki_space",
		label: "Feishu Wiki Spaces",
		description: "飞书知识空间管理工具。当用户要求查看知识库列表、获取知识库信息、创建知识库时使用。Actions: list（列出知识空间）, get（获取知识空间信息）, create（创建知识空间）。【重要】space_id 可以从浏览器 URL 中获取，或通过 list 接口获取。【重要】知识空间（Space）是知识库的基本组成单位，包含多个具有层级关系的文档节点。",
		parameters: FeishuWikiSpaceSchema,
		async execute(_toolCallId, params) {
			const p = params;
			try {
				const client = toolClient();
				switch (p.action) {
					case "list": {
						log.info(`list: page_size=${p.page_size ?? 10}`);
						const res = await client.invoke("feishu_wiki_space.list", (sdk, opts) => sdk.wiki.space.list({ params: {
							page_size: p.page_size,
							page_token: p.page_token
						} }, opts), { as: "user" });
						assertLarkOk$2(res);
						const data = res.data;
						log.info(`list: returned ${data?.items?.length ?? 0} spaces`);
						return json({
							spaces: data?.items,
							has_more: data?.has_more,
							page_token: data?.page_token
						});
					}
					case "get": {
						log.info(`get: space_id=${p.space_id}`);
						const res = await client.invoke("feishu_wiki_space.get", (sdk, opts) => sdk.wiki.space.get({ path: { space_id: p.space_id } }, opts), { as: "user" });
						assertLarkOk$2(res);
						log.info(`get: retrieved space ${p.space_id}`);
						return json({ space: res.data?.space });
					}
					case "create": {
						log.info(`create: name=${p.name ?? "(empty)"}, description=${p.description ?? "(empty)"}`);
						const res = await client.invoke("feishu_wiki_space.create", (sdk, opts) => sdk.wiki.space.create({ data: {
							name: p.name,
							description: p.description
						} }, opts), { as: "user" });
						assertLarkOk$2(res);
						log.info(`create: created space_id=${(res.data?.space)?.space_id}`);
						return json({ space: res.data?.space });
					}
				}
			} catch (err) {
				return await handleInvokeErrorWithAutoAuth(err, cfg);
			}
		}
	}, { name: "feishu_wiki_space" });
}
//#endregion
//#region src/tools/oapi/wiki/space-node.ts
const FeishuWikiSpaceNodeSchema = Type.Union([
	Type.Object({
		action: Type.Literal("list"),
		space_id: Type.String({ description: "space_id" }),
		parent_node_token: Type.Optional(Type.String({ description: "parent_node_token" })),
		page_size: Type.Optional(Type.Integer({
			description: "page_size",
			minimum: 1
		})),
		page_token: Type.Optional(Type.String({ description: "page_token" }))
	}),
	Type.Object({
		action: Type.Literal("get"),
		token: Type.String({ description: "node token" }),
		obj_type: Type.Optional(StringEnum([
			"doc",
			"sheet",
			"mindnote",
			"bitable",
			"file",
			"docx",
			"slides",
			"wiki"
		], { description: "obj_type" }))
	}),
	Type.Object({
		action: Type.Literal("create"),
		space_id: Type.String({ description: "space_id" }),
		obj_type: StringEnum([
			"sheet",
			"mindnote",
			"bitable",
			"file",
			"docx",
			"slides"
		], { description: "obj_type" }),
		parent_node_token: Type.Optional(Type.String({ description: "parent_node_token" })),
		node_type: StringEnum(["origin", "shortcut"], { description: "node_type" }),
		origin_node_token: Type.Optional(Type.String({ description: "origin_node_token" })),
		title: Type.Optional(Type.String({ description: "title" }))
	}),
	Type.Object({
		action: Type.Literal("move"),
		space_id: Type.String({ description: "space_id" }),
		node_token: Type.String({ description: "node_token" }),
		target_parent_token: Type.Optional(Type.String({ description: "target_parent_token" }))
	}),
	Type.Object({
		action: Type.Literal("copy"),
		space_id: Type.String({ description: "space_id" }),
		node_token: Type.String({ description: "node_token" }),
		target_space_id: Type.Optional(Type.String({ description: "target_space_id" })),
		target_parent_token: Type.Optional(Type.String({ description: "target_parent_token" })),
		title: Type.Optional(Type.String({ description: "title" }))
	})
]);
function registerFeishuWikiSpaceNodeTool(api) {
	if (!api.config) return false;
	const cfg = api.config;
	const { toolClient, log } = createToolContext(api, "feishu_wiki_space_node");
	return registerTool(api, {
		name: "feishu_wiki_space_node",
		label: "Feishu Wiki Space Nodes",
		description: "飞书知识库节点管理工具。操作：list（列表）、get（获取）、create（创建）、move（移动）、copy（复制）。节点是知识库中的文档，包括 doc、bitable(多维表表格)、sheet(电子表格) 等类型。node_token 是节点的唯一标识符，obj_token 是实际文档的 token。可通过 get 操作将 wiki 类型的 node_token 转换为实际文档的 obj_token。",
		parameters: FeishuWikiSpaceNodeSchema,
		async execute(_toolCallId, params) {
			const p = params;
			try {
				const client = toolClient();
				switch (p.action) {
					case "list": {
						log.info(`list: space_id=${p.space_id}, parent=${p.parent_node_token ?? "(root)"}, page_size=${p.page_size ?? 50}`);
						const res = await client.invoke("feishu_wiki_space_node.list", (sdk, opts) => sdk.wiki.spaceNode.list({
							path: { space_id: p.space_id },
							params: {
								page_size: p.page_size,
								page_token: p.page_token,
								parent_node_token: p.parent_node_token
							}
						}, opts), { as: "user" });
						assertLarkOk$2(res);
						const data = res.data;
						log.info(`list: returned ${data?.items?.length ?? 0} nodes`);
						return json({
							nodes: data?.items,
							has_more: data?.has_more,
							page_token: data?.page_token
						});
					}
					case "get": {
						log.info(`get: token=${p.token}, obj_type=${p.obj_type ?? "wiki"}`);
						const res = await client.invoke("feishu_wiki_space_node.get", (sdk, opts) => sdk.wiki.space.getNode({ params: {
							token: p.token,
							obj_type: p.obj_type || "wiki"
						} }, opts), { as: "user" });
						assertLarkOk$2(res);
						log.info(`get: retrieved node ${p.token}`);
						return json({ node: res.data?.node });
					}
					case "create": {
						log.info(`create: space_id=${p.space_id}, obj_type=${p.obj_type}, parent=${p.parent_node_token ?? "(root)"}, title=${p.title ?? "(empty)"}, node_type=${p.node_type}, original_node_token=${p.origin_node_token ?? "(empty)"}`);
						const res = await client.invoke("feishu_wiki_space_node.create", (sdk, opts) => sdk.wiki.spaceNode.create({
							path: { space_id: p.space_id },
							data: {
								obj_type: p.obj_type,
								parent_node_token: p.parent_node_token,
								node_type: p.node_type,
								origin_node_token: p.origin_node_token,
								title: p.title
							}
						}, opts), { as: "user" });
						assertLarkOk$2(res);
						log.info(`create: created node_token=${(res.data?.node)?.node_token}`);
						return json({ node: res.data?.node });
					}
					case "move": {
						log.info(`move: space_id=${p.space_id}, node_token=${p.node_token}, target_parent=${p.target_parent_token ?? "(root)"}`);
						const res = await client.invoke("feishu_wiki_space_node.move", (sdk, opts) => sdk.wiki.spaceNode.move({
							path: {
								space_id: p.space_id,
								node_token: p.node_token
							},
							data: { target_parent_token: p.target_parent_token }
						}, opts), { as: "user" });
						assertLarkOk$2(res);
						log.info(`move: moved node ${p.node_token}`);
						return json({ node: res.data?.node });
					}
					case "copy": {
						log.info(`copy: space_id=${p.space_id}, node_token=${p.node_token}, target_space=${p.target_space_id ?? "(same)"}, target_parent=${p.target_parent_token ?? "(root)"}`);
						const res = await client.invoke("feishu_wiki_space_node.copy", (sdk, opts) => sdk.wiki.spaceNode.copy({
							path: {
								space_id: p.space_id,
								node_token: p.node_token
							},
							data: {
								target_space_id: p.target_space_id,
								target_parent_token: p.target_parent_token,
								title: p.title
							}
						}, opts), { as: "user" });
						assertLarkOk$2(res);
						log.info(`copy: copied to node_token=${(res.data?.node)?.node_token}`);
						return json({ node: res.data?.node });
					}
				}
			} catch (err) {
				return await handleInvokeErrorWithAutoAuth(err, cfg);
			}
		}
	}, { name: "feishu_wiki_space_node" });
}
//#endregion
//#region src/tools/oapi/wiki/index.ts
/**
* 注册所有 Wiki 工具
*/
function registerFeishuWikiTools(api) {
	if (!api.config) {
		api.logger.debug?.("feishu_wiki: No config available, skipping");
		return;
	}
	const accounts = getEnabledLarkAccounts(api.config);
	if (accounts.length === 0) {
		api.logger.debug?.("feishu_wiki: No Feishu accounts configured, skipping");
		return;
	}
	if (!resolveAnyEnabledToolsConfig(accounts).wiki) {
		api.logger.debug?.("feishu_wiki: wiki tool disabled in all accounts");
		return;
	}
	const registered = [];
	if (registerFeishuWikiSpaceTool(api)) registered.push("feishu_wiki_space");
	if (registerFeishuWikiSpaceNodeTool(api)) registered.push("feishu_wiki_space_node");
	if (registered.length > 0) api.logger.info?.(`feishu_wiki: Registered ${registered.join(", ")}`);
}
//#endregion
//#region src/tools/tat/im/resource.ts
/** MIME type → 文件扩展名（下载时使用） */
const MIME_TO_EXT$1 = {
	"image/png": ".png",
	"image/jpeg": ".jpg",
	"image/jpg": ".jpg",
	"image/gif": ".gif",
	"image/webp": ".webp",
	"image/svg+xml": ".svg",
	"image/bmp": ".bmp",
	"image/tiff": ".tiff",
	"video/mp4": ".mp4",
	"video/mpeg": ".mpeg",
	"video/quicktime": ".mov",
	"video/x-msvideo": ".avi",
	"video/webm": ".webm",
	"audio/mpeg": ".mp3",
	"audio/wav": ".wav",
	"audio/ogg": ".ogg",
	"audio/mp4": ".m4a",
	"application/pdf": ".pdf",
	"application/msword": ".doc",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
	"application/vnd.ms-excel": ".xls",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
	"application/vnd.ms-powerpoint": ".ppt",
	"application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
	"application/zip": ".zip",
	"application/x-rar-compressed": ".rar",
	"text/plain": ".txt",
	"application/json": ".json"
};
/**
* 从二进制响应中提取 Buffer、Content-Type。
* SDK 的二进制响应可能有 getReadableStream()，也可能直接是 Buffer 等格式。
*/
async function extractBuffer(res) {
	let chunks;
	if (typeof res.getReadableStream === "function") {
		const stream = res.getReadableStream();
		chunks = [];
		for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	} else if (Buffer.isBuffer(res)) chunks = [res];
	else if (Buffer.isBuffer(res?.data)) chunks = [res.data];
	else throw new Error("无法从响应中提取二进制数据");
	return {
		buffer: Buffer.concat(chunks),
		contentType: res.headers?.["content-type"] ?? ""
	};
}
/**
* 将 buffer 保存到临时文件，返回路径。
*/
async function saveToTempFile(buffer, contentType, prefix) {
	const mimeType = contentType ? contentType.split(";")[0].trim() : "";
	const filePath = buildRandomTempFilePath({
		prefix,
		extension: mimeType ? MIME_TO_EXT$1[mimeType] : void 0
	});
	await fs$1.mkdir(path$1.dirname(filePath), { recursive: true });
	await fs$1.writeFile(filePath, buffer);
	return filePath;
}
const FeishuImBotImageSchema = Type.Object({
	message_id: Type.String({ description: "消息 ID（om_xxx 格式），引用消息可从上下文中的 [message_id=om_xxx] 提取" }),
	file_key: Type.String({ description: "资源 Key，图片消息的 image_key（img_xxx）或文件消息的 file_key（file_xxx）" }),
	type: StringEnum(["image", "file"], { description: "资源类型：image（图片消息中的图片）、file（文件/音频/视频消息中的文件）" })
});
function registerFeishuImBotImageTool(api) {
	if (!api.config) return false;
	const { getClient, log } = createToolContext(api, "feishu_im_bot_image");
	return registerTool(api, {
		name: "feishu_im_bot_image",
		label: "Feishu: IM Bot Image Download",
		description: "【以机器人身份】下载飞书 IM 消息中的图片或文件资源到本地。\n\n适用场景：用户直接发送给机器人的消息、用户引用的消息、机器人收到的群聊消息中的图片/文件。即当前对话上下文中出现的 message_id 和 image_key/file_key，应使用本工具下载。\n引用消息的 message_id 可从上下文中的 [message_id=om_xxx] 提取，无需向用户询问。\n\n文件自动保存到 /tmp/openclaw/ 下，返回值中的 saved_path 为实际保存路径。",
		parameters: FeishuImBotImageSchema,
		async execute(_toolCallId, params) {
			const p = params;
			try {
				const client = getClient();
				log.info(`download: message_id="${p.message_id}", file_key="${p.file_key}", type="${p.type}"`);
				const { buffer, contentType } = await extractBuffer(await client.im.messageResource.get({
					path: {
						message_id: p.message_id,
						file_key: p.file_key
					},
					params: { type: p.type }
				}));
				log.info(`download: ${buffer.length} bytes, content-type=${contentType}`);
				const savedPath = await saveToTempFile(buffer, contentType, "bot-resource");
				log.info(`download: saved to ${savedPath}`);
				return json({
					message_id: p.message_id,
					file_key: p.file_key,
					type: p.type,
					size_bytes: buffer.length,
					content_type: contentType,
					saved_path: savedPath
				});
			} catch (err) {
				log.error(`Error: ${formatLarkError(err)}`);
				return json({ error: formatLarkError(err) });
			}
		}
	}, { name: "feishu_im_bot_image" });
}
//#endregion
//#region src/tools/tat/im/index.ts
/**
* 注册所有 IM 工具
*
* Note: feishu_im_message_reaction 和 feishu_im_message_recall 已移除，
* 其功能由 ChannelMessageActionAdapter (actions.ts) 的 react/delete action 统一覆盖。
*/
function registerFeishuImTools$1(api) {
	if (registerFeishuImBotImageTool(api)) api.logger.info?.("feishu_im: Registered feishu_im_bot_image");
}
//#endregion
//#region src/tools/oapi/sheets/sheet.ts
const MAX_READ_ROWS = 200;
const MAX_WRITE_ROWS = 5e3;
const MAX_WRITE_COLS = 100;
const EXPORT_POLL_INTERVAL_MS = 1e3;
const EXPORT_POLL_MAX_RETRIES = 30;
function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
* 从飞书电子表格 URL 中解析 token 和可选的 sheet_id。
*
* 支持格式：
*   https://www.feishu.cn/sheets/TOKEN
*   https://xxx.feishu.cn/sheets/TOKEN?sheet=SHEET_ID
*   https://xxx.feishu.cn/wiki/TOKEN（知识库中的电子表格）
*/
function parseSheetUrl(url) {
	try {
		const u = new URL(url);
		const match = u.pathname.match(/\/(?:sheets|wiki)\/([^/?#]+)/);
		if (!match) return null;
		return {
			token: match[1],
			sheetId: u.searchParams.get("sheet") || void 0
		};
	} catch {
		return null;
	}
}
/**
* 飞书已知的 token 类型前缀。
* 新版 token：第 5/10/15 位字符（1-indexed）组成前缀。
* 旧版 token：前 3 个字符即为前缀。
*
* 常见类型：dox=云文档, sht=电子表格, bas=多维表格, wik=知识库
*/
const KNOWN_TOKEN_TYPES = new Set([
	"dox",
	"doc",
	"sht",
	"bas",
	"app",
	"sld",
	"bmn",
	"fld",
	"nod",
	"box",
	"jsn",
	"img",
	"isv",
	"wik",
	"wia",
	"wib",
	"wic",
	"wid",
	"wie",
	"dsb"
]);
/**
* 从 token 中提取类型前缀（如 "sht"、"wik"、"doc" 等）。
* 先检测新版格式（第 5/10/15 位），再回退旧版格式（前 3 位）。
*/
function getTokenType(token) {
	if (token.length >= 15) {
		const prefix = token[4] + token[9] + token[14];
		if (KNOWN_TOKEN_TYPES.has(prefix)) return prefix;
	}
	if (token.length >= 3) {
		const prefix = token.substring(0, 3);
		if (KNOWN_TOKEN_TYPES.has(prefix)) return prefix;
	}
	return null;
}
/**
* 从参数中解析 spreadsheet_token（支持 url 和直接 token 两种方式）。
* 如果检测到 wiki token，自动通过 wiki API 获取真实的 spreadsheet_token。
*/
async function resolveToken(p, client, log) {
	let token;
	let urlSheetId;
	if (p.spreadsheet_token) token = p.spreadsheet_token;
	else if (p.url) {
		const parsed = parseSheetUrl(p.url);
		if (!parsed) throw new Error(`Failed to parse spreadsheet_token from URL: ${p.url}`);
		token = parsed.token;
		urlSheetId = parsed.sheetId;
	} else throw new Error("url or spreadsheet_token is required");
	if (getTokenType(token) === "wik") {
		log.info(`resolveToken: detected wiki token, resolving obj_token...`);
		const wikiNodeRes = await client.invoke("feishu_sheet.info", (sdk, opts) => sdk.wiki.space.getNode({ params: {
			token,
			obj_type: "wiki"
		} }, opts), { as: "user" });
		assertLarkOk$2(wikiNodeRes);
		const objToken = wikiNodeRes.data?.node?.obj_token;
		if (!objToken) throw new Error(`Failed to resolve spreadsheet token from wiki token: ${token}`);
		log.info(`resolveToken: wiki resolved ${token} -> ${objToken}`);
		token = objToken;
	}
	return {
		token,
		urlSheetId
	};
}
/**
* Resolve the target range for read/write/append operations.
*
* Priority: explicit range > sheet_id param / URL sheet > first sheet via API.
* Throws if the spreadsheet has no worksheets.
*/
async function resolveRange(token, range, sheetId, client, apiName) {
	if (range) return range;
	if (sheetId) return sheetId;
	const sheetsRes = await client.invoke(apiName, (sdk, opts) => sdk.sheets.spreadsheetSheet.query({ path: { spreadsheet_token: token } }, opts), { as: "user" });
	assertLarkOk$2(sheetsRes);
	const firstSheet = (sheetsRes.data?.sheets ?? [])[0];
	if (!firstSheet?.sheet_id) throw new Error("spreadsheet has no worksheets");
	return firstSheet.sheet_id;
}
/**
* 将列号（1-based）转换为 Excel 列字母（A, B, ..., Z, AA, AB, ...）。
*/
function colLetter(n) {
	let result = "";
	while (n > 0) {
		n--;
		result = String.fromCharCode(65 + n % 26) + result;
		n = Math.floor(n / 26);
	}
	return result;
}
/**
* 将单元格值中的富文本 segment 数组拍平为纯文本字符串。
*
* 飞书 Sheets API 对带样式的单元格返回 [{type:"text", text:"...", segmentStyle:{...}}, ...] 格式，
* 极其冗余。此函数将其拼接为单个字符串，大幅减少 token 消耗。
*/
function flattenCellValue(cell) {
	if (!Array.isArray(cell)) return cell;
	if (cell.length > 0 && cell.every((seg) => seg != null && typeof seg === "object" && "text" in seg)) return cell.map((seg) => seg.text).join("");
	return cell;
}
function flattenValues(values) {
	if (!values) return values;
	return values.map((row) => row.map(flattenCellValue));
}
function truncateRows(values, maxRows) {
	if (!values) return {
		values,
		truncated: false,
		total_rows: 0
	};
	const total = values.length;
	if (total <= maxRows) return {
		values,
		truncated: false,
		total_rows: total
	};
	return {
		values: values.slice(0, maxRows),
		truncated: true,
		total_rows: total
	};
}
const UrlOrToken = [Type.Optional(Type.String({ description: "电子表格 URL，例如 https://xxx.feishu.cn/sheets/TOKEN 或 https://xxx.feishu.cn/wiki/TOKEN（与 spreadsheet_token 二选一）" })), Type.Optional(Type.String({ description: "电子表格 token（与 url 二选一）" }))];
const ValueRenderOption = Type.Optional(Type.Union([
	Type.Literal("ToString"),
	Type.Literal("FormattedValue"),
	Type.Literal("Formula"),
	Type.Literal("UnformattedValue")
], { description: "值渲染方式：ToString（默认）、FormattedValue（按格式）、Formula（公式）、UnformattedValue（原始值）" }));
const FeishuSheetSchema = Type.Union([
	Type.Object({
		action: Type.Literal("info"),
		url: UrlOrToken[0],
		spreadsheet_token: UrlOrToken[1]
	}),
	Type.Object({
		action: Type.Literal("read"),
		url: UrlOrToken[0],
		spreadsheet_token: UrlOrToken[1],
		range: Type.Optional(Type.String({ description: "读取范围（可选）。格式：<sheetId>!A1:D10 或 <sheetId>（sheetId 通过 info 获取）。不填则自动读取第一个工作表全部数据" })),
		sheet_id: Type.Optional(Type.String({ description: "工作表 ID（可选）。仅当不提供 range 时生效，指定要读取的工作表。不填则读取第一个工作表" })),
		value_render_option: ValueRenderOption
	}),
	Type.Object({
		action: Type.Literal("write"),
		url: UrlOrToken[0],
		spreadsheet_token: UrlOrToken[1],
		range: Type.Optional(Type.String({ description: "写入范围（可选）。格式：<sheetId>!A1:D10（sheetId 通过 info 获取）。不填则写入第一个工作表（从 A1 开始）" })),
		sheet_id: Type.Optional(Type.String({ description: "工作表 ID（可选）。仅当不提供 range 时生效。不填则使用第一个工作表" })),
		values: Type.Array(Type.Array(Type.Any()), { description: "二维数组，每个元素是一行。例如 [[\"姓名\",\"年龄\"],[\"张三\",25]]" })
	}),
	Type.Object({
		action: Type.Literal("append"),
		url: UrlOrToken[0],
		spreadsheet_token: UrlOrToken[1],
		range: Type.Optional(Type.String({ description: "追加范围（可选）。格式同 write。不填则追加到第一个工作表末尾" })),
		sheet_id: Type.Optional(Type.String({ description: "工作表 ID（可选）。仅当不提供 range 时生效" })),
		values: Type.Array(Type.Array(Type.Any()), { description: "要追加的二维数组数据" })
	}),
	Type.Object({
		action: Type.Literal("find"),
		url: UrlOrToken[0],
		spreadsheet_token: UrlOrToken[1],
		sheet_id: Type.String({ description: "工作表 ID（必填，可通过 info action 获取）" }),
		find: Type.String({ description: "查找内容（字符串或正则表达式）" }),
		range: Type.Optional(Type.String({ description: "查找范围。格式：A1:D10（不含 sheetId 前缀）。不填则搜索整个工作表" })),
		match_case: Type.Optional(Type.Boolean({ description: "是否区分大小写（默认 true）" })),
		match_entire_cell: Type.Optional(Type.Boolean({ description: "是否完全匹配整个单元格（默认 false）" })),
		search_by_regex: Type.Optional(Type.Boolean({ description: "是否使用正则表达式（默认 false）" })),
		include_formulas: Type.Optional(Type.Boolean({ description: "是否搜索公式（默认 false）" }))
	}),
	Type.Object({
		action: Type.Literal("create"),
		title: Type.String({ description: "电子表格标题" }),
		folder_token: Type.Optional(Type.String({ description: "文件夹 token（可选）。不填时创建到「我的空间」根目录" })),
		headers: Type.Optional(Type.Array(Type.String(), { description: "表头列名（可选）。例如 [\"姓名\", \"部门\", \"入职日期\"]。提供后会写入第一行" })),
		data: Type.Optional(Type.Array(Type.Array(Type.Any()), { description: "初始数据（可选）。二维数组，写在表头之后。例如 [[\"张三\", \"工程\", \"2026-01-01\"]]" }))
	}),
	Type.Object({
		action: Type.Literal("export"),
		url: UrlOrToken[0],
		spreadsheet_token: UrlOrToken[1],
		file_extension: StringEnum(["xlsx", "csv"], { description: "导出格式：xlsx 或 csv" }),
		output_path: Type.Optional(Type.String({ description: "本地保存路径（含文件名）。不填则只返回文件信息" })),
		sheet_id: Type.Optional(Type.String({ description: "工作表 ID。导出 CSV 时必填（CSV 一次只能导出一个工作表），导出 xlsx 时可选" }))
	})
]);
function registerFeishuSheetTool(api) {
	if (!api.config) return false;
	const cfg = api.config;
	const { toolClient, log } = createToolContext(api, "feishu_sheet");
	return registerTool(api, {
		name: "feishu_sheet",
		label: "Feishu Spreadsheet",
		description: "【以用户身份】飞书电子表格工具。支持创建、读写、查找、导出电子表格。\n\n电子表格（Sheets）类似 Excel/Google Sheets，与多维表格（Bitable/Airtable）是不同产品。\n\n所有 action（除 create 外）均支持传入 url 或 spreadsheet_token，工具会自动解析。支持知识库 wiki URL，自动解析为电子表格 token。\n\nActions:\n- info：获取表格信息 + 全部工作表列表（一次调用替代 get_info + list_sheets）\n- read：读取数据。不填 range 自动读取第一个工作表全部数据\n- write：覆盖写入,高危,请谨慎使用该操作。不填 range 自动写入第一个工作表（从 A1 开始）\n- append：在已有数据末尾追加行\n- find：在工作表中查找单元格\n- create：创建电子表格。支持带 headers + data 一步创建含数据的表格\n- export：导出为 xlsx 或 csv（csv 必须指定 sheet_id）",
		parameters: FeishuSheetSchema,
		async execute(_toolCallId, params) {
			const p = params;
			try {
				const client = toolClient();
				const brand = client.account.brand;
				switch (p.action) {
					case "info": {
						const { token } = await resolveToken(p, client, log);
						log.info(`info: token=${token}`);
						const [spreadsheetRes, sheetsRes] = await Promise.all([client.invoke("feishu_sheet.info", (sdk, opts) => sdk.sheets.spreadsheet.get({ path: { spreadsheet_token: token } }, opts), { as: "user" }), client.invoke("feishu_sheet.info", (sdk, opts) => sdk.sheets.spreadsheetSheet.query({ path: { spreadsheet_token: token } }, opts), { as: "user" })]);
						assertLarkOk$2(spreadsheetRes);
						assertLarkOk$2(sheetsRes);
						const spreadsheet = spreadsheetRes.data?.spreadsheet;
						const sheets = (sheetsRes.data?.sheets ?? []).map((s) => ({
							sheet_id: s.sheet_id,
							title: s.title,
							index: s.index,
							row_count: s.grid_properties?.row_count,
							column_count: s.grid_properties?.column_count,
							frozen_row_count: s.grid_properties?.frozen_row_count,
							frozen_column_count: s.grid_properties?.frozen_column_count
						}));
						log.info(`info: title="${spreadsheet?.title}", ${sheets.length} sheets`);
						return json({
							title: spreadsheet?.title,
							spreadsheet_token: token,
							url: `${wwwDomain(brand)}/sheets/${token}`,
							sheets
						});
					}
					case "read": {
						const { token, urlSheetId } = await resolveToken(p, client, log);
						const range = await resolveRange(token, p.range, p.sheet_id ?? urlSheetId, client, "feishu_sheet.read");
						log.info(`read: token=${token}, range=${range}`);
						const query = {
							valueRenderOption: p.value_render_option ?? "ToString",
							dateTimeRenderOption: "FormattedString"
						};
						const res = await client.invokeByPath("feishu_sheet.read", `/open-apis/sheets/v2/spreadsheets/${token}/values/${encodeURIComponent(range)}`, {
							method: "GET",
							query,
							as: "user"
						});
						if (res.code && res.code !== 0) return json({ error: res.msg || `API error code: ${res.code}` });
						const valueRange = res.data?.valueRange;
						const { values, truncated, total_rows } = truncateRows(flattenValues(valueRange?.values), MAX_READ_ROWS);
						log.info(`read: ${total_rows} rows${truncated ? ` (truncated to ${MAX_READ_ROWS})` : ""}`);
						return json({
							range: valueRange?.range,
							values,
							...truncated ? {
								truncated: true,
								total_rows,
								hint: `Data exceeds ${MAX_READ_ROWS} rows, truncated. Please narrow the range and read again.`
							} : {}
						});
					}
					case "write": {
						const { token, urlSheetId } = await resolveToken(p, client, log);
						if (p.values && p.values.length > MAX_WRITE_ROWS) return json({ error: `write row count ${p.values.length} exceeds limit ${MAX_WRITE_ROWS}` });
						if (p.values && p.values.some((row) => Array.isArray(row) && row.length > MAX_WRITE_COLS)) return json({ error: `write column count exceeds limit ${MAX_WRITE_COLS}` });
						const range = await resolveRange(token, p.range, p.sheet_id ?? urlSheetId, client, "feishu_sheet.write");
						log.info(`write: token=${token}, range=${range}, rows=${p.values?.length}`);
						const res = await client.invokeByPath("feishu_sheet.write", `/open-apis/sheets/v2/spreadsheets/${token}/values`, {
							method: "PUT",
							body: { valueRange: {
								range,
								values: p.values
							} },
							as: "user"
						});
						if (res.code && res.code !== 0) return json({ error: res.msg || `API error code: ${res.code}` });
						log.info(`write: updated ${res.data?.updatedCells ?? 0} cells`);
						return json({
							updated_range: res.data?.updatedRange,
							updated_rows: res.data?.updatedRows,
							updated_columns: res.data?.updatedColumns,
							updated_cells: res.data?.updatedCells,
							revision: res.data?.revision
						});
					}
					case "append": {
						const { token, urlSheetId } = await resolveToken(p, client, log);
						if (p.values && p.values.length > MAX_WRITE_ROWS) return json({ error: `append row count ${p.values.length} exceeds limit ${MAX_WRITE_ROWS}` });
						const range = await resolveRange(token, p.range, p.sheet_id ?? urlSheetId, client, "feishu_sheet.append");
						log.info(`append: token=${token}, range=${range}, rows=${p.values?.length}`);
						const res = await client.invokeByPath("feishu_sheet.append", `/open-apis/sheets/v2/spreadsheets/${token}/values_append`, {
							method: "POST",
							body: { valueRange: {
								range,
								values: p.values
							} },
							as: "user"
						});
						if (res.code && res.code !== 0) return json({ error: res.msg || `API error code: ${res.code}` });
						const updates = res.data?.updates;
						log.info(`append: updated ${updates?.updatedCells ?? 0} cells`);
						return json({
							table_range: res.data?.tableRange,
							updated_range: updates?.updatedRange,
							updated_rows: updates?.updatedRows,
							updated_columns: updates?.updatedColumns,
							updated_cells: updates?.updatedCells,
							revision: updates?.revision
						});
					}
					case "find": {
						const { token } = await resolveToken(p, client, log);
						log.info(`find: token=${token}, sheet_id=${p.sheet_id}, find="${p.find}"`);
						const findCondition = { range: p.range ? `${p.sheet_id}!${p.range}` : p.sheet_id };
						if (p.match_case !== void 0) findCondition.match_case = !p.match_case;
						if (p.match_entire_cell !== void 0) findCondition.match_entire_cell = p.match_entire_cell;
						if (p.search_by_regex !== void 0) findCondition.search_by_regex = p.search_by_regex;
						if (p.include_formulas !== void 0) findCondition.include_formulas = p.include_formulas;
						const res = await client.invoke("feishu_sheet.find", (sdk, opts) => sdk.sheets.spreadsheetSheet.find({
							path: {
								spreadsheet_token: token,
								sheet_id: p.sheet_id
							},
							data: {
								find_condition: findCondition,
								find: p.find
							}
						}, opts), { as: "user" });
						assertLarkOk$2(res);
						const findResult = res.data?.find_result;
						log.info(`find: matched ${findResult?.matched_cells?.length ?? 0} cells`);
						return json({
							matched_cells: findResult?.matched_cells,
							matched_formula_cells: findResult?.matched_formula_cells,
							rows_count: findResult?.rows_count
						});
					}
					case "create": {
						log.info(`create: title="${p.title}", folder=${p.folder_token ?? "(root)"}, headers=${!!p.headers}, data=${p.data?.length ?? 0} rows`);
						const createRes = await client.invoke("feishu_sheet.create", (sdk, opts) => sdk.sheets.spreadsheet.create({ data: {
							title: p.title,
							folder_token: p.folder_token
						} }, opts), { as: "user" });
						assertLarkOk$2(createRes);
						const token = (createRes.data?.spreadsheet)?.spreadsheet_token;
						if (!token) return json({ error: "failed to create spreadsheet: no token returned" });
						const url = `${wwwDomain(brand)}/sheets/${token}`;
						log.info(`create: token=${token}`);
						if (p.headers || p.data) {
							const allRows = [];
							if (p.headers) allRows.push(p.headers);
							if (p.data) allRows.push(...p.data);
							if (allRows.length > 0) {
								const sheetsRes = await client.invoke("feishu_sheet.create", (sdk, opts) => sdk.sheets.spreadsheetSheet.query({ path: { spreadsheet_token: token } }, opts), { as: "user" });
								assertLarkOk$2(sheetsRes);
								const firstSheet = (sheetsRes.data?.sheets ?? [])[0];
								if (firstSheet?.sheet_id) {
									const sheetId = firstSheet.sheet_id;
									const numRows = allRows.length;
									const range = `${sheetId}!A1:${colLetter(Math.max(...allRows.map((r) => r.length)))}${numRows}`;
									log.info(`create: writing ${numRows} rows to ${range}`);
									const writeRes = await client.invokeByPath("feishu_sheet.create", `/open-apis/sheets/v2/spreadsheets/${token}/values`, {
										method: "PUT",
										body: { valueRange: {
											range,
											values: allRows
										} },
										as: "user"
									});
									if (writeRes.code && writeRes.code !== 0) {
										log.info(`create: initial data write failed: ${writeRes.msg}`);
										return json({
											spreadsheet_token: token,
											url,
											warning: `spreadsheet created but failed to write initial data: ${writeRes.msg}`
										});
									}
								}
							}
						}
						return json({
							spreadsheet_token: token,
							title: p.title,
							url
						});
					}
					case "export": {
						const { token } = await resolveToken(p, client, log);
						if (p.file_extension === "csv" && !p.sheet_id) return json({ error: "sheet_id is required for CSV export (CSV can only export one worksheet at a time). Use info action to get the worksheet list." });
						log.info(`export: token=${token}, format=${p.file_extension}, output=${p.output_path ?? "(info only)"}`);
						const createRes = await client.invoke("feishu_sheet.export", (sdk, opts) => sdk.drive.exportTask.create({ data: {
							file_extension: p.file_extension,
							token,
							type: "sheet",
							sub_id: p.sheet_id
						} }, opts), { as: "user" });
						assertLarkOk$2(createRes);
						const ticket = createRes.data?.ticket;
						if (!ticket) return json({ error: "failed to create export task: no ticket returned" });
						log.info(`export: ticket=${ticket}`);
						let fileToken;
						let fileName;
						let fileSize;
						for (let i = 0; i < EXPORT_POLL_MAX_RETRIES; i++) {
							await sleep(EXPORT_POLL_INTERVAL_MS);
							const pollRes = await client.invoke("feishu_sheet.export", (sdk, opts) => sdk.drive.exportTask.get({
								path: { ticket },
								params: { token }
							}, opts), { as: "user" });
							assertLarkOk$2(pollRes);
							const result = pollRes.data?.result;
							const jobStatus = result?.job_status;
							if (jobStatus === 0) {
								fileToken = result?.file_token;
								fileName = result?.file_name;
								fileSize = result?.file_size;
								log.info(`export: done, file_token=${fileToken}, size=${fileSize}`);
								break;
							}
							if (jobStatus !== void 0 && jobStatus >= 3) return json({ error: result?.job_error_msg || `export failed (status=${jobStatus})` });
							log.info(`export: polling ${i + 1}/${EXPORT_POLL_MAX_RETRIES}, status=${jobStatus}`);
						}
						if (!fileToken) return json({ error: "export timeout: task did not complete within 30 seconds" });
						if (p.output_path) {
							const stream = (await client.invoke("feishu_sheet.export", (sdk, opts) => sdk.drive.exportTask.download({ path: { file_token: fileToken } }, opts), { as: "user" })).getReadableStream();
							const chunks = [];
							for await (const chunk of stream) chunks.push(chunk);
							await fs$2.mkdir(path$2.dirname(p.output_path), { recursive: true });
							await fs$2.writeFile(p.output_path, Buffer.concat(chunks));
							log.info(`export: saved to ${p.output_path}`);
							return json({
								file_path: p.output_path,
								file_name: fileName,
								file_size: fileSize
							});
						}
						return json({
							file_token: fileToken,
							file_name: fileName,
							file_size: fileSize,
							hint: "File exported. Provide output_path parameter to download locally."
						});
					}
				}
			} catch (err) {
				return await handleInvokeErrorWithAutoAuth(err, cfg);
			}
		}
	}, { name: "feishu_sheet" });
}
//#endregion
//#region src/tools/oapi/sheets/index.ts
/**
* 注册 Sheets 工具
*/
function registerFeishuSheetsTools(api) {
	if (!api.config) {
		api.logger.debug?.("feishu_sheets: No config available, skipping");
		return;
	}
	const accounts = getEnabledLarkAccounts(api.config);
	if (accounts.length === 0) {
		api.logger.debug?.("feishu_sheets: No Feishu accounts configured, skipping");
		return;
	}
	if (!resolveAnyEnabledToolsConfig(accounts).sheets) {
		api.logger.debug?.("feishu_sheets: sheets tool disabled in all accounts");
		return;
	}
	if (registerFeishuSheetTool(api)) api.logger.info?.("feishu_sheets: Registered feishu_sheet");
}
//#endregion
//#region src/tools/oapi/chat/chat.ts
const FeishuChatSchema = Type.Union([Type.Object({
	action: Type.Literal("search"),
	query: Type.String({ description: "搜索关键词（必填）。支持匹配群名称、群成员名称。支持多语种、拼音、前缀等模糊搜索。" }),
	page_size: Type.Optional(Type.Integer({
		description: "分页大小（默认20）",
		minimum: 1
	})),
	page_token: Type.Optional(Type.String({ description: "分页标记。首次请求无需填写" })),
	user_id_type: Type.Optional(StringEnum([
		"open_id",
		"union_id",
		"user_id"
	], { description: "用户 ID 类型（默认 open_id）" }))
}), Type.Object({
	action: Type.Literal("get"),
	chat_id: Type.String({ description: "群 ID（格式如 oc_xxx）" }),
	user_id_type: Type.Optional(StringEnum([
		"open_id",
		"union_id",
		"user_id"
	], { description: "用户 ID 类型（默认 open_id）" }))
})]);
function registerChatSearchTool(api) {
	if (!api.config) return false;
	const cfg = api.config;
	const { toolClient, log } = createToolContext(api, "feishu_chat");
	return registerTool(api, {
		name: "feishu_chat",
		label: "Feishu: Chat Management",
		description: "以用户身份调用飞书群聊管理工具。Actions: search（搜索群列表，支持关键词匹配群名称、群成员）, get（获取指定群的详细信息，包括群名称、描述、头像、群主、权限配置等）。",
		parameters: FeishuChatSchema,
		async execute(_toolCallId, params) {
			const p = params;
			try {
				const client = toolClient();
				switch (p.action) {
					case "search": {
						log.info(`search: query="${p.query}", page_size=${p.page_size ?? 20}`);
						const res = await client.invoke("feishu_chat.search", (sdk, opts) => sdk.im.v1.chat.search({ params: {
							user_id_type: p.user_id_type || "open_id",
							query: p.query,
							page_size: p.page_size,
							page_token: p.page_token
						} }, opts), { as: "user" });
						assertLarkOk$2(res);
						const data = res.data;
						const chatCount = data?.items?.length ?? 0;
						log.info(`search: found ${chatCount} chats`);
						return json({
							items: data?.items,
							has_more: data?.has_more ?? false,
							page_token: data?.page_token
						});
					}
					case "get": {
						log.info(`get: chat_id=${p.chat_id}, user_id_type=${p.user_id_type ?? "open_id"}`);
						const res = await client.invoke("feishu_chat.get", (sdk, opts) => sdk.im.v1.chat.get({
							path: { chat_id: p.chat_id },
							params: { user_id_type: p.user_id_type || "open_id" }
						}, {
							...opts ?? {},
							headers: {
								...opts?.headers ?? {},
								"X-Chat-Custom-Header": "enable_chat_list_security_check"
							}
						}), { as: "user" });
						assertLarkOk$2(res);
						log.info(`get: retrieved chat info for ${p.chat_id}`);
						return json({ chat: res.data });
					}
				}
			} catch (err) {
				return await handleInvokeErrorWithAutoAuth(err, cfg);
			}
		}
	}, { name: "feishu_chat" });
}
//#endregion
//#region src/tools/oapi/chat/members.ts
const ChatMembersSchema = Type.Object({
	chat_id: Type.String({ description: "群 ID（格式如 oc_xxx）。可以通过 feishu_chat_search 工具搜索获取" }),
	member_id_type: Type.Optional(StringEnum([
		"open_id",
		"union_id",
		"user_id"
	])),
	page_size: Type.Optional(Type.Integer({
		description: "分页大小（默认20）",
		minimum: 1
	})),
	page_token: Type.Optional(Type.String({ description: "分页标记。首次请求无需填写" }))
});
function registerChatMembersTool(api) {
	if (!api.config) return false;
	const cfg = api.config;
	const { toolClient, log } = createToolContext(api, "feishu_chat_members");
	return registerTool(api, {
		name: "feishu_chat_members",
		label: "Feishu: Get Chat Members",
		description: "以用户的身份获取指定群组的成员列表。返回成员信息，包含成员 ID、姓名等。注意：不会返回群组内的机器人成员。",
		parameters: ChatMembersSchema,
		async execute(_toolCallId, params) {
			const p = params;
			try {
				const client = toolClient();
				log.info(`chat_members: chat_id="${p.chat_id}", page_size=${p.page_size ?? 20}`);
				const res = await client.invoke("feishu_chat_members.default", (sdk, opts) => sdk.im.v1.chatMembers.get({
					path: { chat_id: p.chat_id },
					params: {
						member_id_type: p.member_id_type || "open_id",
						page_size: p.page_size,
						page_token: p.page_token
					}
				}, {
					...opts ?? {},
					headers: {
						...opts?.headers ?? {},
						"X-Chat-Custom-Header": "enable_chat_list_security_check"
					}
				}), { as: "user" });
				assertLarkOk$2(res);
				const data = res.data;
				const memberCount = data?.items?.length ?? 0;
				const memberTotal = data?.member_total ?? 0;
				log.info(`chat_members: found ${memberCount} members (total: ${memberTotal})`);
				return json({
					items: data?.items,
					has_more: data?.has_more ?? false,
					page_token: data?.page_token,
					member_total: memberTotal
				});
			} catch (err) {
				return await handleInvokeErrorWithAutoAuth(err, cfg);
			}
		}
	}, { name: "feishu_chat_members" });
}
//#endregion
//#region src/tools/oapi/chat/index.ts
function registerFeishuChatTools(api) {
	const registered = [];
	if (registerChatSearchTool(api)) registered.push("feishu_chat");
	if (registerChatMembersTool(api)) registered.push("feishu_chat_members");
	if (registered.length > 0) api.logger.info?.(`feishu_chat: Registered ${registered.join(", ")}`);
}
//#endregion
//#region src/tools/oapi/im/message.ts
const FEISHU_POST_LOCALE_PRIORITY = [
	"zh_cn",
	"en_us",
	"ja_jp"
];
/**
* Check whether a value is a non-null object whose properties can be read.
*
* @param value - The value to check
* @returns Whether the value is a non-null object
*/
function isRecord$1(value) {
	return value != null && typeof value === "object";
}
/**
* Collect post content bodies from a parsed Feishu post payload.
* Handles both flat (title/content at root) and multi-locale wrapper structures.
*
* @param parsed - The parsed JSON object
* @returns List of post content bodies to process
*/
function collectPostContents(parsed) {
	if ("title" in parsed || "content" in parsed) return [parsed];
	const bodies = [];
	const seen = /* @__PURE__ */ new Set();
	for (const locale of FEISHU_POST_LOCALE_PRIORITY) {
		const localeContent = parsed[locale];
		if (!isRecord$1(localeContent)) continue;
		const body = localeContent;
		if (!seen.has(body)) {
			bodies.push(body);
			seen.add(body);
		}
	}
	for (const value of Object.values(parsed)) {
		if (!isRecord$1(value)) continue;
		const body = value;
		if (!seen.has(body)) {
			bodies.push(body);
			seen.add(body);
		}
	}
	return bodies;
}
/**
* Convert markdown tables to the Feishu-compatible list format.
*
* Reuses the channel runtime's existing converter so the tool send path
* behaves identically to the main reply path.
*
* @param cfg - Current tool configuration
* @param text - Raw markdown text
* @returns Converted text, or the original text when runtime is unavailable
*/
function convertMarkdownTablesForLark(cfg, text) {
	try {
		const runtime = LarkClient.runtime;
		if (runtime?.channel?.text?.convertMarkdownTables && runtime.channel.text.resolveMarkdownTableMode) {
			const tableMode = runtime.channel.text.resolveMarkdownTableMode({
				cfg,
				channel: "feishu"
			});
			return runtime.channel.text.convertMarkdownTables(text, tableMode);
		}
	} catch {}
	return text;
}
/**
* Pre-process `tag="md"` text nodes inside `post` messages so the tool send
* path also renders markdown tables correctly.
*
* @param cfg - Current tool configuration
* @param msgType - Feishu message type
* @param content - The JSON string from tool parameters
* @returns Pre-processed JSON string
*/
function preprocessPostContent(cfg, msgType, content) {
	if (msgType !== "post") return content;
	try {
		const parsed = JSON.parse(content);
		if (!isRecord$1(parsed)) return content;
		const postContents = collectPostContents(parsed);
		if (postContents.length === 0) return content;
		let changed = false;
		for (const postContent of postContents) {
			if (!postContent.content || !Array.isArray(postContent.content)) continue;
			for (const line of postContent.content) {
				if (!Array.isArray(line)) continue;
				for (const block of line) {
					if (!isRecord$1(block) || block.tag !== "md" || typeof block.text !== "string") continue;
					const convertedText = convertMarkdownTablesForLark(cfg, block.text);
					if (convertedText !== block.text) {
						block.text = convertedText;
						changed = true;
					}
				}
			}
		}
		return changed ? JSON.stringify(parsed) : content;
	} catch {
		return content;
	}
}
const FeishuImMessageSchema = Type.Union([Type.Object({
	action: Type.Literal("send"),
	receive_id_type: StringEnum(["open_id", "chat_id"], { description: "接收者 ID 类型：open_id（私聊，ou_xxx）、chat_id（群聊，oc_xxx）" }),
	receive_id: Type.String({ description: "接收者 ID，与 receive_id_type 对应。open_id 填 'ou_xxx'，chat_id 填 'oc_xxx'" }),
	msg_type: StringEnum([
		"text",
		"post",
		"image",
		"file",
		"audio",
		"media",
		"interactive",
		"share_chat",
		"share_user"
	], { description: "消息类型：text（纯文本）、post（富文本）、image（图片）、file（文件）、interactive（消息卡片）、share_chat（群名片）、share_user（个人名片）等" }),
	content: Type.String({ description: "消息内容（JSON 字符串），格式取决于 msg_type。示例：text → '{\"text\":\"你好\"}'，image → '{\"image_key\":\"img_xxx\"}'，share_chat → '{\"chat_id\":\"oc_xxx\"}'，post → '{\"zh_cn\":{\"title\":\"标题\",\"content\":[[{\"tag\":\"text\",\"text\":\"正文\"}]]}}'" }),
	uuid: Type.Optional(Type.String({ description: "幂等唯一标识。同一 uuid 在 1 小时内只会发送一条消息，用于去重" }))
}), Type.Object({
	action: Type.Literal("reply"),
	message_id: Type.String({ description: "被回复消息的 ID（om_xxx 格式）" }),
	msg_type: StringEnum([
		"text",
		"post",
		"image",
		"file",
		"audio",
		"media",
		"interactive",
		"share_chat",
		"share_user"
	], { description: "消息类型：text（纯文本）、post（富文本）、image（图片）、interactive（消息卡片）等" }),
	content: Type.String({ description: "回复消息内容（JSON 字符串），格式同 send 的 content" }),
	reply_in_thread: Type.Optional(Type.Boolean({ description: "是否以话题形式回复。true 则消息出现在该消息的话题中，false（默认）则出现在聊天主流" })),
	uuid: Type.Optional(Type.String({ description: "幂等唯一标识" }))
})]);
function registerFeishuImUserMessageTool(api) {
	if (!api.config) return false;
	const cfg = api.config;
	const { toolClient, log } = createToolContext(api, "feishu_im_user_message");
	return registerTool(api, {
		name: "feishu_im_user_message",
		label: "Feishu: IM User Message",
		description: "飞书用户身份 IM 消息工具。**有且仅当用户明确要求以自己身份发消息、回复消息时使用，当没有明确要求时优先使用message系统工具**。\n\nActions:\n- send（发送消息）：发送消息到私聊或群聊。私聊用 receive_id_type=open_id，群聊用 receive_id_type=chat_id\n- reply（回复消息）：回复指定 message_id 的消息，支持话题回复（reply_in_thread=true）\n\n【重要】content 必须是合法 JSON 字符串，格式取决于 msg_type。最常用：text 类型 content 为 '{\"text\":\"消息内容\"}'。\n\n【安全约束】此工具以用户身份发送消息，发出后对方看到的发送者是用户本人。调用前必须先向用户确认：1) 发送对象（哪个人或哪个群）2) 消息内容。禁止在用户未明确同意的情况下自行发送消息。",
		parameters: FeishuImMessageSchema,
		async execute(_toolCallId, params) {
			const p = params;
			try {
				const client = toolClient();
				switch (p.action) {
					case "send": {
						log.info(`send: receive_id_type=${p.receive_id_type}, receive_id=${p.receive_id}, msg_type=${p.msg_type}`);
						const processedContent = preprocessPostContent(createAccountScopedConfig(cfg, client.account.accountId), p.msg_type, p.content);
						const res = await client.invoke("feishu_im_user_message.send", (sdk, opts) => sdk.im.v1.message.create({
							params: { receive_id_type: p.receive_id_type },
							data: {
								receive_id: p.receive_id,
								msg_type: p.msg_type,
								content: processedContent,
								uuid: p.uuid
							}
						}, opts), { as: "user" });
						assertLarkOk$2(res);
						const data = res.data;
						log.info(`send: message sent, message_id=${data?.message_id}`);
						return json({
							message_id: data?.message_id,
							chat_id: data?.chat_id,
							create_time: data?.create_time
						});
					}
					case "reply": {
						log.info(`reply: message_id=${p.message_id}, msg_type=${p.msg_type}, reply_in_thread=${p.reply_in_thread ?? false}`);
						const processedContent = preprocessPostContent(createAccountScopedConfig(cfg, client.account.accountId), p.msg_type, p.content);
						const res = await client.invoke("feishu_im_user_message.reply", (sdk, opts) => sdk.im.v1.message.reply({
							path: { message_id: p.message_id },
							data: {
								content: processedContent,
								msg_type: p.msg_type,
								reply_in_thread: p.reply_in_thread,
								uuid: p.uuid
							}
						}, opts), { as: "user" });
						assertLarkOk$2(res);
						const data = res.data;
						log.info(`reply: message sent, message_id=${data?.message_id}`);
						return json({
							message_id: data?.message_id,
							chat_id: data?.chat_id,
							create_time: data?.create_time
						});
					}
				}
			} catch (err) {
				return await handleInvokeErrorWithAutoAuth(err, cfg);
			}
		}
	}, { name: "feishu_im_user_message" });
}
//#endregion
//#region src/tools/oapi/im/resource.ts
const MIME_TO_EXT = {
	"image/png": ".png",
	"image/jpeg": ".jpg",
	"image/jpg": ".jpg",
	"image/gif": ".gif",
	"image/webp": ".webp",
	"image/svg+xml": ".svg",
	"image/bmp": ".bmp",
	"image/tiff": ".tiff",
	"video/mp4": ".mp4",
	"video/mpeg": ".mpeg",
	"video/quicktime": ".mov",
	"video/x-msvideo": ".avi",
	"video/webm": ".webm",
	"audio/mpeg": ".mp3",
	"audio/wav": ".wav",
	"audio/ogg": ".ogg",
	"audio/mp4": ".m4a",
	"application/pdf": ".pdf",
	"application/msword": ".doc",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
	"application/vnd.ms-excel": ".xls",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
	"application/vnd.ms-powerpoint": ".ppt",
	"application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
	"application/zip": ".zip",
	"application/x-rar-compressed": ".rar",
	"text/plain": ".txt",
	"application/json": ".json"
};
const FetchResourceSchema = Type.Object({
	message_id: Type.String({ description: "消息 ID（om_xxx 格式），从消息事件或消息列表中获取" }),
	file_key: Type.String({ description: "资源 Key，从消息体中获取。图片消息的 image_key（img_xxx）或文件消息的 file_key（file_xxx）" }),
	type: StringEnum(["image", "file"], { description: "资源类型：image（图片消息中的图片）、file（文件/音频/视频消息中的文件）" })
});
function registerFeishuImUserFetchResourceTool(api) {
	if (!api.config) return false;
	const cfg = api.config;
	const { toolClient, log } = createToolContext(api, "feishu_im_user_fetch_resource");
	return registerTool(api, {
		name: "feishu_im_user_fetch_resource",
		label: "Feishu: IM Fetch Resource",
		description: "【以用户身份】下载飞书 IM 消息中的文件或图片资源到本地文件。需要用户 OAuth 授权。\n\n适用场景：当你以用户身份调用了消息列表/搜索等 API 获取到 message_id 和 file_key 时，应使用本工具以同样的用户身份下载资源。\n注意：如果 message_id 来自当前对话上下文（用户发给机器人的消息、引用的消息），请使用 feishu_im_bot_image 工具以机器人身份下载，无需用户授权。\n\n参数说明：\n- message_id：消息 ID（om_xxx），从消息事件或消息列表中获取\n- file_key：资源 Key，从消息体中获取。图片用 image_key（img_xxx），文件用 file_key（file_xxx）\n- type：图片用 image，文件/音频/视频用 file\n\n文件自动保存到 /tmp/openclaw/ 下，返回值中的 saved_path 为实际保存路径。\n限制：文件大小不超过 100MB。不支持下载表情包、合并转发消息、卡片中的资源。",
		parameters: FetchResourceSchema,
		async execute(_toolCallId, params) {
			const p = params;
			try {
				const client = toolClient();
				log.info(`fetch_resource: message_id="${p.message_id}", file_key="${p.file_key}", type="${p.type}"`);
				const res = await client.invoke("feishu_im_user_fetch_resource.default", (sdk, opts) => sdk.im.v1.messageResource.get({
					params: { type: p.type },
					path: {
						message_id: p.message_id,
						file_key: p.file_key
					}
				}, opts), { as: "user" });
				const stream = res.getReadableStream();
				const chunks = [];
				for await (const chunk of stream) chunks.push(chunk);
				const buffer = Buffer.concat(chunks);
				log.info(`fetch_resource: downloaded ${buffer.length} bytes`);
				const contentType = res.headers?.["content-type"] || "";
				log.info(`fetch_resource: content-type=${contentType}`);
				const mimeType = contentType ? contentType.split(";")[0].trim() : "";
				const finalPath = buildRandomTempFilePath({
					prefix: "im-resource",
					extension: mimeType ? MIME_TO_EXT[mimeType] : void 0
				});
				log.info(`fetch_resource: saving to ${finalPath}`);
				await fs$1.mkdir(path$1.dirname(finalPath), { recursive: true });
				try {
					await fs$1.writeFile(finalPath, buffer);
					log.info(`fetch_resource: saved to ${finalPath}`);
					return json({
						message_id: p.message_id,
						file_key: p.file_key,
						type: p.type,
						size_bytes: buffer.length,
						content_type: contentType,
						saved_path: finalPath
					});
				} catch (err) {
					log.error(`fetch_resource: failed to save file: ${err}`);
					return json({ error: `保存文件失败: ${err instanceof Error ? err.message : String(err)}` });
				}
			} catch (err) {
				return await handleInvokeErrorWithAutoAuth(err, cfg);
			}
		}
	}, { name: "feishu_im_user_fetch_resource" });
}
//#endregion
//#region src/tools/oapi/im/time-utils.ts
/**
* Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
* SPDX-License-Identifier: MIT
*
* 时间工具函数 — 对齐 Go 实现 (time.go + timerange.go)
*
* 以 ISO 8601 (RFC 3339) 作为标准时间交换格式，
* 提供 ISO 8601 ↔ Unix 转换工具及时间范围解析。
*/
const BJ_OFFSET_MS = 480 * 60 * 1e3;
/** 将 Date 格式化为北京时间 ISO 8601 字符串 */
function formatBeijingISO(d) {
	const bj = new Date(d.getTime() + BJ_OFFSET_MS);
	return `${bj.getUTCFullYear()}-${String(bj.getUTCMonth() + 1).padStart(2, "0")}-${String(bj.getUTCDate()).padStart(2, "0")}T${String(bj.getUTCHours()).padStart(2, "0")}:${String(bj.getUTCMinutes()).padStart(2, "0")}:${String(bj.getUTCSeconds()).padStart(2, "0")}+08:00`;
}
/** Unix 毫秒（数字）→ ISO 8601 北京时间 */
function millisToDateTime(millis) {
	return formatBeijingISO(new Date(millis));
}
/** Unix 毫秒（字符串）→ ISO 8601 北京时间 */
function millisStringToDateTime(millis) {
	return millisToDateTime(parseInt(millis, 10));
}
/** ISO 8601 → Unix 秒（数字） */
function dateTimeToSeconds(datetime) {
	const d = new Date(datetime);
	if (isNaN(d.getTime())) throw new Error(`无法解析 ISO 8601 时间: "${datetime}"。格式示例: 2026-02-27T14:30:00+08:00`);
	return Math.floor(d.getTime() / 1e3);
}
/** ISO 8601 → Unix 秒（字符串） */
function dateTimeToSecondsString(datetime) {
	return dateTimeToSeconds(datetime).toString();
}
/**
* 解析时间范围标识，返回 ISO 8601 字符串对。
*
* 支持的格式：
* - `today` / `yesterday` / `day_before_yesterday`
* - `this_week` / `last_week` / `this_month` / `last_month`
* - `last_{N}_{unit}` — unit: minutes / hours / days
*
* 所有计算基于北京时间 (UTC+8)。
*/
function parseTimeRange(input) {
	const now = /* @__PURE__ */ new Date();
	const bjNow = toBeijingDate(now);
	let start;
	let end;
	switch (input) {
		case "today":
			start = beijingStartOfDay(bjNow);
			end = now;
			break;
		case "yesterday": {
			const d = new Date(bjNow);
			d.setUTCDate(d.getUTCDate() - 1);
			start = beijingStartOfDay(d);
			end = beijingEndOfDay(d);
			break;
		}
		case "day_before_yesterday": {
			const d = new Date(bjNow);
			d.setUTCDate(d.getUTCDate() - 2);
			start = beijingStartOfDay(d);
			end = beijingEndOfDay(d);
			break;
		}
		case "this_week": {
			const day = bjNow.getUTCDay();
			const diffToMon = day === 0 ? 6 : day - 1;
			const monday = new Date(bjNow);
			monday.setUTCDate(monday.getUTCDate() - diffToMon);
			start = beijingStartOfDay(monday);
			end = now;
			break;
		}
		case "last_week": {
			const day = bjNow.getUTCDay();
			const diffToMon = day === 0 ? 6 : day - 1;
			const thisMonday = new Date(bjNow);
			thisMonday.setUTCDate(thisMonday.getUTCDate() - diffToMon);
			const lastMonday = new Date(thisMonday);
			lastMonday.setUTCDate(lastMonday.getUTCDate() - 7);
			const lastSunday = new Date(thisMonday);
			lastSunday.setUTCDate(lastSunday.getUTCDate() - 1);
			start = beijingStartOfDay(lastMonday);
			end = beijingEndOfDay(lastSunday);
			break;
		}
		case "this_month":
			start = beijingStartOfDay(new Date(Date.UTC(bjNow.getUTCFullYear(), bjNow.getUTCMonth(), 1)));
			end = now;
			break;
		case "last_month": {
			const firstDayThisMonth = new Date(Date.UTC(bjNow.getUTCFullYear(), bjNow.getUTCMonth(), 1));
			const lastDayPrevMonth = new Date(firstDayThisMonth);
			lastDayPrevMonth.setUTCDate(lastDayPrevMonth.getUTCDate() - 1);
			start = beijingStartOfDay(new Date(Date.UTC(lastDayPrevMonth.getUTCFullYear(), lastDayPrevMonth.getUTCMonth(), 1)));
			end = beijingEndOfDay(lastDayPrevMonth);
			break;
		}
		default: {
			const match = input.match(/^last_(\d+)_(minutes?|hours?|days?)$/);
			if (!match) throw new Error(`不支持的 relative_time 格式: "${input}"。支持: today, yesterday, day_before_yesterday, this_week, last_week, this_month, last_month, last_{N}_{unit}（unit: minutes/hours/days）`);
			start = subtractFromNow(now, parseInt(match[1], 10), match[2].replace(/s$/, ""));
			end = now;
			break;
		}
	}
	return {
		start: formatBeijingISO(start),
		end: formatBeijingISO(end)
	};
}
/**
* 解析时间范围标识，返回 Unix 秒字符串对（供 SDK 调用）。
*/
function parseTimeRangeToSeconds(input) {
	const range = parseTimeRange(input);
	return {
		start: dateTimeToSecondsString(range.start),
		end: dateTimeToSecondsString(range.end)
	};
}
/** 将 UTC Date 转为「北京时间各部分存在 UTC 字段上」的 Date */
function toBeijingDate(d) {
	return new Date(d.getTime() + BJ_OFFSET_MS);
}
/** 北京时间当天 00:00:00 对应的真实 UTC Date */
function beijingStartOfDay(bjDate) {
	return new Date(Date.UTC(bjDate.getUTCFullYear(), bjDate.getUTCMonth(), bjDate.getUTCDate()) - BJ_OFFSET_MS);
}
/** 北京时间当天 23:59:59 对应的真实 UTC Date */
function beijingEndOfDay(bjDate) {
	return new Date(Date.UTC(bjDate.getUTCFullYear(), bjDate.getUTCMonth(), bjDate.getUTCDate(), 23, 59, 59) - BJ_OFFSET_MS);
}
function subtractFromNow(now, n, unit) {
	const d = new Date(now);
	switch (unit) {
		case "minute":
			d.setMinutes(d.getMinutes() - n);
			break;
		case "hour":
			d.setHours(d.getHours() - n);
			break;
		case "day":
			d.setDate(d.getDate() - n);
			break;
		default: throw new Error(`不支持的时间单位: ${unit}`);
	}
	return d;
}
//#endregion
//#region src/tools/oapi/im/user-name-uat.ts
const UAT_MAX_SIZE = 500;
const UAT_TTL_MS = 1800 * 1e3;
const uatRegistry = /* @__PURE__ */ new Map();
function getOrCreateCache(accountId) {
	let cache = uatRegistry.get(accountId);
	if (!cache) {
		cache = /* @__PURE__ */ new Map();
		uatRegistry.set(accountId, cache);
	}
	return cache;
}
function evict(cache) {
	while (cache.size > UAT_MAX_SIZE) {
		const oldest = cache.keys().next().value;
		if (oldest !== void 0) cache.delete(oldest);
	}
}
/** 从 UAT 缓存中获取用户名 */
function getUATUserName(accountId, openId) {
	const cache = uatRegistry.get(accountId);
	if (!cache) return void 0;
	const entry = cache.get(openId);
	if (!entry) return void 0;
	if (entry.expireAt <= Date.now()) {
		cache.delete(openId);
		return;
	}
	cache.delete(openId);
	cache.set(openId, entry);
	return entry.name;
}
/** 批量写入 UAT 缓存 */
function setUATUserNames(accountId, entries) {
	const cache = getOrCreateCache(accountId);
	const now = Date.now();
	for (const [openId, name] of entries) {
		cache.delete(openId);
		cache.set(openId, {
			name,
			expireAt: now + UAT_TTL_MS
		});
	}
	evict(cache);
}
const BATCH_SIZE = 10;
async function batchResolveUserNamesAsUser(params) {
	const { client, openIds, log } = params;
	if (openIds.length === 0) return /* @__PURE__ */ new Map();
	const accountId = client.account.accountId;
	const cache = getOrCreateCache(accountId);
	const result = /* @__PURE__ */ new Map();
	const now = Date.now();
	const missing = [];
	for (const id of openIds) {
		const entry = cache.get(id);
		if (entry && entry.expireAt > now) result.set(id, entry.name);
		else {
			if (entry) cache.delete(id);
			missing.push(id);
		}
	}
	const uniqueMissing = [...new Set(missing)];
	if (uniqueMissing.length === 0) return result;
	const totalBatches = Math.ceil(uniqueMissing.length / BATCH_SIZE);
	log(`batchResolveUserNamesAsUser: resolving ${uniqueMissing.length} user(s) in ${totalBatches} batch(es), ${result.size} cache hit(s)`);
	for (let i = 0; i < uniqueMissing.length; i += BATCH_SIZE) {
		const chunk = uniqueMissing.slice(i, i + BATCH_SIZE);
		const batchIndex = Math.floor(i / BATCH_SIZE) + 1;
		try {
			const users = (await client.invoke("feishu_get_user.basic_batch", (sdk, opts) => sdk.request({
				method: "POST",
				url: "/open-apis/contact/v3/users/basic_batch",
				data: { user_ids: chunk },
				params: { user_id_type: "open_id" }
			}, opts), { as: "user" }))?.data?.users ?? [];
			let resolved = 0;
			for (const user of users) {
				const openId = user.user_id;
				const rawName = user.name;
				const name = typeof rawName === "string" ? rawName : rawName?.value;
				if (openId && name) {
					cache.delete(openId);
					cache.set(openId, {
						name,
						expireAt: Date.now() + UAT_TTL_MS
					});
					result.set(openId, name);
					resolved++;
				}
			}
			const unresolvedCount = chunk.length - resolved;
			if (unresolvedCount > 0) log(`batchResolveUserNamesAsUser: batch ${batchIndex}/${totalBatches}: ${resolved} resolved, ${unresolvedCount} missing name`);
		} catch (err) {
			if (isInvokeError(err)) throw err;
			log(`batchResolveUserNamesAsUser: failed: ${String(err)}`);
		}
	}
	evict(cache);
	return result;
}
//#endregion
//#region src/tools/oapi/im/format-messages.ts
const log$2 = larkLogger("oapi/im/format-messages");
/** 通过 UAT 获取合并转发子消息 */
function createUATFetchSubMessages(client) {
	return async (messageId) => {
		const res = await client.invokeByPath("feishu_im_user_get_messages.default", `/open-apis/im/v1/messages/${messageId}`, {
			method: "GET",
			query: {
				user_id_type: "open_id",
				card_msg_content_type: "raw_card_content"
			},
			as: "user"
		});
		if (res.code !== 0) throw new Error(`API error: code=${res.code} msg=${res.msg}`);
		return res.data?.items ?? [];
	};
}
/**
* 格式化单条消息对象。
*
* 使用 convertMessageContent 将 body.content 转为 AI 可读文本，
* 并过滤掉 AI 不需要的字段（upper_message_id、tenant_key 等）。
*/
async function formatMessageItem(item, accountId, nameResolver, ctxOverrides) {
	const messageId = item.message_id ?? "";
	const msgType = item.msg_type ?? "unknown";
	let content = "";
	try {
		const rawContent = item.body?.content ?? "";
		if (rawContent) content = (await convertMessageContent(rawContent, msgType, {
			...buildConvertContextFromItem(item, messageId, accountId),
			...ctxOverrides
		})).content;
	} catch (err) {
		log$2.warn("converter failed, falling back to raw content", {
			messageId,
			msgType,
			error: err instanceof Error ? err.message : String(err)
		});
		content = item.body?.content ?? "";
	}
	const senderId = item.sender?.id ?? "";
	const senderType = item.sender?.sender_type ?? "unknown";
	let senderName;
	if (senderId && senderType === "user") senderName = nameResolver(senderId);
	const sender = {
		id: senderId,
		sender_type: senderType
	};
	if (senderName) sender.name = senderName;
	let mentions;
	if (item.mentions && item.mentions.length > 0) mentions = item.mentions.map((m) => ({
		key: m.key ?? "",
		id: extractMentionOpenId(m.id),
		name: m.name ?? ""
	}));
	const createTime = item.create_time ? millisStringToDateTime(item.create_time) : "";
	const formatted = {
		message_id: messageId,
		msg_type: msgType,
		content,
		sender,
		create_time: createTime,
		deleted: item.deleted ?? false,
		updated: item.updated ?? false
	};
	if (item.thread_id) formatted.thread_id = item.thread_id;
	else if (item.parent_id) formatted.reply_to = item.parent_id;
	if (mentions) formatted.mentions = mentions;
	return formatted;
}
/**
* 批量格式化消息列表（UAT 路径）。
*
* 先批量解析所有 sender 的名字（写入 UAT 缓存），再逐条格式化。
* 这样 formatMessageItem 中的 sender.name 和 converter 的
* resolveUserName 都能从 UAT 缓存中读到名字。
*/
async function formatMessageList(items, account, log, client) {
	const accountId = account.accountId;
	const nameResolver = (openId) => getUATUserName(accountId, openId);
	const mentionNames = /* @__PURE__ */ new Map();
	for (const item of items) for (const m of item.mentions ?? []) {
		const openId = extractMentionOpenId(m.id);
		if (openId && m.name) mentionNames.set(openId, m.name);
	}
	if (mentionNames.size > 0) setUATUserNames(accountId, mentionNames);
	const senderIds = [...new Set(items.map((item) => item.sender?.sender_type === "user" ? item.sender.id : void 0).filter((id) => !!id))];
	if (senderIds.length > 0) {
		const missing = senderIds.filter((id) => getUATUserName(accountId, id) === void 0);
		if (missing.length > 0) await batchResolveUserNamesAsUser({
			client,
			openIds: missing,
			log
		});
	}
	const uatBatchResolve = async (openIds) => {
		await batchResolveUserNamesAsUser({
			client,
			openIds,
			log
		});
	};
	const ctxOverrides = {
		account,
		accountId,
		resolveUserName: nameResolver,
		batchResolveNames: uatBatchResolve,
		fetchSubMessages: createUATFetchSubMessages(client)
	};
	return Promise.all(items.map((item) => formatMessageItem(item, accountId, nameResolver, ctxOverrides)));
}
//#endregion
//#region src/tools/oapi/im/message-read.ts
function sortRuleToSortType(rule) {
	return rule === "create_time_asc" ? "ByCreateTimeAsc" : "ByCreateTimeDesc";
}
/** open_id → chat_id (P2P 单聊) */
async function resolveP2PChatId(client, openId, log) {
	const chats = (await client.invokeByPath("feishu_im_user_get_messages.default", "/open-apis/im/v1/chat_p2p/batch_query", {
		method: "POST",
		body: { chatter_ids: [openId] },
		query: { user_id_type: "open_id" },
		as: "user"
	})).data?.p2p_chats;
	if (!chats?.length) {
		log.info(`batch_query: no p2p chat found for open_id=${openId}`);
		throw new Error(`no 1-on-1 chat found with open_id=${openId}. You may not have chat history with this user.`);
	}
	log.info(`batch_query: resolved chat_id=${chats[0].chat_id}`);
	return chats[0].chat_id;
}
/** 解析时间参数，返回秒级时间戳字符串 */
function resolveTimeRange(p, logInfo) {
	if (p.relative_time) {
		const range = parseTimeRangeToSeconds(p.relative_time);
		logInfo(`relative_time="${p.relative_time}" → start=${range.start}, end=${range.end}`);
		return range;
	}
	return {
		start: p.start_time ? dateTimeToSecondsString(p.start_time) : void 0,
		end: p.end_time ? dateTimeToSecondsString(p.end_time) : void 0
	};
}
/** 格式化 message.list 结果并返回 */
async function formatAndReturn(res, config, log, client) {
	const messages = await formatMessageList(res.data?.items ?? [], getFirstAccount(config), (...args) => log.info(args.map(String).join(" ")), client);
	const hasMore = res.data?.has_more ?? false;
	const pageToken = res.data?.page_token;
	log.info(`list: returned ${messages.length} messages, has_more=${hasMore}`);
	return json({
		messages,
		has_more: hasMore,
		page_token: pageToken
	});
}
const GetMessagesSchema = Type.Object({
	open_id: Type.Optional(Type.String({ description: "用户 open_id（ou_xxx），获取与该用户的单聊消息。与 chat_id 互斥" })),
	chat_id: Type.Optional(Type.String({ description: "会话 ID（oc_xxx），支持单聊和群聊。与 open_id 互斥" })),
	sort_rule: Type.Optional(StringEnum(["create_time_asc", "create_time_desc"], { description: "排序方式，默认 create_time_desc（最新消息在前）" })),
	page_size: Type.Optional(Type.Number({
		description: "每页消息数（1-50），默认 50",
		minimum: 1,
		maximum: 50
	})),
	page_token: Type.Optional(Type.String({ description: "分页标记，用于获取下一页" })),
	relative_time: Type.Optional(Type.String({ description: "相对时间范围：today / yesterday / day_before_yesterday / this_week / last_week / this_month / last_month / last_{N}_{unit}（unit: minutes/hours/days）。与 start_time/end_time 互斥" })),
	start_time: Type.Optional(Type.String({ description: "起始时间（ISO 8601 格式，如 2026-02-27T00:00:00+08:00）。与 relative_time 互斥" })),
	end_time: Type.Optional(Type.String({ description: "结束时间（ISO 8601 格式，如 2026-02-27T23:59:59+08:00）。与 relative_time 互斥" }))
});
function registerGetMessages(api) {
	if (!api.config) return false;
	const config = api.config;
	const { toolClient, log } = createToolContext(api, "feishu_im_user_get_messages");
	return registerTool(api, {
		name: "feishu_im_user_get_messages",
		label: "Feishu: Get IM Messages",
		description: "【以用户身份】获取群聊或单聊的历史消息。\n\n用法：\n- 通过 chat_id 获取群聊/单聊消息\n- 通过 open_id 获取与指定用户的单聊消息（自动解析 chat_id）\n- 支持时间范围过滤：relative_time（如 today、last_3_days）或 start_time/end_time（ISO 8601 格式）\n- 支持分页：page_size + page_token\n\n【参数约束】\n- open_id 和 chat_id 必须二选一，不能同时提供\n- relative_time 和 start_time/end_time 不能同时使用\n- page_size 范围 1-50，默认 50\n\n返回消息列表，每条消息包含 message_id、msg_type、content（AI 可读文本）、sender、create_time 等字段。",
		parameters: GetMessagesSchema,
		async execute(_toolCallId, params) {
			const p = params;
			try {
				if (p.open_id && p.chat_id) return json({ error: "cannot provide both open_id and chat_id, please provide only one" });
				if (!p.open_id && !p.chat_id) return json({ error: "either open_id or chat_id is required" });
				if (p.relative_time && (p.start_time || p.end_time)) return json({ error: "cannot use both relative_time and start_time/end_time" });
				const client = toolClient();
				let chatId = p.chat_id ?? "";
				if (p.open_id) {
					log.info(`resolving P2P chat for open_id=${p.open_id}`);
					chatId = await resolveP2PChatId(client, p.open_id, log);
				}
				const time = resolveTimeRange(p, log.info);
				log.info(`list: chat_id=${chatId}, sort=${p.sort_rule ?? "create_time_desc"}, page_size=${p.page_size ?? 50}`);
				const res = await client.invoke("feishu_im_user_get_messages.default", (sdk, opts) => sdk.im.v1.message.list({ params: {
					container_id_type: "chat",
					container_id: chatId,
					start_time: time.start,
					end_time: time.end,
					sort_type: sortRuleToSortType(p.sort_rule),
					page_size: p.page_size ?? 50,
					page_token: p.page_token,
					card_msg_content_type: "raw_card_content"
				} }, opts), { as: "user" });
				assertLarkOk$2(res);
				return await formatAndReturn(res, config, log, client);
			} catch (err) {
				return await handleInvokeErrorWithAutoAuth(err, config);
			}
		}
	}, { name: "feishu_im_user_get_messages" });
}
const GetThreadMessagesSchema = Type.Object({
	thread_id: Type.String({ description: "话题 ID（omt_xxx 格式）" }),
	sort_rule: Type.Optional(StringEnum(["create_time_asc", "create_time_desc"], { description: "排序方式，默认 create_time_desc（最新消息在前）" })),
	page_size: Type.Optional(Type.Number({
		description: "每页消息数（1-50），默认 50",
		minimum: 1,
		maximum: 50
	})),
	page_token: Type.Optional(Type.String({ description: "分页标记，用于获取下一页" }))
});
function registerGetThreadMessages(api) {
	if (!api.config) return false;
	const config = api.config;
	const { toolClient, log } = createToolContext(api, "feishu_im_user_get_thread_messages");
	return registerTool(api, {
		name: "feishu_im_user_get_thread_messages",
		label: "Feishu: Get Thread Messages",
		description: "【以用户身份】获取话题（thread）内的消息列表。\n\n用法：\n- 通过 thread_id（omt_xxx）获取话题内的所有消息\n- 支持分页：page_size + page_token\n\n【注意】话题消息不支持时间范围过滤（飞书 API 限制）\n\n返回消息列表，格式同 feishu_im_user_get_messages。",
		parameters: GetThreadMessagesSchema,
		async execute(_toolCallId, params) {
			const p = params;
			try {
				const client = toolClient();
				log.info(`list: thread_id=${p.thread_id}, sort=${p.sort_rule ?? "create_time_desc"}, page_size=${p.page_size ?? 50}`);
				const res = await client.invoke("feishu_im_user_get_messages.default", (sdk, opts) => sdk.im.v1.message.list({ params: {
					container_id_type: "thread",
					container_id: p.thread_id,
					sort_type: sortRuleToSortType(p.sort_rule),
					page_size: p.page_size ?? 50,
					page_token: p.page_token,
					card_msg_content_type: "raw_card_content"
				} }, opts), { as: "user" });
				assertLarkOk$2(res);
				return await formatAndReturn(res, config, log, client);
			} catch (err) {
				return await handleInvokeErrorWithAutoAuth(err, config);
			}
		}
	}, { name: "feishu_im_user_get_thread_messages" });
}
const SearchMessagesSchema = Type.Object({
	query: Type.Optional(Type.String({ description: "搜索关键词，匹配消息内容。可为空字符串表示不按内容过滤" })),
	sender_ids: Type.Optional(Type.Array(Type.String({ description: "发送者的 open_id（ou_xxx）" }), { description: "发送者 open_id 列表。如需根据用户名查找 open_id，请先使用 search_user 工具" })),
	chat_id: Type.Optional(Type.String({ description: "限定搜索范围的会话 ID（oc_xxx）" })),
	mention_ids: Type.Optional(Type.Array(Type.String({ description: "被@用户的 open_id（ou_xxx）" }), { description: "被@用户的 open_id 列表" })),
	message_type: Type.Optional(StringEnum([
		"file",
		"image",
		"media"
	], { description: "消息类型过滤：file / image / media。为空则搜索所有类型" })),
	sender_type: Type.Optional(StringEnum([
		"user",
		"bot",
		"all"
	], { description: "发送者类型：user / bot / all。默认 user" })),
	chat_type: Type.Optional(StringEnum(["group", "p2p"], { description: "会话类型：group（群聊）/ p2p（单聊）" })),
	relative_time: Type.Optional(Type.String({ description: "相对时间范围：today / yesterday / day_before_yesterday / this_week / last_week / this_month / last_month / last_{N}_{unit}（unit: minutes/hours/days）。与 start_time/end_time 互斥" })),
	start_time: Type.Optional(Type.String({ description: "起始时间（ISO 8601 格式，如 2026-02-27T00:00:00+08:00）。与 relative_time 互斥" })),
	end_time: Type.Optional(Type.String({ description: "结束时间（ISO 8601 格式，如 2026-02-27T23:59:59+08:00）。与 relative_time 互斥" })),
	page_size: Type.Optional(Type.Number({
		description: "每页消息数（1-50），默认 50",
		minimum: 1,
		maximum: 50
	})),
	page_token: Type.Optional(Type.String({ description: "分页标记，用于获取下一页" }))
});
function buildSearchData(p, time) {
	const data = {
		query: p.query ?? "",
		start_time: time.start,
		end_time: time.end
	};
	if (p.sender_ids?.length) data.from_ids = p.sender_ids;
	if (p.chat_id) data.chat_ids = [p.chat_id];
	if (p.mention_ids?.length) data.at_chatter_ids = p.mention_ids;
	if (p.message_type) data.message_type = p.message_type;
	if (p.sender_type && p.sender_type !== "all") data.from_type = p.sender_type;
	if (p.chat_type) data.chat_type = p.chat_type === "group" ? "group_chat" : "p2p_chat";
	return data;
}
async function fetchChatContexts(client, chatIds, logInfo, logWarn) {
	const map = /* @__PURE__ */ new Map();
	if (chatIds.length === 0) return map;
	try {
		logInfo(`batch_query: requesting ${chatIds.length} chat_ids: ${chatIds.join(", ")}`);
		const res = await client.invokeByPath("feishu_im_user_search_messages.default", "/open-apis/im/v1/chats/batch_query", {
			method: "POST",
			body: { chat_ids: chatIds },
			query: { user_id_type: "open_id" },
			as: "user"
		});
		logInfo(`batch_query: response code=${res.code}, msg=${res.msg}, items=${res.data?.items?.length ?? 0}`);
		if (res.code !== 0) logWarn(`batch_query: API returned error code=${res.code}, msg=${res.msg}`);
		for (const c of res.data?.items ?? []) if (c.chat_id) map.set(c.chat_id, {
			name: c.name ?? "",
			chat_mode: c.chat_mode ?? "",
			p2p_target_id: c.p2p_target_id
		});
	} catch (err) {
		logInfo(`batch_query chats failed, skipping: ${err}`);
	}
	return map;
}
async function resolveP2PTargetNames(chatMap, client, logFn) {
	const ids = [...new Set([...chatMap.values()].map((c) => c.p2p_target_id).filter((id) => !!id))];
	if (ids.length > 0) await batchResolveUserNamesAsUser({
		client,
		openIds: ids,
		log: logFn
	});
}
function enrichMessages(messages, items, chatMap, nameResolver) {
	return messages.map((msg, idx) => {
		const chatId = items[idx]?.chat_id;
		const ctx = chatId ? chatMap.get(chatId) : void 0;
		if (!chatId || !ctx) return {
			...msg,
			chat_id: chatId
		};
		if (ctx.chat_mode === "p2p" && ctx.p2p_target_id) {
			const name = nameResolver(ctx.p2p_target_id);
			return {
				...msg,
				chat_id: chatId,
				chat_type: "p2p",
				chat_name: name || void 0,
				chat_partner: {
					open_id: ctx.p2p_target_id,
					name: name || void 0
				}
			};
		}
		return {
			...msg,
			chat_id: chatId,
			chat_type: ctx.chat_mode,
			chat_name: ctx.name || void 0
		};
	});
}
function registerSearchMessages(api) {
	if (!api.config) return false;
	const config = api.config;
	const { toolClient, log } = createToolContext(api, "feishu_im_user_search_messages");
	return registerTool(api, {
		name: "feishu_im_user_search_messages",
		label: "Feishu: Search Messages",
		description: "【以用户身份】跨会话搜索飞书消息。\n\n用法：\n- 按关键词搜索消息内容\n- 按发送者、被@用户、消息类型过滤\n- 按时间范围过滤：relative_time 或 start_time/end_time\n- 限定在某个会话内搜索（chat_id）\n- 支持分页：page_size + page_token\n\n【参数约束】\n- 所有参数均可选，但至少应提供一个过滤条件\n- relative_time 和 start_time/end_time 不能同时使用\n- page_size 范围 1-50，默认 50\n\n返回消息列表，每条消息包含 message_id、msg_type、content、sender、create_time 等字段。\n每条消息还包含 chat_id、chat_type（p2p/group）、chat_name（群名或单聊对方名字）。\n单聊消息额外包含 chat_partner（对方 open_id 和名字）。\n搜索结果中的 chat_id 和 thread_id 可配合 feishu_im_user_get_messages / feishu_im_user_get_thread_messages 查看上下文。",
		parameters: SearchMessagesSchema,
		async execute(_toolCallId, params) {
			const p = params;
			try {
				if (p.relative_time && (p.start_time || p.end_time)) return json({ error: "cannot use both relative_time and start_time/end_time" });
				const client = toolClient();
				const account = getFirstAccount(config);
				const logFn = (...args) => log.info(args.map(String).join(" "));
				const time = resolveTimeRange(p, log.info);
				const searchData = buildSearchData(p, {
					start: time.start ?? "978307200",
					end: time.end ?? Math.floor(Date.now() / 1e3).toString()
				});
				log.info(`search: query="${p.query ?? ""}", page_size=${p.page_size ?? 50}`);
				const searchRes = await client.invoke("feishu_im_user_search_messages.default", (sdk, opts) => sdk.search.message.create({
					data: searchData,
					params: {
						user_id_type: "open_id",
						page_size: p.page_size ?? 50,
						page_token: p.page_token
					}
				}, opts), { as: "user" });
				assertLarkOk$2(searchRes);
				const messageIds = searchRes.data?.items ?? [];
				const hasMore = searchRes.data?.has_more ?? false;
				const pageToken = searchRes.data?.page_token;
				log.info(`search: found ${messageIds.length} IDs, has_more=${hasMore}`);
				if (messageIds.length === 0) return json({
					messages: [],
					has_more: hasMore,
					page_token: pageToken
				});
				const queryStr = messageIds.map((id) => `message_ids=${encodeURIComponent(id)}`).join("&");
				const items = (await client.invokeByPath("feishu_im_user_search_messages.default", `/open-apis/im/v1/messages/mget?${queryStr}`, {
					method: "GET",
					query: {
						user_id_type: "open_id",
						card_msg_content_type: "raw_card_content"
					},
					as: "user"
				})).data?.items ?? [];
				log.info(`mget: ${items.length} details`);
				const chatIds = [...new Set(items.map((i) => i.chat_id).filter(Boolean))];
				const chatMap = await fetchChatContexts(client, chatIds, log.info, log.warn);
				const p2pChats = [...chatMap.entries()].filter(([, v]) => v.chat_mode === "p2p");
				log.info(`chats: ${chatMap.size}/${chatIds.length} resolved, p2p=${p2pChats.length}`);
				const messages = await formatMessageList(items, account, logFn, client);
				await resolveP2PTargetNames(chatMap, client, logFn);
				const uatNameResolver = (id) => getUATUserName(account.accountId, id);
				const result = enrichMessages(messages, items, chatMap, uatNameResolver);
				log.info(`result: ${result.length} messages, has_more=${hasMore}`);
				return json({
					messages: result,
					has_more: hasMore,
					page_token: pageToken
				});
			} catch (err) {
				return await handleInvokeErrorWithAutoAuth(err, config);
			}
		}
	}, { name: "feishu_im_user_search_messages" });
}
function registerMessageReadTools(api) {
	const registered = [];
	if (registerGetMessages(api)) registered.push("feishu_im_user_get_messages");
	if (registerGetThreadMessages(api)) registered.push("feishu_im_user_get_thread_messages");
	if (registerSearchMessages(api)) registered.push("feishu_im_user_search_messages");
	return registered;
}
//#endregion
//#region src/tools/oapi/im/index.ts
function registerFeishuImTools(api) {
	const registered = [];
	if (registerFeishuImUserMessageTool(api)) registered.push("feishu_im_user_message");
	if (registerFeishuImUserFetchResourceTool(api)) registered.push("feishu_im_user_fetch_resource");
	registered.push(...registerMessageReadTools(api));
	if (registered.length > 0) api.logger.info?.(`feishu_im: Registered ${registered.join(", ")}`);
}
//#endregion
//#region src/tools/oapi/index.ts
function registerOapiTools(api) {
	registerGetUserTool(api);
	registerSearchUserTool(api);
	registerFeishuChatTools(api);
	registerFeishuImTools(api);
	registerFeishuCalendarCalendarTool(api);
	registerFeishuCalendarEventTool(api);
	registerFeishuCalendarEventAttendeeTool(api);
	registerFeishuCalendarFreebusyTool(api);
	registerFeishuTaskTaskTool(api);
	registerFeishuTaskTasklistTool(api);
	registerFeishuTaskCommentTool(api);
	registerFeishuTaskSubtaskTool(api);
	registerFeishuBitableAppTool(api);
	registerFeishuBitableAppTableTool(api);
	registerFeishuBitableAppTableRecordTool(api);
	registerFeishuBitableAppTableFieldTool(api);
	registerFeishuBitableAppTableViewTool(api);
	registerFeishuSearchTools(api);
	registerFeishuDriveTools(api);
	registerFeishuWikiTools(api);
	registerFeishuSheetsTools(api);
	registerFeishuImTools$1(api);
	api.logger.info?.("Registered all OAPI tools (calendar, task, bitable, search, drive, wiki, sheets, im)");
}
//#endregion
//#region src/tools/mcp/shared.ts
function isRecord(v) {
	return typeof v === "object" && v !== null;
}
/**
* 从配置对象中提取 MCP endpoint URL
*/
function extractMcpUrlFromConfig(cfg) {
	if (!isRecord(cfg)) return void 0;
	const channels = cfg.channels;
	if (!isRecord(channels)) return void 0;
	const feishu = channels.feishu;
	if (!isRecord(feishu)) return void 0;
	const url = feishu.mcpEndpoint;
	const legacyUrl = feishu.mcp_url;
	const chosen = typeof url === "string" ? url : typeof legacyUrl === "string" ? legacyUrl : void 0;
	if (typeof chosen !== "string") return void 0;
	const trimmed = chosen.trim();
	return trimmed ? trimmed : void 0;
}
/**
* 部分 MCP 网关/代理会在 result 内再次包一层 JSON-RPC envelope。
* 这里做一次递归解包，确保工具最终返回的是纯 result JSON（不包含 jsonrpc/id）。
*/
function unwrapJsonRpcResult(v) {
	if (!isRecord(v)) return v;
	const hasJsonRpc = typeof v.jsonrpc === "string";
	const hasId = "id" in v;
	const hasResult = "result" in v;
	const hasError = "error" in v;
	if (hasJsonRpc && (hasResult || hasError)) {
		if (hasError) {
			const err = v.error;
			if (isRecord(err) && typeof err.message === "string") throw new Error(err.message);
			throw new Error("MCP 返回 error，但无法解析 message");
		}
		return unwrapJsonRpcResult(v.result);
	}
	if (!hasJsonRpc && !hasId && hasResult && !hasError) return unwrapJsonRpcResult(v.result);
	return v;
}
let mcpEndpointOverride;
function setMcpEndpointOverride(endpoint) {
	mcpEndpointOverride = endpoint;
}
function readMcpUrlFromOpenclawJson() {
	try {
		const p = path.join(process.cwd(), ".openclaw", "openclaw.json");
		if (!fs.existsSync(p)) return void 0;
		const raw = fs.readFileSync(p, "utf8");
		return extractMcpUrlFromConfig(JSON.parse(raw));
	} catch {
		return;
	}
}
function getMcpEndpoint(brand) {
	return mcpEndpointOverride || readMcpUrlFromOpenclawJson() || process.env.FEISHU_MCP_ENDPOINT?.trim() || `${mcpDomain(brand)}/mcp`;
}
function buildAuthHeader() {
	const token = process.env.FEISHU_MCP_BEARER_TOKEN?.trim() || process.env.FEISHU_MCP_TOKEN?.trim();
	if (!token) return void 0;
	return token.toLowerCase().startsWith("bearer ") ? token : `Bearer ${token}`;
}
/**
* 调用 MCP 工具
* @param name MCP 工具名称
* @param args 工具参数
* @param toolCallId 工具调用 ID
* @param uat 用户访问令牌(由 invoke 权限检查后传入)
* @param brand 当前账号品牌，用于选择 MCP 端点域名
*/
async function callMcpTool(name, args, toolCallId, uat, brand) {
	const endpoint = getMcpEndpoint(brand);
	const auth = buildAuthHeader();
	const body = {
		jsonrpc: "2.0",
		id: toolCallId,
		method: "tools/call",
		params: {
			name,
			arguments: args
		}
	};
	const headers = {
		"Content-Type": "application/json",
		"X-Lark-MCP-UAT": uat,
		"X-Lark-MCP-Allowed-Tools": name,
		"User-Agent": getUserAgent()
	};
	if (auth) headers.authorization = auth;
	const res = await fetch(endpoint, {
		method: "POST",
		headers,
		body: JSON.stringify(body)
	});
	const text = await res.text();
	if (!res.ok) throw new Error(`MCP HTTP ${res.status} ${res.statusText}: ${text.slice(0, 4e3)}`);
	let data;
	try {
		data = JSON.parse(text);
	} catch {
		throw new Error(`MCP 返回非 JSON：${text.slice(0, 4e3)}`);
	}
	if ("error" in data) throw new Error(`MCP error ${data.error.code}: ${data.error.message}`);
	return unwrapJsonRpcResult(data.result);
}
/**
* 注册 MCP 工具的通用函数 (使用 invoke 机制进行权限检查)
*/
function registerMcpTool(api, config) {
	const { toolClient, log } = createToolContext(api, config.name);
	return registerTool(api, {
		name: config.name,
		label: config.label,
		description: config.description,
		parameters: config.schema,
		async execute(toolCallId, params) {
			const p = params;
			try {
				log.debug?.(`Calling ${config.mcpToolName} (toolCallId: ${toolCallId})`);
				const startTime = Date.now();
				config.validate?.(p);
				const client = toolClient();
				const brand = client.account.brand;
				const result = await client.invoke(config.toolActionKey, async (_sdk, _opts, uat) => {
					if (!uat) throw new Error("UAT not available");
					return callMcpTool(config.mcpToolName, p, toolCallId, uat, brand);
				}, { as: "user" });
				const duration = Date.now() - startTime;
				log.debug?.(`${config.mcpToolName} succeeded in ${duration}ms`);
				if (isRecord(result) && Array.isArray(result.content)) {
					const mcpContent = result.content;
					let details = result;
					if (mcpContent.length === 1 && mcpContent[0]?.type === "text") try {
						details = JSON.parse(mcpContent[0].text);
					} catch {}
					return {
						content: mcpContent.map((c) => ({
							type: "text",
							text: c.text
						})),
						details
					};
				}
				return formatToolResult(result);
			} catch (err) {
				const errMsg = err instanceof Error ? err.message : String(err);
				log.error(`${config.mcpToolName} failed: ${errMsg}`);
				return handleInvokeErrorWithAutoAuth(err, api.config);
			}
		}
	}, { name: config.name });
}
//#endregion
//#region src/tools/mcp/doc/fetch.ts
const FetchDocSchema = Type.Object({
	doc_id: Type.String({ description: "文档 ID 或 URL（支持自动解析）" }),
	offset: Type.Optional(Type.Integer({
		description: "字符偏移量（可选，默认0）。用于大文档分页获取。",
		minimum: 0
	})),
	limit: Type.Optional(Type.Integer({
		description: "返回的最大字符数（可选）。仅在用户明确要求分页时使用。",
		minimum: 1
	}))
});
/**
* 注册 fetch-doc 工具
*/
function registerFetchDocTool(api) {
	return registerMcpTool(api, {
		name: "feishu_fetch_doc",
		mcpToolName: "fetch-doc",
		toolActionKey: "feishu_fetch_doc.default",
		label: "Feishu MCP: fetch-doc",
		description: "获取飞书云文档内容，返回文档标题和 Markdown 格式内容。支持分页获取大文档。",
		schema: FetchDocSchema
	});
}
//#endregion
//#region src/tools/mcp/doc/create.ts
const CreateDocSchema = Type.Object({
	markdown: Type.Optional(Type.String({ description: "Markdown 内容" })),
	title: Type.Optional(Type.String({ description: "文档标题" })),
	folder_token: Type.Optional(Type.String({ description: "父文件夹 token（可选）" })),
	wiki_node: Type.Optional(Type.String({ description: "知识库节点 token 或 URL（可选，传入则在该节点下创建文档）" })),
	wiki_space: Type.Optional(Type.String({ description: "知识空间 ID（可选，特殊值 my_library）" })),
	task_id: Type.Optional(Type.String({ description: "异步任务 ID。提供此参数将查询任务状态而非创建新文档" }))
});
function validateCreateDocParams(p) {
	if (p.task_id) return;
	if (!p.markdown || !p.title) throw new Error("create-doc：未提供 task_id 时，至少需要提供 markdown 和 title");
	if ([
		p.folder_token,
		p.wiki_node,
		p.wiki_space
	].filter(Boolean).length > 1) throw new Error("create-doc：folder_token / wiki_node / wiki_space 三者互斥，请只提供一个");
}
/**
* 注册 create-doc 工具
*/
function registerCreateDocTool(api) {
	return registerMcpTool(api, {
		name: "feishu_create_doc",
		mcpToolName: "create-doc",
		toolActionKey: "feishu_create_doc.default",
		label: "Feishu MCP: create-doc",
		description: "从 Markdown 创建云文档（支持异步 task_id 查询）",
		schema: CreateDocSchema,
		validate: validateCreateDocParams
	});
}
//#endregion
//#region src/tools/mcp/doc/update.ts
const UpdateDocSchema = Type.Object({
	doc_id: Type.Optional(Type.String({ description: "文档 ID 或 URL" })),
	markdown: Type.Optional(Type.String({ description: "Markdown 内容" })),
	mode: Type.Union([
		Type.Literal("overwrite"),
		Type.Literal("append"),
		Type.Literal("replace_range"),
		Type.Literal("replace_all"),
		Type.Literal("insert_before"),
		Type.Literal("insert_after"),
		Type.Literal("delete_range")
	], { description: "更新模式（必填）" }),
	selection_with_ellipsis: Type.Optional(Type.String({ description: "定位表达式：开头内容...结尾内容（与 selection_by_title 二选一）" })),
	selection_by_title: Type.Optional(Type.String({ description: "标题定位：例如 ## 章节标题（与 selection_with_ellipsis 二选一）" })),
	new_title: Type.Optional(Type.String({ description: "新的文档标题（可选）" })),
	task_id: Type.Optional(Type.String({ description: "异步任务 ID，用于查询任务状态" }))
});
function validateUpdateDocParams(p) {
	if (p.task_id) return;
	if (!p.doc_id) throw new Error("update-doc：未提供 task_id 时必须提供 doc_id");
	if (p.mode === "replace_range" || p.mode === "insert_before" || p.mode === "insert_after" || p.mode === "delete_range") {
		const hasEllipsis = Boolean(p.selection_with_ellipsis);
		const hasTitle = Boolean(p.selection_by_title);
		if (hasEllipsis && hasTitle || !hasEllipsis && !hasTitle) throw new Error("update-doc：mode 为 replace_range/insert_before/insert_after/delete_range 时，selection_with_ellipsis 与 selection_by_title 必须二选一");
	}
	if (p.mode !== "delete_range" && !p.markdown) throw new Error(`update-doc：mode=${p.mode} 时必须提供 markdown`);
}
/**
* 注册 update-doc 工具
*/
function registerUpdateDocTool(api) {
	return registerMcpTool(api, {
		name: "feishu_update_doc",
		mcpToolName: "update-doc",
		toolActionKey: "feishu_update_doc.default",
		label: "Feishu MCP: update-doc",
		description: "更新云文档（overwrite/append/replace_range/replace_all/insert_before/insert_after/delete_range，支持异步 task_id 查询）",
		schema: UpdateDocSchema,
		validate: validateUpdateDocParams
	});
}
//#endregion
//#region src/tools/mcp/doc/index.ts
/**
* 注册 MCP Doc 工具（仅保留 create/fetch/update，search/list 已由 OAPI 替代）
*/
function registerFeishuMcpDocTools(api) {
	if (!api.config) {
		api.logger.debug?.("feishu_doc: No config available, skipping");
		return;
	}
	const accounts = getEnabledLarkAccounts(api.config);
	if (accounts.length === 0) {
		api.logger.debug?.("feishu_doc: No Feishu accounts configured, skipping");
		return;
	}
	if (!resolveAnyEnabledToolsConfig(accounts).doc) {
		api.logger.debug?.("feishu_doc: doc tool disabled in all accounts");
		return;
	}
	setMcpEndpointOverride(extractMcpUrlFromConfig(api.config));
	const registered = [];
	if (registerFetchDocTool(api)) registered.push("feishu_fetch_doc");
	if (registerCreateDocTool(api)) registered.push("feishu_create_doc");
	if (registerUpdateDocTool(api)) registered.push("feishu_update_doc");
	if (registered.length > 0) api.logger.info?.(`feishu_doc: Registered ${registered.join(", ")}`);
}
//#endregion
//#region src/tools/oauth-batch-auth.ts
const log$1 = larkLogger("tools/oauth-batch-auth");
const FeishuOAuthBatchAuthSchema = Type.Object({}, { description: "飞书批量授权工具。一次性授权应用已开通的所有用户权限（User Access Token scope）。【使用场景】用户明确要求'授权所有权限'、'一次性授权完成'时使用。【重要】禁止主动推荐此工具，仅在用户明确要求时使用。" });
function registerFeishuOAuthBatchAuthTool(api) {
	if (!api.config) return;
	const cfg = api.config;
	registerTool(api, {
		name: "feishu_oauth_batch_auth",
		label: "Feishu: OAuth Batch Authorization",
		description: "飞书批量授权工具，一次性授权应用已开通的所有用户权限。仅在用户明确要求'授权所有权限'、'一次性授权'时使用。",
		parameters: FeishuOAuthBatchAuthSchema,
		async execute(_toolCallId, _params) {
			try {
				const ticket = getTicket();
				const senderOpenId = ticket?.senderOpenId;
				if (!senderOpenId) return json({ error: "无法获取当前用户身份（senderOpenId），请在飞书对话中使用此工具。" });
				const acct = getLarkAccount(cfg, ticket.accountId);
				if (!acct.configured) return json({ error: `账号 ${ticket.accountId} 缺少 appId 或 appSecret 配置` });
				const account = acct;
				const { appId } = account;
				const sdk = LarkClient.fromAccount(account).sdk;
				let appScopes;
				try {
					appScopes = await getAppGrantedScopes(sdk, appId, "user");
				} catch (err) {
					if (err instanceof AppScopeCheckFailedError) return json({
						error: "app_scope_check_failed",
						message: "应用缺少核心权限 application:application:self_manage，无法查询可授权 scope 列表。\n\n请管理员在飞书开放平台开通此权限后重试。",
						permission_link: `${openPlatformDomain(account.brand)}/app/${appId}/auth?q=application:application:self_manage`,
						app_id: appId
					});
					throw err;
				}
				if (appScopes.length === 0) return json({
					success: false,
					message: "当前应用未开通任何用户级权限（User Access Token scope），无法使用用户身份调用 API。\n\n如需使用用户级功能，请联系管理员在开放平台开通相关权限。",
					total_app_scopes: 0,
					app_id: appId
				});
				appScopes = filterSensitiveScopes(appScopes);
				const existing = await getStoredToken(appId, senderOpenId);
				const grantedScopes = new Set(existing?.scope?.split(/\s+/).filter(Boolean) ?? []);
				const missingScopes = appScopes.filter((s) => !grantedScopes.has(s));
				if (missingScopes.length === 0) return json({
					success: true,
					message: `您已授权所有可用权限（共 ${appScopes.length} 个），无需重复授权。`,
					total_app_scopes: appScopes.length,
					already_granted: appScopes.length,
					missing: 0
				});
				const MAX_SCOPES_PER_BATCH = 100;
				let scopesToAuthorize = missingScopes;
				let batchInfo = "";
				if (missingScopes.length > MAX_SCOPES_PER_BATCH) {
					scopesToAuthorize = missingScopes.slice(0, MAX_SCOPES_PER_BATCH);
					batchInfo = `\n\n由于飞书限制（单次最多 ${MAX_SCOPES_PER_BATCH} 个 scope），本次将授权前 ${MAX_SCOPES_PER_BATCH} 个权限。\n授权完成后，还需授权剩余 ${missingScopes.length - MAX_SCOPES_PER_BATCH} 个权限`;
				}
				const alreadyGrantedScopes = appScopes.filter((s) => grantedScopes.has(s));
				log$1.info(`scope check: total=${appScopes.length}, granted=${alreadyGrantedScopes.length}, missing=${missingScopes.length}`);
				const result = await executeAuthorize({
					account,
					senderOpenId,
					scope: scopesToAuthorize.join(" "),
					isBatchAuth: true,
					totalAppScopes: appScopes.length,
					alreadyGranted: alreadyGrantedScopes.length,
					batchInfo,
					cfg,
					ticket
				});
				if (batchInfo && result.details) {
					const details = result.details;
					if (details.message) details.message = details.message + batchInfo;
				}
				return result;
			} catch (err) {
				api.logger.error?.(`feishu_oauth_batch_auth: ${err}`);
				return json({ error: formatLarkError(err) });
			}
		}
	}, { name: "feishu_oauth_batch_auth" });
	api.logger.info?.("feishu_oauth_batch_auth: Registered feishu_oauth_batch_auth tool");
}
//#endregion
//#region src/messaging/outbound/forward.ts
/**
* Forward an existing message to another chat or user.
*
* @param params.cfg       - Plugin configuration with Feishu credentials.
* @param params.messageId - The message ID to forward.
* @param params.to        - Target identifier (chat_id, open_id, or user_id).
* @param params.accountId - Optional account identifier for multi-account setups.
* @returns The send result containing the new forwarded message ID.
*/
async function forwardMessageFeishu(params) {
	const { cfg, messageId, to, accountId } = params;
	const client = LarkClient.fromCfg(cfg, accountId).sdk;
	const target = normalizeFeishuTarget(to);
	if (!target) throw new Error(`[feishu-forward] Invalid target: "${to}"`);
	const receiveIdType = resolveReceiveIdType(target);
	const response = await client.im.message.forward({
		path: { message_id: messageId },
		params: { receive_id_type: receiveIdType },
		data: { receive_id: target }
	});
	return {
		messageId: response?.data?.message_id ?? "",
		chatId: response?.data?.chat_id ?? ""
	};
}
//#endregion
//#region src/messaging/outbound/chat-manage.ts
/** Assert that a Lark SDK response has code === 0 (or no code field). */
function assertLarkOk(res, context) {
	const code = res?.code;
	if (code !== void 0 && code !== 0) {
		const msg = res?.msg ?? "unknown error";
		throw new Error(`[feishu-chat-manage] ${context}: code=${code}, msg=${msg}`);
	}
}
/**
* Update chat settings such as name or avatar.
*/
async function updateChatFeishu(params) {
	const { cfg, chatId, name, avatar, accountId } = params;
	const client = LarkClient.fromCfg(cfg, accountId).sdk;
	const body = {};
	if (name) body.name = name;
	if (avatar) body.avatar = avatar;
	assertLarkOk(await client.im.chat.update({
		path: { chat_id: chatId },
		data: body
	}), `updateChat for ${chatId}`);
}
/**
* Add members to a chat by their open_id list.
*/
async function addChatMembersFeishu(params) {
	const { cfg, chatId, memberIds, accountId } = params;
	assertLarkOk(await LarkClient.fromCfg(cfg, accountId).sdk.im.v1.chatMembers.create({
		path: { chat_id: chatId },
		data: { id_list: memberIds },
		params: { member_id_type: "open_id" }
	}), `addChatMembers for ${chatId}`);
}
/**
* Remove members from a chat by their open_id list.
*/
async function removeChatMembersFeishu(params) {
	const { cfg, chatId, memberIds, accountId } = params;
	assertLarkOk(await LarkClient.fromCfg(cfg, accountId).sdk.im.v1.chatMembers.delete({
		path: { chat_id: chatId },
		data: { id_list: memberIds },
		params: { member_id_type: "open_id" }
	}), `removeChatMembers for ${chatId}`);
}
/**
* List members of a chat.
*
* Returns a single page (up to 100 members) to avoid unnecessary data
* overhead for large groups.  Use the returned `pageToken` to fetch
* subsequent pages when needed.
*/
async function listChatMembersFeishu(params) {
	const { cfg, chatId, accountId, pageToken } = params;
	const response = await LarkClient.fromCfg(cfg, accountId).sdk.im.v1.chatMembers.get({
		path: { chat_id: chatId },
		params: {
			member_id_type: "open_id",
			page_size: 100,
			...pageToken ? { page_token: pageToken } : {}
		}
	});
	assertLarkOk(response, `listChatMembers for ${chatId}`);
	const members = [];
	const items = (response?.data)?.items;
	if (items && Array.isArray(items)) for (const item of items) members.push({
		memberId: item.member_id ?? "",
		name: item.name ?? "",
		memberIdType: item.member_id_type ?? "open_id"
	});
	const nextPageToken = (response?.data)?.page_token ?? void 0;
	return {
		members,
		pageToken: nextPageToken,
		hasMore: (response?.data)?.has_more === true && !!nextPageToken
	};
}
//#endregion
//#region index.ts
const log = larkLogger("plugin");
function emptyPluginConfigSchema() {
	return {
		type: "object",
		additionalProperties: false,
		properties: {}
	};
}
const plugin = {
	id: "openclaw-lark",
	name: "Feishu",
	description: "Lark/Feishu channel plugin with im/doc/wiki/drive/task/calendar tools",
	configSchema: emptyPluginConfigSchema(),
	register(api) {
		LarkClient.setRuntime(api.runtime);
		api.registerChannel({ plugin: feishuPlugin });
		registerOapiTools(api);
		registerFeishuMcpDocTools(api);
		registerFeishuOAuthTool(api);
		registerFeishuOAuthBatchAuthTool(api);
		api.on("before_tool_call", (event) => {
			log.info(`tool call: ${event.toolName} params=${JSON.stringify(event.params)}`);
		});
		api.on("after_tool_call", (event) => {
			if (event.error) log.error(`tool fail: ${event.toolName} ${event.error} (${event.durationMs ?? 0}ms)`);
			else log.info(`tool done: ${event.toolName} ok (${event.durationMs ?? 0}ms)`);
		});
		api.registerCli((ctx) => {
			ctx.program.command("feishu-diagnose").description("运行飞书插件诊断，检查配置、连通性和权限状态").option("--trace <messageId>", "按 message_id 追踪完整处理链路").option("--analyze", "分析追踪日志（需配合 --trace 使用）").action(async (opts) => {
				try {
					if (opts.trace) {
						const lines = await traceByMessageId(opts.trace);
						console.log(formatTraceOutput(lines, opts.trace));
						if (opts.analyze && lines.length > 0) console.log(analyzeTrace(lines, opts.trace));
					} else {
						const report = await runDiagnosis({
							config: ctx.config,
							logger: ctx.logger
						});
						console.log(formatDiagReportCli(report));
						if (report.overallStatus === "unhealthy") process.exitCode = 1;
					}
				} catch (err) {
					ctx.logger.error(`诊断命令执行失败: ${err}`);
					process.exitCode = 1;
				}
			});
		}, { commands: ["feishu-diagnose"] });
		registerCommands(api);
		if (api.config) api.config, api.logger;
	}
};
//#endregion
export { FeishuEmoji, VALID_FEISHU_EMOJI_TYPES, addChatMembersFeishu, addReactionFeishu, buildMentionedCardContent, buildMentionedMessage, checkMessageGate, plugin as default, editMessageFeishu, extractMessageBody, feishuMessageActions, feishuPlugin, formatMentionAllForCard, formatMentionAllForText, formatMentionForCard, formatMentionForText, forwardMessageFeishu, getMessageFeishu, handleFeishuReaction, isMessageExpired, listChatMembersFeishu, listReactionsFeishu, mentionedBot, monitorFeishuProvider, nonBotMentions, parseMessageEvent, probeFeishu, removeChatMembersFeishu, removeReactionFeishu, sendAudioLark, sendCardFeishu, sendCardLark, sendFileLark, sendImageLark, sendMediaLark, sendMessageFeishu, sendTextLark, updateCardFeishu, updateChatFeishu, uploadAndSendMediaLark, uploadFileLark, uploadImageLark };
