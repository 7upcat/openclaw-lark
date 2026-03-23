import { t as __exportAll } from "./rolldown-runtime-wcPFST8Q.mjs";
import { A as getEnabledLarkAccounts, C as isThreadCapableGroup, D as withTicket, E as ticketElapsed, M as getLarkAccountIds, O as createAccountScopedConfig, S as getChatTypeFeishu, T as getTicket, _ as extractPermissionGrantUrl, b as getPluginVersion, c as AppScopeCheckFailedError, d as MESSAGE_TERMINAL_CODES, f as NeedAuthorizationError, g as UserScopeInsufficientError, h as UserAuthRequiredError, i as resolveUserName, j as getLarkAccount, l as AppScopeMissingError, m as TOKEN_RETRY_CODES, n as createBatchResolveNames, p as REFRESH_TOKEN_RETRYABLE, r as getUserNameCache, s as permissionErrorNotifiedAt, t as batchResolveUserNames, u as LARK_ERROR, v as extractPermissionScopes, w as larkLogger, x as getUserAgent, y as LarkClient } from "./user-name-cache-Bw1VQ2E0.mjs";
import * as Lark from "@larksuiteoapi/node-sdk";
import { fileURLToPath } from "node:url";
import * as path$1 from "node:path";
import { join } from "node:path";
import * as fs$2 from "node:fs";
import * as dns from "node:dns/promises";
import * as net from "node:net";
import * as os from "node:os";
import { homedir } from "node:os";
import { Readable } from "node:stream";
import { Type } from "@sinclair/typebox";
import { DEFAULT_GROUP_HISTORY_LIMIT, buildPendingHistoryContextFromMap, clearHistoryEntriesIfEnabled, recordPendingHistoryEntryIfEnabled } from "openclaw/plugin-sdk/reply-history";
import { resolveSenderCommandAuthorization } from "openclaw/plugin-sdk/zalouser";
import { isNormalizedSenderAllowed } from "openclaw/plugin-sdk/allow-from";
import { createReplyPrefixContext, createTypingCallbacks } from "openclaw/plugin-sdk/channel-runtime";
import { logTypingFailure } from "openclaw/plugin-sdk/channel-feedback";
import { SILENT_REPLY_TOKEN } from "openclaw/plugin-sdk/reply-runtime";
import { resolveThreadSessionKeys } from "openclaw/plugin-sdk/routing";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs$1 from "node:fs/promises";
import { chmod, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import * as crypto from "node:crypto";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
//#region src/core/targets.ts
const CHAT_PREFIX = "oc_";
const OPEN_ID_PREFIX = "ou_";
const TAG_CHAT = "chat:";
const TAG_USER = "user:";
const TAG_OPEN_ID = "open_id:";
const TAG_FEISHU = "feishu:";
const ROUTE_META_FRAGMENT_REPLY_TO = "__feishu_reply_to";
const ROUTE_META_FRAGMENT_THREAD_ID = "__feishu_thread_id";
/**
* Strip OpenClaw routing prefixes (`chat:`, `user:`, `open_id:`) from a
* raw target string, returning the bare Feishu identifier.
*
* Returns `null` when the input is empty or falsy.
*/
function normalizeFeishuTarget(raw) {
	if (!raw) return null;
	const trimmed = parseFeishuRouteTarget(raw).target.trim();
	if (!trimmed) return null;
	if (trimmed.startsWith(TAG_FEISHU)) {
		const inner = trimmed.slice(7).trim();
		if (inner) return inner;
	}
	if (trimmed.startsWith(TAG_CHAT)) return trimmed.slice(5);
	if (trimmed.startsWith(TAG_USER)) return trimmed.slice(5);
	if (trimmed.startsWith(TAG_OPEN_ID)) return trimmed.slice(8);
	return trimmed;
}
function parseFeishuRouteTarget(raw) {
	const trimmed = raw.trim();
	if (!trimmed) return { target: "" };
	const hashIndex = trimmed.indexOf("#");
	if (hashIndex < 0) return { target: trimmed };
	const target = trimmed.slice(0, hashIndex).trim();
	const fragment = trimmed.slice(hashIndex + 1).trim();
	if (!fragment) return { target };
	const params = new URLSearchParams(fragment);
	const replyToMessageId = normalizeMessageId(params.get(ROUTE_META_FRAGMENT_REPLY_TO)?.trim() || void 0);
	const threadId = params.get(ROUTE_META_FRAGMENT_THREAD_ID)?.trim() || void 0;
	return {
		target,
		...replyToMessageId ? { replyToMessageId } : {},
		...threadId ? { threadId } : {}
	};
}
function encodeFeishuRouteTarget(params) {
	const target = params.target.trim();
	if (!target) return target;
	const replyToMessageId = normalizeMessageId(params.replyToMessageId?.trim() || void 0);
	const threadId = params.threadId != null && String(params.threadId).trim() !== "" ? String(params.threadId).trim() : void 0;
	if (!replyToMessageId && !threadId) return target;
	const fragment = new URLSearchParams();
	if (replyToMessageId) fragment.set(ROUTE_META_FRAGMENT_REPLY_TO, replyToMessageId);
	if (threadId) fragment.set(ROUTE_META_FRAGMENT_THREAD_ID, threadId);
	return `${target}#${fragment.toString()}`;
}
/**
* Determine the `receive_id_type` query parameter for the Feishu send-message
* API based on the target identifier.
*/
function resolveReceiveIdType(id) {
	if (id.startsWith(CHAT_PREFIX)) return "chat_id";
	if (id.startsWith(OPEN_ID_PREFIX)) return "open_id";
	return "open_id";
}
function normalizeMessageId(messageId) {
	if (!messageId) return void 0;
	const colonIndex = messageId.indexOf(":");
	if (colonIndex >= 0) return messageId.slice(0, colonIndex);
	return messageId;
}
/**
* Return `true` when a raw string looks like it could be a Feishu target
* (either an OpenClaw-tagged form or a native prefix).
*/
function looksLikeFeishuId(raw) {
	if (!raw) return false;
	return raw.startsWith(TAG_CHAT) || raw.startsWith(TAG_USER) || raw.startsWith(TAG_OPEN_ID) || raw.startsWith(CHAT_PREFIX) || raw.startsWith(OPEN_ID_PREFIX);
}
//#endregion
//#region src/card/markdown-style.ts
/**
* Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
* SPDX-License-Identifier: MIT
*
* Markdown 样式优化工具
*/
/**
* 优化 Markdown 样式：
* - 标题降级：H1 → H4，H2~H6 → H5
* - 表格前后增加段落间距
* - 有序列表：序号后确保只有一个空格
* - 无序列表："- " 格式规范化（跳过分隔线 ---）
* - 表格：单元格前后补空格，分隔符行规范化，表格前后加空行
* - 代码块内容不受影响
*/
function optimizeMarkdownStyle(text, cardVersion = 2) {
	try {
		let r = _optimizeMarkdownStyle(text, cardVersion);
		r = stripInvalidImageKeys(r);
		return r;
	} catch {
		return text;
	}
}
function _optimizeMarkdownStyle(text, cardVersion = 2) {
	const MARK = "___CB_";
	const codeBlocks = [];
	let r = text.replace(/```[\s\S]*?```/g, (m) => {
		return `${MARK}${codeBlocks.push(m) - 1}___`;
	});
	if (/^#{1,3} /m.test(text)) {
		r = r.replace(/^#{2,6} (.+)$/gm, "##### $1");
		r = r.replace(/^# (.+)$/gm, "#### $1");
	}
	if (cardVersion >= 2) {
		r = r.replace(/^(#{4,5} .+)\n{1,2}(#{4,5} )/gm, "$1\n<br>\n$2");
		r = r.replace(/^([^|\n].*)\n(\|.+\|)/gm, "$1\n\n$2");
		r = r.replace(/\n\n((?:\|.+\|[^\S\n]*\n?)+)/g, "\n\n<br>\n\n$1");
		r = r.replace(/((?:^\|.+\|[^\S\n]*\n?)+)/gm, "$1\n<br>\n");
		r = r.replace(/^((?!#{4,5} )(?!\*\*).+)\n\n(<br>)\n\n(\|)/gm, "$1\n$2\n$3");
		r = r.replace(/^(\*\*.+)\n\n(<br>)\n\n(\|)/gm, "$1\n$2\n\n$3");
		r = r.replace(/(\|[^\n]*\n)\n(<br>\n)((?!#{4,5} )(?!\*\*))/gm, "$1$2$3");
		codeBlocks.forEach((block, i) => {
			r = r.replace(`${MARK}${i}___`, `\n<br>\n${block}\n<br>\n`);
		});
	} else codeBlocks.forEach((block, i) => {
		r = r.replace(`${MARK}${i}___`, block);
	});
	r = r.replace(/\n{3,}/g, "\n\n");
	return r;
}
/** Matches complete markdown image syntax: `![alt](value)` */
const IMAGE_RE$1 = /!\[([^\]]*)\]\(([^)\s]+)\)/g;
/**
* Strip `![alt](value)` where value is not a valid Feishu image key
* (`img_xxx`). Prevents CardKit error 200570.
*
* HTTP URLs are stripped as well — ImageResolver should have already
* replaced them with `img_xxx` keys before this point. This serves
* as a safety net for any unresolved URLs.
*/
function stripInvalidImageKeys(text) {
	if (!text.includes("![")) return text;
	return text.replace(IMAGE_RE$1, (fullMatch, _alt, value) => {
		if (value.startsWith("img_")) return fullMatch;
		return "";
	});
}
//#endregion
//#region src/messaging/outbound/media-url-utils.ts
/**
* Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
* SPDX-License-Identifier: MIT
*/
function normalizeMediaUrlInput(value) {
	let raw = value.trim();
	if (raw.startsWith("<") && raw.endsWith(">") && raw.length >= 2) raw = raw.slice(1, -1).trim();
	const first = raw[0];
	const last = raw[raw.length - 1];
	if (raw.length >= 2 && (first === "\"" && last === "\"" || first === "'" && last === "'" || first === "`" && last === "`")) raw = raw.slice(1, -1).trim();
	return raw;
}
function stripQueryAndHash(value) {
	return value.split(/[?#]/, 1)[0] ?? value;
}
function isWindowsAbsolutePath(value) {
	return /^[A-Za-z]:[\\/]/.test(value) || value.startsWith("\\\\");
}
function isLocalMediaPath(value) {
	const raw = normalizeMediaUrlInput(value);
	return raw.startsWith("file://") || path$1.isAbsolute(raw) || isWindowsAbsolutePath(raw);
}
function safeFileUrlToPath(fileUrl) {
	const raw = normalizeMediaUrlInput(fileUrl);
	try {
		return fileURLToPath(raw);
	} catch {
		return new URL(raw).pathname;
	}
}
/**
* Validate that a resolved local file path falls under one of the
* allowed root directories.  Prevents path-traversal attacks when
* the AI or an external payload supplies a local media path.
*
* Semantics:
* - **`undefined`** — caller has not opted in to restriction; the
*   function is a no-op so existing behaviour is preserved.  The
*   caller should log a warning independently.
* - **`[]` (empty array)** — explicitly configured with no allowed
*   roots → all local access is denied.
* - **Non-empty array** — standard allowlist check.
*
* @param filePath   - Resolved absolute path to validate.
* @param localRoots - Allowed root directories.
* @throws {Error} When the path is not under any allowed root, or
*                 when `localRoots` is an empty array.
*/
function validateLocalMediaRoots(filePath, localRoots) {
	if (localRoots === void 0) return;
	if (localRoots.length === 0) throw new Error(`[feishu-media] Local file access denied for "${filePath}": mediaLocalRoots is configured as an empty array, which blocks all local access. Add allowed directories to mediaLocalRoots or use a remote URL instead.`);
	let resolved;
	try {
		resolved = fs$2.realpathSync(path$1.resolve(filePath));
	} catch {
		resolved = path$1.resolve(filePath);
	}
	if (!localRoots.some((root) => {
		let resolvedRoot;
		try {
			resolvedRoot = fs$2.realpathSync(path$1.resolve(root));
		} catch {
			resolvedRoot = path$1.resolve(root);
		}
		return resolved === resolvedRoot || resolved.startsWith(resolvedRoot + path$1.sep);
	})) throw new Error(`[feishu-media] Local file access denied for "${filePath}": path is not under any allowed mediaLocalRoots (${localRoots.join(", ")}). Move the file to an allowed directory or use a remote URL instead.`);
}
function resolveBaseNameFromPath(value) {
	const cleanPath = stripQueryAndHash(normalizeMediaUrlInput(value));
	const fileName = isWindowsAbsolutePath(cleanPath) ? path$1.win32.basename(cleanPath) : path$1.basename(cleanPath);
	if (fileName && fileName !== "/" && fileName !== "." && fileName !== "\\") return fileName;
}
function resolveFileNameFromMediaUrl(mediaUrl) {
	const raw = normalizeMediaUrlInput(mediaUrl);
	if (!raw) return void 0;
	if (isLocalMediaPath(raw)) {
		if (raw.startsWith("file://")) {
			const fromFileUrlName = resolveBaseNameFromPath(safeFileUrlToPath(raw));
			if (fromFileUrlName) return fromFileUrlName;
		}
		return resolveBaseNameFromPath(raw);
	}
	try {
		const parsed = new URL(raw);
		if (parsed.protocol === "http:" || parsed.protocol === "https:") {
			const fromUrlPath = path$1.posix.basename(parsed.pathname);
			if (fromUrlPath && fromUrlPath !== "/") return fromUrlPath;
		}
	} catch {}
	return resolveBaseNameFromPath(raw);
}
//#endregion
//#region src/messaging/outbound/media.ts
/**
* Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
* SPDX-License-Identifier: MIT
*
* Media handling for the Lark/Feishu channel plugin.
*
* Provides functions for downloading images and file resources from
* Feishu messages, uploading media to the Feishu IM storage, and
* sending image / file messages to chats.
*/
const log$22 = larkLogger("outbound/media");
/**
* Extract a Buffer from various SDK response formats.
*
* The Feishu Node SDK can return binary data in several shapes depending
* on the runtime environment and SDK version:
*   - A Buffer directly
*   - An ArrayBuffer
*   - A response object with a `.data` property
*   - A response object with `.getReadableStream()`
*   - A response object with `.writeFile(path)`
*   - An async iterable / iterator
*   - A Node.js Readable stream
*
* This helper normalises all of those into a single Buffer.
*/
async function extractBufferFromResponse(response) {
	if (Buffer.isBuffer(response)) return { buffer: response };
	if (response instanceof ArrayBuffer) return { buffer: Buffer.from(response) };
	if (response == null) throw new Error("[feishu-media] Received null/undefined response");
	const resp = response;
	const contentType = resp.headers?.["content-type"] ?? resp.contentType ?? void 0;
	if (resp.data != null) {
		if (Buffer.isBuffer(resp.data)) return {
			buffer: resp.data,
			contentType
		};
		if (resp.data instanceof ArrayBuffer) return {
			buffer: Buffer.from(resp.data),
			contentType
		};
		if (typeof resp.data.pipe === "function") return {
			buffer: await streamToBuffer(resp.data),
			contentType
		};
	}
	if (typeof resp.getReadableStream === "function") return {
		buffer: await streamToBuffer(await resp.getReadableStream()),
		contentType
	};
	if (typeof resp.writeFile === "function") {
		const tmpDir = os.tmpdir();
		const tmpFile = path$1.join(tmpDir, `feishu-media-${Date.now()}`);
		try {
			await resp.writeFile(tmpFile);
			return {
				buffer: fs$2.readFileSync(tmpFile),
				contentType
			};
		} finally {
			try {
				fs$2.unlinkSync(tmpFile);
			} catch {}
		}
	}
	if (typeof resp[Symbol.asyncIterator] === "function" || typeof resp.next === "function") {
		const chunks = [];
		const iterable = typeof resp[Symbol.asyncIterator] === "function" ? resp : asyncIteratorToIterable(resp);
		for await (const chunk of iterable) chunks.push(Buffer.from(chunk));
		return {
			buffer: Buffer.concat(chunks),
			contentType
		};
	}
	if (typeof resp.pipe === "function") return {
		buffer: await streamToBuffer(resp),
		contentType
	};
	throw new Error("[feishu-media] Unable to extract binary data from response: unrecognised format");
}
/**
* Consume a Readable stream into a Buffer.
*/
function streamToBuffer(stream) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		stream.on("data", (chunk) => {
			chunks.push(Buffer.from(chunk));
		});
		stream.on("end", () => resolve(Buffer.concat(chunks)));
		stream.on("error", reject);
	});
}
/**
* Wrap an AsyncIterator into an AsyncIterable.
*/
async function* asyncIteratorToIterable(iterator) {
	while (true) {
		const { value, done } = await iterator.next();
		if (done) break;
		yield value;
	}
}
/**
* Download a resource (image or file) attached to a specific message.
*
* @param params.cfg       - Plugin configuration.
* @param params.messageId - The message the resource belongs to.
* @param params.fileKey   - The file_key or image_key of the resource.
* @param params.type      - Whether the resource is an "image" or "file".
* @param params.accountId - Optional account identifier.
* @returns The resource buffer, content type, and file name.
*/
async function downloadMessageResourceFeishu(params) {
	const { cfg, messageId, fileKey, type, accountId } = params;
	const response = await LarkClient.fromCfg(cfg, accountId).sdk.im.messageResource.get({
		path: {
			message_id: messageId,
			file_key: fileKey
		},
		params: { type }
	});
	const { buffer, contentType } = await extractBufferFromResponse(response);
	let fileName;
	if (response && typeof response === "object") {
		const resp = response;
		const disposition = resp.headers?.["content-disposition"] ?? resp.headers?.["Content-Disposition"];
		if (typeof disposition === "string") {
			const match = disposition.match(/filename[*]?=(?:UTF-8'')?["']?([^"';\n]+)/i);
			if (match) fileName = decodeURIComponent(match[1].trim());
		}
	}
	return {
		buffer,
		contentType,
		fileName
	};
}
/**
* Upload an image to Feishu IM storage.
*
* Accepts either a Buffer containing the raw image bytes or a file
* system path to read from.
*
* @param params.cfg       - Plugin configuration.
* @param params.image     - A Buffer or local file path for the image.
* @param params.imageType - The image usage type: "message" (default) or "avatar".
* @param params.accountId - Optional account identifier.
* @returns The assigned image_key.
*/
async function uploadImageLark(params) {
	const { cfg, image, imageType = "message", accountId } = params;
	const client = LarkClient.fromCfg(cfg, accountId).sdk;
	const imageStream = Buffer.isBuffer(image) ? Readable.from(image) : fs$2.createReadStream(image);
	const response = await client.im.image.create({ data: {
		image_type: imageType,
		image: imageStream
	} });
	const imageKey = response?.data?.image_key ?? response?.image_key;
	if (!imageKey) throw new Error(`[feishu-media] Image upload failed: no image_key in response. Check that the image is a valid format (JPEG/PNG/GIF/BMP/WEBP). Response: ${JSON.stringify(response).slice(0, 200)}`);
	return { imageKey };
}
/**
* Upload a file to Feishu IM storage.
*
* @param params.cfg       - Plugin configuration.
* @param params.file      - A Buffer or local file path.
* @param params.fileName  - The display name of the file.
* @param params.fileType  - Feishu file type: "opus" | "mp4" | "pdf" | "doc" | "xls" | "ppt" | "stream".
* @param params.duration  - Duration in milliseconds (for audio/video files).
* @param params.accountId - Optional account identifier.
* @returns The assigned file_key.
*/
async function uploadFileLark(params) {
	const { cfg, file, fileName, fileType, duration, accountId } = params;
	const client = LarkClient.fromCfg(cfg, accountId).sdk;
	const fileStream = Buffer.isBuffer(file) ? Readable.from(file) : fs$2.createReadStream(file);
	const response = await client.im.file.create({ data: {
		file_type: fileType,
		file_name: fileName,
		file: fileStream,
		...duration !== void 0 ? { duration: String(duration) } : {}
	} });
	const fileKey = response?.data?.file_key ?? response?.file_key;
	if (!fileKey) throw new Error(`[feishu-media] File upload failed: no file_key in response for "${fileName}" (type=${fileType}). Response: ${JSON.stringify(response).slice(0, 200)}`);
	return { fileKey };
}
/**
* Unified media message sender — handles both reply and create paths for
* image / file / audio `msg_type` values.
*
* Mirrors {@link sendImMessage} in `deliver.ts` (which covers "post" and
* "interactive"), extracted here to avoid a cross-module dependency.
*/
async function sendMediaMessage(params) {
	const { client, to, content, msgType, replyToMessageId, replyInThread } = params;
	if (replyToMessageId) {
		const response = await client.im.message.reply({
			path: { message_id: replyToMessageId },
			data: {
				content,
				msg_type: msgType,
				reply_in_thread: replyInThread
			}
		});
		return {
			messageId: response?.data?.message_id ?? "",
			chatId: response?.data?.chat_id ?? ""
		};
	}
	const target = normalizeFeishuTarget(to);
	if (!target) throw new Error(`[feishu-media] Cannot send ${msgType} message: "${to}" is not a valid target. Expected a chat_id (oc_*), open_id (ou_*), or user_id.`);
	const receiveIdType = resolveReceiveIdType(target);
	const response = await client.im.message.create({
		params: { receive_id_type: receiveIdType },
		data: {
			receive_id: target,
			msg_type: msgType,
			content
		}
	});
	return {
		messageId: response?.data?.message_id ?? "",
		chatId: response?.data?.chat_id ?? ""
	};
}
/**
* Send an image message to a chat or user.
*
* @param params.cfg              - Plugin configuration.
* @param params.to               - Target identifier.
* @param params.imageKey         - The image_key from a previous upload.
* @param params.replyToMessageId - Optional message ID for threaded reply.
* @param params.replyInThread    - When true, reply appears in thread.
* @param params.accountId        - Optional account identifier.
* @returns The send result.
*/
async function sendImageLark(params) {
	const { cfg, to, imageKey, replyToMessageId, replyInThread, accountId } = params;
	log$22.info(`sendImageLark: target=${to}, imageKey=${imageKey}`);
	const client = LarkClient.fromCfg(cfg, accountId).sdk;
	return sendMediaMessage({
		client,
		to,
		content: JSON.stringify({ image_key: imageKey }),
		msgType: "image",
		replyToMessageId,
		replyInThread
	});
}
/**
* Send a file message to a chat or user.
*
* @param params.cfg              - Plugin configuration.
* @param params.to               - Target identifier.
* @param params.fileKey          - The file_key from a previous upload.
* @param params.replyToMessageId - Optional message ID for threaded reply.
* @param params.replyInThread    - When true, reply appears in thread.
* @param params.accountId        - Optional account identifier.
* @returns The send result.
*/
async function sendFileLark(params) {
	const { cfg, to, fileKey, replyToMessageId, replyInThread, accountId } = params;
	log$22.info(`sendFileLark: target=${to}, fileKey=${fileKey}`);
	const client = LarkClient.fromCfg(cfg, accountId).sdk;
	return sendMediaMessage({
		client,
		to,
		content: JSON.stringify({ file_key: fileKey }),
		msgType: "file",
		replyToMessageId,
		replyInThread
	});
}
/**
* Send a video message to a chat or user.
*
* Uses `msg_type: "media"` so Feishu renders the message as a playable
* video instead of a file attachment.
*
* @param params.cfg              - Plugin configuration.
* @param params.to               - Target identifier.
* @param params.fileKey          - The file_key from a previous upload.
* @param params.replyToMessageId - Optional message ID for threaded reply.
* @param params.replyInThread    - When true, reply appears in thread.
* @param params.accountId        - Optional account identifier.
* @returns The send result.
*/
async function sendVideoLark(params) {
	const { cfg, to, fileKey, replyToMessageId, replyInThread, accountId } = params;
	log$22.info(`sendVideoLark: target=${to}, fileKey=${fileKey}`);
	const client = LarkClient.fromCfg(cfg, accountId).sdk;
	return sendMediaMessage({
		client,
		to,
		content: JSON.stringify({ file_key: fileKey }),
		msgType: "media",
		replyToMessageId,
		replyInThread
	});
}
/**
* Send an audio message to a chat or user.
*
* Uses `msg_type: "audio"` so Feishu renders the message as a playable
* voice bubble instead of a file attachment.
*
* @param params.cfg              - Plugin configuration.
* @param params.to               - Target identifier.
* @param params.fileKey          - The file_key from a previous upload.
* @param params.replyToMessageId - Optional message ID for threaded reply.
* @param params.replyInThread    - When true, reply appears in thread.
* @param params.accountId        - Optional account identifier.
* @returns The send result.
*/
async function sendAudioLark(params) {
	const { cfg, to, fileKey, replyToMessageId, replyInThread, accountId } = params;
	log$22.info(`sendAudioLark: target=${to}, fileKey=${fileKey}`);
	const client = LarkClient.fromCfg(cfg, accountId).sdk;
	return sendMediaMessage({
		client,
		to,
		content: JSON.stringify({ file_key: fileKey }),
		msgType: "audio",
		replyToMessageId,
		replyInThread
	});
}
/** Known image extensions. */
const IMAGE_EXTENSIONS = new Set([
	".jpg",
	".jpeg",
	".png",
	".gif",
	".bmp",
	".webp",
	".ico",
	".tiff",
	".tif",
	".heic"
]);
/** Extension-to-Feishu-file-type mapping. */
const EXTENSION_TYPE_MAP = {
	".opus": "opus",
	".ogg": "opus",
	".mp4": "mp4",
	".mov": "mp4",
	".avi": "mp4",
	".mkv": "mp4",
	".webm": "mp4",
	".pdf": "pdf",
	".doc": "doc",
	".docx": "doc",
	".xls": "xls",
	".xlsx": "xls",
	".csv": "xls",
	".ppt": "ppt",
	".pptx": "ppt"
};
/**
* Detect the Feishu file type from a file name extension.
*
* Returns one of the Feishu-supported file type strings, or "stream"
* as a catch-all for unrecognised extensions.
*
* @param fileName - The file name (with extension).
* @returns The detected file type.
*/
function detectFileType(fileName) {
	return EXTENSION_TYPE_MAP[path$1.extname(fileName).toLowerCase()] ?? "stream";
}
/**
* Parse the duration (in milliseconds) from an OGG/Opus audio buffer.
*
* Scans backward from the end of the buffer to find the last OggS page
* header, reads the granule position (absolute sample count), and divides
* by 48 000 (the Opus standard sample rate) then converts to milliseconds.
*
* Returns `undefined` when the buffer cannot be parsed (e.g. truncated or
* not actually OGG).  This is intentionally lenient so callers can fall
* back gracefully.
*/
function parseOggOpusDuration(buffer) {
	const OGGS = Buffer.from("OggS");
	let offset = -1;
	for (let i = buffer.length - OGGS.length; i >= 0; i--) if (buffer[i] === 79 && buffer.compare(OGGS, 0, 4, i, i + 4) === 0) {
		offset = i;
		break;
	}
	if (offset < 0) return void 0;
	const granuleOffset = offset + 6;
	if (granuleOffset + 8 > buffer.length) return void 0;
	const lo = buffer.readUInt32LE(granuleOffset);
	const granule = buffer.readUInt32LE(granuleOffset + 4) * 4294967296 + lo;
	if (granule <= 0) return void 0;
	return Math.ceil(granule / 48e3) * 1e3;
}
/**
* Parse the duration (in milliseconds) from an MP4 video buffer.
*
* Scans top-level boxes to locate the `moov` container, then finds the
* `mvhd` (Movie Header) box inside it.  The `mvhd` box stores:
*   - **timescale**: number of time-units per second
*   - **duration**: total duration in those time-units
*
* Supports both version-0 (32-bit fields) and version-1 (64-bit fields)
* of the `mvhd` box.
*
* Returns `undefined` when the buffer cannot be parsed (e.g. truncated,
* `moov` at end of a huge file not fully buffered, or not actually MP4).
*/
function parseMp4Duration(buffer) {
	const moovData = findBox(buffer, 0, buffer.length, "moov");
	if (!moovData) return void 0;
	const mvhdData = findBox(buffer, moovData.dataStart, moovData.dataEnd, "mvhd");
	if (!mvhdData) return void 0;
	const off = mvhdData.dataStart;
	if (off + 1 > buffer.length) return void 0;
	const version = buffer.readUInt8(off);
	let timescale;
	let duration;
	if (version === 0) {
		if (off + 20 > buffer.length) return void 0;
		timescale = buffer.readUInt32BE(off + 12);
		duration = buffer.readUInt32BE(off + 16);
	} else {
		if (off + 32 > buffer.length) return void 0;
		timescale = buffer.readUInt32BE(off + 20);
		const hi = buffer.readUInt32BE(off + 24);
		const lo = buffer.readUInt32BE(off + 28);
		duration = hi * 4294967296 + lo;
	}
	if (timescale <= 0 || duration <= 0) return void 0;
	return Math.round(duration / timescale * 1e3);
}
/**
* Find a box (atom) by its 4-character type within a range of the buffer.
* Returns the data start/end offsets (after the 8-byte box header), or
* `undefined` if not found.
*/
function findBox(buffer, start, end, type) {
	let offset = start;
	while (offset + 8 <= end) {
		const size = buffer.readUInt32BE(offset);
		const boxType = buffer.toString("ascii", offset + 4, offset + 8);
		let boxEnd;
		let dataStart;
		if (size === 0) {
			boxEnd = end;
			dataStart = offset + 8;
		} else if (size === 1) {
			if (offset + 16 > end) break;
			const hi = buffer.readUInt32BE(offset + 8);
			const lo = buffer.readUInt32BE(offset + 12);
			boxEnd = offset + hi * 4294967296 + lo;
			dataStart = offset + 16;
		} else {
			if (size < 8) break;
			boxEnd = offset + size;
			dataStart = offset + 8;
		}
		if (boxType === type) return {
			dataStart,
			dataEnd: Math.min(boxEnd, end)
		};
		offset = boxEnd;
	}
}
/**
* Check whether a file name has an image extension.
*/
function isImageFileName(fileName) {
	const ext = path$1.extname(fileName).toLowerCase();
	return IMAGE_EXTENSIONS.has(ext);
}
/**
* Upload and send a media file (image or general file) in one step.
*
* Accepts either a URL (remote or local `file://`) or a raw Buffer.
* The function determines whether the media is an image (by extension)
* and uses the appropriate upload/send path.
*
* @param params.cfg              - Plugin configuration.
* @param params.to               - Target identifier.
* @param params.mediaUrl         - URL of the media (http/https or local path).
* @param params.mediaBuffer      - Raw bytes of the media (alternative to URL).
* @param params.fileName         - File name (used for type detection and display).
* @param params.replyToMessageId - Optional message ID for threaded reply.
* @param params.accountId        - Optional account identifier.
* @returns The send result.
*/
async function uploadAndSendMediaLark(params) {
	const { cfg, to, mediaUrl, mediaBuffer, fileName, replyToMessageId, replyInThread, accountId, mediaLocalRoots } = params;
	log$22.info(`uploadAndSendMediaLark: target=${to}, source=${mediaBuffer ? "buffer" : mediaUrl ?? "(none)"}, fileName=${fileName ?? "(auto)"}`);
	let buffer;
	let resolvedFileName = fileName ?? "file";
	if (mediaBuffer) {
		buffer = mediaBuffer;
		log$22.debug(`using provided buffer: ${buffer.length} bytes`);
	} else if (mediaUrl) {
		buffer = await fetchMediaBuffer(mediaUrl, mediaLocalRoots);
		log$22.debug(`fetched media: ${buffer.length} bytes from "${mediaUrl}"`);
		if (!fileName) {
			const derivedFileName = resolveFileNameFromMediaUrl(mediaUrl);
			if (derivedFileName) resolvedFileName = derivedFileName;
		}
	} else throw new Error("[feishu-media] uploadAndSendMediaLark requires either mediaUrl or mediaBuffer. Provide a URL (http/https/file://) or a raw Buffer to send media.");
	const isImage = isImageFileName(resolvedFileName);
	log$22.info(`resolved: fileName="${resolvedFileName}", type=${isImage ? "image" : "file"}, size=${buffer.length}`);
	if (isImage) {
		const { imageKey } = await uploadImageLark({
			cfg,
			image: buffer,
			imageType: "message",
			accountId
		});
		log$22.debug(`image uploaded: imageKey=${imageKey}`);
		return sendImageLark({
			cfg,
			to,
			imageKey,
			replyToMessageId,
			replyInThread,
			accountId
		});
	}
	const fileType = detectFileType(resolvedFileName);
	const isAudio = fileType === "opus";
	const isVideo = fileType === "mp4";
	const duration = isAudio ? parseOggOpusDuration(buffer) : isVideo ? parseMp4Duration(buffer) : void 0;
	const { fileKey } = await uploadFileLark({
		cfg,
		file: buffer,
		fileName: resolvedFileName,
		fileType,
		duration,
		accountId
	});
	log$22.debug(`file uploaded: fileKey=${fileKey}, fileType=${fileType}${isAudio || isVideo ? `, duration=${duration ?? "unknown"}ms` : ""}`);
	if (isAudio) return sendAudioLark({
		cfg,
		to,
		fileKey,
		replyToMessageId,
		replyInThread,
		accountId
	});
	if (isVideo) return sendVideoLark({
		cfg,
		to,
		fileKey,
		replyToMessageId,
		replyInThread,
		accountId
	});
	return sendFileLark({
		cfg,
		to,
		fileKey,
		replyToMessageId,
		replyInThread,
		accountId
	});
}
/**
* Fetch remote image bytes by URL (http/https only).
* Local file access is denied. Includes SSRF protection.
*/
async function fetchRemoteImageBuffer(url) {
	return fetchMediaBuffer(url, void 0);
}
/**
* Check whether an IP address belongs to a private or reserved range.
*
* Blocks: 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16,
* 169.254.0.0/16 (link-local / cloud metadata), 0.0.0.0,
* IPv6 loopback (::1), link-local (fe80::), ULA (fc/fd).
*/
function isPrivateIP(ip) {
	if (ip.startsWith("127.")) return true;
	if (ip.startsWith("10.")) return true;
	if (ip.startsWith("192.168.")) return true;
	if (ip.startsWith("169.254.")) return true;
	if (ip === "0.0.0.0") return true;
	if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(ip)) return true;
	if (ip === "::1" || ip === "::") return true;
	if (ip.startsWith("fe80:")) return true;
	if (ip.startsWith("fc") || ip.startsWith("fd")) return true;
	return false;
}
/**
* Validate that a remote URL does not target private/reserved IP addresses.
*
* Resolves the hostname via DNS and checks all returned addresses.
* Rejects URLs with non-http(s) protocols.
*/
async function validateRemoteUrl(raw) {
	const parsed = new URL(raw);
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error(`[feishu-media] Unsupported protocol "${parsed.protocol}" in URL "${raw}". Only http:// and https:// are allowed for remote media.`);
	const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
	if (net.isIP(hostname)) {
		if (isPrivateIP(hostname)) throw new Error(`[feishu-media] Access to private/reserved IP "${hostname}" is denied (SSRF protection). URL: "${raw}"`);
	} else try {
		const addresses = await dns.resolve(hostname);
		for (const addr of addresses) if (isPrivateIP(addr)) throw new Error(`[feishu-media] Domain "${hostname}" resolves to private/reserved IP "${addr}" (SSRF protection). URL: "${raw}"`);
	} catch (err) {
		if (err instanceof Error && err.message.includes("SSRF protection")) throw err;
		log$22.warn(`[feishu-media] DNS resolution failed for "${hostname}": ${err}`);
	}
}
/**
* Fetch media bytes from a URL or local file path.
*
* Supports:
* - `http://` and `https://` URLs (fetched via the global `fetch` API)
* - `file://` URLs and bare file system paths (read from disk, gated
*   by `localRoots` for path-traversal prevention)
*/
async function fetchMediaBuffer(urlOrPath, localRoots) {
	const raw = normalizeMediaUrlInput(urlOrPath);
	if (isLocalMediaPath(raw)) {
		const filePath = raw.startsWith("file://") ? safeFileUrlToPath(raw) : raw;
		if (localRoots !== void 0) validateLocalMediaRoots(filePath, localRoots);
		else throw new Error(`[feishu-media] Local file access denied for "${filePath}": mediaLocalRoots is not configured. Configure mediaLocalRoots to explicitly allow local file access.`);
		const buf = fs$2.readFileSync(filePath);
		log$22.debug(`local file read: "${filePath}", ${buf.length} bytes`);
		return buf;
	}
	await validateRemoteUrl(raw);
	const FETCH_TIMEOUT_MS = 3e4;
	log$22.info(`fetching remote media: ${raw}`);
	const response = await fetch(raw, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
	if (!response.ok) throw new Error(`[feishu-media] Failed to fetch media from "${raw}": HTTP ${response.status} ${response.statusText}. Verify the URL is accessible and returns a valid media resource.`);
	const arrayBuffer = await response.arrayBuffer();
	log$22.debug(`remote media fetched: ${raw}, ${arrayBuffer.byteLength} bytes`);
	return Buffer.from(arrayBuffer);
}
//#endregion
//#region src/core/api-error.ts
/**
* Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
* SPDX-License-Identifier: MIT
*
* Shared Lark API error handling utilities.
*
* Provides unified error handling for two distinct error paths:
*
* 1. **Response-level errors** — The SDK returns a response object with a
*    non-zero `code`.  Handled by {@link assertLarkOk}.
*
* 2. **Thrown exceptions** — The SDK throws an Axios-style error (HTTP 4xx)
*    whose properties include the Feishu error `code` and `msg`.
*    Handled by {@link formatLarkError}.
*
* Both paths intercept well-known codes (e.g. LARK_ERROR.APP_SCOPE_MISSING (99991672) — missing API scopes)
* and produce user-friendly messages with actionable authorization links.
*/
/**
* Given a Feishu error code and msg, format a user-friendly permission
* error string if the code is LARK_ERROR.APP_SCOPE_MISSING (99991672).  Returns `null` for other codes.
*/
function formatPermissionError(code, msg) {
	if (code !== LARK_ERROR.APP_SCOPE_MISSING) return null;
	const authUrl = extractPermissionGrantUrl(msg);
	return `权限不足：应用缺少 [${extractPermissionScopes(msg)}] 权限。\n请管理员点击以下链接申请并开通权限：\n${authUrl}`;
}
function coerceCode(value) {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string") {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
}
/**
* 从 Lark SDK 抛错对象中提取飞书 API code。
*
* 支持三种常见结构：
* - `{ code }` — SDK 直接挂载
* - `{ data: { code } }` — 响应体嵌套
* - `{ response: { data: { code } } }` — Axios 风格
*/
function extractLarkApiCode(err) {
	if (!err || typeof err !== "object") return void 0;
	const e = err;
	return coerceCode(e.code) ?? coerceCode(e.data?.code) ?? coerceCode(e.response?.data?.code);
}
/**
* Assert that a Lark SDK response is successful (code === 0).
*
* For permission errors (code LARK_ERROR.APP_SCOPE_MISSING (99991672)), the thrown error includes the
* required scope names and a direct authorization URL so the AI can
* present it to the end user.
*/
function assertLarkOk(res) {
	if (!res.code || res.code === 0) return;
	const permMsg = formatPermissionError(res.code, res.msg ?? "");
	if (permMsg) throw new Error(permMsg);
	throw new Error(res.msg ?? `Feishu API error (code: ${res.code})`);
}
/**
* Extract a meaningful error message from a thrown Lark SDK / Axios error.
*
* The Lark SDK throws Axios errors whose object carries Feishu-specific
* fields (`code`, `msg`) alongside the standard `message`.  For permission
* errors (LARK_ERROR.APP_SCOPE_MISSING (99991672)) we format a user-friendly string with scopes + auth URL.
* For all other errors we try `err.msg` first (the Feishu detail) and fall
* back to `err.message` (the generic Axios text).
*/
function formatLarkError(err) {
	if (!err || typeof err !== "object") return String(err);
	const e = err;
	if (typeof e.code === "number" && e.msg) {
		const permMsg = formatPermissionError(e.code, e.msg);
		if (permMsg) return permMsg;
		return e.msg;
	}
	const data = e.response?.data;
	if (data && typeof data.code === "number" && data.msg) {
		const permMsg = formatPermissionError(data.code, data.msg);
		if (permMsg) return permMsg;
		return data.msg;
	}
	return e.message ?? String(err);
}
//#endregion
//#region src/messaging/outbound/deliver.ts
const log$21 = larkLogger("outbound/deliver");
/**
* Build a Feishu post-format content envelope from processed text.
*/
function buildPostContent(text) {
	return JSON.stringify({ zh_cn: { content: [[{
		tag: "md",
		text
	}]] } });
}
/**
* Normalise `<at>` mention tags that the AI frequently writes incorrectly.
*
* Correct Feishu syntax:
*   `<at user_id="ou_xxx">name</at>`   — mention a user
*   `<at user_id="all"></at>`           — mention everyone
*
* Common AI mistakes this function fixes:
*   `<at id=all></at>`           → `<at user_id="all"></at>`
*   `<at id="ou_xxx"></at>`      → `<at user_id="ou_xxx"></at>`
*   `<at open_id="ou_xxx"></at>` → `<at user_id="ou_xxx"></at>`
*   `<at user_id=ou_xxx></at>`   → `<at user_id="ou_xxx"></at>`
*/
function normalizeAtMentions(text) {
	return text.replace(/<at\s+(?:id|open_id|user_id)\s*=\s*"?([^">\s]+)"?\s*>/gi, "<at user_id=\"$1\">");
}
/**
* Pre-process text for Lark rendering:
* mention normalisation + table conversion + style optimization.
*/
function prepareTextForLark(cfg, text, accountId) {
	let processed = normalizeAtMentions(text);
	try {
		const accountScopedCfg = createAccountScopedConfig(cfg, accountId);
		const runtime = LarkClient.runtime;
		if (runtime?.channel?.text?.convertMarkdownTables && runtime.channel.text.resolveMarkdownTableMode) {
			const tableMode = runtime.channel.text.resolveMarkdownTableMode({
				cfg: accountScopedCfg,
				channel: "feishu"
			});
			processed = runtime.channel.text.convertMarkdownTables(processed, tableMode);
		}
	} catch {}
	return optimizeMarkdownStyle(processed, 1);
}
/**
* Unified IM message sender — handles both reply and create paths for any
* `msg_type`.  Replaces the former `replyPostMessage`, `createPostMessage`,
* `replyInteractiveMessage` and `createInteractiveMessage` helpers.
*/
async function sendImMessage(params) {
	const { client, to, content, msgType, replyToMessageId, replyInThread } = params;
	if (replyToMessageId) {
		log$21.info(`replying to message ${replyToMessageId} (msg_type=${msgType}, thread=${replyInThread ?? false})`);
		const response = await client.im.message.reply({
			path: { message_id: replyToMessageId },
			data: {
				content,
				msg_type: msgType,
				reply_in_thread: replyInThread
			}
		});
		const result = {
			messageId: response?.data?.message_id ?? "",
			chatId: response?.data?.chat_id ?? ""
		};
		log$21.debug(`reply sent: messageId=${result.messageId}`);
		return result;
	}
	const target = normalizeFeishuTarget(to);
	if (!target) throw new Error(`Cannot send message: "${to}" is not a valid target. Expected a chat_id (oc_*), open_id (ou_*), or user_id.`);
	const receiveIdType = resolveReceiveIdType(target);
	log$21.info(`creating message to ${target} (msg_type=${msgType})`);
	const response = await client.im.message.create({
		params: { receive_id_type: receiveIdType },
		data: {
			receive_id: target,
			msg_type: msgType,
			content
		}
	});
	const result = {
		messageId: response?.data?.message_id ?? "",
		chatId: response?.data?.chat_id ?? ""
	};
	log$21.debug(`message created: messageId=${result.messageId}`);
	return result;
}
/**
* Detect whether a text string is a complete Feishu card JSON (v1, v2, or template).
*
* Returns the parsed card object if the text is valid card JSON, or
* `undefined` if it is plain text. Detection is conservative — only
* triggers when the **entire** trimmed text is a JSON object with
* recognisable card structure markers.
*
* - **v2**: top-level `schema` equals `"2.0"`
* - **v1**: has an `elements` array AND at least `config` or `header`
* - **template**: `type` equals `"template"` with `data.template_id`
* - **wrapped**: `msg_type` or `type` equals `"interactive"` with a nested `card` object
*/
function detectCardJson(text) {
	const trimmed = text.trim();
	if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return void 0;
	try {
		const parsed = JSON.parse(trimmed);
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return;
		const obj = parsed;
		if (obj.schema === "2.0") return obj;
		if (Array.isArray(obj.elements) && (obj.config !== void 0 || obj.header !== void 0)) return obj;
		if (obj.type === "template" && typeof obj.data === "object" && obj.data !== null && typeof obj.data.template_id === "string") return obj;
		if ((obj.msg_type === "interactive" || obj.type === "interactive") && typeof obj.card === "object" && obj.card !== null) return obj.card;
		return;
	} catch {
		return;
	}
}
/**
* Send a text message to a Feishu chat or user.
*
* Standalone implementation that directly operates the Lark SDK.
* The text is pre-processed (table conversion, style optimization)
* and sent as a Feishu "post" message with markdown rendering.
*
* If the entire text is a valid Feishu card JSON string (v1 or v2),
* it is automatically detected and routed to {@link sendCardLark}
* instead of being sent as plain text.
*
* @param params - See {@link SendTextLarkParams}.
* @returns The message ID and chat ID.
* @throws {Error} When the target is invalid or the API call fails.
*
* @example
* ```ts
* const result = await sendTextLark({
*   cfg,
*   to: "oc_xxx",
*   text: "Hello from Feishu",
* });
* ```
*/
async function sendTextLark(params) {
	const { cfg, to, text, replyToMessageId, replyInThread, accountId } = params;
	const card = detectCardJson(text);
	if (card) {
		const version = card.schema === "2.0" ? "v2" : "v1";
		log$21.info(`detected ${version} card JSON in text (target=${to}), routing to sendCardLark`);
		return sendCardLark({
			cfg,
			to,
			card,
			replyToMessageId,
			replyInThread,
			accountId
		});
	}
	log$21.info(`sendTextLark: target=${to}, textLength=${text.length}`);
	const client = LarkClient.fromCfg(cfg, accountId).sdk;
	return sendImMessage({
		client,
		to,
		content: buildPostContent(prepareTextForLark(cfg, text, accountId)),
		msgType: "post",
		replyToMessageId,
		replyInThread
	});
}
/**
* Send an interactive card message to a Feishu chat or user.
*
* Supports both v1 (Message Card) and v2 (CardKit) card formats.
* The card JSON is serialised and sent as `msg_type: "interactive"`.
*
* @param params - See {@link SendCardLarkParams}.
* @returns The message ID and chat ID.
* @throws {Error} When the target is invalid or the API call fails.
*
* @example
* ```ts
* // v1 card
* const result = await sendCardLark({
*   cfg,
*   to: "oc_xxx",
*   card: {
*     config: { wide_screen_mode: true },
*     header: { title: { tag: "plain_text", content: "Hello" }, template: "blue" },
*     elements: [{ tag: "div", text: { tag: "lark_md", content: "world" } }],
*   },
* });
*
* // v2 card
* const result2 = await sendCardLark({
*   cfg,
*   to: "oc_xxx",
*   card: {
*     schema: "2.0",
*     config: { wide_screen_mode: true },
*     body: { elements: [{ tag: "markdown", content: "Hello **world**" }] },
*   },
* });
* ```
*/
async function sendCardLark(params) {
	const { cfg, to, card, replyToMessageId, replyInThread, accountId } = params;
	const version = card.schema === "2.0" ? "v2" : "v1";
	log$21.info(`sendCardLark: target=${to}, cardVersion=${version}`);
	const client = LarkClient.fromCfg(cfg, accountId).sdk;
	const content = JSON.stringify(card);
	try {
		return await sendImMessage({
			client,
			to,
			content,
			msgType: "interactive",
			replyToMessageId,
			replyInThread
		});
	} catch (err) {
		const detail = formatLarkError(err);
		log$21.error(`sendCardLark failed: ${detail}`);
		throw new Error(`Card send failed: ${detail}\n\nTroubleshooting:\n- Do NOT use img/image elements with fabricated img_key values — Feishu rejects invalid keys.\n- Do NOT put URLs in img_key — it must be a real image_key from uploadImage.\n- Prefer text-only cards (markdown elements) which have 100% success rate.\n- If you need images, send them as separate media messages, not inside cards.`);
	}
}
/**
* Send a single media message to a Feishu chat or user.
*
* Pure atomic operation — uploads the media and sends it. On upload
* failure, falls back to sending the URL as a clickable text link.
*
* This function does **not** handle leading text or multi-media
* orchestration; those concerns belong to the adapter's `sendMedia`
* and `sendPayload` methods.
*
* @param params - See {@link SendMediaLarkParams}.
* @returns The message ID and chat ID of the sent message.
* @throws {Error} When the target is invalid or all send attempts fail.
*
* @example
* ```ts
* const result = await sendMediaLark({
*   cfg,
*   to: "oc_xxx",
*   mediaUrl: "https://example.com/image.png",
* });
* ```
*/
async function sendMediaLark(params) {
	const { cfg, to, mediaUrl, replyToMessageId, replyInThread, accountId, mediaLocalRoots } = params;
	log$21.info(`sendMediaLark: target=${to}, mediaUrl=${mediaUrl}`);
	try {
		const result = await uploadAndSendMediaLark({
			cfg,
			to,
			mediaUrl,
			replyToMessageId,
			replyInThread,
			accountId,
			mediaLocalRoots
		});
		log$21.info(`media sent: messageId=${result.messageId}`);
		return {
			messageId: result.messageId,
			chatId: result.chatId
		};
	} catch (err) {
		const errMsg = err instanceof Error ? err.message : String(err);
		log$21.error(`sendMediaLark failed for "${mediaUrl}": ${errMsg}`);
		log$21.info(`falling back to text link for "${mediaUrl}"`);
		return {
			...await sendTextLark({
				cfg,
				to,
				text: `\u{1F4CE} ${mediaUrl}`,
				replyToMessageId,
				replyInThread,
				accountId
			}),
			warning: `Media upload failed for "${mediaUrl}" (${errMsg}). A text link was sent instead. The user may need to open the link manually.`
		};
	}
}
//#endregion
//#region src/messaging/inbound/policy.ts
/**
* Check whether a sender is permitted by a given allowlist.
*
* Entries are normalised to lowercase strings before comparison.
* A single "*" entry acts as a wildcard that matches everyone.
* When the allowlist is empty the result is `{ allowed: false }`.
*/
function resolveFeishuAllowlistMatch(params) {
	const allowFrom = params.allowFrom.map((entry) => String(entry).trim().toLowerCase()).filter(Boolean);
	if (allowFrom.length === 0) return { allowed: false };
	if (allowFrom.includes("*")) return {
		allowed: true,
		matchKey: "*",
		matchSource: "wildcard"
	};
	const senderId = params.senderId.toLowerCase();
	if (allowFrom.includes(senderId)) return {
		allowed: true,
		matchKey: senderId,
		matchSource: "id"
	};
	return { allowed: false };
}
/**
* Look up the per-group configuration by group ID.
*
* Performs a case-insensitive lookup against the keys in `cfg.groups`.
* Returns `undefined` when no matching group entry is found.
*/
function resolveFeishuGroupConfig(params) {
	const groups = params.cfg?.groups ?? {};
	const groupId = params.groupId?.trim();
	if (!groupId) return;
	const direct = groups[groupId];
	if (direct) return direct;
	const lowered = groupId.toLowerCase();
	const matchKey = Object.keys(groups).find((key) => key.toLowerCase() === lowered);
	return matchKey ? groups[matchKey] : void 0;
}
/**
* Extract the tool policy configuration from the group config that
* corresponds to the given group context.
*
* ★ 多账号配置隔离：SDK 回调传入的 params.cfg 是顶层全局配置，
*   cfg.channels.feishu 不包含 per-account 的覆盖值。
*   这里通过 getLarkAccount() 获取当前 account 合并后的配置，
*   确保每个账号的 groups / tool policy 配置独立生效。
*/
function resolveFeishuGroupToolPolicy(params) {
	const accountFeishuCfg = getLarkAccount(params.cfg, params.accountId ?? void 0).config;
	if (!accountFeishuCfg) return;
	return resolveFeishuGroupConfig({
		cfg: accountFeishuCfg,
		groupId: params.groupId
	})?.tools;
}
/**
* Determine whether an inbound group message should be processed.
*
* - `disabled` --> always rejected
* - `open`     --> always allowed
* - `allowlist` --> allowed only when the sender matches the allowlist
*/
function isFeishuGroupAllowed(params) {
	const { groupPolicy } = params;
	if (groupPolicy === "disabled") return false;
	if (groupPolicy === "open") return true;
	return resolveFeishuAllowlistMatch(params).allowed;
}
/**
* Split a raw `groupAllowFrom` array into legacy chat-ID entries
* (`oc_xxx`) and sender-level entries.
*
* Older Feishu configs used `groupAllowFrom` with `oc_xxx` chat IDs to
* control which groups are allowed.  The correct semantic (aligned with
* Telegram) is sender IDs.  This function separates the two concerns so
* both layers can work independently.
*/
function splitLegacyGroupAllowFrom(rawGroupAllowFrom) {
	const legacyChatIds = [];
	const senderAllowFrom = [];
	for (const entry of rawGroupAllowFrom) {
		const str = String(entry);
		if (str.startsWith("oc_")) legacyChatIds.push(str);
		else senderAllowFrom.push(str);
	}
	return {
		legacyChatIds,
		senderAllowFrom
	};
}
/**
* Resolve the effective sender-level group policy and the merged
* `allowFrom` list for sender filtering within a group.
*
* The precedence chain for `senderPolicy` is:
*   per-group `groupPolicy` > default ("*") group `groupPolicy` >
*   global `groupPolicy` > "open" (default).
*
* The `senderAllowFrom` is the union of global (non-oc_) entries,
* per-group entries, and default ("*") entries (when no per-group config).
*/
function resolveGroupSenderPolicyContext(params) {
	const { groupConfig, defaultConfig, accountFeishuCfg, senderGroupAllowFrom } = params;
	return {
		senderPolicy: groupConfig?.groupPolicy ?? defaultConfig?.groupPolicy ?? accountFeishuCfg?.groupPolicy ?? "open",
		senderAllowFrom: [
			...senderGroupAllowFrom,
			...groupConfig?.allowFrom ?? [],
			...!groupConfig && defaultConfig?.allowFrom ? defaultConfig.allowFrom : []
		]
	};
}
//#endregion
//#region src/core/message-unavailable.ts
/**
* Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
* SPDX-License-Identifier: MIT
*
* 消息不可用（已撤回/已删除）状态管理。
*
* 目标：
* 1) 当命中飞书终止错误码（230011/231003）时，按 message_id 标记不可用；
* 2) 后续针对该 message_id 的 API 调用直接短路，避免持续报错刷屏。
*/
const UNAVAILABLE_CACHE_TTL_MS = 1800 * 1e3;
const MAX_CACHE_SIZE_BEFORE_PRUNE = 512;
const unavailableMessageCache = /* @__PURE__ */ new Map();
function pruneExpired(nowMs = Date.now()) {
	for (const [messageId, state] of unavailableMessageCache) if (nowMs - state.markedAtMs > UNAVAILABLE_CACHE_TTL_MS) unavailableMessageCache.delete(messageId);
}
function isTerminalMessageApiCode(code) {
	return typeof code === "number" && MESSAGE_TERMINAL_CODES.has(code);
}
function markMessageUnavailable(params) {
	const normalizedId = normalizeMessageId(params.messageId);
	if (!normalizedId) return;
	if (unavailableMessageCache.size >= MAX_CACHE_SIZE_BEFORE_PRUNE) pruneExpired();
	unavailableMessageCache.set(normalizedId, {
		apiCode: params.apiCode,
		operation: params.operation,
		markedAtMs: Date.now()
	});
}
function getMessageUnavailableState(messageId) {
	const normalizedId = normalizeMessageId(messageId);
	if (!normalizedId) return void 0;
	const state = unavailableMessageCache.get(normalizedId);
	if (!state) return void 0;
	if (Date.now() - state.markedAtMs > UNAVAILABLE_CACHE_TTL_MS) {
		unavailableMessageCache.delete(normalizedId);
		return;
	}
	return state;
}
function isMessageUnavailable(messageId) {
	return !!getMessageUnavailableState(messageId);
}
function markMessageUnavailableFromError(params) {
	const normalizedId = normalizeMessageId(params.messageId);
	if (!normalizedId) return void 0;
	const code = extractLarkApiCode(params.error);
	if (!isTerminalMessageApiCode(code)) return void 0;
	markMessageUnavailable({
		messageId: normalizedId,
		apiCode: code,
		operation: params.operation
	});
	return code;
}
var MessageUnavailableError = class extends Error {
	messageId;
	apiCode;
	operation;
	constructor(params) {
		const operationText = params.operation ? `, op=${params.operation}` : "";
		super(`[feishu-message-unavailable] message ${params.messageId} unavailable (code=${params.apiCode}${operationText})`);
		this.name = "MessageUnavailableError";
		this.messageId = params.messageId;
		this.apiCode = params.apiCode;
		this.operation = params.operation;
	}
};
function isMessageUnavailableError(error) {
	return error instanceof MessageUnavailableError || typeof error === "object" && error !== null && error.name === "MessageUnavailableError";
}
function assertMessageAvailable(messageId, operation) {
	const normalizedId = normalizeMessageId(messageId);
	if (!normalizedId) return;
	const state = getMessageUnavailableState(normalizedId);
	if (!state) return;
	throw new MessageUnavailableError({
		messageId: normalizedId,
		apiCode: state.apiCode,
		operation: operation ?? state.operation
	});
}
/**
* 针对 message_id 的统一保护：
* - 调用前检查是否已标记不可用；
* - 调用报错后识别 230011/231003 并标记；
* - 命中时抛出 MessageUnavailableError 供上游快速终止流程。
*/
async function runWithMessageUnavailableGuard(params) {
	const normalizedId = normalizeMessageId(params.messageId);
	if (!normalizedId) return params.fn();
	assertMessageAvailable(normalizedId, params.operation);
	try {
		return await params.fn();
	} catch (error) {
		const code = markMessageUnavailableFromError({
			messageId: normalizedId,
			error,
			operation: params.operation
		});
		if (code) throw new MessageUnavailableError({
			messageId: normalizedId,
			apiCode: code,
			operation: params.operation
		});
		throw error;
	}
}
//#endregion
//#region src/messaging/converters/utils.ts
/**
* Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
* SPDX-License-Identifier: MIT
*
* Shared utilities for content converters.
*/
/** Escape a string for safe use inside a RegExp. */
function escapeRegExp$1(str) {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
/**
* Safely parse a JSON string, returning undefined on failure.
*/
function safeParse(raw) {
	try {
		return JSON.parse(raw);
	} catch {
		return;
	}
}
/**
* Format a duration in milliseconds to a human-readable string.
*
* Examples: 1500 → "1.5s", 65000 → "65s"
*/
function formatDuration(ms) {
	const seconds = ms / 1e3;
	if (seconds < 1) return `${ms}ms`;
	if (Number.isInteger(seconds)) return `${seconds}s`;
	return `${seconds.toFixed(1)}s`;
}
/**
* Convert a millisecond timestamp to "YYYY-MM-DD HH:mm" in UTC+8 (Beijing time).
*/
function millisToDatetime(ms) {
	const num = Number(ms);
	if (!Number.isFinite(num)) return String(ms);
	const d = new Date(num + 480 * 60 * 1e3);
	return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
//#endregion
//#region src/messaging/inbound/mention.ts
/** Whether the bot was @-mentioned. */
function mentionedBot(ctx) {
	return ctx.mentions.some((m) => m.isBot);
}
/** All non-bot mentions. */
function nonBotMentions(ctx) {
	return ctx.mentions.filter((m) => !m.isBot);
}
/**
* Remove all @mention placeholder keys from the message text.
*/
function extractMessageBody(text, allMentionKeys) {
	let result = text;
	for (const key of allMentionKeys) result = result.replace(new RegExp(escapeRegExp$1(key) + "\\s*", "g"), "");
	return result.trim();
}
/**
* Format a mention for a Feishu text / post message.
* @returns e.g. `<at user_id="ou_xxx">Alice</at>`
*/
function formatMentionForText(target) {
	return `<at user_id="${target.openId}">${target.name}</at>`;
}
/** Format an @everyone mention for text / post. */
function formatMentionAllForText() {
	return `<at user_id="all">Everyone</at>`;
}
/**
* Format a mention for a Feishu Interactive Card.
* @returns e.g. `<at id=ou_xxx></at>`
*/
function formatMentionForCard(target) {
	return `<at id=${target.openId}></at>`;
}
/** Format an @everyone mention for card. */
function formatMentionAllForCard() {
	return `<at id=all></at>`;
}
/** Prepend @mention tags (text format) to a message body. */
function buildMentionedMessage(targets, message) {
	if (targets.length === 0) return message;
	return `${targets.map(formatMentionForText).join(" ")}\n${message}`;
}
/** Prepend @mention tags (card format) to card markdown content. */
function buildMentionedCardContent(targets, message) {
	if (targets.length === 0) return message;
	return `${targets.map(formatMentionForCard).join(" ")}\n${message}`;
}
//#endregion
//#region src/messaging/outbound/send.ts
/**
* Resolve the configured markdown table mode for Feishu and convert tables if
* the runtime converter is available.
*
* @param cfg - Plugin configuration
* @param text - Raw markdown text
* @param accountId - Optional account identifier for multi-account setups
* @returns Converted text, or the original text when runtime helpers are unavailable
*/
function convertMarkdownTablesForFeishu(cfg, text, accountId) {
	try {
		const accountScopedCfg = createAccountScopedConfig(cfg, accountId);
		const runtime = LarkClient.runtime;
		if (runtime?.channel?.text?.convertMarkdownTables && runtime.channel.text.resolveMarkdownTableMode) {
			const tableMode = runtime.channel.text.resolveMarkdownTableMode({
				cfg: accountScopedCfg,
				channel: "feishu"
			});
			return runtime.channel.text.convertMarkdownTables(text, tableMode);
		}
	} catch {}
	return text;
}
/**
* Send a text message (rendered as a Feishu "post" with markdown support)
* to a chat or user.
*
* The message text is wrapped in Feishu's post format using the `md` tag
* for rich rendering. If `replyToMessageId` is provided, the message is
* sent as a threaded reply; otherwise it is sent as a new message using
* the appropriate `receive_id_type`.
*
* Markdown tables in the text are automatically converted to the format
* supported by Feishu via the runtime's table converter when available.
*
* @param params - See {@link SendFeishuMessageParams}.
* @returns The send result containing the new message ID.
*/
async function sendMessageFeishu(params) {
	const { cfg, to, text, replyToMessageId, mentions, accountId, replyInThread, i18nTexts } = params;
	const client = LarkClient.fromCfg(cfg, accountId).sdk;
	let contentPayload;
	if (i18nTexts && Object.keys(i18nTexts).length > 0) {
		const postBody = {};
		for (const [locale, localeText] of Object.entries(i18nTexts)) {
			let processed = localeText;
			if (mentions && mentions.length > 0) processed = buildMentionedMessage(mentions, processed);
			processed = convertMarkdownTablesForFeishu(cfg, processed, accountId);
			processed = optimizeMarkdownStyle(processed, 1);
			postBody[locale] = { content: [[{
				tag: "md",
				text: processed
			}]] };
		}
		contentPayload = JSON.stringify(postBody);
	} else {
		let messageText = text;
		if (mentions && mentions.length > 0) messageText = buildMentionedMessage(mentions, messageText);
		messageText = convertMarkdownTablesForFeishu(cfg, messageText, accountId);
		messageText = optimizeMarkdownStyle(messageText, 1);
		contentPayload = JSON.stringify({ zh_cn: { content: [[{
			tag: "md",
			text: messageText
		}]] } });
	}
	if (replyToMessageId) {
		const normalizedId = normalizeMessageId(replyToMessageId);
		const response = await runWithMessageUnavailableGuard({
			messageId: normalizedId,
			operation: "im.message.reply(post)",
			fn: () => client.im.message.reply({
				path: { message_id: normalizedId },
				data: {
					content: contentPayload,
					msg_type: "post",
					reply_in_thread: replyInThread
				}
			})
		});
		return {
			messageId: response?.data?.message_id ?? "",
			chatId: response?.data?.chat_id ?? ""
		};
	}
	const target = normalizeFeishuTarget(to);
	if (!target) throw new Error(`[feishu-send] Invalid target: "${to}"`);
	const receiveIdType = resolveReceiveIdType(target);
	const response = await client.im.message.create({
		params: { receive_id_type: receiveIdType },
		data: {
			receive_id: target,
			msg_type: "post",
			content: contentPayload
		}
	});
	return {
		messageId: response?.data?.message_id ?? "",
		chatId: response?.data?.chat_id ?? ""
	};
}
/**
* Send an interactive card message to a chat or user.
*
* @param params - See {@link SendFeishuCardParams}.
* @returns The send result containing the new message ID.
*/
async function sendCardFeishu(params) {
	const { cfg, to, card, replyToMessageId, accountId, replyInThread } = params;
	const client = LarkClient.fromCfg(cfg, accountId).sdk;
	const contentPayload = JSON.stringify(card);
	if (replyToMessageId) {
		const normalizedId = normalizeMessageId(replyToMessageId);
		const response = await runWithMessageUnavailableGuard({
			messageId: normalizedId,
			operation: "im.message.reply(interactive)",
			fn: () => client.im.message.reply({
				path: { message_id: normalizedId },
				data: {
					content: contentPayload,
					msg_type: "interactive",
					reply_in_thread: replyInThread
				}
			})
		});
		return {
			messageId: response?.data?.message_id ?? "",
			chatId: response?.data?.chat_id ?? ""
		};
	}
	const target = normalizeFeishuTarget(to);
	if (!target) throw new Error(`[feishu-send] Invalid target: "${to}"`);
	const receiveIdType = resolveReceiveIdType(target);
	const response = await client.im.message.create({
		params: { receive_id_type: receiveIdType },
		data: {
			receive_id: target,
			msg_type: "interactive",
			content: contentPayload
		}
	});
	return {
		messageId: response?.data?.message_id ?? "",
		chatId: response?.data?.chat_id ?? ""
	};
}
/**
* Update (PATCH) the content of an existing interactive card message.
*
* Only messages originally sent by the bot can be updated. The card
* must have been created with `"update_multi": true` in its config if
* all recipients should see the update.
*
* @param params.cfg       - Plugin configuration.
* @param params.messageId - The card message ID to update.
* @param params.card      - The new card content.
* @param params.accountId - Optional account identifier.
*/
async function updateCardFeishu(params) {
	const { cfg, messageId, card, accountId } = params;
	const client = LarkClient.fromCfg(cfg, accountId).sdk;
	await runWithMessageUnavailableGuard({
		messageId,
		operation: "im.message.patch(interactive)",
		fn: () => client.im.message.patch({
			path: { message_id: messageId },
			data: { content: JSON.stringify(card) }
		})
	});
}
/**
* Build a simple Feishu Interactive Message Card containing a single
* markdown element.
*
* This is a convenience wrapper for the most common card layout: a
* wide-screen card with one markdown block.
*
* @param text - The markdown text to render in the card.
* @returns A card JSON object ready to be sent via {@link sendCardFeishu}.
*/
function buildMarkdownCard(text) {
	return {
		schema: "2.0",
		config: { wide_screen_mode: true },
		body: { elements: [{
			tag: "markdown",
			content: optimizeMarkdownStyle(text)
		}] }
	};
}
/**
* Build an i18n-aware Feishu Interactive Message Card containing a single
* markdown element with per-locale content.
*
* Uses the CardKit v2 `i18n_content` field so the Feishu client
* auto-selects the locale matching the user's language setting.
*
* @param i18nTexts - A map of locale to markdown text (e.g. { zh_cn: '...', en_us: '...' }).
* @returns A card JSON object ready to be sent via {@link sendCardFeishu}.
*/
function buildI18nMarkdownCard(i18nTexts) {
	const locales = Object.keys(i18nTexts);
	const fallbackText = optimizeMarkdownStyle(i18nTexts[locales.includes("en_us") ? "en_us" : locales[0]]);
	const i18nContent = {};
	for (const [locale, text] of Object.entries(i18nTexts)) i18nContent[locale] = optimizeMarkdownStyle(text);
	return {
		schema: "2.0",
		config: { wide_screen_mode: true },
		body: { elements: [{
			tag: "markdown",
			content: fallbackText,
			i18n_content: i18nContent
		}] }
	};
}
/**
* Build a markdown card and send it in one step.
*
* If mention targets are provided, they are prepended to the markdown
* content using the card mention syntax.
*
* @param params.cfg              - Plugin configuration.
* @param params.to               - Target identifier.
* @param params.text             - Markdown content for the card.
* @param params.replyToMessageId - Optional message ID for threaded reply.
* @param params.mentions         - Optional mention targets.
* @param params.accountId        - Optional account identifier.
* @returns The send result containing the new message ID.
*/
async function sendMarkdownCardFeishu(params) {
	const { cfg, to, text, replyToMessageId, mentions, accountId, replyInThread } = params;
	let cardText = text;
	if (mentions && mentions.length > 0) cardText = buildMentionedCardContent(mentions, cardText);
	return sendCardFeishu({
		cfg,
		to,
		card: buildMarkdownCard(cardText),
		replyToMessageId,
		replyInThread,
		accountId
	});
}
/**
* Edit the content of an existing message.
*
* Updates the message body via the IM message update API. Only
* messages sent by the bot can be edited.
*
* @param params.cfg       - Plugin configuration.
* @param params.messageId - The message ID to edit.
* @param params.text      - The new message text.
* @param params.accountId - Optional account identifier.
*/
async function editMessageFeishu(params) {
	const { cfg, messageId, text, accountId } = params;
	const client = LarkClient.fromCfg(cfg, accountId).sdk;
	const optimizedText = optimizeMarkdownStyle(convertMarkdownTablesForFeishu(cfg, text, accountId), 1);
	const contentPayload = JSON.stringify({ zh_cn: { content: [[{
		tag: "md",
		text: optimizedText
	}]] } });
	await runWithMessageUnavailableGuard({
		messageId,
		operation: "im.message.update(post)",
		fn: () => client.im.message.update({
			path: { message_id: messageId },
			data: {
				content: contentPayload,
				msg_type: "post"
			}
		})
	});
}
//#endregion
//#region src/core/app-scope-checker.ts
const log$20 = larkLogger("core/app-scope-checker");
const cache = /* @__PURE__ */ new Map();
const CACHE_TTL_MS = 30 * 1e3;
/** 清除指定 appId 的缓存。 */
function invalidateAppScopeCache(appId) {
	cache.delete(appId);
}
/**
* 获取应用已开通的 scope 列表。
*
* 需要应用自身有 `application:application:self_manage` 权限。
* `appId` 可传 `"me"` 查自己。
*
* @param sdk - Lark SDK 实例
* @param appId - 应用 ID
* @param tokenType - token 类型，用于过滤只支持特定 token 类型的 scope
* @returns scope 字符串数组，如 `["calendar:calendar", "task:task:write"]`
*/
async function getAppGrantedScopes(sdk, appId, tokenType) {
	const cached = cache.get(appId);
	if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.rawScopes.filter((s) => {
		if (tokenType && s.token_types && Array.isArray(s.token_types)) return s.token_types.includes(tokenType);
		return true;
	}).map((s) => s.scope);
	try {
		const res = await sdk.request({
			method: "GET",
			url: `/open-apis/application/v6/applications/${appId}`,
			params: { lang: "zh_cn" }
		});
		if (res.code !== 0) throw new AppScopeCheckFailedError(appId);
		const app = res.data?.app ?? res.app ?? res.data;
		const validScopes = (app?.scopes ?? app?.online_version?.scopes ?? []).filter((s) => typeof s.scope === "string" && s.scope.length > 0).map((s) => ({
			scope: s.scope,
			token_types: s.token_types
		}));
		cache.set(appId, {
			rawScopes: validScopes,
			rawApp: app,
			fetchedAt: Date.now()
		});
		log$20.info(`fetched ${validScopes.length} scopes for app ${appId}`);
		const scopes = validScopes.filter((s) => {
			if (tokenType && s.token_types && Array.isArray(s.token_types)) return s.token_types.includes(tokenType);
			return true;
		}).map((s) => s.scope);
		log$20.info(`returning ${scopes.length} scopes${tokenType ? ` for ${tokenType} token` : ""}`);
		return scopes;
	} catch (err) {
		if (err instanceof AppScopeCheckFailedError) throw err;
		const statusCode = err?.response?.status || err?.status || err?.statusCode;
		if (statusCode === 400 || statusCode === 403 || err instanceof Error && (err.message.includes("status code 400") || err.message.includes("status code 403"))) throw new AppScopeCheckFailedError(appId);
		log$20.warn(`failed to fetch scopes for ${appId}: ${err instanceof Error ? err.message : err}`);
		return [];
	}
}
/**
* 获取应用信息，包括 owner 信息。
*
* 复用 getAppGrantedScopes 的 API 调用和缓存。
* 如果缓存中已有数据且未过期，直接从缓存提取。
*
* @param sdk - Lark SDK 实例
* @param appId - 应用 ID（可传 "me"）
*/
async function getAppInfo(sdk, appId) {
	await getAppGrantedScopes(sdk, appId);
	const cached = cache.get(appId);
	const rawApp = cached?.rawApp;
	const owner = rawApp?.owner;
	const creatorId = rawApp?.creator_id;
	const effectiveOwnerOpenId = (owner?.owner_type ?? owner?.type) === 2 && owner?.owner_id ? owner.owner_id : creatorId ?? owner?.owner_id;
	return {
		appId,
		creatorId,
		ownerOpenId: owner?.owner_id,
		ownerType: owner?.owner_type,
		effectiveOwnerOpenId,
		scopes: cached?.rawScopes ?? []
	};
}
/**
* 计算 APP 已有 ∩ OAPI 需要 的交集。
*
* 用于传给 OAuth 的 scope 参数 — 只请求 APP 已开通且 API 需要的 scope。
*
* @param appGranted - 应用已开通的 scope 列表
* @param apiRequired - OAPI 要求的 scope 列表
* @returns 交集 scope 列表
*/
function intersectScopes(appGranted, apiRequired) {
	const grantedSet = new Set(appGranted);
	return apiRequired.filter((s) => grantedSet.has(s));
}
/**
* 计算 OAPI 需要但 APP 未开通的 scope（差集）。
*
* 用于 AppScopeMissingError 的 missingScopes。
*
* @param appGranted - 应用已开通的 scope 列表
* @param apiRequired - OAPI 要求的 scope 列表
* @returns 缺失的 scope 列表
*/
function missingScopes(appGranted, apiRequired) {
	const grantedSet = new Set(appGranted);
	return apiRequired.filter((s) => !grantedSet.has(s));
}
/**
* 校验应用已开通的 scope 是否满足要求。
*
* 与 tool-client.ts invoke() 的 scope 校验逻辑完全一致，作为唯一真值来源：
*   - `scopeNeedType === "all"`: appScopes 必须包含 requiredScopes 的全部项
*   - 其他（默认 "one"）:        appScopes 与 requiredScopes 的交集非空即可
*   - appScopes 为空:            视为满足（API 查询失败，退回服务端判断）
*
* @param appScopes      - 应用已开通的 scope 列表（由 getAppGrantedScopes 返回）
* @param requiredScopes - 需要的 scope 列表
* @param scopeNeedType  - "all" 表示全部必须，undefined/"one" 表示任一即可
*/
function isAppScopeSatisfied(appScopes, requiredScopes, scopeNeedType) {
	if (appScopes.length === 0) return true;
	if (requiredScopes.length === 0) return true;
	if (scopeNeedType === "all") return missingScopes(appScopes, requiredScopes).length === 0;
	return intersectScopes(appScopes, requiredScopes).length > 0;
}
//#endregion
//#region src/core/app-owner-fallback.ts
const log$19 = larkLogger("core/app-owner-fallback");
/**
* 获取应用的 effectiveOwnerOpenId。
*
* 复用 app-scope-checker 的 API 调用、缓存和统一 owner 定义（effectiveOwnerOpenId）。
* 查询失败时返回 undefined（fail-open）。
*
* @param account - 已配置的飞书账号信息
* @param sdk - 飞书 SDK 实例（必须已初始化 TAT）
* @returns 应用所有者的 open_id，如果查询失败则返回 undefined
*/
async function getAppOwnerFallback(account, sdk) {
	const { appId } = account;
	try {
		return (await getAppInfo(sdk, appId)).effectiveOwnerOpenId;
	} catch (err) {
		log$19.warn(`failed to get owner for ${appId}: ${err instanceof Error ? err.message : err}`);
		return;
	}
}
//#endregion
//#region src/core/owner-policy.ts
/**
* 非应用 owner 尝试执行 owner-only 操作时抛出。
*
* 注意：`appOwnerId` 仅用于内部日志，不应序列化到用户可见的响应中，
* 以避免泄露 owner 的 open_id。
*/
var OwnerAccessDeniedError = class extends Error {
	userOpenId;
	appOwnerId;
	constructor(userOpenId, appOwnerId) {
		super("Permission denied: Only the app owner is authorized to use this feature.");
		this.name = "OwnerAccessDeniedError";
		this.userOpenId = userOpenId;
		this.appOwnerId = appOwnerId;
	}
};
/**
* 校验用户是否为应用 owner（fail-close 版本）。
*
* - 获取 owner 失败时 → 拒绝（安全优先）
* - owner 不匹配时 → 拒绝
*
* 适用于：`executeAuthorize`（OAuth 授权发起）、`commands/auth.ts`（批量授权）等
* 赋予实质性权限的入口。
*/
async function assertOwnerAccessStrict(account, sdk, userOpenId) {
	const ownerOpenId = await getAppOwnerFallback(account, sdk);
	if (!ownerOpenId) throw new OwnerAccessDeniedError(userOpenId, "unknown");
	if (ownerOpenId !== userOpenId) throw new OwnerAccessDeniedError(userOpenId, ownerOpenId);
}
//#endregion
//#region src/messaging/converters/text.ts
const convertText = (raw, ctx) => {
	return {
		content: resolveMentions(safeParse(raw)?.text ?? raw, ctx),
		resources: []
	};
};
//#endregion
//#region src/messaging/converters/post.ts
/** Preferred locale order for multi-language post unwrapping. */
const LOCALE_PRIORITY = [
	"zh_cn",
	"en_us",
	"ja_jp"
];
/**
* Unwrap a parsed post object that may be locale-wrapped.
*
* Feishu post messages come in two shapes:
*   - Flat:   `{ title, content }`
*   - Locale: `{ zh_cn: { title, content }, en_us: { title, content } }`
*/
function unwrapLocale(parsed) {
	if ("title" in parsed || "content" in parsed) return parsed;
	for (const locale of LOCALE_PRIORITY) {
		const localeData = parsed[locale];
		if (localeData != null && typeof localeData === "object") return localeData;
	}
	const firstKey = Object.keys(parsed)[0];
	if (firstKey) {
		const firstValue = parsed[firstKey];
		if (firstValue != null && typeof firstValue === "object") return firstValue;
	}
}
const convertPost = (raw, ctx) => {
	const rawParsed = safeParse(raw);
	if (rawParsed == null || typeof rawParsed !== "object") return {
		content: "[rich text message]",
		resources: []
	};
	const parsed = unwrapLocale(rawParsed);
	if (!parsed) return {
		content: "[rich text message]",
		resources: []
	};
	const resources = [];
	const lines = [];
	if (parsed.title) lines.push(`**${parsed.title}**`, "");
	const contentBlocks = parsed.content ?? [];
	for (const paragraph of contentBlocks) {
		if (!Array.isArray(paragraph)) continue;
		let line = "";
		for (const el of paragraph) line += renderElement(el, ctx, resources);
		lines.push(line);
	}
	let content = lines.join("\n").trim() || "[rich text message]";
	content = resolveMentions(content, ctx);
	return {
		content,
		resources
	};
};
function renderElement(el, ctx, resources) {
	switch (el.tag) {
		case "text": {
			let text = el.text ?? "";
			text = applyStyle(text, el.style);
			return text;
		}
		case "a": {
			const text = el.text ?? el.href ?? "";
			return el.href ? `[${text}](${el.href})` : text;
		}
		case "at": {
			const userId = el.user_id ?? "";
			if (userId === "all") return "@all";
			const name = el.user_name ?? userId;
			const info = ctx.mentionsByOpenId.get(userId);
			if (info) return info.key;
			return `@${name}`;
		}
		case "img":
			if (el.image_key) {
				resources.push({
					type: "image",
					fileKey: el.image_key
				});
				return `![image](${el.image_key})`;
			}
			return "";
		case "media":
			if (el.file_key) {
				resources.push({
					type: "file",
					fileKey: el.file_key
				});
				return `<file key="${el.file_key}"/>`;
			}
			return "";
		case "code_block": return `\n\`\`\`${el.language ?? ""}\n${el.text ?? ""}\n\`\`\`\n`;
		case "hr": return "\n---\n";
		default: return el.text ?? "";
	}
}
function applyStyle(text, style) {
	if (!style || style.length === 0) return text;
	let result = text;
	if (style.includes("bold")) result = `**${result}**`;
	if (style.includes("italic")) result = `*${result}*`;
	if (style.includes("underline")) result = `<u>${result}</u>`;
	if (style.includes("lineThrough")) result = `~~${result}~~`;
	if (style.includes("codeInline")) result = `\`${result}\``;
	return result;
}
//#endregion
//#region src/messaging/converters/image.ts
const convertImage = (raw) => {
	const imageKey = safeParse(raw)?.image_key;
	if (!imageKey) return {
		content: "[image]",
		resources: []
	};
	return {
		content: `![image](${imageKey})`,
		resources: [{
			type: "image",
			fileKey: imageKey
		}]
	};
};
//#endregion
//#region src/messaging/converters/file.ts
const convertFile = (raw) => {
	const parsed = safeParse(raw);
	const fileKey = parsed?.file_key;
	if (!fileKey) return {
		content: "[file]",
		resources: []
	};
	const fileName = parsed?.file_name ?? "";
	return {
		content: `<file key="${fileKey}"${fileName ? ` name="${fileName}"` : ""}/>`,
		resources: [{
			type: "file",
			fileKey,
			fileName: fileName || void 0
		}]
	};
};
//#endregion
//#region src/messaging/converters/audio.ts
const convertAudio = (raw) => {
	const parsed = safeParse(raw);
	const fileKey = parsed?.file_key;
	if (!fileKey) return {
		content: "[audio]",
		resources: []
	};
	const duration = parsed?.duration;
	return {
		content: `<audio key="${fileKey}"${duration != null ? ` duration="${formatDuration(duration)}"` : ""}/>`,
		resources: [{
			type: "audio",
			fileKey,
			duration: duration ?? void 0
		}]
	};
};
//#endregion
//#region src/messaging/converters/video.ts
const convertVideo = (raw) => {
	const parsed = safeParse(raw);
	const fileKey = parsed?.file_key;
	if (!fileKey) return {
		content: "[video]",
		resources: []
	};
	const fileName = parsed?.file_name ?? "";
	const duration = parsed?.duration;
	const coverKey = parsed?.image_key;
	return {
		content: `<video key="${fileKey}"${fileName ? ` name="${fileName}"` : ""}${duration != null ? ` duration="${formatDuration(duration)}"` : ""}/>`,
		resources: [{
			type: "video",
			fileKey,
			fileName: fileName || void 0,
			duration: duration ?? void 0,
			coverImageKey: coverKey ?? void 0
		}]
	};
};
//#endregion
//#region src/messaging/converters/sticker.ts
const convertSticker = (raw) => {
	const fileKey = safeParse(raw)?.file_key;
	if (!fileKey) return {
		content: "[sticker]",
		resources: []
	};
	return {
		content: `<sticker key="${fileKey}"/>`,
		resources: [{
			type: "sticker",
			fileKey
		}]
	};
};
//#endregion
//#region src/messaging/converters/interactive/types.ts
const EMOJI_MAP = {
	OK: "👌",
	THUMBSUP: "👍",
	SMILE: "😊",
	HEART: "❤️",
	CLAP: "👏",
	FIRE: "🔥",
	PARTY: "🎉",
	THINK: "🤔"
};
const CHART_TYPE_NAMES = {
	bar: "柱状图",
	line: "折线图",
	pie: "饼图",
	area: "面积图",
	radar: "雷达图",
	scatter: "散点图"
};
//#endregion
//#region src/messaging/converters/interactive/card-utils.ts
/**
* Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
* SPDX-License-Identifier: MIT
*
* Utility functions for card content conversion.
*/
function escapeAttr(s) {
	return s.replace(/"/g, "\\\"").replace(/\n/g, "\\n");
}
function formatMillisecondsToISO8601(milliseconds) {
	const ms = parseInt(milliseconds, 10);
	if (isNaN(ms)) return "";
	return new Date(ms).toISOString();
}
function normalizeTimeFormat(input) {
	if (!input) return "";
	const num = parseInt(input, 10);
	if (!isNaN(num) && String(num) === input.trim()) {
		if (input.length >= 13) return new Date(num).toISOString();
		else if (input.length >= 10) return (/* @__PURE__ */ new Date(num * 1e3)).toISOString();
	}
	if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(input)) return input;
	const dtMatch = /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}(?::\d{2})?)$/.exec(input);
	if (dtMatch) {
		const d = /* @__PURE__ */ new Date(`${dtMatch[1]}T${dtMatch[2]}`);
		if (!isNaN(d.getTime())) return d.toISOString();
	}
	if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
	if (/^\d{2}:\d{2}(:\d{2})?$/.test(input)) return input;
	return input;
}
//#endregion
//#region src/messaging/converters/interactive/card-converter.ts
const MODE = {
	Concise: 0,
	Detailed: 1
};
const elementConverters = new Map([
	["plain_text", (c, _elem, prop) => c.convertPlainText(prop)],
	["markdown", (c, _elem, prop) => c.convertMarkdown(prop)],
	["markdown_v1", (c, elem, prop) => c.convertMarkdownV1(elem, prop)],
	["text", (c, _elem, prop) => c.convertPlainText(prop)],
	["div", (c, _elem, prop, id) => c.convertDiv(prop, id)],
	["note", (c, _elem, prop) => c.convertNote(prop)],
	["hr", () => "---"],
	["br", () => "\n"],
	["column_set", (c, _elem, prop, _id, depth) => c.convertColumnSet(prop, depth)],
	["column", (c, _elem, prop, _id, depth) => c.convertColumn(prop, depth)],
	["person", (c, _elem, prop, id) => c.convertPerson(prop, id)],
	["person_v1", (c, _elem, prop, id) => c.convertPersonV1(prop, id)],
	["person_list", (c, _elem, prop) => c.convertPersonList(prop)],
	["avatar", (c, _elem, prop, id) => c.convertAvatar(prop, id)],
	["at", (c, _elem, prop) => c.convertAt(prop)],
	["at_all", () => "@所有人"],
	["button", (c, _elem, prop, id) => c.convertButton(prop, id)],
	["actions", (c, _elem, prop) => c.convertActions(prop)],
	["action", (c, _elem, prop) => c.convertActions(prop)],
	["overflow", (c, _elem, prop) => c.convertOverflow(prop)],
	["select_static", (c, _elem, prop, id) => c.convertSelect(prop, id, false)],
	["multi_select_static", (c, _elem, prop, id) => c.convertSelect(prop, id, true)],
	["select_person", (c, _elem, prop, id) => c.convertSelect(prop, id, false)],
	["multi_select_person", (c, _elem, prop, id) => c.convertSelect(prop, id, true)],
	["select_img", (c, _elem, prop, id) => c.convertSelectImg(prop, id)],
	["input", (c, _elem, prop, id) => c.convertInput(prop, id)],
	["date_picker", (c, _elem, prop, id) => c.convertDatePicker(prop, id, "date")],
	["picker_time", (c, _elem, prop, id) => c.convertDatePicker(prop, id, "time")],
	["picker_datetime", (c, _elem, prop, id) => c.convertDatePicker(prop, id, "datetime")],
	["checker", (c, _elem, prop, id) => c.convertChecker(prop, id)],
	["img", (c, _elem, prop, id) => c.convertImage(prop, id)],
	["image", (c, _elem, prop, id) => c.convertImage(prop, id)],
	["img_combination", (c, _elem, prop) => c.convertImgCombination(prop)],
	["table", (c, _elem, prop) => c.convertTable(prop)],
	["chart", (c, _elem, prop, id) => c.convertChart(prop, id)],
	["audio", (c, _elem, prop, id) => c.convertAudio(prop, id)],
	["video", (c, _elem, prop, id) => c.convertVideo(prop, id)],
	["collapsible_panel", (c, _elem, prop, id) => c.convertCollapsiblePanel(prop, id)],
	["form", (c, _elem, prop, id) => c.convertForm(prop, id)],
	["interactive_container", (c, _elem, prop, id) => c.convertInteractiveContainer(prop, id)],
	["text_tag", (c, _elem, prop) => c.convertTextTag(prop)],
	["number_tag", (c, _elem, prop) => c.convertNumberTag(prop)],
	["link", (c, _elem, prop) => c.convertLink(prop)],
	["emoji", (c, _elem, prop) => c.convertEmoji(prop)],
	["local_datetime", (c, _elem, prop) => c.convertLocalDatetime(prop)],
	["list", (c, _elem, prop) => c.convertList(prop)],
	["blockquote", (c, _elem, prop) => c.convertBlockquote(prop)],
	["code_block", (c, _elem, prop) => c.convertCodeBlock(prop)],
	["code_span", (c, _elem, prop) => c.convertCodeSpan(prop)],
	["heading", (c, _elem, prop) => c.convertHeading(prop)],
	["fallback_text", (c, _elem, prop) => c.convertFallbackText(prop)],
	["repeat", (c, _elem, prop) => c.convertRepeat(prop)],
	["card_header", () => ""],
	["custom_icon", () => ""],
	["standard_icon", () => ""]
]);
var CardConverter = class {
	mode;
	attachment;
	constructor(mode) {
		this.mode = mode;
	}
	convert(input) {
		const card = safeParse(input.json_card);
		if (!card) return {
			content: "<card>\n[无法解析卡片内容]\n</card>",
			schema: 0
		};
		if (input.json_attachment) this.attachment = safeParse(input.json_attachment);
		let schema = input.card_schema ?? 0;
		if (schema === 0) {
			const s = card.schema;
			schema = typeof s === "number" ? s : 1;
		}
		const header = card.header;
		const title = header ? this.extractHeaderTitle(header, schema) : "";
		const body = this.extractBody(card, schema);
		const bodyContent = body ? this.convertBody(body, schema) : "";
		let out = title ? `<card title="${escapeAttr(title)}">\n` : "<card>\n";
		if (bodyContent) out += bodyContent + "\n";
		out += "</card>";
		return {
			content: out,
			schema
		};
	}
	extractBody(card, _schema) {
		if (card.body && typeof card.body === "object") return card.body;
	}
	extractHeaderTitle(header, _schema) {
		const prop = header.property;
		if (prop) {
			const titleElem = prop.title;
			if (titleElem) return this.extractTextContent(titleElem);
		} else {
			const titleElem = header.title;
			if (titleElem) return this.extractTextContent(titleElem);
		}
		return "";
	}
	convertBody(body, _schema) {
		let elements;
		const prop = body.property;
		if (prop) {
			const e = prop.elements;
			if (Array.isArray(e) && e.length > 0) elements = e;
		}
		if (!elements || elements.length === 0) {
			const e = body.elements;
			if (Array.isArray(e)) elements = e;
		}
		if (!elements || elements.length === 0) return "";
		return this.convertElements(elements, 0);
	}
	convertElements(elements, depth) {
		const results = [];
		for (const elem of elements) {
			if (typeof elem !== "object" || elem === null) continue;
			const result = this.convertElement(elem, depth);
			if (result) results.push(result);
		}
		return results.join("\n");
	}
	convertElement(elem, depth) {
		const tag = elem.tag ?? "";
		const id = elem.id ?? "";
		const prop = this.extractProperty(elem);
		const fn = elementConverters.get(tag);
		if (fn) return fn(this, elem, prop, id, depth);
		return this.convertUnknown(prop, tag);
	}
	extractProperty(elem) {
		if (elem.property && typeof elem.property === "object") return elem.property;
		return elem;
	}
	extractTextContent(textElem) {
		if (textElem == null) return "";
		if (typeof textElem === "string") return textElem;
		if (typeof textElem === "object") {
			const m = textElem;
			if (m.property && typeof m.property === "object") return this.extractTextFromProperty(m.property);
			return this.extractTextFromProperty(m);
		}
		return "";
	}
	extractTextFromProperty(prop) {
		const i18n = prop.i18nContent;
		if (i18n && typeof i18n === "object") for (const lang of [
			"zh_cn",
			"en_us",
			"ja_jp"
		]) {
			const t = i18n[lang];
			if (typeof t === "string" && t) return t;
		}
		if (typeof prop.content === "string") return prop.content;
		const elements = prop.elements;
		if (Array.isArray(elements) && elements.length > 0) {
			const texts = [];
			for (const elem of elements) if (typeof elem === "object" && elem !== null) {
				const t = this.extractTextContent(elem);
				if (t) texts.push(t);
			}
			return texts.join("");
		}
		if (typeof prop.text === "string") return prop.text;
		return "";
	}
	convertPlainText(prop) {
		const content = prop.content;
		if (!content) return "";
		const style = this.extractTextStyle(prop);
		return this.applyTextStyle(content, style);
	}
	convertMarkdown(prop) {
		const elements = prop.elements;
		if (Array.isArray(elements) && elements.length > 0) return this.convertMarkdownElements(elements);
		if (typeof prop.content === "string") return prop.content;
		return "";
	}
	convertMarkdownV1(elem, prop) {
		const elements = prop.elements;
		if (Array.isArray(elements) && elements.length > 0) return this.convertMarkdownElements(elements);
		const fallback = elem.fallback;
		if (fallback && typeof fallback === "object") return this.convertElement(fallback, 0);
		if (typeof prop.content === "string") return prop.content;
		return "";
	}
	convertMarkdownElements(elements) {
		const parts = [];
		for (const elem of elements) {
			if (typeof elem !== "object" || elem === null) continue;
			const result = this.convertElement(elem, 0);
			if (result) parts.push(result);
		}
		return parts.join("");
	}
	convertDiv(prop, _id) {
		const results = [];
		const textElem = prop.text;
		if (textElem && typeof textElem === "object") {
			const text = this.convertElement(textElem, 0);
			if (text) results.push(text);
		}
		const fields = prop.fields;
		if (Array.isArray(fields) && fields.length > 0) {
			const fieldTexts = [];
			for (const field of fields) {
				if (typeof field !== "object" || field === null) continue;
				const te = field.text;
				if (te && typeof te === "object") {
					const ft = this.convertElement(te, 0);
					if (ft) fieldTexts.push(ft);
				}
			}
			if (fieldTexts.length > 0) results.push(fieldTexts.join("\n"));
		}
		const extraElem = prop.extra;
		if (extraElem && typeof extraElem === "object") {
			const extra = this.convertElement(extraElem, 0);
			if (extra) results.push(extra);
		}
		return results.join("\n");
	}
	convertNote(prop) {
		const elements = prop.elements;
		if (!Array.isArray(elements) || elements.length === 0) return "";
		const texts = [];
		for (const elem of elements) {
			if (typeof elem !== "object" || elem === null) continue;
			const text = this.convertElement(elem, 0);
			if (text) texts.push(text);
		}
		if (texts.length === 0) return "";
		return `📝 ${texts.join(" ")}`;
	}
	convertLink(prop) {
		const content = prop.content || "链接";
		let url = "";
		const urlObj = prop.url;
		if (urlObj && typeof urlObj === "object") url = urlObj.url || "";
		if (url) return `[${content}](${url})`;
		return content;
	}
	convertEmoji(prop) {
		const key = prop.key || "";
		return EMOJI_MAP[key] ?? `:${key}:`;
	}
	convertLocalDatetime(prop) {
		const milliseconds = prop.milliseconds;
		const fallbackText = prop.fallbackText;
		if (milliseconds) {
			const formatted = formatMillisecondsToISO8601(milliseconds);
			if (formatted) return formatted;
		}
		return fallbackText || "";
	}
	convertList(prop) {
		const items = prop.items;
		if (!Array.isArray(items) || items.length === 0) return "";
		const lines = [];
		for (const item of items) {
			if (typeof item !== "object" || item === null) continue;
			const im = item;
			const level = im.level || 0;
			const listType = im.type || "";
			const order = im.order || 0;
			const indent = "  ".repeat(level);
			const marker = listType === "ol" ? `${Math.floor(order)}.` : "-";
			const elements = im.elements;
			if (Array.isArray(elements)) {
				const content = this.convertMarkdownElements(elements);
				lines.push(`${indent}${marker} ${content}`);
			}
		}
		return lines.join("\n");
	}
	convertBlockquote(prop) {
		let content = "";
		if (typeof prop.content === "string") content = prop.content;
		else {
			const elements = prop.elements;
			if (Array.isArray(elements)) content = this.convertMarkdownElements(elements);
		}
		if (!content) return "";
		return content.split("\n").map((line) => `> ${line}`).join("\n");
	}
	convertCodeBlock(prop) {
		const language = prop.language || "plaintext";
		let code = "";
		const contents = prop.contents;
		if (Array.isArray(contents)) for (const line of contents) {
			if (typeof line !== "object" || line === null) continue;
			const lineContents = line.contents;
			if (Array.isArray(lineContents)) for (const c of lineContents) {
				if (typeof c !== "object" || c === null) continue;
				const cm = c;
				if (typeof cm.content === "string") code += cm.content;
			}
		}
		return `\`\`\`${language}\n${code}\`\`\``;
	}
	convertCodeSpan(prop) {
		return `\`${prop.content || ""}\``;
	}
	convertHeading(prop) {
		let level = prop.level || 1;
		if (level < 1) level = 1;
		if (level > 6) level = 6;
		let content = "";
		if (typeof prop.content === "string") content = prop.content;
		else {
			const elements = prop.elements;
			if (Array.isArray(elements)) content = this.convertMarkdownElements(elements);
		}
		return `${"#".repeat(level)} ${content}`;
	}
	convertFallbackText(prop) {
		const textElem = prop.text;
		if (textElem && typeof textElem === "object") return this.extractTextContent(textElem);
		const elements = prop.elements;
		if (Array.isArray(elements)) return this.convertMarkdownElements(elements);
		return "";
	}
	convertTextTag(prop) {
		const textElem = prop.text;
		let text = "";
		if (textElem && typeof textElem === "object") text = this.extractTextContent(textElem);
		if (!text) return "";
		return `「${text}」`;
	}
	convertNumberTag(prop) {
		const textElem = prop.text;
		let text = "";
		if (textElem && typeof textElem === "object") text = this.extractTextContent(textElem);
		if (!text) return "";
		const urlObj = prop.url;
		if (urlObj && typeof urlObj === "object") {
			const url = urlObj.url;
			if (url) return `[${text}](${url})`;
		}
		return text;
	}
	convertUnknown(prop, tag) {
		if (!prop) {
			if (this.mode === MODE.Detailed) return `[未知内容](tag:${tag})`;
			return "[未知内容]";
		}
		for (const path of [
			"content",
			"text",
			"title",
			"label",
			"placeholder"
		]) if (prop[path] != null) {
			const text = this.extractTextContent(prop[path]);
			if (text) return text;
		}
		const elements = prop.elements;
		if (Array.isArray(elements) && elements.length > 0) return this.convertElements(elements, 0);
		if (this.mode === MODE.Detailed) return `[未知内容](tag:${tag})`;
		return "[未知内容]";
	}
	convertColumnSet(prop, depth) {
		const columns = prop.columns;
		if (!Array.isArray(columns) || columns.length === 0) return "";
		const results = [];
		for (const col of columns) {
			if (typeof col !== "object" || col === null) continue;
			const result = this.convertElement(col, depth + 1);
			if (result) results.push(result);
		}
		return results.join("\n\n");
	}
	convertColumn(prop, depth) {
		const elements = prop.elements;
		if (!Array.isArray(elements) || elements.length === 0) return "";
		return this.convertElements(elements, depth);
	}
	convertForm(prop, _id) {
		let out = "<form>\n";
		const elements = prop.elements;
		if (Array.isArray(elements)) out += this.convertElements(elements, 0);
		out += "\n</form>";
		return out;
	}
	convertCollapsiblePanel(prop, _id) {
		const expanded = prop.expanded === true;
		let title = "详情";
		const header = prop.header;
		if (header && typeof header === "object") {
			const titleElem = header.title;
			if (titleElem) {
				const t = this.extractTextContent(titleElem);
				if (t) title = t;
			}
		}
		if (expanded || this.mode === MODE.Detailed) {
			let out = `▼ ${title}\n`;
			const elements = prop.elements;
			if (Array.isArray(elements)) {
				const content = this.convertElements(elements, 1);
				for (const line of content.split("\n")) if (line) out += `    ${line}\n`;
			}
			out += "▲";
			return out;
		}
		return `▶ ${title}`;
	}
	convertInteractiveContainer(prop, _id) {
		let url = "";
		const actions = prop.actions;
		if (Array.isArray(actions) && actions.length > 0) {
			const action = actions[0];
			if (action && typeof action === "object") {
				if (action.type === "open_url") {
					const actionData = action.action;
					if (actionData && typeof actionData === "object") url = actionData.url || "";
				}
			}
		}
		let out = "<clickable";
		if (url) out += ` url="${escapeAttr(url)}"`;
		if (this.mode === MODE.Detailed && _id) out += ` id="${_id}"`;
		out += ">\n";
		const elements = prop.elements;
		if (Array.isArray(elements)) out += this.convertElements(elements, 0);
		out += "\n</clickable>";
		return out;
	}
	convertRepeat(prop) {
		const elements = prop.elements;
		if (Array.isArray(elements)) return this.convertElements(elements, 0);
		return "";
	}
	convertButton(prop, _id) {
		let buttonText = "";
		const textElem = prop.text;
		if (textElem && typeof textElem === "object") buttonText = this.extractTextContent(textElem);
		if (!buttonText) buttonText = "按钮";
		const disabled = prop.disabled === true;
		if (disabled && this.mode === MODE.Concise) return `[${buttonText} ✗]`;
		const actions = prop.actions;
		if (Array.isArray(actions)) for (const action of actions) {
			if (typeof action !== "object" || action === null) continue;
			const am = action;
			if (am.type === "open_url") {
				const ad = am.action;
				if (ad && typeof ad === "object") {
					const url = ad.url;
					if (url) return `[${buttonText}](${url})`;
				}
			}
		}
		if (disabled && this.mode === MODE.Detailed) {
			let result = `[${buttonText} ✗]`;
			const tips = prop.disabledTips;
			if (tips && typeof tips === "object") {
				const tipsText = this.extractTextContent(tips);
				if (tipsText) result += `(tips:"${tipsText}")`;
			}
			return result;
		}
		return `[${buttonText}]`;
	}
	convertActions(prop) {
		const actions = prop.actions;
		if (!Array.isArray(actions) || actions.length === 0) return "";
		const results = [];
		for (const action of actions) {
			if (typeof action !== "object" || action === null) continue;
			const result = this.convertElement(action, 0);
			if (result) results.push(result);
		}
		return results.join(" ");
	}
	convertSelect(prop, _id, isMulti) {
		const options = prop.options || [];
		const selectedValues = /* @__PURE__ */ new Set();
		if (isMulti) {
			const vals = prop.selectedValues;
			if (Array.isArray(vals)) {
				for (const v of vals) if (typeof v === "string") selectedValues.add(v);
			}
		} else {
			const initialOption = prop.initialOption;
			if (typeof initialOption === "string") selectedValues.add(initialOption);
			const initialIndex = prop.initialIndex;
			if (typeof initialIndex === "number" && initialIndex >= 0 && initialIndex < options.length) {
				const opt = options[initialIndex];
				if (opt && typeof opt === "object") {
					const val = opt.value;
					if (val) selectedValues.add(val);
				}
			}
		}
		const optionTexts = [];
		let hasSelected = false;
		for (const opt of options) {
			if (typeof opt !== "object" || opt === null) continue;
			const om = opt;
			let optText = "";
			const textElem = om.text;
			if (textElem && typeof textElem === "object") optText = this.extractTextContent(textElem);
			if (!optText) optText = om.value || "";
			if (!optText) continue;
			const value = om.value || "";
			if (selectedValues.has(value)) {
				optText = "✓" + optText;
				hasSelected = true;
			}
			optionTexts.push(optText);
		}
		if (optionTexts.length === 0) {
			let placeholder = "请选择";
			const phElem = prop.placeholder;
			if (phElem && typeof phElem === "object") {
				const ph = this.extractTextContent(phElem);
				if (ph) placeholder = ph;
			}
			optionTexts.push(placeholder + " ▼");
		} else if (!hasSelected) optionTexts[optionTexts.length - 1] += " ▼";
		let result = `{${optionTexts.join(" / ")}}`;
		if (this.mode === MODE.Detailed) {
			const attrs = [];
			if (isMulti) attrs.push("multi");
			if (_id.includes("person") || prop.type === "person") attrs.push("type:person");
			if (attrs.length > 0) result += `(${attrs.join(" ")})`;
		}
		return result;
	}
	convertSelectImg(prop, _id) {
		const options = prop.options;
		if (!Array.isArray(options)) return "";
		const selectedValues = /* @__PURE__ */ new Set();
		const vals = prop.selectedValues;
		if (Array.isArray(vals)) {
			for (const v of vals) if (typeof v === "string") selectedValues.add(v);
		}
		const optTexts = [];
		for (let i = 0; i < options.length; i++) {
			const opt = options[i];
			if (!opt || typeof opt !== "object") continue;
			const value = opt.value || "";
			let text = `🖼️图${i + 1}`;
			if (selectedValues.has(value)) text = "✓" + text;
			optTexts.push(text);
		}
		return `{${optTexts.join(" / ")}}`;
	}
	convertInput(prop, _id) {
		let label = "";
		const labelElem = prop.label;
		if (labelElem && typeof labelElem === "object") label = this.extractTextContent(labelElem);
		const defaultValue = prop.defaultValue || "";
		let placeholder = "";
		const phElem = prop.placeholder;
		if (phElem && typeof phElem === "object") placeholder = this.extractTextContent(phElem);
		let result;
		if (defaultValue) result = defaultValue + "___";
		else if (placeholder) result = placeholder + "_____";
		else result = "_____";
		if (label) result = label + ": " + result;
		if (prop.inputType === "multiline_text") result = result.replace(/_____/g, "...");
		return result;
	}
	convertDatePicker(prop, _id, pickerType) {
		let emoji;
		let value = "";
		switch (pickerType) {
			case "date":
				emoji = "📅";
				value = prop.initialDate || "";
				break;
			case "time":
				emoji = "🕐";
				value = prop.initialTime || "";
				break;
			case "datetime":
				emoji = "📅";
				value = prop.initialDatetime || "";
				break;
			default: emoji = "📅";
		}
		if (value) value = normalizeTimeFormat(value);
		if (!value) {
			let placeholder = "选择";
			const phElem = prop.placeholder;
			if (phElem && typeof phElem === "object") {
				const ph = this.extractTextContent(phElem);
				if (ph) placeholder = ph;
			}
			value = placeholder;
		}
		return `${emoji} ${value}`;
	}
	convertChecker(prop, _id) {
		const checkMark = prop.checked === true ? "[x]" : "[ ]";
		let text = "";
		const textElem = prop.text;
		if (textElem && typeof textElem === "object") text = this.extractTextContent(textElem);
		let result = `${checkMark} ${text}`;
		if (this.mode === MODE.Detailed && _id) result += `(id:${_id})`;
		return result;
	}
	convertOverflow(prop) {
		const options = prop.options;
		if (!Array.isArray(options) || options.length === 0) return "";
		const optTexts = [];
		for (const opt of options) {
			if (typeof opt !== "object" || opt === null) continue;
			const textElem = opt.text;
			if (textElem && typeof textElem === "object") {
				const text = this.extractTextContent(textElem);
				if (text) optTexts.push(text);
			}
		}
		return `⋮ ${optTexts.join(", ")}`;
	}
	convertPerson(prop, _id) {
		const userID = prop.userID || "";
		if (!userID) return "";
		let personName = "";
		if (this.attachment) {
			const persons = this.attachment.persons;
			if (persons && typeof persons === "object") {
				const person = persons[userID];
				if (person && typeof person === "object") {
					const content = person.content;
					if (content) personName = content;
				}
			}
		}
		if (!personName) {
			const notation = prop.notation;
			if (notation && typeof notation === "object") personName = this.extractTextContent(notation);
		}
		if (personName) {
			if (this.mode === MODE.Detailed) return `@${personName}(open_id:${userID})`;
			return `@${personName}`;
		}
		if (this.mode === MODE.Detailed) return `@用户(open_id:${userID})`;
		return `@${userID}`;
	}
	convertPersonV1(prop, _id) {
		const userID = prop.userID || "";
		if (!userID) return "";
		let personName = "";
		if (this.attachment) {
			const persons = this.attachment.persons;
			if (persons && typeof persons === "object") {
				const person = persons[userID];
				if (person && typeof person === "object") {
					const content = person.content;
					if (content) personName = content;
				}
			}
		}
		if (personName) {
			if (this.mode === MODE.Detailed) return `@${personName}(open_id:${userID})`;
			return `@${personName}`;
		}
		if (this.mode === MODE.Detailed) return `@用户(open_id:${userID})`;
		return `@${userID}`;
	}
	convertPersonList(prop) {
		const persons = prop.persons;
		if (!Array.isArray(persons) || persons.length === 0) return "";
		const names = [];
		for (const person of persons) {
			if (typeof person !== "object" || person === null) continue;
			const personID = person.id || "";
			const name = "用户";
			if (this.mode === MODE.Detailed && personID) names.push(`@${name}(id:${personID})`);
			else names.push(`@${name}`);
		}
		return names.join(", ");
	}
	convertAvatar(prop, _id) {
		const userID = prop.userID || "";
		let result = "👤";
		if (this.mode === MODE.Detailed && userID) result += `(id:${userID})`;
		return result;
	}
	convertAt(prop) {
		const userID = prop.userID || "";
		if (!userID) return "";
		let userName = "";
		let actualUserID = "";
		if (this.attachment) {
			const atUsers = this.attachment.at_users;
			if (atUsers && typeof atUsers === "object") {
				const userInfo = atUsers[userID];
				if (userInfo && typeof userInfo === "object") {
					const content = userInfo.content;
					if (content) userName = content;
					const uid = userInfo.user_id;
					if (uid) actualUserID = uid;
				}
			}
		}
		if (userName) {
			if (this.mode === MODE.Detailed) {
				if (actualUserID) return `@${userName}(user_id:${actualUserID})`;
				return `@${userName}(open_id:${userID})`;
			}
			return `@${userName}`;
		}
		if (this.mode === MODE.Detailed) {
			if (actualUserID) return `@用户(user_id:${actualUserID})`;
			return `@用户(open_id:${userID})`;
		}
		return `@${userID}`;
	}
	convertImage(prop, _id) {
		let alt = "图片";
		const altElem = prop.alt;
		if (altElem && typeof altElem === "object") {
			const altText = this.extractTextContent(altElem);
			if (altText) alt = altText;
		}
		const titleElem = prop.title;
		if (titleElem && typeof titleElem === "object") {
			const titleText = this.extractTextContent(titleElem);
			if (titleText) alt = titleText;
		}
		let result = `🖼️ ${alt}`;
		if (this.mode === MODE.Detailed) {
			const imageID = prop.imageID;
			if (imageID) {
				const token = this.getImageToken(imageID);
				if (token) result += `(img_token:${token})`;
				else result += `(img_key:${imageID})`;
			}
		}
		return result;
	}
	convertImgCombination(prop) {
		const imgList = prop.imgList;
		if (!Array.isArray(imgList) || imgList.length === 0) return "";
		let result = `🖼️ ${imgList.length}张图片`;
		if (this.mode === MODE.Detailed) {
			const keys = [];
			for (const img of imgList) {
				if (typeof img !== "object" || img === null) continue;
				const imageID = img.imageID;
				if (imageID) keys.push(imageID);
			}
			if (keys.length > 0) result += `(keys:${keys.join(",")})`;
		}
		return result;
	}
	convertChart(prop, _id) {
		let title = "图表";
		let chartType = "";
		const chartSpec = prop.chartSpec;
		if (chartSpec && typeof chartSpec === "object") {
			const titleObj = chartSpec.title;
			if (titleObj && typeof titleObj === "object") {
				const text = titleObj.text;
				if (text) title = text;
			}
			const ct = chartSpec.type;
			if (ct) {
				chartType = ct;
				const typeName = CHART_TYPE_NAMES[chartType];
				if (typeName) title = `${title}${typeName}`;
			}
		}
		const summary = this.extractChartSummary(prop, chartType);
		let result = `📊 ${title}`;
		if (summary) result += `\n数据摘要: ${summary}`;
		return result;
	}
	extractChartSummary(prop, chartType) {
		const chartSpec = prop.chartSpec;
		if (!chartSpec || typeof chartSpec !== "object") return "";
		const dataObj = chartSpec.data;
		if (!dataObj || typeof dataObj !== "object") return "";
		const values = dataObj.values;
		if (!Array.isArray(values) || values.length === 0) return "";
		switch (chartType) {
			case "line":
			case "bar":
			case "area": return this.extractLineBarSummary(chartSpec, values);
			case "pie": return this.extractPieSummary(chartSpec, values);
			default: return this.extractGenericSummary(values);
		}
	}
	extractLineBarSummary(chartSpec, values) {
		const xField = chartSpec.xField;
		const yField = chartSpec.yField;
		if (!xField || !yField || values.length === 0) return this.extractGenericSummary(values);
		const parts = [];
		for (const v of values) {
			if (typeof v !== "object" || v === null) continue;
			const vm = v;
			parts.push(`${vm[xField]}:${vm[yField]}`);
		}
		return parts.length > 0 ? parts.join(", ") : this.extractGenericSummary(values);
	}
	extractPieSummary(chartSpec, values) {
		const categoryField = chartSpec.categoryField;
		const valueField = chartSpec.valueField;
		if (!categoryField || !valueField || values.length === 0) return this.extractGenericSummary(values);
		const parts = [];
		for (const v of values) {
			if (typeof v !== "object" || v === null) continue;
			const vm = v;
			parts.push(`${vm[categoryField]}:${vm[valueField]}`);
		}
		return parts.length > 0 ? parts.join(", ") : this.extractGenericSummary(values);
	}
	extractGenericSummary(values) {
		return `${values.length}个数据点`;
	}
	convertAudio(prop, _id) {
		let result = "🎵 音频";
		if (this.mode === MODE.Detailed) {
			const fileID = prop.fileID || prop.audioID || "";
			if (fileID) result += `(key:${fileID})`;
		}
		return result;
	}
	convertVideo(prop, _id) {
		let result = "🎬 视频";
		if (this.mode === MODE.Detailed) {
			const fileID = prop.fileID || prop.videoID || "";
			if (fileID) result += `(key:${fileID})`;
		}
		return result;
	}
	convertTable(prop) {
		const columns = prop.columns;
		if (!Array.isArray(columns) || columns.length === 0) return "";
		const rows = prop.rows || [];
		const colNames = [];
		const colKeys = [];
		for (const col of columns) {
			if (typeof col !== "object" || col === null) continue;
			const cm = col;
			let displayName = cm.displayName || "";
			const name = cm.name || "";
			if (!displayName) displayName = name;
			colNames.push(displayName);
			colKeys.push(name);
		}
		const lines = [];
		lines.push("| " + colNames.join(" | ") + " |");
		lines.push("|" + colNames.map(() => "------|").join(""));
		for (const row of rows) {
			if (typeof row !== "object" || row === null) continue;
			const rm = row;
			const cells = [];
			for (const key of colKeys) {
				let cellValue = "";
				const cellData = rm[key];
				if (cellData && typeof cellData === "object") {
					if (cellData.data != null) cellValue = this.extractTableCellValue(cellData.data);
				}
				cells.push(cellValue);
			}
			lines.push("| " + cells.join(" | ") + " |");
		}
		return lines.join("\n");
	}
	extractTableCellValue(data) {
		if (typeof data === "string") return data;
		if (typeof data === "number") return data.toFixed(2);
		if (Array.isArray(data)) {
			const texts = [];
			for (const item of data) if (typeof item === "object" && item !== null) {
				const im = item;
				if (typeof im.text === "string") texts.push(`「${im.text}」`);
			}
			return texts.join(" ");
		}
		if (typeof data === "object" && data !== null) return this.extractTextContent(data);
		return "";
	}
	extractTextStyle(prop) {
		const style = {
			bold: false,
			italic: false,
			strikethrough: false
		};
		const textStyle = prop.textStyle;
		if (!textStyle || typeof textStyle !== "object") return style;
		const attrs = textStyle.attributes;
		if (Array.isArray(attrs)) for (const attr of attrs) {
			if (typeof attr !== "string") continue;
			switch (attr) {
				case "bold":
					style.bold = true;
					break;
				case "italic":
					style.italic = true;
					break;
				case "strikethrough":
					style.strikethrough = true;
					break;
			}
		}
		return style;
	}
	applyTextStyle(content, style) {
		if (!content) return content;
		if (style.strikethrough) content = `~~${content}~~`;
		if (style.italic) content = `*${content}*`;
		if (style.bold) content = `**${content}**`;
		return content;
	}
	getImageToken(imageID) {
		if (!this.attachment) return "";
		const images = this.attachment.images;
		if (!images || typeof images !== "object") return "";
		const imageInfo = images[imageID];
		if (!imageInfo || typeof imageInfo !== "object") return "";
		return imageInfo.token || "";
	}
};
//#endregion
//#region src/messaging/converters/interactive/legacy.ts
function convertLegacyCard(parsed) {
	const texts = [];
	const header = parsed.header;
	if (header) {
		const title = header.title;
		if (title && typeof title.content === "string") texts.push(`**${title.content}**`);
	}
	const body = parsed.body;
	extractTexts(parsed.elements ?? body?.elements ?? [], texts);
	return {
		content: texts.length > 0 ? texts.join("\n") : "[interactive card]",
		resources: []
	};
}
function extractTexts(elements, out) {
	if (!Array.isArray(elements)) return;
	for (const el of elements) {
		if (typeof el !== "object" || el === null) continue;
		const elem = el;
		if (elem.tag === "markdown" && typeof elem.content === "string") {
			out.push(elem.content);
			continue;
		}
		if (elem.tag === "div" || elem.tag === "plain_text" || elem.tag === "lark_md") {
			const text = elem.text;
			if (text?.content && typeof text.content === "string") out.push(text.content);
			if (typeof elem.content === "string") out.push(elem.content);
		}
		if (elem.tag === "column_set") {
			const columns = elem.columns;
			if (columns) for (const col of columns) {
				const colObj = col;
				if (colObj.elements) extractTexts(colObj.elements, out);
			}
		}
		if (elem.elements) extractTexts(elem.elements, out);
	}
}
//#endregion
//#region src/messaging/converters/interactive/index.ts
const convertInteractive = (raw) => {
	const parsed = safeParse(raw);
	if (!parsed) return {
		content: "[interactive card]",
		resources: []
	};
	if (typeof parsed.json_card === "string") return {
		content: new CardConverter(MODE.Concise).convert(parsed).content || "[interactive card]",
		resources: []
	};
	return convertLegacyCard(parsed);
};
//#endregion
//#region src/messaging/converters/share.ts
const convertShareChat = (raw) => {
	return {
		content: `<group_card id="${safeParse(raw)?.chat_id ?? ""}"/>`,
		resources: []
	};
};
const convertShareUser = (raw) => {
	return {
		content: `<contact_card id="${safeParse(raw)?.user_id ?? ""}"/>`,
		resources: []
	};
};
//#endregion
//#region src/messaging/converters/location.ts
const convertLocation = (raw) => {
	const parsed = safeParse(raw);
	const name = parsed?.name ?? "";
	const lat = parsed?.latitude ?? "";
	const lng = parsed?.longitude ?? "";
	return {
		content: `<location${name ? ` name="${name}"` : ""}${lat && lng ? ` coords="lat:${lat},lng:${lng}"` : ""}/>`,
		resources: []
	};
};
//#endregion
//#region src/messaging/converters/merge-forward.ts
const log$18 = larkLogger("converters/merge-forward");
/**
* Recursively expand a merge_forward message.
*
* Output format aligns with the Go reference implementation:
* ```
* <forwarded_messages>
* [RFC3339] sender_id:
*     message content
* </forwarded_messages>
* ```
*/
const convertMergeForward = async (_raw, ctx) => {
	const { accountId, messageId, resolveUserName, batchResolveNames, fetchSubMessages } = ctx;
	if (!fetchSubMessages) return {
		content: "<forwarded_messages/>",
		resources: []
	};
	return {
		content: await expand(accountId, messageId, resolveUserName, batchResolveNames, fetchSubMessages),
		resources: []
	};
};
async function expand(accountId, messageId, resolveUserName, batchResolveNames, fetchSubMessages) {
	let items;
	try {
		items = await fetchSubMessages(messageId);
	} catch (error) {
		log$18.error("fetch sub-messages failed", {
			messageId,
			error: error instanceof Error ? error.message : String(error)
		});
		return "<forwarded_messages/>";
	}
	if (items.length === 0) return "<forwarded_messages/>";
	const childrenMap = buildChildrenMap(items, messageId);
	const senderIds = collectSenderIds(items, messageId);
	if (senderIds.length > 0 && batchResolveNames) try {
		await batchResolveNames(senderIds);
	} catch (err) {
		log$18.debug("batchResolveNames failed (best-effort)", { error: err instanceof Error ? err.message : String(err) });
	}
	return formatSubTree(messageId, childrenMap, accountId, resolveUserName);
}
/**
* Build a map from parent message ID → ordered child items.
*
* The API returns a flat `items` array where each item may carry an
* `upper_message_id` pointing to its parent container. Items without
* `upper_message_id` are direct children of the root container.
*
* The root container message itself (matching `rootMessageId`) is skipped.
*/
function buildChildrenMap(items, rootMessageId) {
	const map = /* @__PURE__ */ new Map();
	for (const item of items) {
		if (item.message_id === rootMessageId && !item.upper_message_id) continue;
		const parentId = item.upper_message_id ?? rootMessageId;
		let children = map.get(parentId);
		if (!children) {
			children = [];
			map.set(parentId, children);
		}
		children.push(item);
	}
	for (const children of map.values()) children.sort((a, b) => {
		return parseInt(String(a.create_time ?? "0"), 10) - parseInt(String(b.create_time ?? "0"), 10);
	});
	return map;
}
/**
* Collect all unique sender IDs from non-root items for batch name resolution.
*/
function collectSenderIds(items, rootMessageId) {
	const ids = /* @__PURE__ */ new Set();
	for (const item of items) {
		if (item.message_id === rootMessageId && !item.upper_message_id) continue;
		if (item.sender?.sender_type === "user") {
			const senderId = item.sender.id;
			if (senderId) ids.add(senderId);
		}
	}
	return [...ids];
}
/**
* Recursively format a sub-tree of messages rooted at `parentId`.
*
* For `merge_forward` children this recurses into `formatSubTree`
* directly (no additional API calls). For other message types it
* delegates to `convertMessageContent`.
*/
async function formatSubTree(parentId, childrenMap, accountId, resolveUserName) {
	const children = childrenMap.get(parentId);
	if (!children || children.length === 0) return "<forwarded_messages/>";
	const parts = [];
	for (const item of children) try {
		const msgType = item.msg_type ?? "text";
		const senderId = item.sender?.id ?? "unknown";
		const createTime = item.create_time ? parseInt(String(item.create_time), 10) : void 0;
		const timestamp = createTime ? formatTimestamp$1(createTime) : "unknown";
		const rawContent = item.body?.content ?? "{}";
		let content;
		if (msgType === "merge_forward") {
			const nestedId = item.message_id;
			if (nestedId) content = await formatSubTree(nestedId, childrenMap, accountId, resolveUserName);
			else content = "<forwarded_messages/>";
		} else content = (await convertMessageContent(rawContent, msgType, {
			...buildConvertContextFromItem(item, parentId, accountId),
			accountId,
			resolveUserName
		})).content;
		const displayName = resolveUserName?.(senderId) ?? senderId;
		const indented = indentLines(content, "    ");
		parts.push(`[${timestamp}] ${displayName}:\n${indented}`);
	} catch (err) {
		log$18.warn("failed to convert sub-message", {
			messageId: item.message_id,
			msgType: item.msg_type ?? "unknown",
			error: err instanceof Error ? err.message : String(err)
		});
	}
	if (parts.length === 0) return "<forwarded_messages/>";
	return `<forwarded_messages>\n${parts.join("\n")}\n</forwarded_messages>`;
}
/**
* Convert a millisecond timestamp to RFC 3339 format with +08:00 offset
* (Beijing time).
*/
function formatTimestamp$1(ms) {
	const date = new Date(ms);
	const utcMs = date.getTime() + date.getTimezoneOffset() * 6e4;
	const bjDate = new Date(utcMs + 8 * 36e5);
	return `${bjDate.getFullYear()}-${String(bjDate.getMonth() + 1).padStart(2, "0")}-${String(bjDate.getDate()).padStart(2, "0")}T${String(bjDate.getHours()).padStart(2, "0")}:${String(bjDate.getMinutes()).padStart(2, "0")}:${String(bjDate.getSeconds()).padStart(2, "0")}+08:00`;
}
/** Add a prefix indent to every line of text. */
function indentLines(text, indent) {
	return text.split("\n").map((line) => `${indent}${line}`).join("\n");
}
//#endregion
//#region src/messaging/converters/folder.ts
const convertFolder = (raw) => {
	const parsed = safeParse(raw);
	const fileKey = parsed?.file_key;
	if (!fileKey) return {
		content: "[folder]",
		resources: []
	};
	const fileName = parsed?.file_name ?? "";
	return {
		content: `<folder key="${fileKey}"${fileName ? ` name="${fileName}"` : ""}/>`,
		resources: []
	};
};
//#endregion
//#region src/messaging/converters/system.ts
const convertSystem = (raw) => {
	const parsed = safeParse(raw);
	if (!parsed?.template) return {
		content: "[system message]",
		resources: []
	};
	let content = parsed.template;
	const replacements = {
		"{from_user}": parsed.from_user?.length ? parsed.from_user.filter(Boolean).join(", ") : void 0,
		"{to_chatters}": parsed.to_chatters?.length ? parsed.to_chatters.filter(Boolean).join(", ") : void 0,
		"{divider_text}": parsed.divider_text?.text
	};
	for (const [placeholder, value] of Object.entries(replacements)) if (value != null) content = content.replaceAll(placeholder, value);
	else content = content.replaceAll(placeholder, "");
	return {
		content: content.trim(),
		resources: []
	};
};
//#endregion
//#region src/messaging/converters/hongbao.ts
const convertHongbao = (raw) => {
	const text = safeParse(raw)?.text;
	return {
		content: `<hongbao${text ? ` text="${text}"` : ""}/>`,
		resources: []
	};
};
//#endregion
//#region src/messaging/converters/calendar.ts
function formatCalendarContent(parsed) {
	const summary = parsed?.summary ?? "";
	const parts = [];
	if (summary) parts.push(`📅 ${summary}`);
	const start = parsed?.start_time ? millisToDatetime(parsed.start_time) : "";
	const end = parsed?.end_time ? millisToDatetime(parsed.end_time) : "";
	if (start && end) parts.push(`🕙 ${start} ~ ${end}`);
	else if (start) parts.push(`🕙 ${start}`);
	return parts.join("\n") || "[calendar event]";
}
const convertShareCalendarEvent = (raw) => {
	return {
		content: `<calendar_share>${formatCalendarContent(safeParse(raw))}</calendar_share>`,
		resources: []
	};
};
const convertCalendar = (raw) => {
	return {
		content: `<calendar_invite>${formatCalendarContent(safeParse(raw))}</calendar_invite>`,
		resources: []
	};
};
const convertGeneralCalendar = (raw) => {
	return {
		content: `<calendar>${formatCalendarContent(safeParse(raw))}</calendar>`,
		resources: []
	};
};
//#endregion
//#region src/messaging/converters/video-chat.ts
const convertVideoChat = (raw) => {
	const parsed = safeParse(raw);
	const topic = parsed?.topic ?? "";
	const parts = [];
	if (topic) parts.push(`📹 ${topic}`);
	if (parsed?.start_time) parts.push(`🕙 ${millisToDatetime(parsed.start_time)}`);
	return {
		content: `<meeting>${parts.join("\n") || "[video chat]"}</meeting>`,
		resources: []
	};
};
//#endregion
//#region src/messaging/converters/todo.ts
/** Extract plain text from post-style content blocks. */
function extractPlainText(content) {
	const lines = [];
	for (const paragraph of content) {
		if (!Array.isArray(paragraph)) continue;
		let line = "";
		for (const el of paragraph) if (el.text) line += el.text;
		lines.push(line);
	}
	return lines.join("\n").trim();
}
const convertTodo = (raw) => {
	const parsed = safeParse(raw);
	const parts = [];
	const fullTitle = [parsed?.summary?.title ?? "", parsed?.summary?.content ? extractPlainText(parsed.summary.content) : ""].filter(Boolean).join("\n");
	if (fullTitle) parts.push(fullTitle);
	if (parsed?.due_time) parts.push(`Due: ${millisToDatetime(parsed.due_time)}`);
	return {
		content: `<todo>\n${parts.join("\n") || "[todo]"}\n</todo>`,
		resources: []
	};
};
//#endregion
//#region src/messaging/converters/vote.ts
const convertVote = (raw) => {
	const parsed = safeParse(raw);
	const topic = parsed?.topic ?? "";
	const options = parsed?.options ?? [];
	const parts = [];
	if (topic) parts.push(topic);
	for (const opt of options) parts.push(`• ${opt}`);
	return {
		content: `<vote>\n${parts.join("\n") || "[vote]"}\n</vote>`,
		resources: []
	};
};
//#endregion
//#region src/messaging/converters/unknown.ts
const convertUnknown = (raw) => {
	const parsed = safeParse(raw);
	if (parsed != null && typeof parsed === "object" && "text" in parsed) {
		const text = parsed.text;
		if (typeof text === "string") return {
			content: text,
			resources: []
		};
	}
	return {
		content: "[unsupported message]",
		resources: []
	};
};
//#endregion
//#region src/messaging/converters/index.ts
const converters = new Map([
	["text", convertText],
	["post", convertPost],
	["image", convertImage],
	["file", convertFile],
	["audio", convertAudio],
	["video", convertVideo],
	["media", convertVideo],
	["sticker", convertSticker],
	["interactive", convertInteractive],
	["share_chat", convertShareChat],
	["share_user", convertShareUser],
	["location", convertLocation],
	["merge_forward", convertMergeForward],
	["folder", convertFolder],
	["system", convertSystem],
	["hongbao", convertHongbao],
	["share_calendar_event", convertShareCalendarEvent],
	["calendar", convertCalendar],
	["general_calendar", convertGeneralCalendar],
	["video_chat", convertVideoChat],
	["todo", convertTodo],
	["vote", convertVote],
	["unknown", convertUnknown]
]);
//#endregion
//#region src/messaging/converters/content-converter.ts
/** 从 mention 的 id 字段提取 open_id（兼容事件推送的对象格式和 API 响应的字符串格式） */
function extractMentionOpenId(id) {
	if (typeof id === "string") return id;
	if (id != null && typeof id === "object" && "open_id" in id) {
		const openId = id.open_id;
		return typeof openId === "string" ? openId : "";
	}
	return "";
}
/**
* Convert raw message content using the converter for the given message
* type. Falls back to the "unknown" converter for unrecognised types.
*
* Returns a Promise because some converters (e.g. merge_forward) perform
* async operations. Synchronous converters are awaited transparently.
*/
async function convertMessageContent(raw, messageType, ctx) {
	const fn = converters.get(messageType) ?? converters.get("unknown");
	if (!fn) return {
		content: raw,
		resources: []
	};
	return fn(raw, ctx);
}
/**
* Build a {@link ConvertContext} from a raw Feishu API message item.
*
* Extracts the `mentions` array that the IM API returns on each message
* item and maps it into the key→MentionInfo / openId→MentionInfo
* structures the converter system expects.
*/
function buildConvertContextFromItem(item, fallbackMessageId, accountId) {
	const mentions = /* @__PURE__ */ new Map();
	const mentionsByOpenId = /* @__PURE__ */ new Map();
	for (const m of item.mentions ?? []) {
		const openId = extractMentionOpenId(m.id);
		if (!openId) continue;
		const info = {
			key: m.key,
			openId,
			name: m.name ?? "",
			isBot: false
		};
		mentions.set(m.key, info);
		mentionsByOpenId.set(openId, info);
	}
	return {
		mentions,
		mentionsByOpenId,
		messageId: item.message_id ?? fallbackMessageId,
		accountId,
		resolveUserName: accountId ? (openId) => getUserNameCache(accountId).get(openId) : void 0
	};
}
/**
* Resolve mention placeholders in text.
*
* - Bot mentions: remove the placeholder key and any preceding `@botName`
*   entirely (with trailing whitespace).
* - Non-bot mentions: replace the placeholder key with readable `@name`.
*/
function resolveMentions(text, ctx) {
	if (ctx.mentions.size === 0) return text;
	let result = text;
	for (const [key, info] of ctx.mentions) if (info.isBot && ctx.stripBotMentions) {
		result = result.replace(new RegExp(`@${escapeRegExp$1(info.name)}\\s*`, "g"), "").trim();
		result = result.replace(new RegExp(escapeRegExp$1(key) + "\\s*", "g"), "").trim();
	} else result = result.replace(new RegExp(escapeRegExp$1(key), "g"), `@${info.name}`);
	return result;
}
//#endregion
//#region src/messaging/inbound/parse-io.ts
const log$17 = larkLogger("inbound/parse-io");
/**
* 对 interactive 消息，通过 TAT 调用 API 获取完整 v2 卡片内容。
* 事件推送的 content 可能不包含 json_card，API 调用可返回完整的 raw_card_content。
* 失败时返回 undefined，调用方 fallback 到原始 content。
*
* Note: `larkClient.sdk` 的类型定义不暴露 raw `request` 方法，
* 因此这里使用 `as any` 断言调用。
*/
async function fetchCardContent(messageId, larkClient) {
	try {
		return (await larkClient.sdk.request({
			method: "GET",
			url: `/open-apis/im/v1/messages/${messageId}`,
			params: {
				user_id_type: "open_id",
				card_msg_content_type: "raw_card_content"
			}
		}))?.data?.items?.[0]?.body?.content ?? void 0;
	} catch (err) {
		log$17.warn(`fetchCardContent failed for ${messageId}: ${err instanceof Error ? err.message : String(err)}`);
		return;
	}
}
/**
* Create a `fetchSubMessages` callback for use in `ConvertContext`.
*
* The returned function calls the im/v1/messages API to fetch
* sub-messages of a merge_forward message.
*
* Note: `larkClient.sdk` 的类型定义不暴露 raw `request` 方法，
* 因此这里使用 `as any` 断言调用。
*/
function createFetchSubMessages(larkClient) {
	return async (msgId) => {
		const response = await larkClient.sdk.request({
			method: "GET",
			url: `/open-apis/im/v1/messages/${msgId}`,
			params: {
				user_id_type: "open_id",
				card_msg_content_type: "raw_card_content"
			}
		});
		if (response?.code !== 0) throw new Error(`API error: code=${response?.code} msg=${response?.msg}`);
		return response?.data?.items ?? [];
	};
}
/**
* Create a `batchResolveNames` callback for use in `ConvertContext`.
*
* Wraps `createBatchResolveNames` from user-name-cache.ts, providing
* the account and log function.
*/
function createParseResolveNames(account) {
	return createBatchResolveNames(account, (...args) => log$17.info(args.map(String).join(" ")));
}
//#endregion
//#region src/messaging/inbound/parse.ts
const log$16 = larkLogger("inbound/parse");
/**
* Parse a raw Feishu message event into a normalised MessageContext.
*
* @param expandCtx  When provided, cfg/accountId are used to create
*                   callbacks for async converters (e.g. merge_forward)
*                   to fetch sub-messages and resolve sender names.
*/
async function parseMessageEvent(event, botOpenId, expandCtx) {
	const mentionMap = /* @__PURE__ */ new Map();
	const mentionList = [];
	for (const m of event.message.mentions ?? []) {
		const openId = m.id?.open_id ?? "";
		if (!openId) continue;
		const info = {
			key: m.key,
			openId,
			name: m.name,
			isBot: Boolean(botOpenId && openId === botOpenId)
		};
		mentionMap.set(m.key, info);
		mentionList.push(info);
	}
	const mentionsByOpenId = /* @__PURE__ */ new Map();
	for (const info of mentionList) mentionsByOpenId.set(info.openId, info);
	const acctId = expandCtx?.accountId;
	const larkClient = expandCtx ? LarkClient.fromCfg(expandCtx.cfg, acctId) : void 0;
	let fetchSubMessages;
	let batchResolveNames;
	if (expandCtx) {
		const account = getLarkAccount(expandCtx.cfg, acctId);
		fetchSubMessages = createFetchSubMessages(larkClient);
		batchResolveNames = createParseResolveNames(account);
	}
	let effectiveContent = event.message.content;
	if (event.message.message_type === "interactive" && expandCtx) {
		const fullContent = await fetchCardContent(event.message.message_id, larkClient);
		if (fullContent) {
			effectiveContent = fullContent;
			log$16.info("replaced interactive content with full v2 card data");
		}
	}
	const convertCtx = {
		mentions: mentionMap,
		mentionsByOpenId,
		messageId: event.message.message_id,
		botOpenId,
		cfg: expandCtx?.cfg,
		accountId: acctId,
		resolveUserName: acctId ? (openId) => getUserNameCache(acctId).get(openId) : void 0,
		fetchSubMessages,
		batchResolveNames,
		stripBotMentions: true
	};
	const { content, resources } = await convertMessageContent(effectiveContent, event.message.message_type, convertCtx);
	const createTimeStr = event.message.create_time;
	const createTime = createTimeStr ? parseInt(createTimeStr, 10) : void 0;
	return {
		chatId: event.message.chat_id,
		messageId: event.message.message_id,
		senderId: event.sender.sender_id.open_id || "",
		chatType: event.message.chat_type,
		rootId: event.message.root_id || void 0,
		parentId: event.message.parent_id || void 0,
		threadId: event.message.thread_id || void 0,
		content,
		contentType: event.message.message_type,
		resources,
		mentions: mentionList,
		createTime: Number.isNaN(createTime) ? void 0 : createTime,
		rawMessage: effectiveContent !== event.message.content ? {
			...event.message,
			content: effectiveContent
		} : event.message,
		rawSender: event.sender
	};
}
//#endregion
//#region src/messaging/inbound/media-resolver.ts
/**
* Download media files based on pre-extracted ResourceDescriptors from
* the converter phase.
*/
async function downloadResources(params) {
	const { cfg, messageId, resources, maxBytes, log, accountId } = params;
	if (resources.length === 0) return [];
	const out = [];
	const core = LarkClient.runtime;
	for (const res of resources) try {
		const resourceType = res.type === "image" ? "image" : "file";
		const result = await downloadMessageResourceFeishu({
			cfg,
			messageId,
			fileKey: res.fileKey,
			type: resourceType,
			accountId
		});
		let contentType = result.contentType;
		if (!contentType) contentType = await core.media.detectMime({ buffer: result.buffer });
		const fileName = result.fileName || res.fileName;
		const saved = await core.channel.media.saveMediaBuffer(result.buffer, contentType, "inbound", maxBytes, fileName);
		const placeholder = inferPlaceholderFromType(res.type);
		out.push({
			path: saved.path,
			contentType: saved.contentType,
			placeholder,
			fileKey: res.fileKey,
			resourceType: res.type
		});
		log?.(`feishu: downloaded ${res.type} resource ${res.fileKey}, saved to ${saved.path}`);
	} catch (err) {
		log?.(`feishu: failed to download ${res.type} resource ${res.fileKey}: ${String(err)}`);
	}
	return out;
}
function inferPlaceholderFromType(type) {
	switch (type) {
		case "image": return "<media:image>";
		case "file": return "<media:document>";
		case "audio": return "<media:audio>";
		case "video": return "<media:video>";
		case "sticker": return "<media:sticker>";
	}
}
function buildFeishuMediaPayload(mediaList) {
	const first = mediaList[0];
	const mediaPaths = mediaList.map((m) => m.path);
	const mediaTypes = mediaList.map((m) => m.contentType).filter(Boolean);
	return {
		MediaPath: first?.path,
		MediaType: first?.contentType,
		MediaUrl: first?.path,
		MediaPaths: mediaPaths.length > 0 ? mediaPaths : void 0,
		MediaUrls: mediaPaths.length > 0 ? mediaPaths : void 0,
		MediaTypes: mediaTypes.length > 0 ? mediaTypes : void 0
	};
}
//#endregion
//#region src/messaging/shared/message-lookup.ts
const log$15 = larkLogger("shared/message-lookup");
/**
* Retrieve a single message by its ID from the Feishu IM API.
*
* Returns a normalised {@link FeishuMessageInfo} object, or `null` if the
* message cannot be found or the API returns an error.
*
* @param params.cfg       - Plugin configuration with Feishu credentials.
* @param params.messageId - The message ID to fetch.
* @param params.accountId - Optional account identifier for multi-account setups.
*/
async function getMessageFeishu(params) {
	const { cfg, messageId, accountId, expandForward } = params;
	const larkClient = LarkClient.fromCfg(cfg, accountId);
	const sdk = larkClient.sdk;
	try {
		const requestOpts = {
			method: "GET",
			url: `/open-apis/im/v1/messages/mget`,
			params: {
				message_ids: messageId,
				user_id_type: "open_id",
				card_msg_content_type: "raw_card_content"
			}
		};
		const items = (await sdk.request(requestOpts))?.data?.items;
		if (!items || items.length === 0) {
			log$15.info(`getMessageFeishu: no items returned for ${messageId}`);
			return null;
		}
		const expandCtx = expandForward ? {
			cfg,
			accountId,
			fetchSubMessages: async (msgId) => {
				const res = await larkClient.sdk.request({
					method: "GET",
					url: `/open-apis/im/v1/messages/${msgId}`,
					params: {
						user_id_type: "open_id",
						card_msg_content_type: "raw_card_content"
					}
				});
				if (res?.code !== 0) throw new Error(`API error: code=${res?.code} msg=${res?.msg}`);
				return res?.data?.items ?? [];
			},
			batchResolveNames: createBatchResolveNames(getLarkAccount(cfg, accountId), (...args) => log$15.info(args.map(String).join(" ")))
		} : void 0;
		return await parseMessageItem(items[0], messageId, expandCtx);
	} catch (error) {
		log$15.error(`get message failed (${messageId}): ${error instanceof Error ? error.message : String(error)}`);
		return null;
	}
}
/**
* Parse a single message item from the Feishu IM API response into a
* normalised {@link FeishuMessageInfo}.
*
* Content parsing is delegated to the shared converter system so that
* every message-type mapping is defined in exactly one place.
*/
async function parseMessageItem(msg, fallbackMessageId, expandCtx) {
	const msgType = msg.msg_type ?? "text";
	const rawContent = msg.body?.content ?? "{}";
	const messageId = msg.message_id ?? fallbackMessageId;
	const acctId = expandCtx?.accountId;
	const { content } = await convertMessageContent(rawContent, msgType, {
		...buildConvertContextFromItem(msg, fallbackMessageId, acctId),
		cfg: expandCtx?.cfg,
		accountId: acctId,
		fetchSubMessages: expandCtx?.fetchSubMessages,
		batchResolveNames: expandCtx?.batchResolveNames
	});
	const senderId = msg.sender?.id ?? void 0;
	const senderType = msg.sender?.sender_type ?? void 0;
	const senderName = senderId && acctId ? getUserNameCache(acctId).get(senderId) : void 0;
	return {
		messageId,
		chatId: msg.chat_id ?? "",
		chatType: msg.chat_type ?? void 0,
		senderId,
		senderName,
		senderType,
		content,
		contentType: msgType,
		createTime: msg.create_time ? parseInt(String(msg.create_time), 10) : void 0,
		threadId: msg.thread_id || void 0
	};
}
//#endregion
//#region src/messaging/inbound/enrich.ts
/**
* Resolve the sender display name and track permission errors.
*
* This must run before the gate check because per-group sender
* allowlists may match on senderName.
*/
async function resolveSenderInfo(params) {
	const { account, log } = params;
	let ctx = params.ctx;
	if (ctx.rawSender?.sender_type !== "user") {
		log(`sender_type is "${ctx.rawSender?.sender_type}", skipping name resolution`);
		return { ctx };
	}
	const senderResult = await resolveUserName({
		account,
		openId: ctx.senderId,
		log
	});
	if (senderResult.name) {
		ctx = {
			...ctx,
			senderName: senderResult.name
		};
		log(`sender resolved: ${senderResult.name}`);
	} else if (senderResult.permissionError) log(`sender resolve failed: permission error code=${senderResult.permissionError.code}`);
	let permissionError;
	if (senderResult.permissionError) {
		const appKey = account.appId ?? "default";
		const now = Date.now();
		if (now - (permissionErrorNotifiedAt.get(appKey) ?? 0) > 3e5) {
			permissionErrorNotifiedAt.set(appKey, now);
			permissionError = senderResult.permissionError;
		}
	}
	return {
		ctx,
		permissionError
	};
}
/**
* Batch-prefetch user display names for the sender and all non-bot
* mentions. Mention names that are already known from the event payload
* are written into the cache for free.
*/
async function prefetchUserNames(params) {
	const { ctx, account, log } = params;
	if (!account.configured) return;
	const cache = getUserNameCache(account.accountId);
	for (const m of ctx.mentions) if (!m.isBot && m.openId && m.name) cache.set(m.openId, m.name);
	const openIds = /* @__PURE__ */ new Set();
	if (ctx.senderId) openIds.add(ctx.senderId);
	for (const m of ctx.mentions) if (!m.isBot && m.openId) openIds.add(m.openId);
	const toResolve = cache.filterMissing([...openIds]);
	if (toResolve.length > 0) await batchResolveUserNames({
		account,
		openIds: toResolve,
		log
	});
}
/**
* Download and save binary media attachments (images, files, audio,
* video, stickers) from the inbound message.
*
* Uses ResourceDescriptors extracted by content converters during the
* parse phase — no re-parsing of rawMessage.content needed.
*
* Returns a payload object whose keys (`MediaPath`, `MediaType`, …)
* are spread directly into the agent envelope, plus the raw mediaList
* for content substitution.
*/
async function resolveMedia(params) {
	const { ctx, accountScopedCfg, account, log } = params;
	const mediaMaxBytes = (account.config?.mediaMaxMb ?? 30) * 1024 * 1024;
	const mediaList = await downloadResources({
		cfg: accountScopedCfg,
		messageId: ctx.messageId,
		resources: ctx.resources,
		maxBytes: mediaMaxBytes,
		log,
		accountId: account.accountId
	});
	if (mediaList.length > 0) log(`media resolved: ${mediaList.length} attachment(s)`);
	return {
		payload: buildFeishuMediaPayload(mediaList),
		mediaList
	};
}
/**
* Replace Feishu file-key references in message content with actual
* local file paths after download.
*
* This is critical for:
* - **Images / stickers**: The SDK's `detectAndLoadPromptImages` scans
*   the prompt text for local file paths with image extensions.
* - **Audio / video / files**: Gives the AI meaningful context about
*   what was received (the SDK reads these via `MediaPath` directly,
*   but the text body should still reflect the actual attachments).
*/
function substituteMediaPaths(content, mediaList) {
	let result = content;
	for (const media of mediaList) {
		const { fileKey, path, resourceType } = media;
		switch (resourceType) {
			case "image":
				result = result.replace(`![image](${fileKey})`, path);
				break;
			case "sticker":
				result = result.replace(`<sticker key="${fileKey}"/>`, path);
				break;
			case "audio": {
				const audioRe = new RegExp(`<audio key="${escapeRegExp(fileKey)}"[^/]*/>`);
				result = result.replace(audioRe, `[Audio: ${path}]`);
				break;
			}
			case "file": {
				const fileRe = new RegExp(`<file key="${escapeRegExp(fileKey)}"[^/]*/>`);
				result = result.replace(fileRe, `[File: ${path}]`);
				break;
			}
			case "video": {
				const videoRe = new RegExp(`<video key="${escapeRegExp(fileKey)}"[^/]*/>`);
				result = result.replace(videoRe, `[Video: ${path}]`);
				break;
			}
		}
	}
	return result;
}
function escapeRegExp(s) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
/**
* Fetch the text content of the message that the user replied to.
*
* If the quoted message is itself a merge_forward, its sub-messages are
* fetched and formatted as a single text block.
*
* Returns `"senderName: content"` when the sender name is available so
* the AI knows who originally wrote the quoted message.
*/
async function resolveQuotedContent(params) {
	const { ctx, accountScopedCfg, account, log } = params;
	if (!ctx.parentId) return void 0;
	try {
		const quotedMsg = await getMessageFeishu({
			cfg: accountScopedCfg,
			messageId: ctx.parentId,
			accountId: account.accountId,
			expandForward: true
		});
		if (!quotedMsg) return void 0;
		log(`feishu[${account.accountId}]: fetched quoted message: ${quotedMsg.content?.slice(0, 100)}`);
		const prefix = `[message_id=${ctx.parentId}]`;
		if (quotedMsg.senderName) return `${prefix} ${quotedMsg.senderName}: ${quotedMsg.content}`;
		return `${prefix} ${quotedMsg.content}`;
	} catch (err) {
		log(`feishu[${account.accountId}]: failed to fetch quoted message: ${String(err)}`);
		return;
	}
}
//#endregion
//#region src/messaging/inbound/gate-effects.ts
/**
* Create a pairing request and send a pairing reply message to the user.
*
* This is the side-effect portion of the DM pairing gate: the pure
* policy decision (whether to pair) is made in gate.ts, and this
* function executes the resulting I/O.
*/
async function sendPairingReply(params) {
	const { senderId, chatId, accountId, accountScopedCfg } = params;
	const core = LarkClient.runtime;
	const { code } = await core.channel.pairing.upsertPairingRequest({
		channel: "feishu",
		id: senderId,
		accountId
	});
	const pairingReply = core.channel.pairing.buildPairingReply({
		channel: "feishu",
		idLine: senderId,
		code
	});
	if (accountScopedCfg) await sendMessageFeishu({
		cfg: accountScopedCfg,
		to: chatId,
		text: pairingReply,
		accountId
	});
}
//#endregion
//#region src/messaging/inbound/gate.ts
/** Prevent spamming the legacy groupAllowFrom migration warning. */
let legacyGroupAllowFromWarned = false;
/**
* Read the pairing allowFrom store for the Feishu channel via the SDK runtime.
*/
async function readAllowFromStore(accountId) {
	return await LarkClient.runtime.channel.pairing.readAllowFromStore({
		channel: "feishu",
		accountId
	});
}
/**
* Check whether an inbound message passes all access-control gates.
*
* The DM gate is async because it may read from the pairing store
* and send pairing request messages.
*/
async function checkMessageGate(params) {
	const { ctx, accountFeishuCfg, account, accountScopedCfg, log } = params;
	if (ctx.chatType === "group") return checkGroupGate({
		ctx,
		accountFeishuCfg,
		account,
		accountScopedCfg,
		log
	});
	return checkDmGate({
		ctx,
		accountFeishuCfg,
		account,
		accountScopedCfg,
		log
	});
}
function checkGroupGate(params) {
	const { ctx, accountFeishuCfg, account, accountScopedCfg, log } = params;
	const core = LarkClient.runtime;
	const { legacyChatIds, senderAllowFrom: senderGroupAllowFrom } = splitLegacyGroupAllowFrom(accountFeishuCfg?.groupAllowFrom ?? []);
	if (legacyChatIds.length > 0 && !legacyGroupAllowFromWarned) {
		legacyGroupAllowFromWarned = true;
		log(`feishu[${account.accountId}]: ⚠️  groupAllowFrom contains chat_id entries (${legacyChatIds.join(", ")}). groupAllowFrom is for SENDER filtering (open_ids like ou_xxx). Please move chat_ids to "groups" config instead:\n  channels.feishu.groups: {\n` + legacyChatIds.map((id) => `    "${id}": {},`).join("\n") + `\n  }`);
	}
	const groupAccess = core.channel.groups.resolveGroupPolicy({
		cfg: accountScopedCfg ?? {},
		channel: "feishu",
		groupId: ctx.chatId,
		accountId: account.accountId,
		groupIdCaseInsensitive: true,
		hasGroupAllowFrom: senderGroupAllowFrom.length > 0
	});
	let legacyGroupAdmit = false;
	if (!groupAccess.allowed) {
		const chatIdLower = ctx.chatId.toLowerCase();
		if (!legacyChatIds.some((id) => String(id).toLowerCase() === chatIdLower)) {
			log(`feishu[${account.accountId}]: group ${ctx.chatId} blocked by group-level policy`);
			return {
				allowed: false,
				reason: "group_not_allowed"
			};
		}
		legacyGroupAdmit = true;
	}
	const groupConfig = resolveFeishuGroupConfig({
		cfg: accountFeishuCfg,
		groupId: ctx.chatId
	});
	const defaultConfig = accountFeishuCfg?.groups?.["*"];
	if ((groupConfig?.enabled ?? defaultConfig?.enabled) === false) {
		log(`feishu[${account.accountId}]: group ${ctx.chatId} disabled by per-group config`);
		return {
			allowed: false,
			reason: "group_disabled"
		};
	}
	const hasExplicitSenderConfig = senderGroupAllowFrom.length > 0 || (groupConfig?.allowFrom ?? []).length > 0 || groupConfig?.groupPolicy != null;
	if (!(legacyGroupAdmit && !hasExplicitSenderConfig)) {
		const { senderPolicy, senderAllowFrom } = resolveGroupSenderPolicyContext({
			groupConfig,
			defaultConfig,
			accountFeishuCfg,
			senderGroupAllowFrom
		});
		if (!isFeishuGroupAllowed({
			groupPolicy: senderPolicy,
			allowFrom: senderAllowFrom,
			senderId: ctx.senderId,
			senderName: ctx.senderName
		})) {
			log(`feishu[${account.accountId}]: sender ${ctx.senderId} not allowed in group ${ctx.chatId}`);
			return {
				allowed: false,
				reason: "sender_not_allowed"
			};
		}
	}
	if (core.channel.groups.resolveRequireMention({
		cfg: accountScopedCfg ?? {},
		channel: "feishu",
		groupId: ctx.chatId,
		accountId: account.accountId,
		groupIdCaseInsensitive: true,
		requireMentionOverride: accountFeishuCfg?.requireMention
	}) && !mentionedBot(ctx)) {
		log(`feishu[${account.accountId}]: message in group ${ctx.chatId} did not mention bot, recording to history`);
		return {
			allowed: false,
			reason: "no_mention",
			historyEntry: {
				sender: ctx.senderId,
				body: `${ctx.senderName ?? ctx.senderId}: ${ctx.content}`,
				timestamp: ctx.createTime ?? Date.now(),
				messageId: ctx.messageId
			}
		};
	}
	return { allowed: true };
}
async function checkDmGate(params) {
	const { ctx, accountFeishuCfg, account, accountScopedCfg, log } = params;
	const dmPolicy = accountFeishuCfg?.dmPolicy ?? "pairing";
	const configAllowFrom = accountFeishuCfg?.allowFrom ?? [];
	if (dmPolicy === "disabled") {
		log(`feishu[${account.accountId}]: DM disabled by policy, rejecting sender ${ctx.senderId}`);
		return {
			allowed: false,
			reason: "dm_disabled"
		};
	}
	if (dmPolicy === "open") return { allowed: true };
	if (dmPolicy === "allowlist") {
		const storeAllowFrom = await readAllowFromStore(account.accountId).catch(() => []);
		if (!resolveFeishuAllowlistMatch({
			allowFrom: [...configAllowFrom, ...storeAllowFrom],
			senderId: ctx.senderId,
			senderName: ctx.senderName
		}).allowed) {
			log(`feishu[${account.accountId}]: sender ${ctx.senderId} not in DM allowlist`);
			return {
				allowed: false,
				reason: "dm_not_allowed"
			};
		}
		return { allowed: true };
	}
	const storeAllowFrom = await readAllowFromStore(account.accountId).catch(() => []);
	if (resolveFeishuAllowlistMatch({
		allowFrom: [...configAllowFrom, ...storeAllowFrom],
		senderId: ctx.senderId,
		senderName: ctx.senderName
	}).allowed) return { allowed: true };
	log(`feishu[${account.accountId}]: sender ${ctx.senderId} not paired, creating pairing request`);
	try {
		await sendPairingReply({
			senderId: ctx.senderId,
			chatId: ctx.chatId,
			accountId: account.accountId,
			accountScopedCfg
		});
	} catch (err) {
		log(`feishu[${account.accountId}]: failed to create pairing request for ${ctx.senderId}: ${String(err)}`);
	}
	return {
		allowed: false,
		reason: "pairing_pending"
	};
}
//#endregion
//#region src/core/footer-config.ts
/**
* The default footer configuration.
*
* By default all metadata items are hidden — neither status text
* ("已完成" / "出错" / "已停止") nor elapsed time are shown.
*/
const DEFAULT_FOOTER_CONFIG = {
	status: false,
	elapsed: false
};
/**
* Merge a partial footer configuration with `DEFAULT_FOOTER_CONFIG`.
*
* Fields present in the input take precedence; anything absent falls back
* to the default value.
*/
function resolveFooterConfig(cfg) {
	if (!cfg) return { ...DEFAULT_FOOTER_CONFIG };
	return {
		status: cfg.status ?? DEFAULT_FOOTER_CONFIG.status,
		elapsed: cfg.elapsed ?? DEFAULT_FOOTER_CONFIG.elapsed
	};
}
//#endregion
//#region src/messaging/outbound/typing.ts
const log$14 = larkLogger("outbound/typing");
/**
* The emoji type used to represent the typing indicator.
*
* "Typing" is a built-in Feishu emoji that shows a pencil / keyboard
* animation, making it a natural choice for a typing cue.
*/
const TYPING_EMOJI_TYPE = "Typing";
/**
* Add a typing indicator to a message by creating an emoji reaction.
*
* The reaction is added silently -- any errors (network issues, missing
* permissions, rate limits) are caught and logged rather than propagated
* to the caller. This ensures that a failure to show the typing cue
* never blocks the actual message processing.
*
* @param params.cfg       - Plugin configuration with Feishu credentials.
* @param params.messageId - The message ID to add the typing reaction to.
* @param params.accountId - Optional account identifier for multi-account setups.
* @returns A state object that should be passed to {@link removeTypingIndicator}.
*/
async function addTypingIndicator(params) {
	const { cfg, messageId, accountId } = params;
	const normalizedId = normalizeMessageId(messageId);
	const state = {
		messageId: normalizedId,
		reactionId: null
	};
	try {
		const client = LarkClient.fromCfg(cfg, accountId).sdk;
		state.reactionId = (await runWithMessageUnavailableGuard({
			messageId: normalizedId,
			operation: "im.messageReaction.create(typing)",
			fn: () => client.im.messageReaction.create({
				path: { message_id: normalizedId },
				data: { reaction_type: { emoji_type: TYPING_EMOJI_TYPE } }
			})
		}))?.data?.reaction_id ?? null;
	} catch (error) {
		if (isMessageUnavailableError(error)) {
			log$14.debug(`Skip add typing indicator for unavailable message`, { messageId: normalizedId });
			return state;
		}
		log$14.debug(`Failed to add typing indicator`, {
			messageId,
			error: error instanceof Error ? error.message : error
		});
	}
	return state;
}
/**
* Remove a previously added typing indicator reaction from a message.
*
* If the indicator was never successfully added (reactionId is null),
* this function is a no-op. Errors are silently caught so removal
* failures do not disrupt downstream logic.
*
* @param params.cfg   - Plugin configuration with Feishu credentials.
* @param params.state - The typing indicator state returned by {@link addTypingIndicator}.
* @param params.accountId - Optional account identifier for multi-account setups.
*/
async function removeTypingIndicator(params) {
	const { cfg, state, accountId } = params;
	const reactionId = state.reactionId;
	if (!reactionId) return;
	try {
		const client = LarkClient.fromCfg(cfg, accountId).sdk;
		await runWithMessageUnavailableGuard({
			messageId: state.messageId,
			operation: "im.messageReaction.delete(typing)",
			fn: () => client.im.messageReaction.delete({ path: {
				message_id: state.messageId,
				reaction_id: reactionId
			} })
		});
	} catch (error) {
		if (isMessageUnavailableError(error)) {
			log$14.debug(`Skip remove typing indicator for unavailable message`, { messageId: state.messageId });
			return;
		}
		log$14.debug(`Failed to remove typing indicator`, {
			messageId: state.messageId,
			error: error instanceof Error ? error.message : error
		});
	}
}
//#endregion
//#region src/card/reply-mode.ts
/**
* Resolve the effective reply mode based on configuration and chat type.
*
* Priority: replyMode.{scene} > replyMode.default > replyMode (string) > "auto"
*/
function resolveReplyMode(params) {
	const { feishuCfg, chatType } = params;
	if (feishuCfg?.streaming !== true) return "static";
	const replyMode = feishuCfg?.replyMode;
	if (!replyMode) return "auto";
	if (typeof replyMode === "string") return replyMode;
	return (chatType === "group" ? replyMode.group : chatType === "p2p" ? replyMode.direct : void 0) ?? replyMode.default ?? "auto";
}
/**
* Expand "auto" mode to a concrete mode based on streaming flag and chat type.
*
* When streaming === true: group → static, direct → streaming (legacy behavior).
* When streaming is unset: always static (new default).
*/
function expandAutoMode(params) {
	const { mode, streaming, chatType } = params;
	if (mode !== "auto") return mode;
	return streaming === true ? chatType === "group" ? "static" : "streaming" : "static";
}
/**
* Detect whether the text contains markdown elements that benefit from
* being rendered inside a Feishu interactive card (fenced code blocks or
* markdown tables).
*/
function shouldUseCard(text) {
	if (/```[\s\S]*?```/.test(text)) return true;
	if (/\|.+\|[\r\n]+\|[-:| ]+\|/.test(text)) return true;
	return false;
}
//#endregion
//#region src/card/cardkit.ts
const log$13 = larkLogger("card/cardkit");
/**
* 记录 CardKit API 响应日志，检测错误码并抛出异常。
*
* 默认 fail-fast：body-level 非零 code 视为业务错误，立即抛出，
* 由调用方（streaming-card-controller 等）统一走 catch → guard 处理。
*/
function logCardKitResponse(params) {
	const { resp, api, context } = params;
	const { code, msg } = resp;
	log$13.info(`cardkit ${api} response`, {
		code,
		msg,
		context
	});
	if (code && code !== 0) {
		log$13.warn(`cardkit ${api} FAILED`, {
			code,
			msg,
			context,
			fullResponse: resp
		});
		throw new Error(`cardkit ${api} FAILED: code=${code}, msg=${msg ?? ""}, ${context}`);
	}
}
/**
* Create a card entity via the CardKit API.
*
* Returns the card_id directly, bypassing the idConvert step.
* The card can then be sent via IM API and streamed via CardKit.
*/
async function createCardEntity(params) {
	const { cfg, card, accountId } = params;
	const response = await LarkClient.fromCfg(cfg, accountId).sdk.cardkit.v1.card.create({ data: {
		type: "card_json",
		data: JSON.stringify(card)
	} });
	const cardId = response.data?.card_id ?? response.card_id ?? null;
	logCardKitResponse({
		resp: response,
		api: "card.create",
		context: `cardId=${cardId}`
	});
	return cardId;
}
/**
* Stream text content to a specific card element using the CardKit API.
*
* The card automatically diffs the new content against the previous
* content and renders incremental changes with a typewriter animation.
*
* @param params.cardId    - CardKit card ID (from `convertMessageToCardId`).
* @param params.elementId - The element ID to update (e.g. `STREAMING_ELEMENT_ID`).
* @param params.content   - The full cumulative text (not a delta).
* @param params.sequence  - Monotonically increasing sequence number.
*/
async function streamCardContent(params) {
	const { cfg, cardId, elementId, content, sequence, accountId } = params;
	logCardKitResponse({
		resp: await LarkClient.fromCfg(cfg, accountId).sdk.cardkit.v1.cardElement.content({
			data: {
				content,
				sequence
			},
			path: {
				card_id: cardId,
				element_id: elementId
			}
		}),
		api: "cardElement.content",
		context: `seq=${sequence}, contentLen=${content.length}`
	});
}
/**
* Fully replace a card using the CardKit API.
*
* Used for the final "complete" state update (with action buttons, green
* header, etc.) after streaming finishes.
*
* @param params.cardId   - CardKit card ID.
* @param params.card     - The new card JSON content.
* @param params.sequence - Monotonically increasing sequence number.
*/
async function updateCardKitCard(params) {
	const { cfg, cardId, card, sequence, accountId } = params;
	logCardKitResponse({
		resp: await LarkClient.fromCfg(cfg, accountId).sdk.cardkit.v1.card.update({
			data: {
				card: {
					type: "card_json",
					data: JSON.stringify(card)
				},
				sequence
			},
			path: { card_id: cardId }
		}),
		api: "card.update",
		context: `seq=${sequence}, cardId=${cardId}`
	});
}
async function updateCardKitCardForAuth(params) {
	return updateCardKitCard(params);
}
/**
* Send an interactive card message by referencing a CardKit card_id.
*
* The content format is: {"type":"card","data":{"card_id":"xxx"}}
* This links the IM message to the CardKit card entity, enabling
* streaming updates via cardElement.content().
*/
async function sendCardByCardId(params) {
	const { cfg, to, cardId, replyToMessageId, replyInThread, accountId } = params;
	const client = LarkClient.fromCfg(cfg, accountId).sdk;
	const contentPayload = JSON.stringify({
		type: "card",
		data: { card_id: cardId }
	});
	if (replyToMessageId) {
		const normalizedId = normalizeMessageId(replyToMessageId);
		const response = await runWithMessageUnavailableGuard({
			messageId: normalizedId,
			operation: "im.message.reply(interactive.cardkit)",
			fn: () => client.im.message.reply({
				path: { message_id: normalizedId },
				data: {
					content: contentPayload,
					msg_type: "interactive",
					reply_in_thread: replyInThread
				}
			})
		});
		return {
			messageId: response?.data?.message_id ?? "",
			chatId: response?.data?.chat_id ?? ""
		};
	}
	const target = normalizeFeishuTarget(to);
	if (!target) throw new Error(`[feishu-send] Invalid target: "${to}"`);
	const receiveIdType = resolveReceiveIdType(target);
	const response = await client.im.message.create({
		params: { receive_id_type: receiveIdType },
		data: {
			receive_id: target,
			msg_type: "interactive",
			content: contentPayload
		}
	});
	return {
		messageId: response?.data?.message_id ?? "",
		chatId: response?.data?.chat_id ?? ""
	};
}
/**
* Close (or open) the streaming mode on a CardKit card.
*
* Must be called after streaming is complete to restore normal card
* behaviour (forwarding, interaction callbacks, etc.).
*/
async function setCardStreamingMode(params) {
	const { cfg, cardId, streamingMode, sequence, accountId } = params;
	logCardKitResponse({
		resp: await LarkClient.fromCfg(cfg, accountId).sdk.cardkit.v1.card.settings({
			data: {
				settings: JSON.stringify({ streaming_mode: streamingMode }),
				sequence
			},
			path: { card_id: cardId }
		}),
		api: "card.settings",
		context: `seq=${sequence}, streaming_mode=${streamingMode}`
	});
}
//#endregion
//#region src/card/builder.ts
/**
* Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
* SPDX-License-Identifier: MIT
*
* Interactive card building for Lark/Feishu.
*
* Provides utilities to construct Feishu Interactive Message Cards for
* different agent response states (thinking, streaming, complete, confirm).
*/
/**
* Element ID used for the streaming text area in cards. The CardKit
* `cardElement.content()` API targets this element for typewriter-effect
* streaming updates.
*/
const STREAMING_ELEMENT_ID = "streaming_content";
const REASONING_PREFIX = "Reasoning:\n";
/**
* Split a payload text into optional `reasoningText` and `answerText`.
*
* Handles two formats produced by the framework:
* 1. "Reasoning:\n_italic line_\n…" prefix (from `formatReasoningMessage`)
* 2. `<think>…</think>` / `<thinking>…</thinking>` XML tags
*
* Equivalent to the framework's `splitTelegramReasoningText()`.
*/
function splitReasoningText(text) {
	if (typeof text !== "string" || !text.trim()) return {};
	const trimmed = text.trim();
	if (trimmed.startsWith(REASONING_PREFIX) && trimmed.length > 11) return { reasoningText: cleanReasoningPrefix(trimmed) };
	const taggedReasoning = extractThinkingContent(text);
	const strippedAnswer = stripReasoningTags(text);
	if (!taggedReasoning && strippedAnswer === text) return { answerText: text };
	return {
		reasoningText: taggedReasoning || void 0,
		answerText: strippedAnswer || void 0
	};
}
/**
* Extract content from `<think>`, `<thinking>`, `<thought>` blocks.
* Handles both closed and unclosed (streaming) tags.
*/
function extractThinkingContent(text) {
	if (!text) return "";
	const scanRe = /<\s*(\/?)\s*(?:think(?:ing)?|thought|antthinking)\s*>/gi;
	let result = "";
	let lastIndex = 0;
	let inThinking = false;
	for (const match of text.matchAll(scanRe)) {
		const idx = match.index ?? 0;
		if (inThinking) result += text.slice(lastIndex, idx);
		inThinking = match[1] !== "/";
		lastIndex = idx + match[0].length;
	}
	if (inThinking) result += text.slice(lastIndex);
	return result.trim();
}
/**
* Strip reasoning blocks — both XML tags with their content and any
* "Reasoning:\n" prefixed content.
*/
function stripReasoningTags(text) {
	let result = text.replace(/<\s*(?:think(?:ing)?|thought|antthinking)\s*>[\s\S]*?<\s*\/\s*(?:think(?:ing)?|thought|antthinking)\s*>/gi, "");
	result = result.replace(/<\s*(?:think(?:ing)?|thought|antthinking)\s*>[\s\S]*$/gi, "");
	result = result.replace(/<\s*\/\s*(?:think(?:ing)?|thought|antthinking)\s*>/gi, "");
	return result.trim();
}
/**
* Clean a "Reasoning:\n_italic_" formatted message back to plain text.
* Strips the prefix and per-line italic markdown wrappers.
*/
function cleanReasoningPrefix(text) {
	let cleaned = text.replace(/^Reasoning:\s*/i, "");
	cleaned = cleaned.split("\n").map((line) => line.replace(/^_(.+)_$/, "$1")).join("\n");
	return cleaned.trim();
}
/**
* Format reasoning duration into a human-readable i18n pair.
* e.g. { zh: "思考了 3.2s", en: "Thought for 3.2s" }
*/
function formatReasoningDuration(ms) {
	const d = formatElapsed(ms);
	return {
		zh: `思考了 ${d}`,
		en: `Thought for ${d}`
	};
}
/**
* Format milliseconds into a human-readable duration string.
*/
function formatElapsed(ms) {
	const seconds = ms / 1e3;
	return seconds < 60 ? `${seconds.toFixed(1)}s` : `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}
/**
* Build footer meta-info: notation-sized text with i18n support.
* Error text is rendered in red; normal text uses default grey (notation).
*/
function buildFooter(zhText, enText, isError) {
	const zhContent = isError ? `<font color='red'>${zhText}</font>` : zhText;
	const enContent = isError ? `<font color='red'>${enText}</font>` : enText;
	return [{
		tag: "markdown",
		content: enContent,
		i18n_content: {
			zh_cn: zhContent,
			en_us: enContent
		},
		text_size: "notation"
	}];
}
/**
* Build a full Feishu Interactive Message Card JSON object for the
* given state.
*/
function buildCardContent(state, data = {}) {
	switch (state) {
		case "thinking": return buildThinkingCard();
		case "streaming": return buildStreamingCard(data.text ?? "", data.toolCalls ?? [], data.reasoningText);
		case "complete": return buildCompleteCard({
			text: data.text ?? "",
			toolCalls: data.toolCalls ?? [],
			elapsedMs: data.elapsedMs,
			isError: data.isError,
			reasoningText: data.reasoningText,
			reasoningElapsedMs: data.reasoningElapsedMs,
			isAborted: data.isAborted,
			footer: data.footer
		});
		case "confirm": return buildConfirmCard(data.confirmData);
		default: throw new Error(`Unknown card state: ${state}`);
	}
}
function buildThinkingCard() {
	return {
		config: {
			wide_screen_mode: true,
			update_multi: true,
			locales: ["zh_cn", "en_us"]
		},
		elements: [{
			tag: "markdown",
			content: "Thinking...",
			i18n_content: {
				zh_cn: "思考中...",
				en_us: "Thinking..."
			}
		}]
	};
}
function buildStreamingCard(partialText, toolCalls, reasoningText) {
	const elements = [];
	if (!partialText && reasoningText) elements.push({
		tag: "markdown",
		content: `💭 **Thinking...**\n\n${reasoningText}`,
		i18n_content: {
			zh_cn: `💭 **思考中...**\n\n${reasoningText}`,
			en_us: `💭 **Thinking...**\n\n${reasoningText}`
		},
		text_size: "notation"
	});
	else if (partialText) elements.push({
		tag: "markdown",
		content: optimizeMarkdownStyle(partialText)
	});
	if (toolCalls.length > 0) {
		const toolLines = toolCalls.map((tc) => {
			return `${tc.status === "running" ? "🔄" : tc.status === "complete" ? "✅" : "❌"} ${tc.name} - ${tc.status}`;
		});
		elements.push({
			tag: "markdown",
			content: toolLines.join("\n"),
			text_size: "notation"
		});
	}
	return {
		config: {
			wide_screen_mode: true,
			update_multi: true,
			locales: ["zh_cn", "en_us"]
		},
		elements
	};
}
function buildCompleteCard(params) {
	const { text, toolCalls, elapsedMs, isError, reasoningText, reasoningElapsedMs, isAborted, footer } = params;
	const elements = [];
	if (reasoningText) {
		const dur = reasoningElapsedMs ? formatReasoningDuration(reasoningElapsedMs) : null;
		const zhLabel = dur ? dur.zh : "思考";
		const enLabel = dur ? dur.en : "Thought";
		elements.push({
			tag: "collapsible_panel",
			expanded: false,
			header: {
				title: {
					tag: "markdown",
					content: `💭 ${enLabel}`,
					i18n_content: {
						zh_cn: `💭 ${zhLabel}`,
						en_us: `💭 ${enLabel}`
					}
				},
				vertical_align: "center",
				icon: {
					tag: "standard_icon",
					token: "down-small-ccm_outlined",
					size: "16px 16px"
				},
				icon_position: "follow_text",
				icon_expanded_angle: -180
			},
			border: {
				color: "grey",
				corner_radius: "5px"
			},
			vertical_spacing: "8px",
			padding: "8px 8px 8px 8px",
			elements: [{
				tag: "markdown",
				content: reasoningText,
				text_size: "notation"
			}]
		});
	}
	elements.push({
		tag: "markdown",
		content: optimizeMarkdownStyle(text)
	});
	if (toolCalls.length > 0) {
		const toolSummaryLines = toolCalls.map((tc) => {
			return `${tc.status === "complete" ? "✅" : "❌"} **${tc.name}** - ${tc.status}`;
		});
		elements.push({
			tag: "markdown",
			content: toolSummaryLines.join("\n"),
			text_size: "notation"
		});
	}
	const zhParts = [];
	const enParts = [];
	if (footer?.status) if (isError) {
		zhParts.push("出错");
		enParts.push("Error");
	} else if (isAborted) {
		zhParts.push("已停止");
		enParts.push("Stopped");
	} else {
		zhParts.push("已完成");
		enParts.push("Completed");
	}
	if (footer?.elapsed && elapsedMs != null) {
		const d = formatElapsed(elapsedMs);
		zhParts.push(`耗时 ${d}`);
		enParts.push(`Elapsed ${d}`);
	}
	if (zhParts.length > 0) elements.push(...buildFooter(zhParts.join(" · "), enParts.join(" · "), isError));
	const summaryText = text.replace(/[*_`#>\[\]()~]/g, "").trim();
	return {
		config: {
			wide_screen_mode: true,
			update_multi: true,
			locales: ["zh_cn", "en_us"],
			summary: summaryText ? { content: summaryText.slice(0, 120) } : void 0
		},
		elements
	};
}
function buildConfirmCard(confirmData) {
	const elements = [];
	elements.push({
		tag: "div",
		text: {
			tag: "lark_md",
			content: confirmData.operationDescription
		}
	});
	if (confirmData.preview) {
		elements.push({ tag: "hr" });
		elements.push({
			tag: "div",
			text: {
				tag: "lark_md",
				content: `**Preview:**\n${confirmData.preview}`
			}
		});
	}
	elements.push({ tag: "hr" });
	elements.push({
		tag: "action",
		actions: [
			{
				tag: "button",
				text: {
					tag: "plain_text",
					content: "Confirm"
				},
				type: "primary",
				value: {
					action: "confirm_write",
					operation_id: confirmData.pendingOperationId
				}
			},
			{
				tag: "button",
				text: {
					tag: "plain_text",
					content: "Reject"
				},
				type: "danger",
				value: {
					action: "reject_write",
					operation_id: confirmData.pendingOperationId
				}
			},
			...confirmData.preview ? [] : [{
				tag: "button",
				text: {
					tag: "plain_text",
					content: "Preview"
				},
				type: "default",
				value: {
					action: "preview_write",
					operation_id: confirmData.pendingOperationId
				}
			}]
		]
	});
	return {
		config: {
			wide_screen_mode: true,
			update_multi: true
		},
		header: {
			title: {
				tag: "plain_text",
				content: "🔒 Confirmation Required"
			},
			template: "orange"
		},
		elements
	};
}
/**
* Convert an old-format FeishuCard to CardKit JSON 2.0 format.
* JSON 2.0 uses `body.elements` instead of top-level `elements`.
*/
function toCardKit2(card) {
	const result = {
		schema: "2.0",
		config: card.config,
		body: { elements: card.elements }
	};
	if (card.header) result.header = card.header;
	return result;
}
//#endregion
//#region src/card/image-resolver.ts
const log$12 = larkLogger("card/image-resolver");
/** Matches complete markdown image syntax: `![alt](value)` */
const IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)\)/g;
var ImageResolver = class {
	/** URL → imageKey for successfully uploaded images. */
	resolved = /* @__PURE__ */ new Map();
	/** URL → upload Promise for in-flight uploads (dedup). */
	pending = /* @__PURE__ */ new Map();
	/** URLs that have already failed — skip retries. */
	failed = /* @__PURE__ */ new Set();
	cfg;
	accountId;
	onImageResolved;
	constructor(opts) {
		this.cfg = opts.cfg;
		this.accountId = opts.accountId;
		this.onImageResolved = opts.onImageResolved;
	}
	/**
	* Synchronously resolve image URLs in markdown text.
	*
	* - `img_xxx` references are kept as-is.
	* - URLs with a cached imageKey are replaced inline.
	* - URLs with an in-flight upload are stripped (will appear after re-flush).
	* - New URLs trigger an async upload and are stripped for now.
	*/
	resolveImages(text) {
		if (!text.includes("![")) return text;
		return text.replace(IMAGE_RE, (fullMatch, alt, value) => {
			if (value.startsWith("img_")) return fullMatch;
			if (!value.startsWith("http://") && !value.startsWith("https://")) return "";
			const cached = this.resolved.get(value);
			if (cached) return `![${alt}](${cached})`;
			if (this.failed.has(value)) return "";
			if (this.pending.has(value)) return "";
			this.startUpload(value);
			return "";
		});
	}
	/**
	* Resolve all image URLs in text synchronously: trigger uploads for new
	* URLs, wait for all pending uploads, then return text with image keys.
	*/
	async resolveImagesAwait(text, timeoutMs) {
		this.resolveImages(text);
		if (this.pending.size > 0) {
			log$12.info("resolveImagesAwait: waiting for uploads", {
				count: this.pending.size,
				timeoutMs
			});
			const allUploads = Promise.all(this.pending.values());
			const timeout = new Promise((resolve) => setTimeout(resolve, timeoutMs));
			await Promise.race([allUploads, timeout]);
			if (this.pending.size > 0) log$12.warn("resolveImagesAwait: timed out with pending uploads", { remaining: this.pending.size });
		}
		return this.resolveImages(text);
	}
	startUpload(url) {
		const uploadPromise = this.doUpload(url);
		this.pending.set(url, uploadPromise);
	}
	async doUpload(url) {
		try {
			log$12.info("uploading image", { url });
			const buffer = await fetchRemoteImageBuffer(url);
			const { imageKey } = await uploadImageLark({
				cfg: this.cfg,
				image: buffer,
				imageType: "message",
				accountId: this.accountId
			});
			log$12.info("image uploaded", {
				url,
				imageKey
			});
			this.resolved.set(url, imageKey);
			this.pending.delete(url);
			this.onImageResolved();
			return imageKey;
		} catch (err) {
			log$12.warn("image upload failed", {
				url,
				error: String(err)
			});
			this.pending.delete(url);
			this.failed.add(url);
			return null;
		}
	}
};
//#endregion
//#region src/core/shutdown-hooks.ts
/**
* Process-level graceful shutdown hook registry.
*
* Provides a singleton Map of async cleanup callbacks, drained
* during graceful shutdown by the channel monitor.
*/
const hooks = /* @__PURE__ */ new Map();
/**
* Register a cleanup callback to run during graceful shutdown.
*
* @param key - Unique identifier for this hook (duplicate keys overwrite).
* @param cleanup - Async function to execute on shutdown.
* @returns An unregister function — call it when the resource is
*          released normally (e.g. card streaming completes).
*/
function registerShutdownHook(key, cleanup) {
	hooks.set(key, cleanup);
	return () => {
		hooks.delete(key);
	};
}
/**
* Drain all registered shutdown hooks (best-effort, bounded by deadline).
*
* @param opts - Optional configuration.
* @param opts.deadlineMs - Maximum time to wait for all hooks (default 5000).
* @param opts.log - Logger function for progress/error output.
*/
async function drainShutdownHooks(opts) {
	if (hooks.size === 0) return;
	const log = opts?.log;
	const deadline = opts?.deadlineMs ?? 5e3;
	log?.(`graceful shutdown: draining ${hooks.size} cleanup hook(s)`);
	const entries = Array.from(hooks.entries());
	hooks.clear();
	const promises = entries.map(async ([key, cleanup]) => {
		try {
			await cleanup();
			log?.(`graceful shutdown: hook "${key}" done`);
		} catch (err) {
			log?.(`graceful shutdown: hook "${key}" failed: ${String(err)}`);
		}
	});
	let timer;
	const timeoutPromise = new Promise((resolve) => {
		timer = setTimeout(resolve, deadline);
	});
	await Promise.race([Promise.allSettled(promises).then(() => clearTimeout(timer)), timeoutPromise]);
}
//#endregion
//#region src/card/reply-dispatcher-types.ts
const TERMINAL_PHASES = new Set([
	"completed",
	"aborted",
	"terminated",
	"creation_failed"
]);
const PHASE_TRANSITIONS = {
	idle: new Set([
		"creating",
		"aborted",
		"terminated"
	]),
	creating: new Set([
		"streaming",
		"creation_failed",
		"aborted",
		"terminated"
	]),
	streaming: new Set([
		"completed",
		"aborted",
		"terminated"
	]),
	completed: /* @__PURE__ */ new Set(),
	aborted: /* @__PURE__ */ new Set(),
	terminated: /* @__PURE__ */ new Set(),
	creation_failed: /* @__PURE__ */ new Set()
};
/**
* Throttle intervals for card updates.
*
* - `CARDKIT_MS`: CardKit `cardElement.content()` — designed for streaming,
*   low throttle is fine.
* - `PATCH_MS`: `im.message.patch` — strict rate limits (code 230020).
* - `LONG_GAP_THRESHOLD_MS`: After a long idle gap (tool call / LLM thinking),
*   defer the first flush briefly.
* - `BATCH_AFTER_GAP_MS`: Batching window after a long gap.
*/
const THROTTLE_CONSTANTS = {
	CARDKIT_MS: 100,
	PATCH_MS: 1500,
	LONG_GAP_THRESHOLD_MS: 2e3,
	BATCH_AFTER_GAP_MS: 300
};
//#endregion
//#region src/card/flush-controller.ts
/**
* Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
* SPDX-License-Identifier: MIT
*
* Generic throttled flush controller.
*
* A pure scheduling primitive that manages timer-based throttling,
* mutex-guarded flushing, and reflush-on-conflict. Contains no
* business logic — the actual flush work is provided via a callback.
*/
var FlushController = class {
	flushInProgress = false;
	flushResolvers = [];
	needsReflush = false;
	pendingFlushTimer = null;
	lastUpdateTime = 0;
	isCompleted = false;
	constructor(doFlush) {
		this.doFlush = doFlush;
	}
	/** Mark the controller as completed — no more flushes after current one. */
	complete() {
		this.isCompleted = true;
	}
	/** Cancel any pending deferred flush timer. */
	cancelPendingFlush() {
		if (this.pendingFlushTimer) {
			clearTimeout(this.pendingFlushTimer);
			this.pendingFlushTimer = null;
		}
	}
	/** Wait for any in-progress flush to finish. */
	waitForFlush() {
		if (!this.flushInProgress) return Promise.resolve();
		return new Promise((resolve) => this.flushResolvers.push(resolve));
	}
	/**
	* Execute a flush (mutex-guarded, with reflush on conflict).
	*
	* If a flush is already in progress, marks needsReflush so a
	* follow-up flush fires immediately after the current one completes.
	*/
	async flush() {
		if (!this.cardMessageReady() || this.flushInProgress || this.isCompleted) {
			if (this.flushInProgress && !this.isCompleted) this.needsReflush = true;
			return;
		}
		this.flushInProgress = true;
		this.needsReflush = false;
		this.lastUpdateTime = Date.now();
		try {
			await this.doFlush();
			this.lastUpdateTime = Date.now();
		} finally {
			this.flushInProgress = false;
			const resolvers = this.flushResolvers;
			this.flushResolvers = [];
			for (const resolve of resolvers) resolve();
			if (this.needsReflush && !this.isCompleted && !this.pendingFlushTimer) {
				this.needsReflush = false;
				this.pendingFlushTimer = setTimeout(() => {
					this.pendingFlushTimer = null;
					this.flush();
				}, 0);
			}
		}
	}
	/**
	* Throttled update entry point.
	*
	* @param throttleMs - Minimum interval between flushes (varies by
	*   CardKit vs IM patch mode). Passed in by the caller so this
	*   controller remains business-logic-free.
	*/
	async throttledUpdate(throttleMs) {
		if (!this.cardMessageReady()) return;
		const now = Date.now();
		const elapsed = now - this.lastUpdateTime;
		if (elapsed >= throttleMs) {
			this.cancelPendingFlush();
			if (elapsed > THROTTLE_CONSTANTS.LONG_GAP_THRESHOLD_MS) {
				this.lastUpdateTime = now;
				this.pendingFlushTimer = setTimeout(() => {
					this.pendingFlushTimer = null;
					this.flush();
				}, THROTTLE_CONSTANTS.BATCH_AFTER_GAP_MS);
			} else await this.flush();
		} else if (!this.pendingFlushTimer) {
			const delay = throttleMs - elapsed;
			this.pendingFlushTimer = setTimeout(() => {
				this.pendingFlushTimer = null;
				this.flush();
			}, delay);
		}
	}
	/** Overridable gate: subclasses / consumers can set via setCardMessageReady. */
	_cardMessageReady = false;
	cardMessageReady() {
		return this._cardMessageReady;
	}
	setCardMessageReady(ready) {
		this._cardMessageReady = ready;
		if (ready) this.lastUpdateTime = Date.now();
	}
};
//#endregion
//#region src/card/unavailable-guard.ts
/**
* Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
* SPDX-License-Identifier: MIT
*
* Guard against operating on unavailable (deleted/recalled) messages.
*
* Encapsulates the terminateDueToUnavailable / shouldSkipForUnavailable
* logic previously scattered as closures in reply-dispatcher.ts.
*/
const log$11 = larkLogger("card/unavailable-guard");
var UnavailableGuard = class {
	terminated = false;
	replyToMessageId;
	getCardMessageId;
	onTerminate;
	constructor(params) {
		this.replyToMessageId = params.replyToMessageId;
		this.getCardMessageId = params.getCardMessageId;
		this.onTerminate = params.onTerminate;
	}
	get isTerminated() {
		return this.terminated;
	}
	/**
	* Check whether the reply pipeline should skip further operations.
	* Returns true if the message is already known to be unavailable.
	*/
	shouldSkip(source) {
		if (this.terminated) return true;
		if (!this.replyToMessageId) return false;
		if (!isMessageUnavailable(this.replyToMessageId)) return false;
		return this.terminate(source);
	}
	/**
	* Attempt to terminate the reply pipeline due to an unavailable message.
	*
	* @param source - Descriptive label for the caller (for logging).
	* @param err    - Optional error that triggered the check.
	* @returns true if the pipeline was (or already had been) terminated.
	*/
	terminate(source, err) {
		if (this.terminated) return true;
		const fromError = isMessageUnavailableError(err) ? err : void 0;
		const cardMessageId = this.getCardMessageId();
		const state = getMessageUnavailableState(this.replyToMessageId) ?? getMessageUnavailableState(cardMessageId ?? void 0);
		let apiCode = fromError?.apiCode ?? state?.apiCode;
		if (!apiCode && err) {
			const detectedCode = extractLarkApiCode(err);
			if (isTerminalMessageApiCode(detectedCode)) {
				const fallbackMessageId = this.replyToMessageId ?? cardMessageId ?? void 0;
				if (fallbackMessageId) markMessageUnavailable({
					messageId: fallbackMessageId,
					apiCode: detectedCode,
					operation: source
				});
				apiCode = detectedCode;
			}
		}
		if (!apiCode) return false;
		this.terminated = true;
		this.onTerminate();
		const affectedMessageId = fromError?.messageId ?? this.replyToMessageId ?? cardMessageId ?? "unknown";
		log$11.warn("reply pipeline terminated by unavailable message", {
			source,
			apiCode,
			messageId: affectedMessageId
		});
		return true;
	}
};
//#endregion
//#region src/card/streaming-card-controller.ts
/**
* Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
* SPDX-License-Identifier: MIT
*
* Streaming card controller for the Lark/Feishu channel plugin.
*
* Manages the full lifecycle of a streaming CardKit card:
* idle → creating → streaming → completed / aborted / terminated.
*
* Delegates throttling to FlushController and message-unavailable
* detection to UnavailableGuard.
*/
const log$10 = larkLogger("card/streaming");
const STREAMING_THINKING_CARD = {
	schema: "2.0",
	config: {
		streaming_mode: true,
		locales: ["zh_cn", "en_us"],
		summary: {
			content: "Thinking...",
			i18n_content: {
				zh_cn: "思考中...",
				en_us: "Thinking..."
			}
		}
	},
	body: { elements: [{
		tag: "markdown",
		content: "",
		text_align: "left",
		text_size: "normal_v2",
		margin: "0px 0px 0px 0px",
		element_id: STREAMING_ELEMENT_ID
	}, {
		tag: "markdown",
		content: " ",
		icon: {
			tag: "custom_icon",
			img_key: "img_v3_02vb_496bec09-4b43-4773-ad6b-0cdd103cd2bg",
			size: "16px 16px"
		},
		element_id: "loading_icon"
	}] }
};
var StreamingCardController = class {
	phase = "idle";
	cardKit = {
		cardKitCardId: null,
		originalCardKitCardId: null,
		cardKitSequence: 0,
		cardMessageId: null
	};
	text = {
		accumulatedText: "",
		completedText: "",
		streamingPrefix: "",
		lastPartialText: ""
	};
	reasoning = {
		accumulatedReasoningText: "",
		reasoningStartTime: null,
		reasoningElapsedMs: 0,
		isReasoningPhase: false
	};
	flush;
	guard;
	imageResolver;
	createEpoch = 0;
	_terminalReason = null;
	dispatchFullyComplete = false;
	cardCreationPromise = null;
	disposeShutdownHook = null;
	dispatchStartTime = Date.now();
	deps;
	elapsed() {
		return Date.now() - this.dispatchStartTime;
	}
	constructor(deps) {
		this.deps = deps;
		this.guard = new UnavailableGuard({
			replyToMessageId: deps.replyToMessageId,
			getCardMessageId: () => this.cardKit.cardMessageId,
			onTerminate: () => {
				this.transition("terminated", "UnavailableGuard", "unavailable");
			}
		});
		this.flush = new FlushController(() => this.performFlush());
		this.imageResolver = new ImageResolver({
			cfg: deps.cfg,
			accountId: deps.accountId,
			onImageResolved: () => {
				if (!this.isTerminalPhase && this.cardKit.cardMessageId) this.throttledCardUpdate();
			}
		});
	}
	get cardMessageId() {
		return this.cardKit.cardMessageId;
	}
	get isTerminalPhase() {
		return TERMINAL_PHASES.has(this.phase);
	}
	/**
	* Whether the card has been explicitly aborted (via abortCard()).
	*
	* Distinct from isTerminalPhase — creation_failed is NOT an abort;
	* it should allow fallthrough to static delivery in the factory.
	*/
	get isAborted() {
		return this.phase === "aborted";
	}
	/** Whether the reply pipeline was terminated due to an unavailable message. */
	get isTerminated() {
		return this.guard.isTerminated;
	}
	/** Check if the pipeline should skip further operations for this source. */
	shouldSkipForUnavailable(source) {
		return this.guard.shouldSkip(source);
	}
	/** Attempt to terminate the pipeline due to an unavailable message error. */
	terminateIfUnavailable(source, err) {
		return this.guard.terminate(source, err);
	}
	/** Why the controller entered a terminal phase, or null if still active. */
	get terminalReason() {
		return this._terminalReason;
	}
	/** @internal — exposed for test assertions only. */
	get currentPhase() {
		return this.phase;
	}
	/**
	* Unified callback guard — returns true if the pipeline is active
	* and the callback should proceed.
	*
	* Combines three checks:
	* 1. guard.isTerminated — message recalled/deleted
	* 2. guard.shouldSkip(source) — eagerly detect unavailable messages
	* 3. isTerminalPhase — completed/aborted/terminated/creation_failed
	*/
	shouldProceed(source) {
		if (this.guard.isTerminated || this.guard.shouldSkip(source)) return false;
		return !this.isTerminalPhase;
	}
	isStaleCreate(epoch) {
		return epoch !== this.createEpoch;
	}
	transition(to, source, reason) {
		const from = this.phase;
		if (from === to) return false;
		if (!PHASE_TRANSITIONS[from].has(to)) {
			log$10.warn("phase transition rejected", {
				from,
				to,
				source
			});
			return false;
		}
		this.phase = to;
		log$10.info("phase transition", {
			from,
			to,
			source,
			reason
		});
		if (TERMINAL_PHASES.has(to)) {
			this._terminalReason = reason ?? null;
			this.onEnterTerminalPhase();
		}
		return true;
	}
	onEnterTerminalPhase() {
		this.createEpoch += 1;
		this.flush.cancelPendingFlush();
		this.flush.complete();
		this.disposeShutdownHook?.();
		this.disposeShutdownHook = null;
	}
	/**
	* Handle a deliver() call in streaming card mode.
	*
	* Accumulates text from the SDK's deliver callbacks to build the
	* authoritative "completedText" for the final card.
	*/
	async onDeliver(payload) {
		if (!this.shouldProceed("onDeliver")) return;
		const text = payload.text ?? "";
		if (!text.trim()) return;
		await this.ensureCardCreated();
		if (!this.shouldProceed("onDeliver.postCreate")) return;
		if (!this.cardKit.cardMessageId) return;
		const split = splitReasoningText(text);
		if (split.reasoningText && !split.answerText) {
			this.reasoning.reasoningElapsedMs = this.reasoning.reasoningStartTime ? Date.now() - this.reasoning.reasoningStartTime : 0;
			this.reasoning.accumulatedReasoningText = split.reasoningText;
			this.reasoning.isReasoningPhase = true;
			await this.throttledCardUpdate();
			return;
		}
		this.reasoning.isReasoningPhase = false;
		if (split.reasoningText) this.reasoning.accumulatedReasoningText = split.reasoningText;
		const answerText = split.answerText ?? text;
		this.text.completedText += (this.text.completedText ? "\n\n" : "") + answerText;
		if (!this.text.lastPartialText && !this.text.streamingPrefix) {
			this.text.accumulatedText += (this.text.accumulatedText ? "\n\n" : "") + answerText;
			this.text.streamingPrefix = this.text.accumulatedText;
			await this.throttledCardUpdate();
		}
	}
	async onReasoningStream(payload) {
		if (!this.shouldProceed("onReasoningStream")) return;
		await this.ensureCardCreated();
		if (!this.shouldProceed("onReasoningStream.postCreate")) return;
		if (!this.cardKit.cardMessageId) return;
		const rawText = payload.text ?? "";
		if (!rawText) return;
		if (!this.reasoning.reasoningStartTime) this.reasoning.reasoningStartTime = Date.now();
		this.reasoning.isReasoningPhase = true;
		const split = splitReasoningText(rawText);
		this.reasoning.accumulatedReasoningText = split.reasoningText ?? rawText;
		await this.throttledCardUpdate();
	}
	async onPartialReply(payload) {
		if (!this.shouldProceed("onPartialReply")) return;
		const text = stripReasoningTags(payload.text ?? "");
		log$10.debug("onPartialReply", { len: text.length });
		if (!text) return;
		if (!this.reasoning.reasoningStartTime) this.reasoning.reasoningStartTime = Date.now();
		if (this.reasoning.isReasoningPhase) {
			this.reasoning.isReasoningPhase = false;
			this.reasoning.reasoningElapsedMs = this.reasoning.reasoningStartTime ? Date.now() - this.reasoning.reasoningStartTime : 0;
		}
		if (this.text.lastPartialText && text.length < this.text.lastPartialText.length) this.text.streamingPrefix += (this.text.streamingPrefix ? "\n\n" : "") + this.text.lastPartialText;
		this.text.lastPartialText = text;
		this.text.accumulatedText = this.text.streamingPrefix ? this.text.streamingPrefix + "\n\n" + text : text;
		if (!this.text.streamingPrefix && SILENT_REPLY_TOKEN.startsWith(this.text.accumulatedText.trim())) {
			log$10.debug("onPartialReply: buffering NO_REPLY prefix");
			return;
		}
		await this.ensureCardCreated();
		if (!this.shouldProceed("onPartialReply.postCreate")) return;
		if (!this.cardKit.cardMessageId) return;
		await this.throttledCardUpdate();
	}
	async onError(err, info) {
		if (this.guard.terminate("onError", err)) return;
		log$10.error(`${info.kind} reply failed`, { error: String(err) });
		this.finalizeCard("onError", "error");
		await this.flush.waitForFlush();
		if (this.cardCreationPromise) await this.cardCreationPromise;
		const errorEffectiveCardId = this.cardKit.cardKitCardId ?? this.cardKit.originalCardKitCardId;
		if (this.cardKit.cardMessageId) try {
			const rawErrorText = this.text.accumulatedText ? `${this.text.accumulatedText}\n\n---\n**Error**: An error occurred while generating the response.` : "**Error**: An error occurred while generating the response.";
			const errorCard = buildCardContent("complete", {
				text: this.imageResolver.resolveImages(rawErrorText),
				reasoningText: this.reasoning.accumulatedReasoningText || void 0,
				reasoningElapsedMs: this.reasoning.reasoningElapsedMs || void 0,
				elapsedMs: this.elapsed(),
				isError: true,
				footer: this.deps.resolvedFooter
			});
			if (errorEffectiveCardId) await this.closeStreamingAndUpdate(errorEffectiveCardId, errorCard, "onError");
			else await updateCardFeishu({
				cfg: this.deps.cfg,
				messageId: this.cardKit.cardMessageId,
				card: errorCard,
				accountId: this.deps.accountId
			});
		} catch {}
	}
	async onIdle() {
		if (this.guard.isTerminated || this.guard.shouldSkip("onIdle")) return;
		if (!this.dispatchFullyComplete) return;
		if (this.isTerminalPhase) return;
		this.finalizeCard("onIdle", "normal");
		await this.flush.waitForFlush();
		if (this.cardCreationPromise) {
			await this.cardCreationPromise;
			await new Promise((resolve) => setTimeout(resolve, 0));
			await this.flush.waitForFlush();
		}
		const idleEffectiveCardId = this.cardKit.cardKitCardId ?? this.cardKit.originalCardKitCardId;
		if (this.cardKit.cardMessageId) try {
			if (idleEffectiveCardId) {
				const seqBeforeClose = this.cardKit.cardKitSequence;
				this.cardKit.cardKitSequence += 1;
				log$10.info("onIdle: closing streaming mode", {
					seqBefore: seqBeforeClose,
					seqAfter: this.cardKit.cardKitSequence
				});
				await setCardStreamingMode({
					cfg: this.deps.cfg,
					cardId: idleEffectiveCardId,
					streamingMode: false,
					sequence: this.cardKit.cardKitSequence,
					accountId: this.deps.accountId
				});
			}
			const isNoReplyLeak = !this.text.completedText && SILENT_REPLY_TOKEN.startsWith(this.text.accumulatedText.trim());
			const displayText = this.text.completedText || (isNoReplyLeak ? "" : this.text.accumulatedText) || "Done.";
			if (!this.text.completedText && !this.text.accumulatedText) log$10.warn("reply completed without visible text, using empty-reply fallback");
			const completeCard = buildCardContent("complete", {
				text: await this.imageResolver.resolveImagesAwait(displayText, 15e3),
				reasoningText: this.reasoning.accumulatedReasoningText || void 0,
				reasoningElapsedMs: this.reasoning.reasoningElapsedMs || void 0,
				elapsedMs: this.elapsed(),
				footer: this.deps.resolvedFooter
			});
			if (idleEffectiveCardId) {
				const seqBeforeUpdate = this.cardKit.cardKitSequence;
				this.cardKit.cardKitSequence += 1;
				log$10.info("onIdle: updating final card", {
					seqBefore: seqBeforeUpdate,
					seqAfter: this.cardKit.cardKitSequence
				});
				await updateCardKitCard({
					cfg: this.deps.cfg,
					cardId: idleEffectiveCardId,
					card: toCardKit2(completeCard),
					sequence: this.cardKit.cardKitSequence,
					accountId: this.deps.accountId
				});
			} else await updateCardFeishu({
				cfg: this.deps.cfg,
				messageId: this.cardKit.cardMessageId,
				card: completeCard,
				accountId: this.deps.accountId
			});
			log$10.info("reply completed, card finalized", {
				elapsedMs: this.elapsed(),
				isCardKit: !!idleEffectiveCardId
			});
		} catch (err) {
			log$10.warn("final card update failed", { error: String(err) });
		}
	}
	markFullyComplete() {
		log$10.debug("markFullyComplete", {
			completedTextLen: this.text.completedText.length,
			accumulatedTextLen: this.text.accumulatedText.length
		});
		this.dispatchFullyComplete = true;
	}
	async abortCard() {
		try {
			if (!this.transition("aborted", "abortCard", "abort")) return;
			await this.flush.waitForFlush();
			if (this.cardCreationPromise) await this.cardCreationPromise;
			const effectiveCardId = this.cardKit.cardKitCardId ?? this.cardKit.originalCardKitCardId;
			if (effectiveCardId) {
				const elapsedMs = Date.now() - this.dispatchStartTime;
				const abortCardContent = buildCardContent("complete", {
					text: this.imageResolver.resolveImages(this.text.accumulatedText || "Aborted."),
					reasoningText: this.reasoning.accumulatedReasoningText || void 0,
					reasoningElapsedMs: this.reasoning.reasoningElapsedMs || void 0,
					elapsedMs,
					isAborted: true,
					footer: this.deps.resolvedFooter
				});
				await this.closeStreamingAndUpdate(effectiveCardId, abortCardContent, "abortCard");
				log$10.info("abortCard completed", { effectiveCardId });
			} else if (this.cardKit.cardMessageId) {
				const elapsedMs = Date.now() - this.dispatchStartTime;
				const abortCard = buildCardContent("complete", {
					text: this.imageResolver.resolveImages(this.text.accumulatedText || "Aborted."),
					reasoningText: this.reasoning.accumulatedReasoningText || void 0,
					reasoningElapsedMs: this.reasoning.reasoningElapsedMs || void 0,
					elapsedMs,
					isAborted: true,
					footer: this.deps.resolvedFooter
				});
				await updateCardFeishu({
					cfg: this.deps.cfg,
					messageId: this.cardKit.cardMessageId,
					card: abortCard,
					accountId: this.deps.accountId
				});
				log$10.info("abortCard completed (IM fallback)", { messageId: this.cardKit.cardMessageId });
			}
		} catch (err) {
			log$10.warn("abortCard failed", { error: String(err) });
		}
	}
	async ensureCardCreated() {
		if (this.guard.shouldSkip("ensureCardCreated.precheck")) return;
		if (this.cardKit.cardMessageId || this.phase === "creation_failed" || this.isTerminalPhase) return;
		if (this.cardCreationPromise) {
			await this.cardCreationPromise;
			return;
		}
		if (!this.transition("creating", "ensureCardCreated")) return;
		this.createEpoch += 1;
		const epoch = this.createEpoch;
		this.cardCreationPromise = (async () => {
			try {
				try {
					const cId = await createCardEntity({
						cfg: this.deps.cfg,
						card: STREAMING_THINKING_CARD,
						accountId: this.deps.accountId
					});
					if (this.isStaleCreate(epoch)) {
						log$10.info("ensureCardCreated: stale epoch after createCardEntity, bailing out", {
							epoch,
							phase: this.phase
						});
						return;
					}
					if (cId) {
						this.cardKit.cardKitCardId = cId;
						this.cardKit.originalCardKitCardId = cId;
						this.cardKit.cardKitSequence = 1;
						this.disposeShutdownHook = registerShutdownHook(`streaming-card:${cId}`, () => this.abortCard());
						log$10.info("created CardKit entity", {
							cardId: cId,
							initialSequence: this.cardKit.cardKitSequence
						});
						const result = await sendCardByCardId({
							cfg: this.deps.cfg,
							to: this.deps.chatId,
							cardId: cId,
							replyToMessageId: this.deps.replyToMessageId,
							replyInThread: this.deps.replyInThread,
							accountId: this.deps.accountId
						});
						if (this.isStaleCreate(epoch)) {
							log$10.info("ensureCardCreated: stale epoch after sendCardByCardId, bailing out", {
								epoch,
								phase: this.phase
							});
							this.disposeShutdownHook?.();
							this.disposeShutdownHook = null;
							return;
						}
						this.cardKit.cardMessageId = result.messageId;
						this.flush.setCardMessageReady(true);
						if (!this.transition("streaming", "ensureCardCreated.cardkit")) {
							this.disposeShutdownHook?.();
							this.disposeShutdownHook = null;
							return;
						}
						log$10.info("sent CardKit card", { messageId: result.messageId });
					} else throw new Error("card.create returned empty card_id");
				} catch (cardKitErr) {
					if (this.isStaleCreate(epoch)) return;
					if (this.guard.terminate("ensureCardCreated.cardkitFlow", cardKitErr)) return;
					const apiDetail = extractApiDetail(cardKitErr);
					log$10.warn("CardKit flow failed, falling back to IM", { apiDetail });
					this.cardKit.cardKitCardId = null;
					this.cardKit.originalCardKitCardId = null;
					const fallbackCard = buildCardContent("thinking");
					const result = await sendCardFeishu({
						cfg: this.deps.cfg,
						to: this.deps.chatId,
						card: fallbackCard,
						replyToMessageId: this.deps.replyToMessageId,
						replyInThread: this.deps.replyInThread,
						accountId: this.deps.accountId
					});
					if (this.isStaleCreate(epoch)) {
						log$10.info("ensureCardCreated: stale epoch after IM fallback send, bailing out", {
							epoch,
							phase: this.phase
						});
						return;
					}
					this.cardKit.cardMessageId = result.messageId;
					this.flush.setCardMessageReady(true);
					if (!this.transition("streaming", "ensureCardCreated.imFallback")) return;
					log$10.info("sent fallback IM card", { messageId: result.messageId });
				}
			} catch (err) {
				if (this.isStaleCreate(epoch)) return;
				if (this.guard.terminate("ensureCardCreated.outer", err)) return;
				log$10.warn("thinking card failed, falling back to static", { error: String(err) });
				this.transition("creation_failed", "ensureCardCreated.outer", "creation_failed");
			}
		})();
		await this.cardCreationPromise;
	}
	async performFlush() {
		if (!this.cardKit.cardMessageId || this.isTerminalPhase) return;
		if (!this.cardKit.cardKitCardId && this.cardKit.originalCardKitCardId) {
			log$10.debug("performFlush: skipping (CardKit streaming disabled, awaiting final update)");
			return;
		}
		log$10.debug("flushCardUpdate: enter", {
			seq: this.cardKit.cardKitSequence,
			isCardKit: !!this.cardKit.cardKitCardId
		});
		try {
			const displayText = this.buildDisplayText();
			const resolvedText = this.imageResolver.resolveImages(displayText);
			if (this.cardKit.cardKitCardId) {
				const prevSeq = this.cardKit.cardKitSequence;
				this.cardKit.cardKitSequence += 1;
				log$10.debug("flushCardUpdate: seq bump", {
					seqBefore: prevSeq,
					seqAfter: this.cardKit.cardKitSequence
				});
				await streamCardContent({
					cfg: this.deps.cfg,
					cardId: this.cardKit.cardKitCardId,
					elementId: STREAMING_ELEMENT_ID,
					content: optimizeMarkdownStyle(resolvedText),
					sequence: this.cardKit.cardKitSequence,
					accountId: this.deps.accountId
				});
			} else {
				log$10.debug("flushCardUpdate: IM patch fallback");
				const card = buildCardContent("streaming", {
					text: this.reasoning.isReasoningPhase ? "" : resolvedText,
					reasoningText: this.reasoning.isReasoningPhase ? this.reasoning.accumulatedReasoningText : void 0
				});
				await updateCardFeishu({
					cfg: this.deps.cfg,
					messageId: this.cardKit.cardMessageId,
					card,
					accountId: this.deps.accountId
				});
			}
		} catch (err) {
			if (this.guard.terminate("flushCardUpdate", err)) return;
			const apiCode = extractLarkApiCode(err);
			if (apiCode === 230020) {
				log$10.info("flushCardUpdate: rate limited (230020), skipping", { seq: this.cardKit.cardKitSequence });
				return;
			}
			const apiDetail = extractApiDetail(err);
			log$10.error("card stream update failed", {
				apiCode,
				seq: this.cardKit.cardKitSequence,
				apiDetail
			});
			if (this.cardKit.cardKitCardId) {
				log$10.warn("disabling CardKit streaming, falling back to im.message.patch");
				this.cardKit.cardKitCardId = null;
			}
		}
	}
	buildDisplayText() {
		if (this.reasoning.isReasoningPhase && this.reasoning.accumulatedReasoningText) {
			const reasoningDisplay = `💭 **Thinking...**\n\n${this.reasoning.accumulatedReasoningText}`;
			return this.text.accumulatedText ? this.text.accumulatedText + "\n\n" + reasoningDisplay : reasoningDisplay;
		}
		return this.text.accumulatedText;
	}
	async throttledCardUpdate() {
		if (this.guard.shouldSkip("throttledCardUpdate")) return;
		const throttleMs = this.cardKit.cardKitCardId ? THROTTLE_CONSTANTS.CARDKIT_MS : THROTTLE_CONSTANTS.PATCH_MS;
		await this.flush.throttledUpdate(throttleMs);
	}
	finalizeCard(source, reason) {
		this.transition("completed", source, reason);
	}
	/**
	* Close streaming mode then update card content (shared by onError and abortCard).
	*/
	async closeStreamingAndUpdate(cardId, card, label) {
		const seqBeforeClose = this.cardKit.cardKitSequence;
		this.cardKit.cardKitSequence += 1;
		log$10.info(`${label}: closing streaming mode`, {
			seqBefore: seqBeforeClose,
			seqAfter: this.cardKit.cardKitSequence
		});
		await setCardStreamingMode({
			cfg: this.deps.cfg,
			cardId,
			streamingMode: false,
			sequence: this.cardKit.cardKitSequence,
			accountId: this.deps.accountId
		});
		const seqBeforeUpdate = this.cardKit.cardKitSequence;
		this.cardKit.cardKitSequence += 1;
		log$10.info(`${label}: updating card`, {
			seqBefore: seqBeforeUpdate,
			seqAfter: this.cardKit.cardKitSequence
		});
		await updateCardKitCard({
			cfg: this.deps.cfg,
			cardId,
			card: toCardKit2(card),
			sequence: this.cardKit.cardKitSequence,
			accountId: this.deps.accountId
		});
	}
};
function extractApiDetail(err) {
	if (!err || typeof err !== "object") return String(err);
	const e = err;
	return e.response?.data ? JSON.stringify(e.response.data) : String(err);
}
//#endregion
//#region src/card/reply-dispatcher.ts
/**
* Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
* SPDX-License-Identifier: MIT
*
* Reply dispatcher factory for the Lark/Feishu channel plugin.
*
* Thin factory function that:
* 1. Resolves account, reply mode, and typing indicator config
* 2. In streaming mode, delegates to StreamingCardController
* 3. In static mode, delivers via sendMessageFeishu / sendMarkdownCardFeishu
* 4. Assembles and returns FeishuReplyDispatcherResult
*/
const log$9 = larkLogger("card/reply-dispatcher");
function createFeishuReplyDispatcher(params) {
	const core = LarkClient.runtime;
	const { cfg, agentId, chatId, replyToMessageId, accountId, replyInThread } = params;
	const account = getLarkAccount(cfg, accountId);
	const feishuCfg = account.config;
	const accountScopedCfg = createAccountScopedConfig(cfg, account.accountId);
	const prefixContext = createReplyPrefixContext({
		cfg,
		agentId
	});
	const chatType = params.chatType;
	const effectiveReplyMode = resolveReplyMode({
		feishuCfg,
		chatType
	});
	const replyMode = expandAutoMode({
		mode: effectiveReplyMode,
		streaming: feishuCfg?.streaming,
		chatType
	});
	const useStreamingCards = replyMode === "streaming";
	const enableBlockStreaming = feishuCfg?.blockStreaming === true && !useStreamingCards;
	const resolvedFooter = resolveFooterConfig(feishuCfg?.footer);
	log$9.info("reply mode resolved", {
		effectiveReplyMode,
		replyMode,
		chatType
	});
	const textChunkLimit = core.channel.text.resolveTextChunkLimit(cfg, "feishu", accountId, { fallbackLimit: 4e3 });
	const chunkMode = core.channel.text.resolveChunkMode(cfg, "feishu");
	const tableMode = core.channel.text.resolveMarkdownTableMode({
		cfg: accountScopedCfg,
		channel: "feishu"
	});
	const controller = useStreamingCards ? new StreamingCardController({
		cfg,
		accountId,
		chatId,
		replyToMessageId,
		replyInThread,
		resolvedFooter
	}) : null;
	let staticAborted = false;
	const staticGuard = controller ? null : new UnavailableGuard({
		replyToMessageId,
		getCardMessageId: () => null,
		onTerminate: () => {
			staticAborted = true;
		}
	});
	const shouldSkip = (source) => {
		if (controller) return controller.shouldSkipForUnavailable(source);
		return staticGuard?.shouldSkip(source) ?? false;
	};
	const isTerminated = () => {
		if (controller) return controller.isTerminated;
		return staticGuard?.isTerminated ?? false;
	};
	let typingState = null;
	let typingStopped = false;
	const typingCallbacks = createTypingCallbacks({
		keepaliveIntervalMs: 0,
		start: async () => {
			if (shouldSkip("typing.start.precheck")) return;
			if (!replyToMessageId || typingStopped || params.skipTyping) return;
			if (typingState?.reactionId) return;
			typingState = await addTypingIndicator({
				cfg,
				messageId: replyToMessageId,
				accountId
			});
			if (shouldSkip("typing.start.postcheck")) return;
			if (typingStopped && typingState) {
				await removeTypingIndicator({
					cfg,
					state: typingState,
					accountId
				});
				typingState = null;
				log$9.info("removed typing indicator (raced with stop)");
				return;
			}
			log$9.info("added typing indicator reaction");
		},
		stop: async () => {
			typingStopped = true;
			if (!typingState) return;
			await removeTypingIndicator({
				cfg,
				state: typingState,
				accountId
			});
			typingState = null;
			log$9.info("removed typing indicator reaction");
		},
		onStartError: (err) => {
			logTypingFailure({
				log: (message) => log$9.warn(message),
				channel: "feishu",
				action: "start",
				error: err
			});
		},
		onStopError: (err) => {
			logTypingFailure({
				log: (message) => log$9.warn(message),
				channel: "feishu",
				action: "stop",
				error: err
			});
		}
	});
	let dispatchFullyComplete = false;
	const { dispatcher, replyOptions, markDispatchIdle } = core.channel.reply.createReplyDispatcherWithTyping({
		responsePrefix: prefixContext.responsePrefix,
		responsePrefixContextProvider: prefixContext.responsePrefixContextProvider,
		humanDelay: core.channel.reply.resolveHumanDelayConfig(cfg, agentId),
		onReplyStart: async () => {
			if (shouldSkip("onReplyStart")) return;
			await typingCallbacks.onReplyStart?.();
		},
		deliver: async (payload) => {
			log$9.debug("deliver called", { textPreview: payload.text?.slice(0, 100) });
			if (shouldSkip("deliver.entry")) return;
			if (staticAborted || controller?.isTerminated || controller?.isAborted) {
				log$9.debug("deliver: skipped (aborted)");
				return;
			}
			if (dispatchFullyComplete) {
				log$9.debug("deliver: skipped (dispatch already complete)");
				return;
			}
			const text = payload.text ?? "";
			const payloadMediaUrls = payload.mediaUrls?.length ? payload.mediaUrls : payload.mediaUrl ? [payload.mediaUrl] : [];
			if (!text.trim() && payloadMediaUrls.length === 0) {
				log$9.debug("deliver: empty text and no media, skipping");
				return;
			}
			if (controller) {
				await controller.ensureCardCreated();
				if (controller.isTerminated) return;
				if (controller.cardMessageId) {
					await controller.onDeliver(payload);
					return;
				}
				log$9.warn("deliver: card creation failed, falling back to static delivery");
			}
			if (text.trim()) if (shouldUseCard(text)) {
				const chunks = core.channel.text.chunkTextWithMode(text, textChunkLimit, chunkMode);
				log$9.info("deliver: sending card chunks", {
					count: chunks.length,
					chatId
				});
				for (const chunk of chunks) try {
					await sendMarkdownCardFeishu({
						cfg,
						to: chatId,
						text: chunk,
						replyToMessageId,
						replyInThread,
						accountId
					});
				} catch (err) {
					if (staticGuard?.terminate("deliver.cardChunk", err)) return;
					throw err;
				}
			} else {
				const converted = core.channel.text.convertMarkdownTables(text, tableMode);
				const chunks = core.channel.text.chunkTextWithMode(converted, textChunkLimit, chunkMode);
				log$9.info("deliver: sending text chunks", {
					count: chunks.length,
					chatId
				});
				for (const chunk of chunks) try {
					await sendMessageFeishu({
						cfg,
						to: chatId,
						text: chunk,
						replyToMessageId,
						replyInThread,
						accountId
					});
				} catch (err) {
					if (staticGuard?.terminate("deliver.textChunk", err)) return;
					throw err;
				}
			}
			for (const mediaUrl of payloadMediaUrls) {
				if (!mediaUrl?.trim()) continue;
				try {
					log$9.info("deliver: sending media via static path", { mediaUrl: mediaUrl.slice(0, 80) });
					await sendMediaLark({
						cfg,
						to: chatId,
						mediaUrl,
						accountId,
						replyToMessageId,
						replyInThread
					});
				} catch (mediaErr) {
					if (staticGuard?.terminate("deliver.media", mediaErr)) return;
					log$9.error("deliver: static media send failed", { error: String(mediaErr) });
				}
			}
		},
		onError: async (err, info) => {
			if (controller) {
				if (controller.terminateIfUnavailable("onError", err)) {
					typingCallbacks.onIdle?.();
					return;
				}
				await controller.onError(err, info);
				typingCallbacks.onIdle?.();
				return;
			}
			if (staticGuard?.terminate("onError", err)) {
				typingCallbacks.onIdle?.();
				return;
			}
			log$9.error(`${info.kind} reply failed`, { error: String(err) });
			typingCallbacks.onIdle?.();
		},
		onIdle: async () => {
			if (isTerminated() || shouldSkip("onIdle")) {
				typingCallbacks.onIdle?.();
				return;
			}
			if (!dispatchFullyComplete) {
				typingCallbacks.onIdle?.();
				return;
			}
			if (controller) await controller.onIdle();
			typingCallbacks.onIdle?.();
		},
		onCleanup: async () => {
			typingCallbacks.onCleanup?.();
		}
	});
	const abortCard = controller ? () => controller.abortCard() : async () => {};
	return {
		dispatcher,
		replyOptions: {
			...replyOptions,
			onModelSelected: prefixContext.onModelSelected,
			disableBlockStreaming: !enableBlockStreaming,
			...controller ? {
				onReasoningStream: (payload) => controller.onReasoningStream(payload),
				onPartialReply: (payload) => controller.onPartialReply(payload)
			} : {}
		},
		markDispatchIdle,
		markFullyComplete: () => {
			dispatchFullyComplete = true;
			controller?.markFullyComplete();
		},
		abortCard
	};
}
//#endregion
//#region src/channel/chat-queue.ts
const chatQueues = /* @__PURE__ */ new Map();
const activeDispatchers = /* @__PURE__ */ new Map();
/**
* Append `:thread:{threadId}` suffix when threadId is present.
* Consistent with the SDK's `:thread:` separator convention.
*/
function threadScopedKey(base, threadId) {
	return threadId ? `${base}:thread:${threadId}` : base;
}
function buildQueueKey(accountId, chatId, threadId) {
	return threadScopedKey(`${accountId}:${chatId}`, threadId);
}
function registerActiveDispatcher(key, entry) {
	activeDispatchers.set(key, entry);
}
function unregisterActiveDispatcher(key) {
	activeDispatchers.delete(key);
}
function getActiveDispatcher(key) {
	return activeDispatchers.get(key);
}
/** Check whether the queue has an active task for the given key. */
function hasActiveTask(key) {
	return chatQueues.has(key);
}
function enqueueFeishuChatTask(params) {
	const { accountId, chatId, threadId, task } = params;
	const key = buildQueueKey(accountId, chatId, threadId);
	const prev = chatQueues.get(key) ?? Promise.resolve();
	const status = chatQueues.has(key) ? "queued" : "immediate";
	const next = prev.then(task, task);
	chatQueues.set(key, next);
	const cleanup = () => {
		if (chatQueues.get(key) === next) chatQueues.delete(key);
	};
	next.then(cleanup, cleanup);
	return {
		status,
		promise: next
	};
}
//#endregion
//#region src/channel/abort-detect.ts
const ABORT_TRIGGERS = new Set([
	"stop",
	"esc",
	"abort",
	"wait",
	"exit",
	"interrupt",
	"detente",
	"deten",
	"detén",
	"arrete",
	"arrête",
	"停止",
	"やめて",
	"止めて",
	"रुको",
	"توقف",
	"стоп",
	"остановись",
	"останови",
	"остановить",
	"прекрати",
	"halt",
	"anhalten",
	"aufhören",
	"hoer auf",
	"stopp",
	"pare",
	"stop openclaw",
	"openclaw stop",
	"stop action",
	"stop current action",
	"stop run",
	"stop current run",
	"stop agent",
	"stop the agent",
	"stop don't do anything",
	"stop dont do anything",
	"stop do not do anything",
	"stop doing anything",
	"do not do that",
	"please stop",
	"stop please"
]);
const TRAILING_ABORT_PUNCTUATION_RE = /[.!?…,，。;；:：'"'")\]}]+$/u;
function normalizeAbortTriggerText(text) {
	return text.trim().toLowerCase().replace(/['`]/g, "'").replace(/\s+/g, " ").replace(TRAILING_ABORT_PUNCTUATION_RE, "").trim();
}
/** Exact trigger-word match (same logic as OpenClaw core `isAbortTrigger`). */
function isAbortTrigger(text) {
	if (!text) return false;
	const normalized = normalizeAbortTriggerText(text);
	return ABORT_TRIGGERS.has(normalized);
}
/**
* Extended abort detection: matches both bare trigger words and the
* `/stop` command form.  Used by the monitor fast-path.
*/
function isLikelyAbortText(text) {
	if (!text) return false;
	const trimmed = text.trim().toLowerCase();
	if (trimmed === "/stop") return true;
	return isAbortTrigger(trimmed);
}
/**
* Extract the raw text payload from a Feishu message event.
*
* Only handles `text` type messages.  The `message.content` field is a
* JSON string like `{"text":"hello"}`.  Returns `undefined` for
* non-text messages or parse failures.
*
* In group chats, bot mention placeholders (`@_user_N`) are stripped so
* a message like `@Bot stop` is detected as `stop`.
*/
function extractRawTextFromEvent(event) {
	if (!event.message || event.message.message_type !== "text") return;
	try {
		let text = JSON.parse(event.message.content)?.text;
		if (typeof text !== "string") return void 0;
		text = text.replace(/@_user_\d+/g, "").trim();
		return text || void 0;
	} catch {
		return;
	}
}
//#endregion
//#region src/messaging/inbound/dispatch-context.ts
const log$8 = larkLogger("inbound/dispatch-context");
/**
* Provide a safe RuntimeEnv fallback when the caller did not supply one.
* Replaces the previous unsafe `runtime as RuntimeEnv` casts.
*/
function ensureRuntime(runtime) {
	if (runtime) return runtime;
	return {
		log: (...args) => log$8.info(args.map(String).join(" ")),
		error: (...args) => log$8.error(args.map(String).join(" ")),
		exit: (code) => process.exit(code)
	};
}
/**
* Derive all shared values needed by downstream helpers:
* logging, addressing, route resolution, and system event emission.
*/
function buildDispatchContext(params) {
	const { ctx, account, accountScopedCfg } = params;
	const runtime = ensureRuntime(params.runtime);
	const log = runtime.log;
	const error = runtime.error;
	const isGroup = ctx.chatType === "group";
	const isThread = isGroup && Boolean(ctx.threadId);
	const core = LarkClient.runtime;
	const feishuFrom = `feishu:${ctx.senderId}`;
	const feishuTo = isGroup ? `chat:${ctx.chatId}` : `user:${ctx.senderId}`;
	const envelopeFrom = isGroup ? `${ctx.chatId}:${ctx.senderId}` : ctx.senderId;
	const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(accountScopedCfg);
	const route = core.channel.routing.resolveAgentRoute({
		cfg: accountScopedCfg,
		channel: "feishu",
		accountId: account.accountId,
		peer: {
			kind: isGroup ? "group" : "direct",
			id: isGroup ? ctx.chatId : ctx.senderId
		}
	});
	const sender = ctx.senderName ? `${ctx.senderName} (${ctx.senderId})` : ctx.senderId;
	const location = isGroup ? `group ${ctx.chatId}` : "DM";
	const tags = [];
	tags.push(`msg:${ctx.messageId}`);
	if (ctx.parentId) tags.push(`reply_to:${ctx.parentId}`);
	if (ctx.contentType !== "text") tags.push(ctx.contentType);
	if (ctx.mentions.some((m) => m.isBot)) tags.push("@bot");
	if (ctx.threadId) tags.push(`thread:${ctx.threadId}`);
	if (ctx.resources.length > 0) tags.push(`${ctx.resources.length} attachment(s)`);
	const tagStr = tags.length > 0 ? ` [${tags.join(", ")}]` : "";
	core.system.enqueueSystemEvent(`Feishu[${account.accountId}] ${location} | ${sender}${tagStr}`, {
		sessionKey: route.sessionKey,
		contextKey: `feishu:message:${ctx.chatId}:${ctx.messageId}`
	});
	return {
		ctx,
		accountScopedCfg,
		account,
		runtime,
		log,
		error,
		core,
		isGroup,
		isThread,
		feishuFrom,
		feishuTo,
		envelopeFrom,
		envelopeOptions,
		route,
		threadSessionKey: void 0,
		commandAuthorized: params.commandAuthorized
	};
}
/**
* Resolve thread session key for thread-capable groups.
*
* Returns a thread-scoped session key when ALL conditions are met:
*   1. `threadSession` config is enabled on the account
*   2. The group is a topic group (chat_mode=topic) or uses thread
*      message mode (group_message_type=thread)
*
* The group info is fetched via `im.chat.get` with a 1-hour LRU cache
* to minimise OAPI calls.
*/
async function resolveThreadSessionKey(params) {
	const { accountScopedCfg, account, chatId, threadId, baseSessionKey } = params;
	if (account.config?.threadSession !== true) return void 0;
	if (!await isThreadCapableGroup({
		cfg: accountScopedCfg,
		chatId,
		accountId: account.accountId
	})) {
		log$8.info(`thread session skipped: group ${chatId} is not topic/thread mode`);
		return;
	}
	const { sessionKey } = resolveThreadSessionKeys({
		baseSessionKey,
		threadId,
		parentSessionKey: baseSessionKey,
		normalizeThreadId: (id) => id
	});
	return sessionKey;
}
//#endregion
//#region src/messaging/inbound/dispatch-builders.ts
/**
* Build a `[System: ...]` mention annotation when the message @-mentions
* non-bot users.  Returns `undefined` when there are no user mentions.
*
* Sender identity / chat metadata are handled by the SDK's own
* `buildInboundUserContextPrefix` (via SenderId, SenderName, ReplyToBody,
* InboundHistory, etc.), so we only inject the mention data that the SDK
* does not natively support.
*/
function buildMentionAnnotation(ctx) {
	const mentions = nonBotMentions(ctx);
	if (mentions.length === 0) return void 0;
	return `[System: This message @mentions the following users: ${mentions.map((t) => `${t.name} (open_id: ${t.openId})`).join(", ")}. Use these open_ids when performing actions involving these users.]`;
}
/**
* Pure function: build the annotated message body with optional quote,
* speaker prefix, and mention annotation (for the envelope Body).
*
* Note: message_id and reply_to are now conveyed via system-event tags
* (msg:om_xxx, reply_to:om_yyy) instead of inline annotations, keeping
* the body cleaner and avoiding misleading heuristics for non-text
* message types (merge_forward, interactive cards, etc.).
*/
function buildMessageBody(ctx, quotedContent) {
	let messageBody = ctx.content;
	if (quotedContent) messageBody = `[Replying to: "${quotedContent}"]\n\n${ctx.content}`;
	messageBody = `${ctx.senderName ?? ctx.senderId}: ${messageBody}`;
	const mentionAnnotation = buildMentionAnnotation(ctx);
	if (mentionAnnotation) messageBody += `\n\n${mentionAnnotation}`;
	return messageBody;
}
/**
* Build the BodyForAgent value: the clean message content plus an
* optional mention annotation.
*
* SDK >= 2026.2.10 changed the BodyForAgent fallback chain from
* `BodyForAgent ?? Body` to `BodyForAgent ?? CommandBody ?? RawBody ?? Body`,
* so annotations embedded only in Body never reach the AI.  Setting
* BodyForAgent explicitly ensures the mention annotation survives.
*
* Sender identity, reply context, and chat history are NOT duplicated
* here — they are injected by the SDK's `buildInboundUserContextPrefix`
* via the standard fields (SenderId, SenderName, ReplyToBody,
* InboundHistory) that we pass in buildInboundPayload.
*
* Note: media file paths are substituted into `ctx.content` upstream
* (handler.ts -> substituteMediaPaths) before this function is called.
* The SDK's `detectAndLoadPromptImages` will discover image paths from
* the text and inject them as multimodal content blocks.
*/
function buildBodyForAgent(ctx) {
	const mentionAnnotation = buildMentionAnnotation(ctx);
	if (mentionAnnotation) return `${ctx.content}\n\n${mentionAnnotation}`;
	return ctx.content;
}
/**
* Unified call to `finalizeInboundContext`, eliminating the duplicated
* field-mapping between permission notification and main message paths.
*/
function buildInboundPayload(dc, opts) {
	return dc.core.channel.reply.finalizeInboundContext({
		...opts.extraFields,
		Body: opts.body,
		BodyForAgent: opts.bodyForAgent,
		RawBody: opts.rawBody,
		CommandBody: opts.commandBody,
		From: dc.feishuFrom,
		To: dc.feishuTo,
		SessionKey: dc.threadSessionKey ?? dc.route.sessionKey,
		AccountId: dc.route.accountId,
		ChatType: dc.isGroup ? "group" : "direct",
		GroupSubject: dc.isGroup ? dc.ctx.chatId : void 0,
		SenderName: opts.senderName,
		SenderId: opts.senderId,
		Provider: "feishu",
		Surface: "feishu",
		MessageSid: opts.messageSid,
		ReplyToBody: opts.replyToBody,
		InboundHistory: opts.inboundHistory,
		Timestamp: dc.ctx.createTime ?? Date.now(),
		WasMentioned: opts.wasMentioned,
		CommandAuthorized: dc.commandAuthorized,
		OriginatingChannel: "feishu",
		OriginatingTo: opts.originatingTo ?? dc.feishuTo
	});
}
/**
* Format the agent envelope and prepend group chat history if applicable.
* Returns the combined body and the history key (undefined for DMs).
*/
function buildEnvelopeWithHistory(dc, messageBody, chatHistories, historyLimit) {
	let combinedBody = dc.core.channel.reply.formatAgentEnvelope({
		channel: "Feishu",
		from: dc.envelopeFrom,
		timestamp: /* @__PURE__ */ new Date(),
		envelope: dc.envelopeOptions,
		body: messageBody
	});
	const historyKey = dc.isGroup ? threadScopedKey(dc.ctx.chatId, dc.isThread ? dc.ctx.threadId : void 0) : void 0;
	if (dc.isGroup && historyKey && chatHistories) combinedBody = buildPendingHistoryContextFromMap({
		historyMap: chatHistories,
		historyKey,
		limit: historyLimit,
		currentMessage: combinedBody,
		formatEntry: (entry) => dc.core.channel.reply.formatAgentEnvelope({
			channel: "Feishu",
			from: `${dc.ctx.chatId}:${entry.sender}`,
			timestamp: entry.timestamp,
			body: entry.body,
			envelope: dc.envelopeOptions
		})
	});
	return {
		combinedBody,
		historyKey
	};
}
//#endregion
//#region src/messaging/inbound/dispatch-commands.ts
const log$7 = larkLogger("inbound/dispatch-commands");
/**
* Dispatch a permission-error notification to the agent so it can
* inform the user about the missing Feishu API scope.
*/
async function dispatchPermissionNotification(dc, permissionError, replyToMessageId) {
	const permissionNotifyBody = `[System: The bot encountered a Feishu API permission error. Please inform the user about this issue and provide the permission grant URL for the admin to authorize. Permission grant URL: ${permissionError.grantUrl ?? ""}]`;
	const permCtx = buildInboundPayload(dc, {
		body: dc.core.channel.reply.formatAgentEnvelope({
			channel: "Feishu",
			from: dc.envelopeFrom,
			timestamp: /* @__PURE__ */ new Date(),
			envelope: dc.envelopeOptions,
			body: permissionNotifyBody
		}),
		bodyForAgent: permissionNotifyBody,
		rawBody: permissionNotifyBody,
		commandBody: permissionNotifyBody,
		senderName: "system",
		senderId: "system",
		messageSid: `${dc.ctx.messageId}:permission-error`,
		wasMentioned: false
	});
	const { dispatcher: permDispatcher, replyOptions: permReplyOptions, markDispatchIdle: markPermIdle, markFullyComplete: markPermComplete } = createFeishuReplyDispatcher({
		cfg: dc.accountScopedCfg,
		agentId: dc.route.agentId,
		chatId: dc.ctx.chatId,
		replyToMessageId: replyToMessageId ?? dc.ctx.messageId,
		accountId: dc.account.accountId,
		chatType: dc.ctx.chatType,
		replyInThread: dc.isThread
	});
	dc.log(`feishu[${dc.account.accountId}]: dispatching permission error notification to agent`);
	await dc.core.channel.reply.dispatchReplyFromConfig({
		ctx: permCtx,
		cfg: dc.accountScopedCfg,
		dispatcher: permDispatcher,
		replyOptions: permReplyOptions
	});
	await permDispatcher.waitForIdle();
	markPermComplete();
	markPermIdle();
}
/**
* Dispatch a system command (/help, /reset, etc.) via plain-text delivery.
* No streaming card, no "Processing..." state.
*
* When `suppressReply` is true the agent still runs (e.g. reads workspace
* files) but its text output is not forwarded to Feishu.  This is used for
* bare /new and /reset commands: the SDK already sends a "done" notice
* via its own route, so the AI greeting would be redundant.
*/
async function dispatchSystemCommand(dc, ctxPayload, suppressReply = false, replyToMessageId) {
	let delivered = false;
	dc.log(`feishu[${dc.account.accountId}]: detected system command, using plain-text dispatch${suppressReply ? " (reply suppressed)" : ""}`);
	log$7.info(`system command detected, plain-text dispatch${suppressReply ? ", reply suppressed" : ""}`);
	await dc.core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
		ctx: ctxPayload,
		cfg: dc.accountScopedCfg,
		dispatcherOptions: {
			deliver: async (payload) => {
				if (suppressReply) return;
				const text = payload.text?.trim() ?? "";
				if (!text) return;
				await sendMessageFeishu({
					cfg: dc.accountScopedCfg,
					to: dc.ctx.chatId,
					text,
					replyToMessageId: replyToMessageId ?? dc.ctx.messageId,
					accountId: dc.account.accountId,
					replyInThread: dc.isThread
				});
				delivered = true;
			},
			onSkip: (_payload, info) => {
				if (info.reason !== "silent") dc.log(`feishu[${dc.account.accountId}]: command reply skipped (reason=${info.reason})`);
			},
			onError: (err, info) => {
				dc.error(`feishu[${dc.account.accountId}]: command ${info.kind} reply failed: ${String(err)}`);
			}
		},
		replyOptions: {}
	});
	dc.log(`feishu[${dc.account.accountId}]: system command dispatched (delivered=${delivered})`);
	log$7.info(`system command dispatched (delivered=${delivered}, elapsed=${ticketElapsed()}ms)`);
}
//#endregion
//#region src/core/token-store.ts
/**
* Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
* SPDX-License-Identifier: MIT
*
* UAT (User Access Token) persistent storage with cross-platform support.
*
* Stores OAuth token data using OS-native credential services so that tokens
* survive process restarts without introducing plain-text local files.
*
* Platform backends:
*   macOS   – Keychain Access via `security` CLI
*   Linux   – AES-256-GCM encrypted files (XDG_DATA_HOME)
*   Windows – AES-256-GCM encrypted files (%LOCALAPPDATA%)
*
* Storage layout:
*   Service  = "openclaw-feishu-uat"
*   Account  = "{appId}:{userOpenId}"
*   Password = JSON-serialised StoredUAToken
*/
const log$6 = larkLogger("core/token-store");
const execFile$1 = promisify(execFile);
const KEYCHAIN_SERVICE = "openclaw-feishu-uat";
/** Refresh proactively when access_token expires within this window. */
const REFRESH_AHEAD_MS = 300 * 1e3;
function accountKey(appId, userOpenId) {
	return `${appId}:${userOpenId}`;
}
/** Mask a token for safe logging: only the last 4 chars are visible. */
function maskToken(token) {
	if (token.length <= 8) return "****";
	return `****${token.slice(-4)}`;
}
const darwinBackend = {
	async get(service, account) {
		try {
			const { stdout } = await execFile$1("security", [
				"find-generic-password",
				"-s",
				service,
				"-a",
				account,
				"-w"
			]);
			return stdout.trim() || null;
		} catch {
			return null;
		}
	},
	async set(service, account, data) {
		try {
			await execFile$1("security", [
				"delete-generic-password",
				"-s",
				service,
				"-a",
				account
			]);
		} catch {}
		await execFile$1("security", [
			"add-generic-password",
			"-s",
			service,
			"-a",
			account,
			"-w",
			data
		]);
	},
	async remove(service, account) {
		try {
			await execFile$1("security", [
				"delete-generic-password",
				"-s",
				service,
				"-a",
				account
			]);
		} catch {}
	}
};
const LINUX_UAT_DIR = join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "openclaw-feishu-uat");
const MASTER_KEY_PATH = join(LINUX_UAT_DIR, "master.key");
const MASTER_KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
/** Convert account key to a filesystem-safe filename. */
function linuxSafeFileName(account) {
	return account.replace(/[^a-zA-Z0-9._-]/g, "_") + ".enc";
}
/** Ensure the credentials directory exists with mode 0700. */
async function ensureLinuxCredDir() {
	await mkdir(LINUX_UAT_DIR, {
		recursive: true,
		mode: 448
	});
}
/**
* Load or create the 32-byte master key.
*
* On first run, generates a random key and writes it to disk (mode 0600).
* On subsequent runs, reads the existing key file.
*/
async function getMasterKey() {
	try {
		const key = await readFile(MASTER_KEY_PATH);
		if (key.length === MASTER_KEY_BYTES) return key;
		log$6.warn("master key has unexpected length, regenerating");
	} catch (err) {
		if (!(err instanceof Error) || err.code !== "ENOENT") log$6.warn(`failed to read master key: ${err instanceof Error ? err.message : err}`);
	}
	await ensureLinuxCredDir();
	const key = randomBytes(MASTER_KEY_BYTES);
	await writeFile(MASTER_KEY_PATH, key, { mode: 384 });
	await chmod(MASTER_KEY_PATH, 384);
	log$6.info("generated new master key for encrypted file storage");
	return key;
}
/** AES-256-GCM encrypt. Returns [12-byte IV][16-byte tag][ciphertext]. */
function encryptData(plaintext, key) {
	const iv = randomBytes(IV_BYTES);
	const cipher = createCipheriv("aes-256-gcm", key, iv);
	const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
	return Buffer.concat([
		iv,
		cipher.getAuthTag(),
		enc
	]);
}
/** AES-256-GCM decrypt. Returns plaintext or `null` on failure. */
function decryptData(data, key) {
	if (data.length < IV_BYTES + TAG_BYTES) return null;
	try {
		const iv = data.subarray(0, IV_BYTES);
		const tag = data.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
		const enc = data.subarray(IV_BYTES + TAG_BYTES);
		const decipher = createDecipheriv("aes-256-gcm", key, iv);
		decipher.setAuthTag(tag);
		return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
	} catch {
		return null;
	}
}
const linuxBackend = {
	async get(_service, account) {
		try {
			const key = await getMasterKey();
			return decryptData(await readFile(join(LINUX_UAT_DIR, linuxSafeFileName(account))), key);
		} catch {
			return null;
		}
	},
	async set(_service, account, data) {
		const key = await getMasterKey();
		await ensureLinuxCredDir();
		const filePath = join(LINUX_UAT_DIR, linuxSafeFileName(account));
		await writeFile(filePath, encryptData(data, key), { mode: 384 });
		await chmod(filePath, 384);
	},
	async remove(_service, account) {
		try {
			await unlink(join(LINUX_UAT_DIR, linuxSafeFileName(account)));
		} catch {}
	}
};
const WIN32_UAT_DIR = join(process.env.LOCALAPPDATA ?? join(process.env.USERPROFILE ?? homedir(), "AppData", "Local"), KEYCHAIN_SERVICE);
const WIN32_MASTER_KEY_PATH = join(WIN32_UAT_DIR, "master.key");
/** Convert account key to a filesystem-safe filename (whitelist approach). */
function win32SafeFileName(account) {
	return account.replace(/[^a-zA-Z0-9._-]/g, "_") + ".enc";
}
async function ensureWin32CredDir() {
	await mkdir(WIN32_UAT_DIR, { recursive: true });
}
async function getWin32MasterKey() {
	try {
		const key = await readFile(WIN32_MASTER_KEY_PATH);
		if (key.length === MASTER_KEY_BYTES) return key;
		log$6.warn("win32 master key has unexpected length, regenerating");
	} catch (err) {
		if (!(err instanceof Error) || err.code !== "ENOENT") log$6.warn(`failed to read win32 master key: ${err instanceof Error ? err.message : err}`);
	}
	await ensureWin32CredDir();
	const key = randomBytes(MASTER_KEY_BYTES);
	await writeFile(WIN32_MASTER_KEY_PATH, key);
	log$6.info("generated new master key for win32 encrypted file storage");
	return key;
}
const win32Backend = {
	async get(_service, account) {
		try {
			const key = await getWin32MasterKey();
			return decryptData(await readFile(join(WIN32_UAT_DIR, win32SafeFileName(account))), key);
		} catch {
			return null;
		}
	},
	async set(_service, account, data) {
		const key = await getWin32MasterKey();
		await ensureWin32CredDir();
		await writeFile(join(WIN32_UAT_DIR, win32SafeFileName(account)), encryptData(data, key));
	},
	async remove(_service, account) {
		try {
			await unlink(join(WIN32_UAT_DIR, win32SafeFileName(account)));
		} catch {}
	}
};
function createBackend() {
	switch (process.platform) {
		case "darwin": return darwinBackend;
		case "linux": return linuxBackend;
		case "win32": return win32Backend;
		default:
			log$6.warn(`unsupported platform "${process.platform}", falling back to macOS backend`);
			return darwinBackend;
	}
}
const backend = createBackend();
/**
* Read the stored UAT for a given (appId, userOpenId) pair.
* Returns `null` when no entry exists or the payload is unparseable.
*/
async function getStoredToken(appId, userOpenId) {
	try {
		const json = await backend.get(KEYCHAIN_SERVICE, accountKey(appId, userOpenId));
		if (!json) return null;
		return JSON.parse(json);
	} catch {
		return null;
	}
}
/**
* Persist a UAT using the platform credential store.
*
* Overwrites any existing entry for the same (appId, userOpenId).
*/
async function setStoredToken(token) {
	const key = accountKey(token.appId, token.userOpenId);
	const payload = JSON.stringify(token);
	await backend.set(KEYCHAIN_SERVICE, key, payload);
	log$6.info(`saved UAT for ${token.userOpenId} (at:${maskToken(token.accessToken)})`);
}
/**
* Remove a stored UAT from the credential store.
*/
async function removeStoredToken(appId, userOpenId) {
	await backend.remove(KEYCHAIN_SERVICE, accountKey(appId, userOpenId));
	log$6.info(`removed UAT for ${userOpenId}`);
}
/**
* Determine the freshness of a stored token.
*
* - `"valid"`         – access_token is still good (expires > 5 min from now)
* - `"needs_refresh"` – access_token expired/expiring but refresh_token is valid
* - `"expired"`       – both tokens are expired; re-authorization required
*/
function tokenStatus(token) {
	const now = Date.now();
	if (now < token.expiresAt - REFRESH_AHEAD_MS) return "valid";
	if (now < token.refreshExpiresAt) return "needs_refresh";
	return "expired";
}
//#endregion
//#region src/core/tool-scopes.ts
/**
* Tool Scope 数据
*
* 每个工具动作所需的飞书权限列表（Required Scopes）
*
* ## 数据说明
*
* - 空数组 `[]` 表示该工具动作不需要任何权限
* - 多个权限表示需要同时拥有所有权限（AND 关系）
* - 所有 scope 都是 user scopes（用户级权限）
*
* ## 示例
*
* ```typescript
* TOOL_SCOPES["feishu_calendar_event.create"]
* // 返回: ["calendar:calendar.event:create", "calendar:calendar.event:update"]
* ```
*
* @see {@link ToolActionKey} 所有可用的工具动作键
*/
const TOOL_SCOPES = {
	"feishu_bitable_app.create": ["base:app:create"],
	"feishu_bitable_app.get": ["base:app:read"],
	"feishu_bitable_app.list": ["space:document:retrieve"],
	"feishu_bitable_app.patch": ["base:app:update"],
	"feishu_bitable_app.copy": ["base:app:copy"],
	"feishu_bitable_app_table.create": ["base:table:create"],
	"feishu_bitable_app_table.list": ["base:table:read"],
	"feishu_bitable_app_table.patch": ["base:table:update"],
	"feishu_bitable_app_table.batch_create": ["base:table:create"],
	"feishu_bitable_app_table_record.create": ["base:record:create"],
	"feishu_bitable_app_table_record.update": ["base:record:update"],
	"feishu_bitable_app_table_record.delete": ["base:record:delete"],
	"feishu_bitable_app_table_record.batch_create": ["base:record:create"],
	"feishu_bitable_app_table_record.batch_update": ["base:record:update"],
	"feishu_bitable_app_table_record.batch_delete": ["base:record:delete"],
	"feishu_bitable_app_table_record.list": ["base:record:retrieve"],
	"feishu_bitable_app_table_field.create": ["base:field:create"],
	"feishu_bitable_app_table_field.list": ["base:field:read"],
	"feishu_bitable_app_table_field.update": ["base:field:read", "base:field:update"],
	"feishu_bitable_app_table_field.delete": ["base:field:delete"],
	"feishu_bitable_app_table_view.create": ["base:view:write_only"],
	"feishu_bitable_app_table_view.get": ["base:view:read"],
	"feishu_bitable_app_table_view.list": ["base:view:read"],
	"feishu_bitable_app_table_view.patch": ["base:view:write_only"],
	"feishu_calendar_calendar.list": ["calendar:calendar:read"],
	"feishu_calendar_calendar.get": ["calendar:calendar:read"],
	"feishu_calendar_calendar.primary": ["calendar:calendar:read"],
	"feishu_calendar_event.create": ["calendar:calendar.event:create", "calendar:calendar.event:update"],
	"feishu_calendar_event.list": ["calendar:calendar.event:read"],
	"feishu_calendar_event.get": ["calendar:calendar.event:read"],
	"feishu_calendar_event.patch": ["calendar:calendar.event:update"],
	"feishu_calendar_event.delete": ["calendar:calendar.event:delete"],
	"feishu_calendar_event.search": ["calendar:calendar.event:read"],
	"feishu_calendar_event.reply": ["calendar:calendar.event:reply"],
	"feishu_calendar_event.instances": ["calendar:calendar.event:read"],
	"feishu_calendar_event.instance_view": ["calendar:calendar.event:read"],
	"feishu_calendar_event_attendee.create": ["calendar:calendar.event:update"],
	"feishu_calendar_event_attendee.list": ["calendar:calendar.event:read"],
	"feishu_calendar_freebusy.list": ["calendar:calendar.free_busy:read"],
	"feishu_task_task.create": ["task:task:write", "task:task:writeonly"],
	"feishu_task_task.get": ["task:task:read", "task:task:write"],
	"feishu_task_task.list": ["task:task:read", "task:task:write"],
	"feishu_task_task.patch": ["task:task:write", "task:task:writeonly"],
	"feishu_task_tasklist.create": ["task:tasklist:write"],
	"feishu_task_tasklist.get": ["task:tasklist:read", "task:tasklist:write"],
	"feishu_task_tasklist.list": ["task:tasklist:read", "task:tasklist:write"],
	"feishu_task_tasklist.tasks": ["task:tasklist:read", "task:tasklist:write"],
	"feishu_task_tasklist.patch": ["task:tasklist:write"],
	"feishu_task_tasklist.add_members": ["task:tasklist:write"],
	"feishu_task_comment.create": ["task:comment:write"],
	"feishu_task_comment.list": ["task:comment:read", "task:comment:write"],
	"feishu_task_comment.get": ["task:comment:read", "task:comment:write"],
	"feishu_task_subtask.create": ["task:task:write"],
	"feishu_task_subtask.list": ["task:task:read", "task:task:write"],
	"feishu_chat.search": ["im:chat:read"],
	"feishu_chat.get": ["im:chat:read"],
	"feishu_chat_members.default": ["im:chat.members:read"],
	"feishu_drive_file.list": ["space:document:retrieve"],
	"feishu_drive_file.get_meta": ["drive:drive.metadata:readonly"],
	"feishu_drive_file.copy": ["docs:document:copy"],
	"feishu_drive_file.move": ["space:document:move"],
	"feishu_drive_file.delete": ["space:document:delete"],
	"feishu_drive_file.upload": ["drive:file:upload"],
	"feishu_drive_file.download": ["drive:file:download"],
	"feishu_doc_media.download": ["board:whiteboard:node:read", "docs:document.media:download"],
	"feishu_doc_media.insert": ["docx:document:write_only", "docs:document.media:upload"],
	"feishu_doc_comments.list": ["wiki:node:read", "docs:document.comment:read"],
	"feishu_doc_comments.create": ["wiki:node:read", "docs:document.comment:create"],
	"feishu_doc_comments.patch": ["docs:document.comment:update"],
	"feishu_wiki_space.list": ["wiki:space:retrieve"],
	"feishu_wiki_space.get": ["wiki:space:read"],
	"feishu_wiki_space.create": ["wiki:space:write_only"],
	"feishu_wiki_space_node.list": ["wiki:node:retrieve"],
	"feishu_wiki_space_node.get": ["wiki:node:read"],
	"feishu_wiki_space_node.create": ["wiki:node:create"],
	"feishu_wiki_space_node.move": ["wiki:node:move"],
	"feishu_wiki_space_node.copy": ["wiki:node:copy"],
	"feishu_im_user_message.send": ["im:message", "im:message.send_as_user"],
	"feishu_im_user_message.reply": ["im:message", "im:message.send_as_user"],
	"feishu_im_user_fetch_resource.default": [
		"im:message.group_msg:get_as_user",
		"im:message.p2p_msg:get_as_user",
		"im:message:readonly"
	],
	"feishu_im_user_get_messages.default": [
		"im:chat:read",
		"im:message:readonly",
		"im:message.group_msg:get_as_user",
		"im:message.p2p_msg:get_as_user",
		"contact:contact.base:readonly",
		"contact:user.base:readonly"
	],
	"feishu_im_user_search_messages.default": [
		"im:chat:read",
		"im:message:readonly",
		"im:message.group_msg:get_as_user",
		"im:message.p2p_msg:get_as_user",
		"contact:contact.base:readonly",
		"contact:user.base:readonly",
		"search:message"
	],
	"feishu_search_doc_wiki.search": ["search:docs:read"],
	"feishu_get_user.basic_batch": ["contact:user.basic_profile:readonly"],
	"feishu_get_user.default": ["contact:contact.base:readonly", "contact:user.base:readonly"],
	"feishu_search_user.default": ["contact:user:search"],
	"feishu_create_doc.default": [
		"board:whiteboard:node:create",
		"docx:document:create",
		"docx:document:readonly",
		"docx:document:write_only",
		"wiki:node:create",
		"wiki:node:read",
		"docs:document.media:upload"
	],
	"feishu_fetch_doc.default": ["docx:document:readonly", "wiki:node:read"],
	"feishu_update_doc.default": [
		"board:whiteboard:node:create",
		"docx:document:create",
		"docx:document:readonly",
		"docx:document:write_only"
	],
	"feishu_sheet.info": ["sheets:spreadsheet.meta:read", "sheets:spreadsheet:read"],
	"feishu_sheet.read": ["sheets:spreadsheet.meta:read", "sheets:spreadsheet:read"],
	"feishu_sheet.write": [
		"sheets:spreadsheet.meta:read",
		"sheets:spreadsheet:read",
		"sheets:spreadsheet:create",
		"sheets:spreadsheet:write_only"
	],
	"feishu_sheet.append": [
		"sheets:spreadsheet.meta:read",
		"sheets:spreadsheet:read",
		"sheets:spreadsheet:create",
		"sheets:spreadsheet:write_only"
	],
	"feishu_sheet.find": ["sheets:spreadsheet.meta:read", "sheets:spreadsheet:read"],
	"feishu_sheet.create": [
		"sheets:spreadsheet.meta:read",
		"sheets:spreadsheet:read",
		"sheets:spreadsheet:create",
		"sheets:spreadsheet:write_only"
	],
	"feishu_sheet.export": ["docs:document:export"]
};
/**
* 飞书插件运行必须开通的应用身份权限清单
*
* 这些权限是插件基础功能（消息接收、卡片交互、基本信息查询等）所必需的，
* 如果缺失这些权限，插件将无法正常工作。
*
* 权限分类：
* - im:message.* - 消息接收和发送
* - im:chat.* - 群聊管理
* - im:resource - 消息资源（图片、文件等）
* - cardkit:card.* - 卡片交互
* - application:application:self_manage - 应用自身权限查询（权限检查基础）
* - contact:contact.base:readonly - 通讯录基础信息
* - docx:document:readonly - 文档基础只读（文档链接预览等）
*
* 最后更新: 2026-03-03
*/
const REQUIRED_APP_SCOPES = [
	"contact:contact.base:readonly",
	"docx:document:readonly",
	"im:chat:read",
	"im:chat:update",
	"im:message.group_at_msg:readonly",
	"im:message.p2p_msg:readonly",
	"im:message.pins:read",
	"im:message.pins:write_only",
	"im:message.reactions:read",
	"im:message.reactions:write_only",
	"im:message:readonly",
	"im:message:recall",
	"im:message:send_as_bot",
	"im:message:send_multi_users",
	"im:message:send_sys_msg",
	"im:message:update",
	"im:resource",
	"application:application:self_manage",
	"cardkit:card:write",
	"cardkit:card:read"
];
/**
* 高敏感权限清单
*
* 这些权限具有较高的敏感度，不应在批量授权时自动申请。
* 用户需要明确知晓这些权限的影响后，才能手动授权。
*
* 权限说明：
* - im:message.send_as_user - 以用户身份发送消息（高风险，可能被滥用发送钓鱼或垃圾消息）
* - space:document:delete - 删除云文档
* - calendar:calendar.event:delete - 删除日程
* - base:table:delete - 删除多维表格数据表
*
* 使用场景：
* - 批量授权时会自动过滤掉这些权限
* - 需要这些权限的功能会单独提示用户授权
*
* 最后更新: 2026-03-17
*/
const SENSITIVE_SCOPES = [
	"im:message.send_as_user",
	"space:document:delete",
	"calendar:calendar.event:delete",
	"base:table:delete"
];
/**
* 过滤掉高敏感权限
*
* 用于批量授权时排除高敏感权限，这些权限需要用户明确授权。
*
* @param scopes - 原始权限列表
* @returns 过滤后的权限列表（不包含高敏感权限）
*
* @example
* ```typescript
* const allScopes = ["im:message", "im:message.send_as_user", "calendar:calendar:read"];
* const safeScopes = filterSensitiveScopes(allScopes);
* // 返回: ["im:message", "calendar:calendar:read"]
* ```
*/
function filterSensitiveScopes(scopes) {
	const sensitiveSet = new Set(SENSITIVE_SCOPES);
	return scopes.filter((scope) => !sensitiveSet.has(scope));
}
/**
* 工具动作总数: 96
* 唯一 scope 总数: 74
* 必需应用权限总数: 20
* 高敏感权限总数: 4
*/
//#endregion
//#region src/channel/probe.ts
/**
* Probe the Feishu bot connection by calling the bot/v3/info API.
*
* Returns a result indicating whether the bot is reachable and its
* basic identity (name, open_id).  Used by onboarding and status
* checks to verify credentials before committing them to config.
*/
async function probeFeishu(credentials) {
	if (!credentials?.appId || !credentials?.appSecret) return {
		ok: false,
		error: "missing credentials (appId, appSecret)"
	};
	return LarkClient.fromCredentials(credentials).probe();
}
//#endregion
//#region src/core/feishu-fetch.ts
/**
* Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
* SPDX-License-Identifier: MIT
*
* Header-aware fetch for Feishu API calls.
*
* Drop-in replacement for `fetch()` that automatically injects
* the User-Agent header.
*/
/**
* Drop-in replacement for `fetch()` that automatically injects
* the User-Agent header.
*
* Used by `device-flow.ts` and `uat-client.ts` so that the custom
* User-Agent is transparently applied without changing every
* call-site's signature.
*/
function feishuFetch(url, init) {
	const headers = {
		...init?.headers,
		"User-Agent": getUserAgent()
	};
	return fetch(url, {
		...init,
		headers
	});
}
//#endregion
//#region src/core/device-flow.ts
const log$5 = larkLogger("core/device-flow");
/**
* Resolve the two OAuth endpoint URLs based on the configured brand.
*/
function resolveOAuthEndpoints(brand) {
	if (!brand || brand === "feishu") return {
		deviceAuthorization: "https://accounts.feishu.cn/oauth/v1/device_authorization",
		token: "https://open.feishu.cn/open-apis/authen/v2/oauth/token"
	};
	if (brand === "lark") return {
		deviceAuthorization: "https://accounts.larksuite.com/oauth/v1/device_authorization",
		token: "https://open.larksuite.com/open-apis/authen/v2/oauth/token"
	};
	const base = brand.replace(/\/+$/, "");
	let accountsBase = base;
	try {
		const parsed = new URL(base);
		if (parsed.hostname.startsWith("open.")) accountsBase = `${parsed.protocol}//${parsed.hostname.replace(/^open\./, "accounts.")}`;
	} catch {}
	return {
		deviceAuthorization: `${accountsBase}/oauth/v1/device_authorization`,
		token: `${base}/open-apis/authen/v2/oauth/token`
	};
}
/**
* Request a device authorisation code from the Feishu OAuth server.
*
* Uses Confidential Client authentication (HTTP Basic with appId:appSecret).
* The `offline_access` scope is automatically appended so that the token
* response includes a refresh_token.
*/
async function requestDeviceAuthorization(params) {
	const { appId, appSecret, brand } = params;
	const endpoints = resolveOAuthEndpoints(brand);
	let scope = params.scope ?? "";
	if (!scope.includes("offline_access")) scope = scope ? `${scope} offline_access` : "offline_access";
	const basicAuth = Buffer.from(`${appId}:${appSecret}`).toString("base64");
	const body = new URLSearchParams();
	body.set("client_id", appId);
	body.set("scope", scope);
	log$5.info(`requesting device authorization (scope="${scope}") url=${endpoints.deviceAuthorization} token_url=${endpoints.token}`);
	const resp = await feishuFetch(endpoints.deviceAuthorization, {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
			Authorization: `Basic ${basicAuth}`
		},
		body: body.toString()
	});
	const text = await resp.text();
	log$5.info(`response status=${resp.status} body=${text.slice(0, 500)}`);
	let data;
	try {
		data = JSON.parse(text);
	} catch {
		throw new Error(`Device authorization failed: HTTP ${resp.status} – ${text.slice(0, 200)}`);
	}
	if (!resp.ok || data.error) {
		const msg = data.error_description ?? data.error ?? "Unknown error";
		throw new Error(`Device authorization failed: ${msg}`);
	}
	const expiresIn = data.expires_in ?? 240;
	const interval = data.interval ?? 5;
	log$5.info(`device_code obtained, expires_in=${expiresIn}s (${Math.round(expiresIn / 60)}min), interval=${interval}s`);
	return {
		deviceCode: data.device_code,
		userCode: data.user_code,
		verificationUri: data.verification_uri,
		verificationUriComplete: data.verification_uri_complete ?? data.verification_uri,
		expiresIn,
		interval
	};
}
function sleep(ms, signal) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(resolve, ms);
		signal?.addEventListener("abort", () => {
			clearTimeout(timer);
			reject(new DOMException("Aborted", "AbortError"));
		}, { once: true });
	});
}
/**
* Poll the token endpoint until the user authorises, rejects, or the code
* expires.
*
* Handles `authorization_pending` (keep polling), `slow_down` (back off by
* +5 s), `access_denied` and `expired_token` (terminal errors).
*
* Pass an `AbortSignal` to cancel polling from the outside.
*/
async function pollDeviceToken(params) {
	const MAX_POLL_INTERVAL = 60;
	const MAX_POLL_ATTEMPTS = 200;
	const { appId, appSecret, brand, deviceCode, expiresIn, signal } = params;
	let interval = params.interval;
	const endpoints = resolveOAuthEndpoints(brand);
	const deadline = Date.now() + expiresIn * 1e3;
	let attempts = 0;
	while (Date.now() < deadline && attempts < MAX_POLL_ATTEMPTS) {
		attempts++;
		if (signal?.aborted) return {
			ok: false,
			error: "expired_token",
			message: "Polling was cancelled"
		};
		await sleep(interval * 1e3, signal);
		let data;
		try {
			data = await (await feishuFetch(endpoints.token, {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({
					grant_type: "urn:ietf:params:oauth:grant-type:device_code",
					device_code: deviceCode,
					client_id: appId,
					client_secret: appSecret
				}).toString()
			})).json();
		} catch (err) {
			log$5.warn(`poll network error: ${err}`);
			interval = Math.min(interval + 1, MAX_POLL_INTERVAL);
			continue;
		}
		const error = data.error;
		if (!error && data.access_token) {
			log$5.info("token obtained successfully");
			const refreshToken = data.refresh_token ?? "";
			const expiresIn = data.expires_in ?? 7200;
			let refreshExpiresIn = data.refresh_token_expires_in ?? 604800;
			if (!refreshToken) {
				log$5.warn("no refresh_token in response, token will not be refreshable");
				refreshExpiresIn = expiresIn;
			}
			return {
				ok: true,
				token: {
					accessToken: data.access_token,
					refreshToken,
					expiresIn,
					refreshExpiresIn,
					scope: data.scope ?? ""
				}
			};
		}
		if (error === "authorization_pending") {
			log$5.debug("authorization_pending, retrying...");
			continue;
		}
		if (error === "slow_down") {
			interval = Math.min(interval + 5, MAX_POLL_INTERVAL);
			log$5.info(`slow_down, interval increased to ${interval}s`);
			continue;
		}
		if (error === "access_denied") {
			log$5.info("user denied authorization");
			return {
				ok: false,
				error: "access_denied",
				message: "用户拒绝了授权"
			};
		}
		if (error === "expired_token" || error === "invalid_grant") {
			log$5.info(`device code expired/invalid (error=${error})`);
			return {
				ok: false,
				error: "expired_token",
				message: "授权码已过期，请重新发起"
			};
		}
		const desc = data.error_description ?? error ?? "Unknown error";
		log$5.warn(`unexpected error: error=${error}, desc=${desc}`);
		return {
			ok: false,
			error: "expired_token",
			message: desc
		};
	}
	if (attempts >= MAX_POLL_ATTEMPTS) log$5.warn(`max poll attempts (${MAX_POLL_ATTEMPTS}) reached`);
	return {
		ok: false,
		error: "expired_token",
		message: "授权超时，请重新发起"
	};
}
//#endregion
//#region src/core/uat-client.ts
const log$4 = larkLogger("core/uat-client");
/**
* Guards against concurrent refresh operations for the same user.
*
* refresh_token is single-use: if two requests trigger a refresh
* simultaneously, the second one would use an already-consumed token and
* fail.  The lock ensures only one refresh runs at a time per user.
*/
const refreshLocks = /* @__PURE__ */ new Map();
async function doRefreshToken(opts, stored) {
	if (Date.now() >= stored.refreshExpiresAt) {
		log$4.info(`refresh_token expired for ${opts.userOpenId}, clearing`);
		await removeStoredToken(opts.appId, opts.userOpenId);
		return null;
	}
	const endpoints = resolveOAuthEndpoints(opts.domain);
	const requestBody = new URLSearchParams({
		grant_type: "refresh_token",
		refresh_token: stored.refreshToken,
		client_id: opts.appId,
		client_secret: opts.appSecret
	}).toString();
	const callEndpoint = async () => {
		return await (await feishuFetch(endpoints.token, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: requestBody
		})).json();
	};
	let data = await callEndpoint();
	const code = data.code;
	const error = data.error;
	if (code !== void 0 && code !== 0 || error) {
		const errCode = code ?? error;
		if (REFRESH_TOKEN_RETRYABLE.has(code)) {
			log$4.warn(`refresh transient error (code=${errCode}) for ${opts.userOpenId}, retrying once`);
			data = await callEndpoint();
			const retryCode = data.code;
			const retryError = data.error;
			if (retryCode !== void 0 && retryCode !== 0 || retryError) {
				const retryErrCode = retryCode ?? retryError;
				log$4.warn(`refresh failed after retry (code=${retryErrCode}), clearing token for ${opts.userOpenId}`);
				await removeStoredToken(opts.appId, opts.userOpenId);
				return null;
			}
		} else {
			log$4.warn(`refresh failed (code=${errCode}), clearing token for ${opts.userOpenId}`);
			await removeStoredToken(opts.appId, opts.userOpenId);
			return null;
		}
	}
	if (!data.access_token) throw new Error("Token refresh returned no access_token");
	const now = Date.now();
	const updated = {
		userOpenId: stored.userOpenId,
		appId: opts.appId,
		accessToken: data.access_token,
		refreshToken: data.refresh_token ?? stored.refreshToken,
		expiresAt: now + (data.expires_in ?? 7200) * 1e3,
		refreshExpiresAt: data.refresh_token_expires_in ? now + data.refresh_token_expires_in * 1e3 : stored.refreshExpiresAt,
		scope: data.scope ?? stored.scope,
		grantedAt: stored.grantedAt
	};
	await setStoredToken(updated);
	log$4.info(`refreshed UAT for ${opts.userOpenId} (at:${maskToken(updated.accessToken)})`);
	return updated;
}
/**
* Refresh with per-user locking.
*/
async function refreshWithLock(opts, stored) {
	const key = `${opts.appId}:${opts.userOpenId}`;
	const existing = refreshLocks.get(key);
	if (existing) {
		await existing;
		return getStoredToken(opts.appId, opts.userOpenId);
	}
	const promise = doRefreshToken(opts, stored);
	refreshLocks.set(key, promise);
	try {
		return await promise;
	} finally {
		refreshLocks.delete(key);
	}
}
/**
* Obtain a valid access_token for the given user.
*
* - Reads from Keychain.
* - Refreshes proactively if the token is about to expire.
* - Throws when no token exists or refresh fails irrecoverably.
*
* **The returned token must never be exposed to the AI layer.**
*/
async function getValidAccessToken(opts) {
	const stored = await getStoredToken(opts.appId, opts.userOpenId);
	if (!stored) throw new NeedAuthorizationError(opts.userOpenId);
	const status = tokenStatus(stored);
	if (status === "valid") return stored.accessToken;
	if (status === "needs_refresh") {
		const refreshed = await refreshWithLock(opts, stored);
		if (!refreshed) throw new NeedAuthorizationError(opts.userOpenId);
		return refreshed.accessToken;
	}
	await removeStoredToken(opts.appId, opts.userOpenId);
	throw new NeedAuthorizationError(opts.userOpenId);
}
/**
* Execute an API call with a valid UAT, retrying once on token-expiry errors.
*/
async function callWithUAT(opts, apiCall) {
	const accessToken = await getValidAccessToken(opts);
	try {
		return await apiCall(accessToken);
	} catch (err) {
		const code = err?.code ?? err?.response?.data?.code;
		if (TOKEN_RETRY_CODES.has(code)) {
			log$4.warn(`API call failed (code=${code}), refreshing and retrying`);
			const stored = await getStoredToken(opts.appId, opts.userOpenId);
			if (!stored) throw new NeedAuthorizationError(opts.userOpenId);
			const refreshed = await refreshWithLock(opts, stored);
			if (!refreshed) throw new NeedAuthorizationError(opts.userOpenId);
			return await apiCall(refreshed.accessToken);
		}
		throw err;
	}
}
/**
* Revoke a user's UAT by removing it from the Keychain.
*/
async function revokeUAT(appId, userOpenId) {
	await removeStoredToken(appId, userOpenId);
	log$4.info(`revoked UAT for ${userOpenId}`);
}
//#endregion
//#region src/core/scope-manager.ts
/**
* Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
* SPDX-License-Identifier: MIT
*
* Scope 管理模块
*
* 为所有工具动作提供类型安全的 scope 查询和检查功能。
*
* ## 三个核心概念
*
* ### 1. Required Scopes（API 需要的权限）
* - 定义：每个 API 调用所需的飞书权限列表
* - 来源：tool-scopes.ts（手动维护的类型化配置）
* - 示例：`["calendar:calendar.event:create", "calendar:calendar.event:update"]`
* - 用途：判断应用和用户是否需要申请/授权权限
*
* ### 2. App Granted Scopes（应用已开通的权限）
* - 定义：应用在飞书开放平台配置并获得管理员批准的权限
* - 来源：通过 API 查询 `/open-apis/application/v6/applications`
* - 作用：应用级权限前置检查，避免无效的用户授权请求
* - 检查时机：在请求用户授权前
*
* ### 3. User Granted Scopes（用户授权的权限）
* - 定义：用户通过 OAuth 流程明确授权给应用的权限
* - 来源：OAuth token 中的 scope 字段
* - 作用：用户级权限检查，确保用户已授权所需权限
* - 检查时机：每次 API 调用前
*
* ## 权限检查流程
*
* ```
* 1. 获取 Required Scopes (API 需要什么权限？)
*    ↓
* 2. 检查 App Granted Scopes (应用开通了吗？)
*    ↓ 是
* 3. 检查 User Granted Scopes (用户授权了吗？)
*    ↓ 是
* 4. 调用 API
* ```
*/
/**
* 获取单个工具动作所需的 scopes（Required Scopes）
*
* @param toolAction - 工具动作键（例如 "feishu_calendar_event.create"）
* @returns API 需要的 scope 字符串数组
*
* @example
* ```ts
* const requiredScopes = getRequiredScopes("feishu_calendar_event.create");
* // 返回: ["calendar:calendar.event:create", "calendar:calendar.event:update"]
* ```
*/
function getRequiredScopes(toolAction) {
	return TOOL_SCOPES[toolAction] ?? [];
}
//#endregion
//#region src/core/raw-request.ts
/** 将 LarkBrand 映射为 API base URL。 */
function resolveDomainUrl(brand) {
	return {
		feishu: "https://open.feishu.cn",
		lark: "https://open.larksuite.com"
	}[brand] ?? `https://${brand}`;
}
/**
* 发起 raw HTTP 请求到飞书 API，自动处理域名解析、header 注入和错误检测。
*
* 飞书 API 统一错误模式：返回 JSON 中 `code !== 0` 表示失败。
*/
async function rawLarkRequest(options) {
	const baseUrl = resolveDomainUrl(options.brand);
	const url = new URL(options.path, baseUrl);
	if (options.query) for (const [k, v] of Object.entries(options.query)) url.searchParams.set(k, v);
	const headers = {};
	if (options.accessToken) headers["Authorization"] = `Bearer ${options.accessToken}`;
	if (options.body !== void 0) headers["Content-Type"] = "application/json";
	if (options.headers) Object.assign(headers, options.headers);
	const data = await (await feishuFetch(url.toString(), {
		method: options.method ?? "GET",
		headers,
		...options.body !== void 0 ? { body: JSON.stringify(options.body) } : {}
	})).json();
	if (data.code !== void 0 && data.code !== 0) {
		const err = new Error(data.msg ?? `Lark API error: code=${data.code}`);
		err.code = data.code;
		err.msg = data.msg;
		throw err;
	}
	return data;
}
//#endregion
//#region src/core/tool-client.ts
/**
* Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
* SPDX-License-Identifier: MIT
*
* ToolClient — 工具层统一客户端。
*
* 专为 `src/tools/` 下的工具设计，封装 account 解析、SDK 管理、
* TAT/UAT 自动切换和 scope 预检。工具代码只需声明 API 名称和调用逻辑，
* 身份选择/scope 校验/token 管理全部由 `invoke()` 内聚处理。
*
* 用法：
* ```typescript
* const client = createToolClient(config);
*
* // UAT 调用 — 通过 { as: "user" } 指定用户身份
* const res = await client.invoke(
*   "calendar.v4.calendarEvent.create",
*   (sdk, opts) => sdk.calendar.calendarEvent.create(payload, opts),
*   { as: "user" },
* );
*
* // TAT 调用 — 默认走应用身份
* const res = await client.invoke(
*   "calendar.v4.calendar.list",
*   (sdk) => sdk.calendar.calendar.list(payload),
*   { as: "tenant" },
* );
* ```
*/
const tcLog = larkLogger("core/tool-client");
var ToolClient = class {
	config;
	/** 当前解析的账号信息（appId、appSecret 保证存在）。 */
	account;
	/** 当前请求的用户 open_id（来自 LarkTicket，可能为 undefined）。 */
	senderOpenId;
	/** Lark SDK 实例（TAT 身份），直接调用即可。 */
	sdk;
	constructor(params) {
		this.account = params.account;
		this.senderOpenId = params.senderOpenId;
		this.sdk = params.sdk;
		this.config = params.config;
	}
	/**
	* 统一 API 调用入口。
	*
	* 自动处理：
	* - 根据 API meta 选择 UAT / TAT
	* - 严格模式：检查应用和用户是否拥有所有 API 要求的 scope
	* - 无 token 或 scope 不足时抛出结构化错误
	* - UAT 模式下复用 callWithUAT 的 refresh + retry
	*
	* @param apiName - meta.json 中的 toolName，如 `"calendar.v4.calendarEvent.create"`
	* @param fn - API 调用逻辑。UAT 时 opts 已注入 token，TAT 时 opts 为 undefined。
	* @param options - 可选配置：
	*   - `as`: 指定 UAT/TAT
	*   - `userOpenId`: 覆盖用户 ID
	*
	* @throws {@link AppScopeMissingError} 应用未开通 API 所需 scope
	* @throws {@link UserAuthRequiredError} 用户未授权或 scope 不足
	* @throws {@link UserScopeInsufficientError} 服务端报用户 scope 不足
	*
	* @example
	* // UAT 调用 — 通过 { as: "user" } 指定
	* const res = await client.invoke(
	*   "calendar.v4.calendarEvent.create",
	*   (sdk, opts) => sdk.calendar.calendarEvent.create(payload, opts),
	*   { as: "user" },
	* );
	*
	* @example
	* // TAT 调用
	* const res = await client.invoke(
	*   "calendar.v4.calendar.list",
	*   (sdk) => sdk.calendar.calendar.list(payload),
	*   { as: "tenant" },
	* );
	*
	*/
	async invoke(toolAction, fn, options) {
		return this._invokeInternal(toolAction, fn, options);
	}
	/**
	* 内部 invoke 实现，只支持 ToolActionKey（严格类型检查）
	*/
	async _invokeInternal(toolAction, fn, options) {
		const feishuEntry = this.config.plugins?.entries?.feishu;
		if (feishuEntry && feishuEntry.enabled !== false) throw new Error("❌ 检测到旧版插件未禁用。\n👉 请依次运行命令：\n```\nopenclaw config set plugins.entries.feishu.enabled false --json\nopenclaw gateway restart\n```");
		const requiredScopes = getRequiredScopes(toolAction);
		const tokenType = options?.as ?? "user";
		const appCheckScopes = tokenType === "user" ? [...new Set([...requiredScopes, "offline_access"])] : requiredScopes;
		let appScopeVerified = true;
		if (appCheckScopes.length > 0) {
			const appGrantedScopes = await getAppGrantedScopes(this.sdk, this.account.appId, tokenType);
			if (appGrantedScopes.length > 0) {
				const missingAppScopes = missingScopes(appGrantedScopes, appCheckScopes);
				if (missingAppScopes.length > 0) throw new AppScopeMissingError({
					apiName: toolAction,
					scopes: missingAppScopes,
					appId: this.account.appId
				}, "all", tokenType, requiredScopes);
			} else appScopeVerified = false;
		}
		if (tokenType === "tenant") return this.invokeAsTenant(toolAction, fn, requiredScopes);
		let userOpenId = options?.userOpenId ?? this.senderOpenId;
		if (!userOpenId) {
			const fallbackUserId = await getAppOwnerFallback(this.account, this.sdk);
			if (fallbackUserId) {
				userOpenId = fallbackUserId;
				tcLog.info(`Using app owner as fallback user`, {
					toolAction,
					appId: this.account.appId,
					ownerId: fallbackUserId
				});
			}
		}
		return this.invokeAsUser(toolAction, fn, requiredScopes, userOpenId, appScopeVerified);
	}
	/**
	* invoke() 的非抛出包装，适用于"允许失败"的子操作。
	*
	* - 成功 → `{ ok: true, data }`
	* - 用户授权错误（可通过 OAuth 恢复）→ `{ ok: false, authHint }`
	* - 应用权限缺失 / appScopeVerified=false → **仍然 throw**（需管理员操作）
	* - 其他错误 → `{ ok: false, error }`
	*/
	/**
	* 对 SDK 未覆盖的飞书 API 发起 raw HTTP 请求，同时复用 invoke() 的
	* auth/scope/refresh 全链路。
	*
	* @param apiName - 逻辑 API 名称（用于日志和错误信息），如 `"im.v1.chatP2p.batchQuery"`
	* @param path - API 路径（以 `/open-apis/` 开头），如 `"/open-apis/im/v1/chat_p2p/batch_query"`
	* @param options - HTTP 方法、body、query 及 InvokeOptions（as、userOpenId 等）
	*
	* @example
	* ```typescript
	* const res = await client.invokeByPath<{ data: { items: Array<{ chat_id: string }> } }>(
	*   "im.v1.chatP2p.batchQuery",
	*   "/open-apis/im/v1/chat_p2p/batch_query",
	*   {
	*     method: "POST",
	*     body: { chatter_ids: [openId] },
	*     as: "user",
	*   },
	* );
	* ```
	*/
	async invokeByPath(toolAction, path, options) {
		const fn = async (_sdk, _opts, uat) => {
			return this.rawRequest(path, {
				method: options?.method,
				body: options?.body,
				query: options?.query,
				headers: options?.headers,
				accessToken: uat
			});
		};
		return this._invokeInternal(toolAction, fn, options);
	}
	async invokeAsTenant(toolAction, fn, requiredScopes) {
		try {
			return await fn(this.sdk);
		} catch (err) {
			this.rethrowStructuredError(err, toolAction, requiredScopes, void 0, "tenant");
			throw err;
		}
	}
	async invokeAsUser(toolAction, fn, requiredScopes, userOpenId, appScopeVerified) {
		if (!userOpenId) throw new UserAuthRequiredError("unknown", {
			apiName: toolAction,
			scopes: requiredScopes,
			appScopeVerified,
			appId: this.account.appId
		});
		await assertOwnerAccessStrict(this.account, this.sdk, userOpenId);
		const stored = await getStoredToken(this.account.appId, userOpenId);
		if (!stored) throw new UserAuthRequiredError(userOpenId, {
			apiName: toolAction,
			scopes: requiredScopes,
			appScopeVerified,
			appId: this.account.appId
		});
		if (appScopeVerified && stored.scope && requiredScopes.length > 0) {
			const userGrantedScopes = new Set(stored.scope.split(/\s+/).filter(Boolean));
			const missingUserScopes = requiredScopes.filter((s) => !userGrantedScopes.has(s));
			if (missingUserScopes.length > 0) throw new UserAuthRequiredError(userOpenId, {
				apiName: toolAction,
				scopes: missingUserScopes,
				appScopeVerified,
				appId: this.account.appId
			});
		}
		try {
			return await callWithUAT({
				userOpenId,
				appId: this.account.appId,
				appSecret: this.account.appSecret,
				domain: this.account.brand
			}, (accessToken) => fn(this.sdk, Lark.withUserAccessToken(accessToken), accessToken));
		} catch (err) {
			if (err instanceof NeedAuthorizationError) throw new UserAuthRequiredError(userOpenId, {
				apiName: toolAction,
				scopes: requiredScopes,
				appScopeVerified
			});
			this.rethrowStructuredError(err, toolAction, requiredScopes, userOpenId, "user");
			throw err;
		}
	}
	/**
	* 发起 raw HTTP 请求到飞书 API，委托 rawLarkRequest 处理。
	*/
	async rawRequest(path, options) {
		return rawLarkRequest({
			brand: this.account.brand,
			path,
			...options
		});
	}
	/**
	* 识别飞书服务端错误码并转换为结构化错误。
	*
	* - LARK_ERROR.APP_SCOPE_MISSING (99991672) → AppScopeMissingError（清缓存后抛出）
	* - LARK_ERROR.USER_SCOPE_INSUFFICIENT (99991679) → UserScopeInsufficientError
	*/
	rethrowStructuredError(err, apiName, effectiveScopes, userOpenId, tokenType) {
		const code = err?.code ?? err?.response?.data?.code;
		if (code === LARK_ERROR.APP_SCOPE_MISSING) {
			invalidateAppScopeCache(this.account.appId);
			throw new AppScopeMissingError({
				apiName,
				scopes: effectiveScopes,
				appId: this.account.appId
			}, "all", tokenType);
		}
		if (code === LARK_ERROR.USER_SCOPE_INSUFFICIENT && userOpenId) throw new UserScopeInsufficientError(userOpenId, {
			apiName,
			scopes: effectiveScopes
		});
	}
};
/**
* 从配置创建 {@link ToolClient}。
*
* 自动从当前 {@link LarkTicket} 解析 accountId 和 senderOpenId。
* 如果 LarkTicket 不可用（如非消息场景），回退到 `accountIndex`
* 指定的账号。
*
* @param config - OpenClaw 配置对象
* @param accountIndex - 回退账号索引（默认 0）
*/
function createToolClient(config, accountIndex = 0) {
	const ticket = getTicket();
	let account;
	if (ticket?.accountId) {
		const resolved = getLarkAccount(config, ticket.accountId);
		if (!resolved.configured) throw new Error(`Feishu account "${ticket.accountId}" is not configured (missing appId or appSecret). Please check channels.feishu.accounts.${ticket.accountId} in your config.`);
		if (!resolved.enabled) throw new Error(`Feishu account "${ticket.accountId}" is disabled. Set channels.feishu.accounts.${ticket.accountId}.enabled to true, or remove it to use defaults.`);
		account = resolved;
	}
	if (!account) {
		const accounts = getEnabledLarkAccounts(config);
		if (accounts.length === 0) throw new Error("No enabled Feishu accounts configured. Please add appId and appSecret in config under channels.feishu");
		if (accountIndex >= accounts.length) throw new Error(`Requested account index ${accountIndex} but only ${accounts.length} accounts available`);
		const fallback = accounts[accountIndex];
		if (!fallback.configured) throw new Error(`Account at index ${accountIndex} is not fully configured (missing appId or appSecret)`);
		account = fallback;
	}
	const larkClient = LarkClient.fromAccount(account);
	return new ToolClient({
		account,
		senderOpenId: ticket?.senderOpenId,
		sdk: larkClient.sdk,
		config
	});
}
//#endregion
//#region src/core/domains.ts
/** 开放平台域名 (API & 权限管理页面) */
function openPlatformDomain(brand) {
	return brand === "lark" ? "https://open.larksuite.com" : "https://open.feishu.cn";
}
/** Applink 域名 */
function applinkDomain(brand) {
	return brand === "lark" ? "https://applink.larksuite.com" : "https://applink.feishu.cn";
}
/** 主站域名 (文档、表格等用户可见链接) */
function wwwDomain(brand) {
	return brand === "lark" ? "https://www.larksuite.com" : "https://www.feishu.cn";
}
/** MCP 服务域名 */
function mcpDomain(brand) {
	return brand === "lark" ? "https://mcp.larksuite.com" : "https://mcp.feishu.cn";
}
//#endregion
//#region src/commands/doctor.ts
/**
* Resolve the global config for cross-account operations.
*
* Plugin commands receive an account-scoped config where `channels.feishu`
* has been replaced with the merged per-account config (the `accounts` map
* is stripped by `baseConfig()`).  Commands that enumerate all accounts
* need the original global config to see the full `accounts` map.
*/
function resolveGlobalConfig$1(config) {
	return LarkClient.globalConfig ?? config;
}
const T$2 = {
	zh_cn: {
		notSet: "(未设置)",
		legacyNotDisabled: "❌ **旧版插件**: 检测到旧版官方插件未禁用\n👉 请依次运行命令：\n```\nopenclaw config set plugins.entries.feishu.enabled false --json\nopenclaw gateway restart\n```",
		legacyRunCmds: "👉 请依次运行命令：",
		legacyDisabled: "✅ **旧版插件**: 已禁用",
		credentials: "✅ **凭证完整性**",
		accountEnabled: "✅ **账户启用**: 已启用",
		apiOk: "✅ **API 连通性**: 连接成功",
		apiFail: "❌ **API 连通性**: 连接失败",
		apiError: "❌ **API 连通性**: 探测异常",
		toolsOk: "✅ 飞书工具加载暂未发现异常",
		toolsWarnProfile: (profile) => `⚠️ **工具基础允许列表**: 当前为 \`${profile}\`，飞书工具可能无法加载。可以按需修改配置：`,
		toolsDocRef: "📖 参考文档",
		allPermsGranted: (count) => `全部 ${count} 个必需权限已开通`,
		missingPermsPrefix: "缺少",
		missingPermsSuffix: "个必需权限。需应用管理员申请开通",
		cannotQueryPerms: "无法查询应用权限状态。原因：未开通 application:application:self_manage 权限",
		cannotQueryPermsGeneric: "无法查询应用权限状态。",
		suggestCheckPerm: "建议检查 application:application:self_manage 权限",
		adminApply: "需应用管理员申请开通",
		apply: "申请",
		permTableHeader: "| 权限名称 | 应用已开通 | 用户已授权 |",
		authStatusLabel: "**授权状态**",
		userTotal: "共 1 个用户",
		valid: "有效",
		needRefresh: "需刷新",
		expired: "已过期",
		tokenRefreshLabel: "**Token 自动刷新**",
		tokenRefreshOn: "✓ 已开启自动刷新 (1/1 个用户)",
		tokenRefreshOff: "✗ 未开启自动刷新，Token 将在 2 小时后过期",
		noUserAuth: "⚠️ **暂无用户授权**",
		noUserAuthDesc: "尚未有用户通过 OAuth 授权。用户首次使用需以用户身份的功能时，会自动触发授权流程。",
		permCompareLabel: "**权限对照**",
		permInsufficient: "**用户身份权限不足**",
		userCountLabel: "已授权",
		noAuthLabel: "暂无授权",
		appMissingUserPerms: (count) => `💡 应用缺少 ${count} 个用户身份权限。需应用管理员申请开通`,
		permCompareSummary: (appCount, total, userPart) => `应用 **${appCount}/${total}** 已开通，用户 **${userPart}**`,
		userReauth: "💡 用户需要重新授权以获得完整权限，可以向机器人发送消息 \"**/feishu auth**\"",
		userNeedsOAuth: "💡 用户需要进行 OAuth 授权，可以向机器人发送消息 \"**/feishu auth**\"",
		userPermFailed: "用户权限检查失败",
		userPermFailedNoSelfManage: "用户权限检查失败：无法查询应用权限。原因：未开通 application:application:self_manage 权限",
		reportTitle: "### 飞书插件诊断",
		pluginVersionLabel: "插件版本",
		diagTimeLabel: "诊断时间",
		noAccounts: "❌ **错误**: 未找到已启用的飞书账户\n\n请在 OpenClaw 配置文件中配置飞书账户并启用。",
		accountNotFoundPrefix: "❌ **错误**: 未找到账户",
		enabledAccountsLabel: "当前已启用的账户",
		toolsCheckPass: "#### ✅ 工具配置检查通过",
		toolsCheckWarn: "#### ⚠️ 工具配置检查异常",
		accountPrefix: "### 账户",
		envCheckPass: "#### ✅ 环境信息检查通过",
		envCheckFail: "#### ❌ 环境信息检查未通过",
		appPermPass: "#### ✅ 应用身份权限检查通过",
		appPermFail: "#### ❌ 应用身份权限检查未通过",
		userPermPass: "#### ✅ 用户身份权限检查通过",
		userPermFail: "#### ❌ 用户身份权限检查未通过"
	},
	en_us: {
		notSet: "(not set)",
		legacyNotDisabled: "❌ **Legacy Plugin**: Legacy official plugin is not disabled\n👉 Please run the following commands:\n```\nopenclaw config set plugins.entries.feishu.enabled false --json\nopenclaw gateway restart\n```",
		legacyRunCmds: "👉 Please run the following commands:",
		legacyDisabled: "✅ **Legacy Plugin**: Disabled",
		credentials: "✅ **Credentials**",
		accountEnabled: "✅ **Account**: Enabled",
		apiOk: "✅ **API Connectivity**: Connected",
		apiFail: "❌ **API Connectivity**: Connection failed",
		apiError: "❌ **API Connectivity**: Probe error",
		toolsOk: "✅ Feishu tools loading: No issues found",
		toolsWarnProfile: (profile) => `⚠️ **Tool Allowlist**: Currently set to \`${profile}\`. Feishu tools may not load properly. Update configuration as needed:`,
		toolsDocRef: "📖 Documentation",
		allPermsGranted: (count) => `All ${count} required permissions granted`,
		missingPermsPrefix: "Missing",
		missingPermsSuffix: "required permissions. Admin needs to apply",
		cannotQueryPerms: "Unable to query app permissions. Reason: Missing application:application:self_manage permission",
		cannotQueryPermsGeneric: "Unable to query app permissions.",
		suggestCheckPerm: "Please check application:application:self_manage permission",
		adminApply: "Admin needs to apply",
		apply: "Apply",
		permTableHeader: "| Permission | App Granted | User Authorized |",
		authStatusLabel: "**Auth Status**",
		userTotal: "1 user total",
		valid: "Valid",
		needRefresh: "Needs refresh",
		expired: "Expired",
		tokenRefreshLabel: "**Token Auto-Refresh**",
		tokenRefreshOn: "✓ Auto-refresh enabled (1/1 users)",
		tokenRefreshOff: "✗ Auto-refresh not enabled. Token will expire in 2 hours",
		noUserAuth: "⚠️ **No User Authorization**",
		noUserAuthDesc: "No user has authorized via OAuth yet. The authorization flow will be triggered automatically when a user first uses a feature requiring user identity.",
		permCompareLabel: "**Permission Comparison**",
		permInsufficient: "**Insufficient User Permissions**",
		userCountLabel: "authorized",
		noAuthLabel: "not authorized",
		appMissingUserPerms: (count) => `💡 App is missing ${count} user-identity permissions. Admin needs to apply`,
		permCompareSummary: (appCount, total, userPart) => `App **${appCount}/${total}** granted, User **${userPart}**`,
		userReauth: "💡 User needs to re-authorize for full permissions. Send message to bot: \"**/feishu auth**\"",
		userNeedsOAuth: "💡 User needs OAuth authorization. Send message to bot: \"**/feishu auth**\"",
		userPermFailed: "User permission check failed",
		userPermFailedNoSelfManage: "User permission check failed: Unable to query app permissions. Reason: Missing application:application:self_manage permission",
		reportTitle: "### Feishu Plugin Diagnostics",
		pluginVersionLabel: "Plugin version",
		diagTimeLabel: "Diagnosis time",
		noAccounts: "❌ **Error**: No enabled Feishu accounts found\n\nPlease configure and enable a Feishu account in the OpenClaw configuration.",
		accountNotFoundPrefix: "❌ **Error**: Account not found",
		enabledAccountsLabel: "Currently enabled accounts",
		toolsCheckPass: "#### ✅ Tool Configuration Check Passed",
		toolsCheckWarn: "#### ⚠️ Tool Configuration Check Warning",
		accountPrefix: "### Account",
		envCheckPass: "#### ✅ Environment Check Passed",
		envCheckFail: "#### ❌ Environment Check Failed",
		appPermPass: "#### ✅ App Permission Check Passed",
		appPermFail: "#### ❌ App Permission Check Failed",
		userPermPass: "#### ✅ User Permission Check Passed",
		userPermFail: "#### ❌ User Permission Check Failed"
	}
};
/**
* 格式化时间戳为 "YYYY-MM-DD HH:mm:ss"
*/
function formatTimestamp(date) {
	return date.toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" }).replace("T", " ");
}
/**
* 获取所有工具动作需要的唯一 scope 列表（从 diagnose.ts 复制）
*/
function getAllToolScopes() {
	const scopesSet = /* @__PURE__ */ new Set();
	for (const scopes of Object.values(TOOL_SCOPES)) for (const scope of scopes) scopesSet.add(scope);
	return Array.from(scopesSet).sort();
}
/**
* 掩码敏感信息（appSecret）
*/
function maskSecret$1(secret, locale) {
	if (!secret) return T$2[locale].notSet;
	if (secret.length <= 4) return "****";
	return secret.slice(0, 4) + "****";
}
/**
* 检查基础信息和账号状态
*/
async function checkBasicInfo(account, config, locale) {
	const t = T$2[locale];
	const lines = [];
	let status = "pass";
	const feishuEntry = config.plugins?.entries?.feishu;
	if (feishuEntry && feishuEntry.enabled !== false) {
		status = "fail";
		lines.push(t.legacyNotDisabled);
	} else lines.push(t.legacyDisabled);
	lines.push(`${t.credentials}: appId: ${account.appId}, appSecret: ${maskSecret$1(account.appSecret, locale)}`);
	lines.push(t.accountEnabled);
	try {
		const probeResult = await probeFeishu({
			accountId: account.accountId,
			appId: account.appId,
			appSecret: account.appSecret,
			brand: account.brand
		});
		if (probeResult.ok) lines.push(t.apiOk);
		else {
			status = "fail";
			lines.push(`${t.apiFail} - ${probeResult.error}`);
		}
	} catch (err) {
		status = "fail";
		lines.push(`${t.apiError} - ${err instanceof Error ? err.message : String(err)}`);
	}
	return {
		status,
		markdown: lines.join("\n")
	};
}
const INCOMPLETE_PROFILES = new Set([
	"minimal",
	"coding",
	"messaging"
]);
function checkToolsProfile(config, locale) {
	const t = T$2[locale];
	const profile = config.tools?.profile;
	if (!profile) return {
		status: "pass",
		markdown: t.toolsOk
	};
	if (INCOMPLETE_PROFILES.has(profile)) return {
		status: "warn",
		markdown: `${t.toolsWarnProfile(profile)}\n\`\`\`
openclaw config set tools.profile "full"
openclaw gateway restart
\`\`\`
${t.toolsDocRef}: https://docs.openclaw.ai/zh-CN/tools`
	};
	return {
		status: "pass",
		markdown: t.toolsOk
	};
}
/**
* 检查应用权限状态
*/
async function checkAppPermissions(account, sdk, locale) {
	const t = T$2[locale];
	const { appId } = account;
	const openDomain = openPlatformDomain(account.brand);
	try {
		const requiredMissing = missingScopes(await getAppGrantedScopes(sdk, appId, "tenant"), Array.from(REQUIRED_APP_SCOPES));
		if (requiredMissing.length === 0) return {
			status: "pass",
			markdown: t.allPermsGranted(REQUIRED_APP_SCOPES.length),
			missingScopes: []
		};
		const lines = [];
		let applyUrl = `${openDomain}/app/${appId}/auth?op_from=feishu-openclaw&token_type=tenant`;
		if (requiredMissing.length < 20) applyUrl = `${openDomain}/app/${appId}/auth?q=${encodeURIComponent(requiredMissing.join(","))}&op_from=feishu-openclaw&token_type=tenant`;
		lines.push(`${t.missingPermsPrefix} ${requiredMissing.length} ${t.missingPermsSuffix} [${t.apply}](${applyUrl})`);
		lines.push("");
		for (const scope of requiredMissing) lines.push(`- ${scope}`);
		return {
			status: "fail",
			markdown: lines.join("\n"),
			missingScopes: requiredMissing
		};
	} catch (err) {
		const applyUrl = `${openDomain}/app/${appId}/auth?q=application:application:self_manage&op_from=feishu-openclaw&token_type=tenant`;
		if (err instanceof AppScopeCheckFailedError) return {
			status: "fail",
			markdown: `${t.cannotQueryPerms}\n\n${t.adminApply} [${t.apply}](${applyUrl})`,
			missingScopes: []
		};
		return {
			status: "fail",
			markdown: `${t.cannotQueryPermsGeneric}${err instanceof Error ? err.message : String(err)}\n\n${t.suggestCheckPerm} [${t.apply}](${applyUrl})`,
			missingScopes: []
		};
	}
}
/**
* 生成权限对照表
*/
function generatePermissionTable(appGrantedScopes, userGrantedScopes, hasValidUser, locale) {
	let allScopes = getAllToolScopes();
	allScopes = filterSensitiveScopes(allScopes);
	const appSet = new Set(appGrantedScopes);
	const userSet = new Set(userGrantedScopes);
	const lines = [];
	lines.push(T$2[locale].permTableHeader);
	lines.push("|----------|-----------|-----------|");
	for (const scope of allScopes) {
		const appGranted = appSet.has(scope) ? "✅" : "❌";
		const userGranted = !hasValidUser ? "➖" : userSet.has(scope) ? "✅" : "❌";
		lines.push(`| ${scope} | ${appGranted} | ${userGranted} |`);
	}
	return lines.join("\n");
}
/**
* 检查用户权限状态
*/
async function checkUserPermissions(account, sdk, locale) {
	const t = T$2[locale];
	const { appId } = account;
	const openDomain = openPlatformDomain(account.brand);
	const lines = [];
	try {
		const ownerId = await getAppOwnerFallback(account, sdk);
		const token = ownerId ? await getStoredToken(appId, ownerId) : null;
		const hasUserAuth = !!token;
		let authStatus = "warn";
		let refreshStatus = "warn";
		let validCount = 0;
		let scopes = [];
		let userTokenStatus = "expired";
		let userMissing = [];
		const appUserScopes = await getAppGrantedScopes(sdk, appId, "user");
		let allScopes = getAllToolScopes();
		allScopes = filterSensitiveScopes(allScopes);
		const appGrantedCount = appUserScopes.filter((s) => allScopes.includes(s)).length;
		if (hasUserAuth) {
			const status = tokenStatus(token);
			userTokenStatus = status;
			scopes = token.scope.split(" ").filter(Boolean);
			validCount = status === "valid" ? 1 : 0;
			const needsRefreshCount = status === "needs_refresh" ? 1 : 0;
			const expiredCount = status === "expired" ? 1 : 0;
			authStatus = expiredCount > 0 ? "warn" : validCount === 1 ? "pass" : "warn";
			const authEmoji = authStatus === "pass" ? "✅" : "⚠️";
			lines.push(`${authEmoji} ${t.authStatusLabel}: ${t.userTotal} | ✓ ${t.valid}: ${validCount}, ⟳ ${t.needRefresh}: ${needsRefreshCount}, ✗ ${t.expired}: ${expiredCount}`);
			const hasOfflineAccess = scopes.includes("offline_access");
			refreshStatus = hasOfflineAccess ? "pass" : "warn";
			const refreshEmoji = refreshStatus === "pass" ? "✅" : "⚠️";
			lines.push(`${refreshEmoji} ${t.tokenRefreshLabel}: ${hasOfflineAccess ? t.tokenRefreshOn : t.tokenRefreshOff}`);
		} else {
			lines.push(t.noUserAuth);
			lines.push("");
			lines.push(t.noUserAuthDesc);
			lines.push("");
		}
		const userGrantedCount = validCount === 1 ? scopes.filter((s) => allScopes.includes(s)).length : 0;
		if (hasUserAuth && validCount === 1) {
			const scopeSet = new Set(scopes);
			userMissing = allScopes.filter((s) => !scopeSet.has(s));
		}
		const tableStatus = appGrantedCount < allScopes.length || userGrantedCount < allScopes.length ? appGrantedCount < allScopes.length ? "fail" : "warn" : "pass";
		const tableEmoji = tableStatus === "pass" ? "✅" : tableStatus === "warn" ? "⚠️" : "❌";
		if (validCount === 0) lines.push(`${t.permCompareLabel}: ${t.permCompareSummary(appGrantedCount, allScopes.length, t.noAuthLabel)}`);
		else if (userGrantedCount < allScopes.length) lines.push(`${tableEmoji} ${t.permInsufficient}: ${t.permCompareSummary(appGrantedCount, allScopes.length, `${userGrantedCount}/${allScopes.length} ${t.userCountLabel}`)}`);
		else lines.push(`${tableEmoji} ${t.permCompareLabel}: ${t.permCompareSummary(appGrantedCount, allScopes.length, `${userGrantedCount}/${allScopes.length} ${t.userCountLabel}`)}`);
		lines.push("");
		if (appGrantedCount < allScopes.length) {
			const appMissingScopes = allScopes.filter((s) => !appUserScopes.includes(s));
			let appApplyUrl = `${openDomain}/app/${appId}/auth?op_from=feishu-openclaw&token_type=user`;
			if (appMissingScopes.length < 20) appApplyUrl = `${openDomain}/app/${appId}/auth?q=${encodeURIComponent(appMissingScopes.join(","))}&op_from=feishu-openclaw&token_type=user`;
			lines.push(`${t.appMissingUserPerms(appMissingScopes.length)} [${t.apply}](${appApplyUrl})`);
		}
		if (userGrantedCount < allScopes.length && validCount > 0) {
			lines.push(t.userReauth);
			lines.push("");
		} else if (!hasUserAuth) {
			lines.push(t.userNeedsOAuth);
			lines.push("");
		}
		const table = generatePermissionTable(appUserScopes, validCount === 1 ? scopes : [], validCount === 1, locale);
		lines.push(table);
		return {
			status: tableStatus === "fail" ? "fail" : authStatus === "warn" || refreshStatus === "warn" || tableStatus === "warn" ? "warn" : "pass",
			markdown: lines.join("\n"),
			hasAuth: hasUserAuth,
			tokenExpired: userTokenStatus === "expired",
			missingUserScopes: userMissing
		};
	} catch (err) {
		const applyUrl = `${openDomain}/app/${appId}/auth?q=application:application:self_manage&op_from=feishu-openclaw&token_type=tenant`;
		if (err instanceof AppScopeCheckFailedError) return {
			status: "warn",
			markdown: `${t.userPermFailedNoSelfManage}\n\n${t.adminApply} [${t.apply}](${applyUrl})`,
			hasAuth: false,
			tokenExpired: false,
			missingUserScopes: []
		};
		return {
			status: "warn",
			markdown: `${t.userPermFailed}: ${err instanceof Error ? err.message : String(err)}`,
			hasAuth: false,
			tokenExpired: false,
			missingUserScopes: []
		};
	}
}
/**
* 运行飞书插件诊断，生成 Markdown 格式报告。
*
* @param config - OpenClaw 配置
* @param currentAccountId - 当前发送命令的机器人账号 ID（若有则只诊断该账号）
* @param locale - 输出语言，默认 zh_cn
*/
async function runFeishuDoctor(config, currentAccountId, locale = "zh_cn") {
	const t = T$2[locale];
	const lines = [];
	const allAccounts = getEnabledLarkAccounts(resolveGlobalConfig$1(config));
	if (allAccounts.length === 0) return t.noAccounts;
	const accounts = currentAccountId ? allAccounts.filter((a) => a.accountId === currentAccountId) : allAccounts;
	if (accounts.length === 0) return `${t.accountNotFoundPrefix} "${currentAccountId}"\n\n${t.enabledAccountsLabel}: ${allAccounts.map((a) => a.accountId).join(", ")}`;
	lines.push(t.reportTitle);
	lines.push("");
	lines.push(`${t.pluginVersionLabel}: ${getPluginVersion()}  |  ${t.diagTimeLabel}: ${formatTimestamp(/* @__PURE__ */ new Date())}`);
	lines.push("");
	lines.push("---");
	lines.push("");
	const toolsResult = checkToolsProfile(config, locale);
	const toolsTitle = toolsResult.status === "pass" ? t.toolsCheckPass : t.toolsCheckWarn;
	lines.push(toolsTitle);
	lines.push("");
	lines.push(toolsResult.markdown);
	lines.push("");
	lines.push("---");
	lines.push("");
	for (let i = 0; i < accounts.length; i++) {
		const account = accounts[i];
		const sdk = LarkClient.fromAccount(account).sdk;
		const accountLabel = account.accountId || account.appId;
		if (accounts.length > 1) {
			lines.push(`${t.accountPrefix} ${i + 1}: ${accountLabel}`);
			lines.push("");
		}
		const basicInfoResult = await checkBasicInfo(account, config, locale);
		const basicTitle = basicInfoResult.status === "pass" ? t.envCheckPass : t.envCheckFail;
		lines.push(basicTitle);
		lines.push("");
		lines.push(basicInfoResult.markdown);
		lines.push("");
		lines.push("---");
		lines.push("");
		const appResult = await checkAppPermissions(account, sdk, locale);
		const appTitle = appResult.status === "pass" ? t.appPermPass : t.appPermFail;
		lines.push(appTitle);
		lines.push("");
		lines.push(appResult.markdown);
		lines.push("");
		lines.push("---");
		lines.push("");
		const userResult = await checkUserPermissions(account, sdk, locale);
		const userTitle = userResult.status === "pass" ? t.userPermPass : t.userPermFail;
		lines.push(userTitle);
		lines.push("");
		lines.push(userResult.markdown);
		lines.push("");
		if (i < accounts.length - 1) {
			lines.push("---");
			lines.push("");
		}
	}
	return lines.join("\n");
}
/**
* 运行飞书插件诊断，同时生成中英双语 Markdown 报告。
* 用于飞书 channel 的多语言 post 发送。
*/
async function runFeishuDoctorI18n(config, currentAccountId) {
	const [zh_cn, en_us] = await Promise.all([runFeishuDoctor(config, currentAccountId, "zh_cn"), runFeishuDoctor(config, currentAccountId, "en_us")]);
	return {
		zh_cn,
		en_us
	};
}
//#endregion
//#region src/commands/auth.ts
const T$1 = {
	zh_cn: {
		noIdentity: "❌ 无法获取用户身份，请在飞书对话中使用此命令",
		accountIncomplete: (accountId) => `❌ 账号 ${accountId} 配置不完整`,
		missingSelfManage: (link) => `❌ 应用缺少核心权限 application:application:self_manage，无法查询可授权 scope 列表。\n\n请管理员在飞书开放平台开通此权限后重试：[申请权限](${link})`,
		ownerOnly: "❌ 此命令仅限应用 owner 执行\n\n如需授权，请联系应用管理员。",
		missingOfflineAccess: (link) => `❌ 应用缺少核心权限 offline_access，无法查询可授权 scope 列表。\n\n请管理员在飞书开放平台开通此权限后重试：[申请权限](${link})`,
		noUserScopes: "当前应用未开通任何用户级权限，无需授权。",
		allAuthorized: (count) => `✅ 您已授权所有可用权限（共 ${count} 个），无需重复授权。`,
		authSent: "✅ 已发送授权请求"
	},
	en_us: {
		noIdentity: "❌ Unable to identify user. Please use this command in a Feishu conversation.",
		accountIncomplete: (accountId) => `❌ Account ${accountId} configuration is incomplete`,
		missingSelfManage: (link) => `❌ App is missing the core permission application:application:self_manage and cannot query available scopes.\n\nPlease ask an admin to grant this permission on the Feishu Open Platform: [Apply](${link})`,
		ownerOnly: "❌ This command is restricted to the app owner.\n\nPlease contact the app admin for authorization.",
		missingOfflineAccess: (link) => `❌ App is missing the core permission offline_access and cannot query available scopes.\n\nPlease ask an admin to grant this permission on the Feishu Open Platform: [Apply](${link})`,
		noUserScopes: "No user-level permissions are enabled for this app. Authorization is not needed.",
		allAuthorized: (count) => `✅ You have authorized all available permissions (${count} total). No re-authorization needed.`,
		authSent: "✅ Authorization request sent"
	}
};
/**
* Format an AuthResult into a locale-specific message string.
*/
function formatAuthResult(result, locale) {
	const t = T$1[locale];
	switch (result.kind) {
		case "no_identity": return t.noIdentity;
		case "account_incomplete": return t.accountIncomplete(result.accountId);
		case "missing_self_manage": return t.missingSelfManage(result.link);
		case "owner_only": return t.ownerOnly;
		case "missing_offline_access": return t.missingOfflineAccess(result.link);
		case "no_user_scopes": return t.noUserScopes;
		case "all_authorized": return t.allAuthorized(result.count);
		case "auth_sent": return t.authSent;
	}
}
/**
* Execute the auth command logic, including side-effects (triggerOnboarding).
* Returns a discriminated result that can be formatted into any locale.
*/
async function executeFeishuAuth(config) {
	const ticket = getTicket();
	const senderOpenId = ticket?.senderOpenId;
	if (!senderOpenId) return { kind: "no_identity" };
	const acct = getLarkAccount(config, ticket.accountId);
	if (!acct.configured) return {
		kind: "account_incomplete",
		accountId: ticket.accountId
	};
	const sdk = LarkClient.fromAccount(acct).sdk;
	const { appId } = acct;
	const openDomain = openPlatformDomain(acct.brand);
	try {
		await getAppInfo(sdk, appId);
	} catch {
		return {
			kind: "missing_self_manage",
			link: `${openDomain}/app/${appId}/auth?q=application:application:self_manage&op_from=feishu-openclaw&token_type=tenant`
		};
	}
	try {
		await assertOwnerAccessStrict(acct, sdk, senderOpenId);
	} catch (err) {
		if (err instanceof OwnerAccessDeniedError) return { kind: "owner_only" };
		throw err;
	}
	let appScopes;
	try {
		appScopes = await getAppGrantedScopes(sdk, appId, "user");
	} catch {
		return {
			kind: "missing_self_manage",
			link: `${openDomain}/app/${appId}/auth?q=application:application:self_manage&op_from=feishu-openclaw&token_type=tenant`
		};
	}
	const allScopes = await getAppGrantedScopes(sdk, appId);
	if (allScopes.length > 0 && !allScopes.includes("offline_access")) return {
		kind: "missing_offline_access",
		link: `${openDomain}/app/${appId}/auth?q=offline_access&op_from=feishu-openclaw&token_type=user`
	};
	appScopes = filterSensitiveScopes(appScopes);
	if (appScopes.length === 0) return { kind: "no_user_scopes" };
	const existing = await getStoredToken(appId, senderOpenId);
	const tokenValid = existing && tokenStatus(existing) !== "expired";
	const grantedScopes = new Set(tokenValid ? existing.scope?.split(/\s+/).filter(Boolean) ?? [] : []);
	if (appScopes.filter((s) => !grantedScopes.has(s)).length === 0) return {
		kind: "all_authorized",
		count: appScopes.length
	};
	await triggerOnboarding({
		cfg: config,
		userOpenId: senderOpenId,
		accountId: ticket.accountId
	});
	return { kind: "auth_sent" };
}
/**
* 执行飞书用户权限批量授权命令
* 直接调用 triggerOnboarding()，包含 owner 检查
*/
async function runFeishuAuth(config, locale = "zh_cn") {
	return formatAuthResult(await executeFeishuAuth(config), locale);
}
/**
* 运行飞书授权命令，同时生成中英双语结果。
* 副作用（triggerOnboarding）只执行一次，结果格式化为双语文本。
*/
async function runFeishuAuthI18n(config) {
	const result = await executeFeishuAuth(config);
	return {
		zh_cn: formatAuthResult(result, "zh_cn"),
		en_us: formatAuthResult(result, "en_us")
	};
}
//#endregion
//#region src/core/tools-config.ts
/**
* The default tools configuration.
*
* By default every non-destructive capability is enabled.  The `perm` flag
* (permission management) defaults to `false` because granting / revoking
* permissions is a privileged operation that admins should opt into
* explicitly.
*/
const DEFAULT_TOOLS_CONFIG = {
	doc: true,
	wiki: true,
	drive: true,
	scopes: true,
	perm: false,
	mail: true,
	sheets: true,
	okr: false
};
/**
* Merge a partial tools configuration with `DEFAULT_TOOLS_CONFIG`.
*
* Fields present in the input take precedence; anything absent falls back
* to the default value.
*/
function resolveToolsConfig(cfg) {
	if (!cfg) return { ...DEFAULT_TOOLS_CONFIG };
	return {
		doc: cfg.doc ?? DEFAULT_TOOLS_CONFIG.doc,
		wiki: cfg.wiki ?? DEFAULT_TOOLS_CONFIG.wiki,
		drive: cfg.drive ?? DEFAULT_TOOLS_CONFIG.drive,
		perm: cfg.perm ?? DEFAULT_TOOLS_CONFIG.perm,
		scopes: cfg.scopes ?? DEFAULT_TOOLS_CONFIG.scopes,
		mail: cfg.mail ?? DEFAULT_TOOLS_CONFIG.mail,
		sheets: cfg.sheets ?? DEFAULT_TOOLS_CONFIG.sheets,
		okr: cfg.okr ?? DEFAULT_TOOLS_CONFIG.okr
	};
}
/**
* 合并多个账户的工具配置（取并集）。
*
* 工具注册是全局的（启动时注册一次），只要任意一个账户启用了某工具，
* 该工具就应被注册。执行时由 LarkTicket 路由到具体账户。
*/
function resolveAnyEnabledToolsConfig(accounts) {
	const merged = {
		doc: false,
		wiki: false,
		drive: false,
		perm: false,
		scopes: false,
		mail: false,
		sheets: false,
		okr: false
	};
	for (const account of accounts) {
		const cfg = resolveToolsConfig(account.config.tools);
		merged.doc = merged.doc || cfg.doc;
		merged.wiki = merged.wiki || cfg.wiki;
		merged.drive = merged.drive || cfg.drive;
		merged.perm = merged.perm || cfg.perm;
		merged.scopes = merged.scopes || cfg.scopes;
		merged.mail = merged.mail || cfg.mail;
		merged.sheets = merged.sheets || cfg.sheets;
		merged.okr = merged.okr || cfg.okr;
	}
	return merged;
}
/**
* Check whether a string matches any of the given patterns.
* Supports trailing `*` as a simple wildcard (e.g., `feishu_calendar_*`).
*/
function matchesAnyPattern(value, patterns) {
	for (const pattern of patterns) {
		if (pattern === "*") return true;
		if (pattern.endsWith("*")) {
			if (value.startsWith(pattern.slice(0, -1))) return true;
		} else if (value === pattern) return true;
	}
	return false;
}
/**
* 检查工具是否应该被注册（channel 级别的 tools.deny 检查）。
*
* 从 `channels.feishu.tools.deny` 读取禁用列表，支持通配符模式。
*
* @param cfg - OpenClaw 配置对象
* @param toolName - 工具名称（如 `feishu_im_user_message`）
* @returns `true` 如果应该注册，`false` 如果应该跳过
*
* @example
* ```typescript
* // 配置示例：
* // channels.feishu.tools.deny: ["feishu_im_user_message", "feishu_calendar_*"]
*
* shouldRegisterTool(cfg, "feishu_im_user_message")  // false
* shouldRegisterTool(cfg, "feishu_calendar_event")   // false (匹配通配符)
* shouldRegisterTool(cfg, "feishu_task_task")        // true
* ```
*/
function shouldRegisterTool(cfg, toolName) {
	const denyList = (cfg.channels?.feishu)?.["tools"]?.["deny"];
	if (Array.isArray(denyList) && denyList.length > 0) {
		if (matchesAnyPattern(toolName, denyList)) return false;
	}
	return true;
}
//#endregion
//#region src/commands/diagnose.ts
/**
* Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
* SPDX-License-Identifier: MIT
*
* Diagnostic module for the Lark/Feishu plugin.
*
* Collects environment info, account configuration, API connectivity,
* app permissions, tool registration state, and recent error logs into
* a structured report that users can share with developers for
* remote troubleshooting.
*/
/**
* Resolve the global config for cross-account operations.
* See doctor.ts for rationale.
*/
function resolveGlobalConfig(config) {
	return LarkClient.globalConfig ?? config;
}
const PLUGIN_VERSION = "2026.2.10";
const LOG_READ_BYTES = 256 * 1024;
const MAX_ERROR_LINES = 20;
/** Matches a timestamped log line: 2026-02-13T09:23:35.038Z [level]: ... */
const TIMESTAMPED_LINE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const ERROR_LEVEL_RE = /\[error\]|\[warn\]/i;
function maskSecret(secret) {
	if (!secret) return "(未设置)";
	if (secret.length <= 4) return "****";
	return secret.slice(0, 4) + "****";
}
async function extractRecentErrors(logPath) {
	try {
		await fs$1.access(logPath);
	} catch {
		return [];
	}
	try {
		const stat = await fs$1.stat(logPath);
		const readSize = Math.min(stat.size, LOG_READ_BYTES);
		const fd = await fs$1.open(logPath, "r");
		try {
			const buffer = Buffer.alloc(readSize);
			await fd.read(buffer, 0, readSize, Math.max(0, stat.size - readSize));
			return buffer.toString("utf-8").split("\n").filter(Boolean).filter((line) => TIMESTAMPED_LINE_RE.test(line) && ERROR_LEVEL_RE.test(line)).slice(-MAX_ERROR_LINES);
		} finally {
			await fd.close();
		}
	} catch {
		return [];
	}
}
async function checkAppScopes(client) {
	const res = await client.application.scope.list({});
	assertLarkOk(res);
	const scopes = res.data?.scopes ?? [];
	const granted = scopes.filter((s) => s.grant_status === 1);
	const pending = scopes.filter((s) => s.grant_status !== 1);
	return {
		granted: granted.length,
		pending: pending.length,
		summary: `${granted.length} 已授权, ${pending.length} 待授权`
	};
}
function detectRegisteredTools(config) {
	const accounts = getEnabledLarkAccounts(config);
	if (accounts.length === 0) return [];
	const toolsCfg = resolveAnyEnabledToolsConfig(accounts);
	const tools = [];
	if (toolsCfg.doc) tools.push("feishu_doc");
	if (toolsCfg.scopes) tools.push("feishu_app_scopes");
	if (toolsCfg.wiki) tools.push("feishu_wiki");
	if (toolsCfg.drive) tools.push("feishu_drive");
	if (toolsCfg.perm) tools.push("feishu_perm");
	tools.push("feishu_bitable_get_meta", "feishu_bitable_list_fields", "feishu_bitable_list_records", "feishu_bitable_get_record", "feishu_bitable_create_record", "feishu_bitable_update_record");
	tools.push("feishu_task");
	tools.push("feishu_calendar");
	return tools;
}
async function diagnoseAccount(account) {
	const checks = [];
	const result = {
		accountId: account.accountId,
		name: account.name,
		enabled: account.enabled,
		configured: account.configured,
		appId: account.appId ?? "(未设置)",
		brand: account.brand,
		checks
	};
	checks.push({
		name: "凭证完整性",
		status: account.configured ? "pass" : "fail",
		message: account.configured ? `appId: ${account.appId}, appSecret: ${maskSecret(account.appSecret)}` : "缺少 appId 或 appSecret"
	});
	checks.push({
		name: "账户启用",
		status: account.enabled ? "pass" : "warn",
		message: account.enabled ? "已启用" : "已禁用"
	});
	if (!account.configured || !account.appId || !account.appSecret) {
		checks.push({
			name: "API 连通性",
			status: "skip",
			message: "凭证未配置，跳过"
		});
		return result;
	}
	try {
		const probeResult = await probeFeishu({
			accountId: account.accountId,
			appId: account.appId,
			appSecret: account.appSecret,
			brand: account.brand
		});
		checks.push({
			name: "API 连通性",
			status: probeResult.ok ? "pass" : "fail",
			message: probeResult.ok ? `连接成功` : `连接失败: ${probeResult.error}`
		});
		if (probeResult.ok) checks.push({
			name: "Bot 信息",
			status: probeResult.botName ? "pass" : "warn",
			message: probeResult.botName ? `${probeResult.botName} (${probeResult.botOpenId})` : "未获取到 Bot 名称"
		});
	} catch (err) {
		checks.push({
			name: "API 连通性",
			status: "fail",
			message: `探测异常: ${err instanceof Error ? err.message : String(err)}`
		});
	}
	try {
		const client = LarkClient.fromAccount(account).sdk;
		const scopesResult = await checkAppScopes(client);
		checks.push({
			name: "应用权限",
			status: scopesResult.pending > 0 ? "warn" : "pass",
			message: scopesResult.summary,
			details: scopesResult.pending > 0 ? "存在未授权的权限，可能影响部分功能" : void 0
		});
	} catch (err) {
		checks.push({
			name: "应用权限",
			status: "warn",
			message: `权限检查失败: ${formatLarkError(err)}`
		});
	}
	checks.push({
		name: "品牌配置",
		status: "pass",
		message: `brand: ${account.brand}`
	});
	return result;
}
async function runDiagnosis(params) {
	const { config } = params;
	const globalCfg = resolveGlobalConfig(config);
	const globalChecks = [];
	const nodeVer = parseInt(process.version.slice(1), 10);
	globalChecks.push({
		name: "Node.js 版本",
		status: nodeVer >= 18 ? "pass" : "warn",
		message: process.version,
		details: nodeVer < 18 ? "建议升级到 Node.js 18+" : void 0
	});
	const accountIds = getLarkAccountIds(globalCfg);
	globalChecks.push({
		name: "飞书账户数量",
		status: accountIds.length > 0 ? "pass" : "fail",
		message: `${accountIds.length} 个账户`
	});
	const logPath = path$1.join(os.homedir(), ".openclaw", "logs", "gateway.log");
	let logExists = false;
	try {
		await fs$1.access(logPath);
		logExists = true;
	} catch {}
	globalChecks.push({
		name: "日志文件",
		status: logExists ? "pass" : "warn",
		message: logExists ? logPath : `未找到: ${logPath}`
	});
	const accountResults = [];
	for (const id of accountIds) {
		const result = await diagnoseAccount(getLarkAccount(globalCfg, id));
		accountResults.push(result);
	}
	const tools = detectRegisteredTools(globalCfg);
	const recentErrors = await extractRecentErrors(logPath);
	globalChecks.push({
		name: "最近错误日志",
		status: recentErrors.length > 0 ? "warn" : "pass",
		message: recentErrors.length > 0 ? `发现 ${recentErrors.length} 条错误` : "无最近错误"
	});
	const allChecks = [...globalChecks, ...accountResults.flatMap((a) => a.checks)];
	const hasFail = allChecks.some((c) => c.status === "fail");
	const hasWarn = allChecks.some((c) => c.status === "warn");
	return {
		timestamp: (/* @__PURE__ */ new Date()).toISOString(),
		environment: {
			nodeVersion: process.version,
			platform: process.platform,
			arch: process.arch,
			pluginVersion: PLUGIN_VERSION
		},
		accounts: accountResults,
		toolsRegistered: tools,
		recentErrors,
		overallStatus: hasFail ? "unhealthy" : hasWarn ? "degraded" : "healthy",
		checks: globalChecks
	};
}
const STATUS_LABEL = {
	pass: "[PASS]",
	warn: "[WARN]",
	fail: "[FAIL]",
	skip: "[SKIP]"
};
function formatCheck(c) {
	let line = `  ${STATUS_LABEL[c.status]} ${c.name}: ${c.message}`;
	if (c.details) line += `\n         ${c.details}`;
	return line;
}
function formatDiagReportText(report) {
	const lines = [];
	const sep = "====================================";
	lines.push(sep);
	lines.push("  飞书插件诊断报告");
	lines.push(`  ${report.timestamp}`);
	lines.push(sep);
	lines.push("");
	lines.push("【环境信息】");
	lines.push(`  Node.js:     ${report.environment.nodeVersion}`);
	lines.push(`  插件版本:    ${report.environment.pluginVersion}`);
	lines.push(`  系统:        ${report.environment.platform} ${report.environment.arch}`);
	lines.push("");
	lines.push("【全局检查】");
	for (const c of report.checks) lines.push(formatCheck(c));
	lines.push("");
	for (const acct of report.accounts) {
		lines.push(`【账户: ${acct.accountId}】`);
		if (acct.name) lines.push(`  名称:     ${acct.name}`);
		lines.push(`  App ID:   ${acct.appId}`);
		lines.push(`  品牌:     ${acct.brand}`);
		lines.push("");
		for (const c of acct.checks) lines.push(formatCheck(c));
		lines.push("");
	}
	lines.push("【工具注册】");
	if (report.toolsRegistered.length > 0) {
		lines.push(`  ${report.toolsRegistered.join(", ")}`);
		lines.push(`  共 ${report.toolsRegistered.length} 个`);
	} else lines.push("  无工具注册（未找到已配置的账户）");
	lines.push("");
	if (report.recentErrors.length > 0) {
		lines.push(`【最近错误】(${report.recentErrors.length} 条)`);
		for (let i = 0; i < report.recentErrors.length; i++) lines.push(`  ${i + 1}. ${report.recentErrors[i]}`);
		lines.push("");
	}
	const statusMap = {
		healthy: "HEALTHY",
		degraded: "DEGRADED (存在警告)",
		unhealthy: "UNHEALTHY (存在失败项)"
	};
	lines.push(sep);
	lines.push(`  总体状态: ${statusMap[report.overallStatus]}`);
	lines.push(sep);
	return lines.join("\n");
}
const ANSI = {
	reset: "\x1B[0m",
	bold: "\x1B[1m",
	green: "\x1B[32m",
	yellow: "\x1B[33m",
	red: "\x1B[31m",
	gray: "\x1B[90m"
};
const STATUS_LABEL_CLI = {
	pass: `${ANSI.green}[PASS]${ANSI.reset}`,
	warn: `${ANSI.yellow}[WARN]${ANSI.reset}`,
	fail: `${ANSI.red}[FAIL]${ANSI.reset}`,
	skip: `${ANSI.gray}[SKIP]${ANSI.reset}`
};
function formatCheckCli(c) {
	let line = `  ${STATUS_LABEL_CLI[c.status]} ${c.name}: ${c.message}`;
	if (c.details) line += `\n         ${ANSI.gray}${c.details}${ANSI.reset}`;
	return line;
}
/**
* Extract all log lines tagged with a specific message_id from gateway.log.
*
* Scans the last 1MB of the log file for lines containing `[msg:{messageId}]`.
* Returns matching lines in chronological order.
*/
async function traceByMessageId(messageId) {
	const logPath = path$1.join(os.homedir(), ".openclaw", "logs", "gateway.log");
	try {
		await fs$1.access(logPath);
	} catch {
		return [];
	}
	const TRACE_READ_BYTES = 1024 * 1024;
	try {
		const stat = await fs$1.stat(logPath);
		const readSize = Math.min(stat.size, TRACE_READ_BYTES);
		const fd = await fs$1.open(logPath, "r");
		try {
			const buffer = Buffer.alloc(readSize);
			await fd.read(buffer, 0, readSize, Math.max(0, stat.size - readSize));
			const content = buffer.toString("utf-8");
			const needle = `[msg:${messageId}]`;
			return content.split("\n").filter((line) => line.includes(needle));
		} finally {
			await fd.close();
		}
	} catch {
		return [];
	}
}
/**
* Format trace output for CLI display.
*/
function formatTraceOutput(lines, messageId) {
	const sep = "────────────────────────────────";
	if (lines.length === 0) return [
		sep,
		`  未找到 ${messageId} 的追踪日志`,
		"",
		"  可能原因:",
		"  1. 该消息尚未被处理",
		"  2. 日志已被轮转",
		"  3. 追踪功能未启用（需要更新插件版本）",
		sep
	].join("\n");
	const output = [`追踪 ${messageId} 的处理链路 (${lines.length} 条日志):`, sep];
	for (const line of lines) output.push(line);
	output.push(sep);
	return output.join("\n");
}
function classifyEvent(body) {
	if (body.startsWith("received from")) return "received";
	if (body.startsWith("sender resolved")) return "sender_resolved";
	if (body.startsWith("rejected:")) return "rejected";
	if (body.startsWith("dispatching to agent")) return "dispatching";
	if (body.startsWith("dispatch complete")) return "dispatch_complete";
	if (body.startsWith("card entity created")) return "card_created";
	if (body.startsWith("card message sent")) return "card_sent";
	if (body.startsWith("cardkit cardElement.content:")) return "card_stream";
	if (body.startsWith("card stream update failed")) return "card_stream_fail";
	if (body.startsWith("cardkit card.settings:")) return "card_settings";
	if (body.startsWith("cardkit card.update:")) return "card_update";
	if (body.startsWith("card creation failed")) return "card_fallback";
	if (body.startsWith("reply completed")) return "reply_completed";
	if (body.startsWith("reply error")) return "reply_error";
	if (body.startsWith("tool call:")) return "tool_call";
	if (body.startsWith("tool done:")) return "tool_done";
	if (body.startsWith("tool fail:")) return "tool_fail";
	return "other";
}
const EVENT_LABEL = {
	received: "消息接收",
	sender_resolved: "Sender 解析",
	rejected: "消息拒绝",
	dispatching: "分发到 Agent",
	dispatch_complete: "Agent 处理完成",
	card_created: "卡片创建",
	card_sent: "卡片消息发送",
	card_stream: "流式更新",
	card_stream_fail: "流式更新失败",
	card_settings: "卡片设置",
	card_update: "卡片最终更新",
	card_fallback: "卡片降级",
	reply_completed: "回复完成",
	reply_error: "回复错误",
	tool_call: "工具调用",
	tool_done: "工具完成",
	tool_fail: "工具失败"
};
/** Expected stages in a normal message processing flow. */
const EXPECTED_STAGES = [
	{
		kind: "received",
		label: "消息接收 (received from)"
	},
	{
		kind: "dispatching",
		label: "分发到 Agent (dispatching to agent)"
	},
	{
		kind: "card_created",
		label: "卡片创建 (card entity created)"
	},
	{
		kind: "card_sent",
		label: "卡片消息发送 (card message sent)"
	},
	{
		kind: "card_stream",
		label: "流式输出 (cardElement.content)"
	},
	{
		kind: "dispatch_complete",
		label: "处理完成 (dispatch complete)"
	},
	{
		kind: "reply_completed",
		label: "回复收尾 (reply completed)"
	}
];
/** Time gap thresholds (ms) for performance warnings. */
const PERF_THRESHOLDS = [
	{
		from: "received",
		to: "dispatching",
		warnMs: 500,
		label: "消息接收 → 分发"
	},
	{
		from: "dispatching",
		to: "card_created",
		warnMs: 5e3,
		label: "分发 → 卡片创建"
	},
	{
		from: "card_created",
		to: "card_stream",
		warnMs: 3e4,
		label: "卡片创建 → 首次流式输出"
	}
];
function parseTraceLines(lines) {
	const events = [];
	const re = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)\s.*?\]:\s(.+)$/;
	for (const line of lines) {
		const m = line.match(re);
		if (m) events.push({
			timestamp: new Date(m[1]),
			raw: line,
			body: m[2]
		});
	}
	return events;
}
/**
* Analyze trace log lines and produce a structured CLI report.
*/
function analyzeTrace(lines, _messageId) {
	const events = parseTraceLines(lines);
	if (events.length === 0) return `无法解析日志行，请确认日志格式正确。`;
	const out = [];
	const sep = "────────────────────────────────";
	const startTime = events[0].timestamp.getTime();
	const totalMs = events[events.length - 1].timestamp.getTime() - startTime;
	out.push("");
	out.push(`${ANSI.bold}【时间线】${ANSI.reset} (${events.length} 条日志，跨度 ${(totalMs / 1e3).toFixed(1)}s)`);
	out.push(sep);
	let prevMs = startTime;
	let streamCount = 0;
	let streamFirstSeq = "";
	let streamLastSeq = "";
	function flushStream() {
		if (streamCount > 0) {
			const label = streamCount === 1 ? `  ${ANSI.gray}...${ANSI.reset} 流式更新 seq=${streamFirstSeq}` : `  ${ANSI.gray}...${ANSI.reset} 流式更新 x${streamCount} (seq=${streamFirstSeq}~${streamLastSeq})`;
			out.push(label);
			streamCount = 0;
		}
	}
	for (const ev of events) {
		const kind = classifyEvent(ev.body);
		const deltaMs = ev.timestamp.getTime() - prevMs;
		prevMs = ev.timestamp.getTime();
		const offsetStr = `+${ev.timestamp.getTime() - startTime}ms`.padStart(10);
		if (kind === "card_stream") {
			const seqMatch = ev.body.match(/seq=(\d+)/);
			const seq = seqMatch ? seqMatch[1] : "?";
			if (streamCount === 0) streamFirstSeq = seq;
			streamLastSeq = seq;
			streamCount++;
			continue;
		}
		flushStream();
		const label = EVENT_LABEL[kind] ?? kind;
		const gapWarn = deltaMs > 5e3 ? ` ${ANSI.yellow}⚠ ${(deltaMs / 1e3).toFixed(1)}s${ANSI.reset}` : "";
		let marker = "  ";
		if (kind === "rejected" || kind === "reply_error" || kind === "tool_fail" || kind === "card_stream_fail" || kind === "card_fallback") marker = `${ANSI.red}✘ ${ANSI.reset}`;
		else if (kind === "tool_call") marker = "→ ";
		let detail = "";
		if (kind === "received") {
			const m = ev.body.match(/from (\S+) in (\S+) \((\w+)\)/);
			if (m) detail = `sender=${m[1]}, chat=${m[2]} (${m[3]})`;
		} else if (kind === "dispatching") {
			const m = ev.body.match(/session=(\S+)\)/);
			if (m) detail = `session=${m[1]}`;
		} else if (kind === "dispatch_complete") {
			const m = ev.body.match(/replies=(\d+), elapsed=(\d+)ms/);
			if (m) detail = `replies=${m[1]}, elapsed=${m[2]}ms`;
		} else if (kind === "tool_call") {
			const m = ev.body.match(/tool call: (\S+)/);
			if (m) detail = m[1];
		} else if (kind === "tool_fail") detail = ev.body.replace("tool fail: ", "");
		else if (kind === "card_created") {
			const m = ev.body.match(/card_id=(\S+)\)/);
			if (m) detail = `card_id=${m[1]}`;
		} else if (kind === "reply_completed") {
			const m = ev.body.match(/elapsed=(\d+)ms/);
			if (m) detail = `elapsed=${m[1]}ms`;
		} else if (kind === "rejected") detail = ev.body.replace("rejected: ", "");
		out.push(`${ANSI.gray}[${offsetStr}]${ANSI.reset} ${marker}${label}${detail ? ` — ${detail}` : ""}${gapWarn}`);
	}
	flushStream();
	out.push("");
	const issues = [];
	const kindSet = new Set(events.map((e) => classifyEvent(e.body)));
	for (const stage of EXPECTED_STAGES) if (!kindSet.has(stage.kind)) {
		if ((stage.kind === "dispatch_complete" || stage.kind === "reply_completed") && !kindSet.has("dispatching")) continue;
		if ((stage.kind === "card_created" || stage.kind === "card_sent" || stage.kind === "card_stream") && kindSet.has("rejected")) continue;
		issues.push(`缺失阶段: ${stage.label}`);
	}
	for (const ev of events) {
		const kind = classifyEvent(ev.body);
		if (kind === "rejected") issues.push(`消息被拒绝: ${ev.body.replace("rejected: ", "")}`);
		if (kind === "reply_error") issues.push(`回复错误: ${ev.body}`);
		if (kind === "tool_fail") issues.push(`工具失败: ${ev.body}`);
		if (kind === "card_stream_fail") issues.push(`流式更新失败: ${ev.body}`);
		if (kind === "card_fallback") issues.push(`卡片降级: ${ev.body}`);
		if (kind === "card_stream" || kind === "card_update" || kind === "card_settings" || kind === "card_created") {
			const codeMatch = ev.body.match(/code=(\d+)/);
			if (codeMatch && codeMatch[1] !== "0") issues.push(`API 返回错误码: code=${codeMatch[1]} — ${ev.body}`);
		}
	}
	const firstByKind = /* @__PURE__ */ new Map();
	for (const ev of events) {
		const kind = classifyEvent(ev.body);
		if (!firstByKind.has(kind)) firstByKind.set(kind, ev);
	}
	for (const rule of PERF_THRESHOLDS) {
		const from = firstByKind.get(rule.from);
		const to = firstByKind.get(rule.to);
		if (from && to) {
			const gap = to.timestamp.getTime() - from.timestamp.getTime();
			if (gap > rule.warnMs) issues.push(`性能警告: ${rule.label} 耗时 ${(gap / 1e3).toFixed(1)}s（阈值 ${(rule.warnMs / 1e3).toFixed(0)}s）`);
		}
	}
	const receivedCount = events.filter((e) => classifyEvent(e.body) === "received").length;
	if (receivedCount > 1) issues.push(`重复投递: 同一消息被接收 ${receivedCount} 次（WebSocket 重投递）`);
	const streamSeqs = [];
	for (const ev of events) if (classifyEvent(ev.body) === "card_stream") {
		const m = ev.body.match(/seq=(\d+)/);
		if (m) streamSeqs.push(parseInt(m[1], 10));
	}
	if (streamSeqs.length > 1) {
		for (let i = 1; i < streamSeqs.length; i++) if (streamSeqs[i] !== streamSeqs[i - 1] + 1) {
			issues.push(`流式 seq 不连续: seq=${streamSeqs[i - 1]} → seq=${streamSeqs[i]}（跳过了 ${streamSeqs[i] - streamSeqs[i - 1] - 1} 个）`);
			break;
		}
	}
	out.push(`${ANSI.bold}【异常检测】${ANSI.reset}`);
	out.push(sep);
	if (issues.length === 0) out.push(`  ${ANSI.green}未发现异常${ANSI.reset}`);
	else for (let i = 0; i < issues.length; i++) {
		const color = issues[i].startsWith("工具失败") || issues[i].startsWith("回复错误") || issues[i].startsWith("API 返回错误码") || issues[i].startsWith("流式更新失败") ? ANSI.red : ANSI.yellow;
		out.push(`  ${color}${i + 1}. ${issues[i]}${ANSI.reset}`);
	}
	out.push("");
	out.push(`${ANSI.bold}【诊断总结】${ANSI.reset}`);
	out.push(sep);
	const hasError = issues.some((i) => i.startsWith("工具失败") || i.startsWith("回复错误") || i.startsWith("API 返回错误码") || i.startsWith("流式更新失败") || i.startsWith("缺失阶段"));
	if (!(issues.length > 0)) {
		out.push(`  状态: ${ANSI.green}✓ 正常${ANSI.reset}`);
		out.push(`  消息处理链路完整，全程耗时 ${(totalMs / 1e3).toFixed(1)}s。`);
		const dispatchComplete = events.find((e) => classifyEvent(e.body) === "dispatch_complete" && e.body.includes("replies=") && !e.body.includes("replies=0"));
		if (dispatchComplete) {
			const m = dispatchComplete.body.match(/elapsed=(\d+)ms/);
			if (m) out.push(`  其中 Agent 处理耗时 ${(parseInt(m[1], 10) / 1e3).toFixed(1)}s（含 AI 推理 + 工具调用）。`);
		}
	} else if (hasError) {
		out.push(`  状态: ${ANSI.red}✘ 异常${ANSI.reset}`);
		out.push(`  发现 ${issues.length} 个问题，需要排查。`);
	} else {
		out.push(`  状态: ${ANSI.yellow}⚠ 有警告${ANSI.reset}`);
		out.push(`  发现 ${issues.length} 个警告，功能可用但需关注。`);
	}
	out.push("");
	return out.join("\n");
}
function formatDiagReportCli(report) {
	const lines = [];
	const sep = "====================================";
	lines.push(sep);
	lines.push(`  ${ANSI.bold}飞书插件诊断报告${ANSI.reset}`);
	lines.push(`  ${report.timestamp}`);
	lines.push(sep);
	lines.push("");
	lines.push(`${ANSI.bold}【环境信息】${ANSI.reset}`);
	lines.push(`  Node.js:     ${report.environment.nodeVersion}`);
	lines.push(`  插件版本:    ${report.environment.pluginVersion}`);
	lines.push(`  系统:        ${report.environment.platform} ${report.environment.arch}`);
	lines.push("");
	lines.push(`${ANSI.bold}【全局检查】${ANSI.reset}`);
	for (const c of report.checks) lines.push(formatCheckCli(c));
	lines.push("");
	for (const acct of report.accounts) {
		lines.push(`${ANSI.bold}【账户: ${acct.accountId}】${ANSI.reset}`);
		if (acct.name) lines.push(`  名称:     ${acct.name}`);
		lines.push(`  App ID:   ${acct.appId}`);
		lines.push(`  品牌:     ${acct.brand}`);
		lines.push("");
		for (const c of acct.checks) lines.push(formatCheckCli(c));
		lines.push("");
	}
	lines.push(`${ANSI.bold}【工具注册】${ANSI.reset}`);
	if (report.toolsRegistered.length > 0) {
		lines.push(`  ${report.toolsRegistered.join(", ")}`);
		lines.push(`  共 ${report.toolsRegistered.length} 个`);
	} else lines.push("  无工具注册（未找到已配置的账户）");
	lines.push("");
	if (report.recentErrors.length > 0) {
		lines.push(`${ANSI.bold}【最近错误】${ANSI.reset}(${report.recentErrors.length} 条)`);
		for (let i = 0; i < report.recentErrors.length; i++) lines.push(`  ${ANSI.gray}${i + 1}. ${report.recentErrors[i]}${ANSI.reset}`);
		lines.push("");
	}
	const statusColorMap = {
		healthy: `${ANSI.green}HEALTHY${ANSI.reset}`,
		degraded: `${ANSI.yellow}DEGRADED (存在警告)${ANSI.reset}`,
		unhealthy: `${ANSI.red}UNHEALTHY (存在失败项)${ANSI.reset}`
	};
	lines.push(sep);
	lines.push(`  总体状态: ${statusColorMap[report.overallStatus]}`);
	lines.push(sep);
	return lines.join("\n");
}
//#endregion
//#region src/commands/index.ts
const T = {
	zh_cn: {
		legacyNotDisabled: "❌ 检测到旧版插件未禁用。\n👉 请依次运行命令：\n```\nopenclaw config set plugins.entries.feishu.enabled false --json\nopenclaw gateway restart\n```",
		toolsProfileWarn: (profile) => `⚠️ 工具 Profile 当前为 \`${profile}\`，飞书工具可能无法加载。请检查配置是否正确。\n`,
		startFailed: (details) => `❌ 飞书 OpenClaw 插件启动失败：\n\n${details}`,
		startWithWarnings: (version, details) => `⚠️ 飞书 OpenClaw 插件已启动 v${version}（存在警告）\n\n${details}`,
		startOk: (version) => `✅ 飞书 OpenClaw 插件已启动 v${version}`,
		helpTitle: (version) => `飞书OpenClaw插件 v${version}`,
		helpUsage: "用法：",
		helpStart: "/feishu start - 校验插件配置",
		helpAuth: "/feishu auth - 批量授权用户权限",
		helpDoctor: "/feishu doctor - 运行诊断",
		helpHelp: "/feishu help - 显示此帮助",
		diagFailed: (msg) => `诊断执行失败: ${msg}`,
		authFailed: (msg) => `授权执行失败: ${msg}`,
		execFailed: (msg) => `执行失败: ${msg}`
	},
	en_us: {
		legacyNotDisabled: "❌ Legacy plugin is not disabled.\n👉 Please run the following commands:\n```\nopenclaw config set plugins.entries.feishu.enabled false --json\nopenclaw gateway restart\n```",
		toolsProfileWarn: (profile) => `⚠️ Tools profile is currently set to \`${profile}\`. Feishu tools may not load properly. Please check your configuration.\n`,
		startFailed: (details) => `❌ Feishu OpenClaw plugin failed to start:\n\n${details}`,
		startWithWarnings: (version, details) => `⚠️ Feishu OpenClaw plugin started v${version} (with warnings)\n\n${details}`,
		startOk: (version) => `✅ Feishu OpenClaw plugin started v${version}`,
		helpTitle: (version) => `Feishu OpenClaw Plugin v${version}`,
		helpUsage: "Usage:",
		helpStart: "/feishu start - Validate plugin configuration",
		helpAuth: "/feishu auth - Batch authorize user permissions",
		helpDoctor: "/feishu doctor - Run diagnostics",
		helpHelp: "/feishu help - Show this help",
		diagFailed: (msg) => `Diagnostics failed: ${msg}`,
		authFailed: (msg) => `Authorization failed: ${msg}`,
		execFailed: (msg) => `Execution failed: ${msg}`
	}
};
/**
* 运行 /feishu start 校验，返回 Markdown 格式结果。
*/
function runFeishuStart(config, locale = "zh_cn") {
	const t = T[locale];
	const cfg = config;
	const errors = [];
	const warnings = [];
	const feishuEntry = cfg.plugins?.entries?.feishu;
	if (feishuEntry && feishuEntry.enabled !== false) errors.push(t.legacyNotDisabled);
	const profile = cfg.tools?.profile;
	if (profile && new Set([
		"minimal",
		"coding",
		"messaging"
	]).has(profile)) warnings.push(t.toolsProfileWarn(profile));
	if (errors.length > 0) {
		const all = [...errors, ...warnings];
		return t.startFailed(all.join("\n\n"));
	}
	if (warnings.length > 0) return t.startWithWarnings(getPluginVersion(), warnings.join("\n\n"));
	return t.startOk(getPluginVersion());
}
/**
* 运行 /feishu start，同时生成中英双语结果。
*/
function runFeishuStartI18n(config) {
	return {
		zh_cn: runFeishuStart(config, "zh_cn"),
		en_us: runFeishuStart(config, "en_us")
	};
}
/**
* 生成 /feishu help 帮助文本。
*/
function getFeishuHelp(locale = "zh_cn") {
	const t = T[locale];
	return `${t.helpTitle(getPluginVersion())}\n\n${t.helpUsage}\n  ${t.helpStart}\n  ${t.helpAuth}\n  ${t.helpDoctor}\n  ${t.helpHelp}`;
}
/**
* 生成 /feishu help，同时生成中英双语结果。
*/
function getFeishuHelpI18n() {
	return {
		zh_cn: getFeishuHelp("zh_cn"),
		en_us: getFeishuHelp("en_us")
	};
}
function registerCommands(api) {
	api.registerCommand({
		name: "feishu_diagnose",
		description: "Run Feishu plugin diagnostics to check config, connectivity, and permissions",
		acceptsArgs: false,
		requireAuth: true,
		async handler(ctx) {
			try {
				return { text: formatDiagReportText(await runDiagnosis({ config: ctx.config })) };
			} catch (err) {
				return { text: T.zh_cn.diagFailed(err instanceof Error ? err.message : String(err)) };
			}
		}
	});
	api.registerCommand({
		name: "feishu_doctor",
		description: "Run Feishu plugin diagnostics",
		acceptsArgs: false,
		requireAuth: true,
		async handler(ctx) {
			try {
				return { text: await runFeishuDoctor(ctx.config, ctx.accountId) };
			} catch (err) {
				return { text: T.zh_cn.diagFailed(err instanceof Error ? err.message : String(err)) };
			}
		}
	});
	api.registerCommand({
		name: "feishu_auth",
		description: "Batch authorize user permissions for Feishu",
		acceptsArgs: false,
		requireAuth: true,
		async handler(ctx) {
			try {
				return { text: await runFeishuAuth(ctx.config) };
			} catch (err) {
				return { text: T.zh_cn.authFailed(err instanceof Error ? err.message : String(err)) };
			}
		}
	});
	api.registerCommand({
		name: "feishu",
		description: "Feishu plugin commands (subcommands: auth, doctor, start)",
		acceptsArgs: true,
		requireAuth: true,
		async handler(ctx) {
			const subcommand = (ctx.args?.trim().split(/\s+/) || [])[0]?.toLowerCase();
			try {
				if (subcommand === "auth" || subcommand === "onboarding") return { text: await runFeishuAuth(ctx.config) };
				if (subcommand === "doctor") return { text: await runFeishuDoctor(ctx.config, ctx.accountId) };
				if (subcommand === "start") return { text: runFeishuStart(ctx.config) };
				return { text: getFeishuHelp() };
			} catch (err) {
				return { text: T.zh_cn.execFailed(err instanceof Error ? err.message : String(err)) };
			}
		}
	});
}
//#endregion
//#region src/messaging/inbound/dispatch.ts
const log$3 = larkLogger("inbound/dispatch");
/**
* Dispatch a normal (non-command) message via the streaming card flow.
* Cleans up consumed history entries after dispatch completes.
*
* Note: history cleanup is intentionally placed here and NOT in the
* system-command path — command handlers don't consume history context,
* so the entries should be preserved for the next normal message.
*/
async function dispatchNormalMessage(dc, ctxPayload, chatHistories, historyKey, historyLimit, replyToMessageId, skillFilter, skipTyping) {
	if (isLikelyAbortText(dc.ctx.content?.trim() ?? "")) {
		dc.log(`feishu[${dc.account.accountId}]: abort message detected, using plain-text dispatch`);
		log$3.info("abort message detected, using plain-text dispatch");
		await dispatchSystemCommand(dc, ctxPayload, false, replyToMessageId);
		return;
	}
	const { dispatcher, replyOptions, markDispatchIdle, markFullyComplete, abortCard } = createFeishuReplyDispatcher({
		cfg: dc.accountScopedCfg,
		agentId: dc.route.agentId,
		chatId: dc.ctx.chatId,
		replyToMessageId: replyToMessageId ?? dc.ctx.messageId,
		accountId: dc.account.accountId,
		chatType: dc.ctx.chatType,
		skipTyping,
		replyInThread: dc.isThread
	});
	const abortController = new AbortController();
	const queueKey = buildQueueKey(dc.account.accountId, dc.ctx.chatId, dc.ctx.threadId);
	registerActiveDispatcher(queueKey, {
		abortCard,
		abortController
	});
	const effectiveSessionKey = dc.threadSessionKey ?? dc.route.sessionKey;
	dc.log(`feishu[${dc.account.accountId}]: dispatching to agent (session=${effectiveSessionKey})`);
	log$3.info(`dispatching to agent (session=${effectiveSessionKey})`);
	try {
		const { queuedFinal, counts } = await dc.core.channel.reply.dispatchReplyFromConfig({
			ctx: ctxPayload,
			cfg: dc.accountScopedCfg,
			dispatcher,
			replyOptions: {
				...replyOptions,
				abortSignal: abortController.signal,
				...skillFilter ? { skillFilter } : {}
			}
		});
		await dispatcher.waitForIdle();
		markFullyComplete();
		markDispatchIdle();
		if (dc.isGroup && historyKey && chatHistories) clearHistoryEntriesIfEnabled({
			historyMap: chatHistories,
			historyKey,
			limit: historyLimit
		});
		dc.log(`feishu[${dc.account.accountId}]: dispatch complete (queuedFinal=${queuedFinal}, replies=${counts.final})`);
		log$3.info(`dispatch complete (replies=${counts.final}, elapsed=${ticketElapsed()}ms)`);
	} finally {
		unregisterActiveDispatcher(queueKey);
	}
}
async function dispatchToAgent(params) {
	const dc = buildDispatchContext(params);
	if (dc.isThread && dc.ctx.threadId) dc.threadSessionKey = await resolveThreadSessionKey({
		accountScopedCfg: dc.accountScopedCfg,
		account: dc.account,
		chatId: dc.ctx.chatId,
		threadId: dc.ctx.threadId,
		baseSessionKey: dc.route.sessionKey
	});
	const messageBody = buildMessageBody(params.ctx, params.quotedContent);
	if (params.permissionError) try {
		await dispatchPermissionNotification(dc, params.permissionError, params.replyToMessageId);
	} catch (err) {
		dc.error(`feishu[${dc.account.accountId}]: permission notification failed, continuing: ${String(err)}`);
	}
	const { combinedBody, historyKey } = buildEnvelopeWithHistory(dc, messageBody, params.chatHistories, params.historyLimit);
	const bodyForAgent = buildBodyForAgent(params.ctx);
	const threadHistoryKey = threadScopedKey(dc.ctx.chatId, dc.isThread ? dc.ctx.threadId : void 0);
	const inboundHistory = dc.isGroup && params.chatHistories && params.historyLimit > 0 ? (params.chatHistories.get(threadHistoryKey) ?? []).map((entry) => ({
		sender: entry.sender,
		body: entry.body,
		timestamp: entry.timestamp ?? Date.now()
	})) : void 0;
	const isBareNewOrReset = /^\/(?:new|reset)\s*$/i.test((params.ctx.content ?? "").trim());
	const groupSystemPrompt = dc.isGroup ? params.groupConfig?.systemPrompt?.trim() || params.defaultGroupConfig?.systemPrompt?.trim() || void 0 : void 0;
	const originatingTo = isBareNewOrReset && dc.isThread ? encodeFeishuRouteTarget({
		target: dc.feishuTo,
		replyToMessageId: params.replyToMessageId ?? params.ctx.messageId,
		threadId: dc.ctx.threadId
	}) : void 0;
	const ctxPayload = buildInboundPayload(dc, {
		body: combinedBody,
		bodyForAgent,
		rawBody: params.ctx.content,
		commandBody: params.ctx.content,
		originatingTo,
		senderName: params.ctx.senderName ?? params.ctx.senderId,
		senderId: params.ctx.senderId,
		messageSid: params.ctx.messageId,
		wasMentioned: mentionedBot(params.ctx),
		replyToBody: params.quotedContent,
		inboundHistory,
		extraFields: {
			...params.mediaPayload,
			...groupSystemPrompt ? { GroupSystemPrompt: groupSystemPrompt } : {},
			...dc.ctx.threadId ? { MessageThreadId: dc.ctx.threadId } : {}
		}
	});
	const contentTrimmed = (params.ctx.content ?? "").trim();
	const isDoctorCommand = /^\/feishu[_ ]doctor\s*$/i.test(contentTrimmed);
	const isAuthCommand = /^\/feishu[_ ](?:auth|onboarding)\s*$/i.test(contentTrimmed);
	const isStartCommand = /^\/feishu[_ ]start\s*$/i.test(contentTrimmed);
	const isHelpCommand = /^\/feishu(?:[_ ]help)?\s*$/i.test(contentTrimmed);
	const i18nCommandName = isDoctorCommand ? "doctor" : isAuthCommand ? "auth" : isStartCommand ? "start" : isHelpCommand ? "help" : null;
	if (i18nCommandName) {
		dc.log(`feishu[${dc.account.accountId}]: ${i18nCommandName} command detected, using i18n dispatch`);
		log$3.info(`${i18nCommandName} command detected, using i18n dispatch`);
		try {
			let i18nTexts;
			if (isDoctorCommand) i18nTexts = await runFeishuDoctorI18n(dc.accountScopedCfg, dc.account.accountId);
			else if (isAuthCommand) i18nTexts = await runFeishuAuthI18n(dc.accountScopedCfg);
			else if (isStartCommand) i18nTexts = runFeishuStartI18n(dc.accountScopedCfg);
			else i18nTexts = getFeishuHelpI18n();
			const card = buildI18nMarkdownCard(i18nTexts);
			await sendCardFeishu({
				cfg: dc.accountScopedCfg,
				to: dc.ctx.chatId,
				card,
				replyToMessageId: params.replyToMessageId ?? dc.ctx.messageId,
				accountId: dc.account.accountId,
				replyInThread: dc.isThread
			});
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err);
			dc.error(`feishu[${dc.account.accountId}]: ${i18nCommandName} i18n dispatch failed: ${errMsg}`);
			await sendMessageFeishu({
				cfg: dc.accountScopedCfg,
				to: dc.ctx.chatId,
				text: `${i18nCommandName} failed: ${errMsg}`,
				replyToMessageId: params.replyToMessageId ?? dc.ctx.messageId,
				accountId: dc.account.accountId,
				replyInThread: dc.isThread
			});
		}
		return;
	}
	const isCommand = dc.core.channel.commands.isControlCommandMessage(params.ctx.content, params.accountScopedCfg);
	const skillFilter = dc.isGroup ? params.groupConfig?.skills ?? params.defaultGroupConfig?.skills : void 0;
	if (isCommand) {
		await dispatchSystemCommand(dc, ctxPayload, isBareNewOrReset, params.replyToMessageId);
		if (isBareNewOrReset && dc.isGroup && historyKey && params.chatHistories) clearHistoryEntriesIfEnabled({
			historyMap: params.chatHistories,
			historyKey,
			limit: params.historyLimit
		});
	} else await dispatchNormalMessage(dc, ctxPayload, params.chatHistories, historyKey, params.historyLimit, params.replyToMessageId, skillFilter, params.skipTyping);
}
//#endregion
//#region src/messaging/inbound/handler.ts
const logger$1 = larkLogger("inbound/handler");
async function handleFeishuMessage(params) {
	const { cfg, event, botOpenId, runtime, chatHistories, accountId, replyToMessageId, forceMention, skipTyping } = params;
	const account = getLarkAccount(cfg, accountId);
	const accountFeishuCfg = account.config;
	const accountScopedCfg = {
		...cfg,
		channels: {
			...cfg.channels,
			feishu: accountFeishuCfg
		}
	};
	const log = runtime?.log ?? ((...args) => logger$1.info(args.map(String).join(" ")));
	const error = runtime?.error ?? ((...args) => logger$1.error(args.map(String).join(" ")));
	let ctx = await parseMessageEvent(event, botOpenId, {
		cfg: accountScopedCfg,
		accountId: account.accountId
	});
	const { ctx: enrichedCtx, permissionError } = await resolveSenderInfo({
		ctx,
		account,
		log
	});
	ctx = enrichedCtx;
	log(`feishu[${account.accountId}]: received message from ${ctx.senderId} in ${ctx.chatId} (${ctx.chatType})`);
	logger$1.info(`received from ${ctx.senderId} in ${ctx.chatId} (${ctx.chatType})`);
	const historyLimit = Math.max(0, accountFeishuCfg?.historyLimit ?? accountScopedCfg.messages?.groupChat?.historyLimit ?? DEFAULT_GROUP_HISTORY_LIMIT);
	const gate = forceMention ? { allowed: true } : await checkMessageGate({
		ctx,
		accountFeishuCfg,
		account,
		accountScopedCfg,
		log
	});
	if (!gate.allowed) {
		if (gate.reason === "no_mention") logger$1.info(`rejected: no bot mention in group ${ctx.chatId}`);
		if (gate.historyEntry && chatHistories) recordPendingHistoryEntryIfEnabled({
			historyMap: chatHistories,
			historyKey: threadScopedKey(ctx.chatId, ctx.threadId),
			limit: historyLimit,
			entry: gate.historyEntry
		});
		return;
	}
	await prefetchUserNames({
		ctx,
		account,
		log
	});
	const enrichParams = {
		ctx,
		accountScopedCfg,
		account,
		log
	};
	const [mediaResult, quotedContent] = await Promise.all([resolveMedia(enrichParams), resolveQuotedContent(enrichParams)]);
	if (mediaResult.mediaList.length > 0) ctx = {
		...ctx,
		content: substituteMediaPaths(ctx.content, mediaResult.mediaList)
	};
	const core = LarkClient.runtime;
	const isGroup = ctx.chatType === "group";
	const dmPolicy = accountFeishuCfg?.dmPolicy ?? "pairing";
	const groupConfig = isGroup ? resolveFeishuGroupConfig({
		cfg: accountFeishuCfg,
		groupId: ctx.chatId
	}) : void 0;
	const defaultGroupConfig = isGroup ? accountFeishuCfg?.groups?.["*"] : void 0;
	const configuredGroupAllowFrom = (() => {
		if (!isGroup) return void 0;
		const { senderAllowFrom } = splitLegacyGroupAllowFrom(accountFeishuCfg?.groupAllowFrom ?? []);
		const senderGroupAllowFrom = senderAllowFrom;
		const perGroupAllowFrom = (groupConfig?.allowFrom ?? []).map(String);
		const defaultSenderAllowFrom = !groupConfig && defaultGroupConfig?.allowFrom ? defaultGroupConfig.allowFrom.map(String) : [];
		const combined = [
			...senderGroupAllowFrom,
			...perGroupAllowFrom,
			...defaultSenderAllowFrom
		];
		if (combined.length > 0) return combined;
		return (groupConfig?.groupPolicy ?? defaultGroupConfig?.groupPolicy ?? accountFeishuCfg?.groupPolicy) === "open" ? ["*"] : [];
	})();
	const { commandAuthorized } = await resolveSenderCommandAuthorization({
		rawBody: ctx.content,
		cfg: accountScopedCfg,
		isGroup,
		dmPolicy,
		configuredAllowFrom: (accountFeishuCfg?.allowFrom ?? []).map(String),
		configuredGroupAllowFrom,
		senderId: ctx.senderId,
		isSenderAllowed: (senderId, allowFrom) => isNormalizedSenderAllowed({
			senderId,
			allowFrom
		}),
		readAllowFromStore: () => readAllowFromStore(account.accountId),
		shouldComputeCommandAuthorized: core.channel.commands.shouldComputeCommandAuthorized,
		resolveCommandAuthorizedFromAuthorizers: core.channel.commands.resolveCommandAuthorizedFromAuthorizers
	});
	try {
		await dispatchToAgent({
			ctx,
			permissionError,
			mediaPayload: mediaResult.payload,
			quotedContent,
			account,
			accountScopedCfg,
			runtime,
			chatHistories,
			historyLimit,
			replyToMessageId,
			commandAuthorized,
			groupConfig,
			defaultGroupConfig,
			skipTyping
		});
	} catch (err) {
		error(`feishu[${account.accountId}]: failed to dispatch message: ${String(err)}`);
		logger$1.error(`dispatch failed: ${String(err)} (elapsed=${ticketElapsed()}ms)`);
	}
}
//#endregion
//#region src/tools/oauth-cards.ts
/** v2 卡片 i18n 配置，注入到 config 中 */
const I18N_CONFIG$1 = {
	update_multi: true,
	locales: ["zh_cn", "en_us"]
};
const CARD_TEXTS = {
	zh_cn: {
		authRequired: "请授权以继续当前操作",
		goAuth: "前往授权",
		expiresHint: (min) => `<font color='grey'>授权链接将在 ${min} 分钟后失效，届时需重新发起</font>`,
		batchAuthHint: "<font color='grey'>💡如果你希望一次性授予所有插件所需要的权限，可以告诉我「授予所有用户权限」，我会协助你完成。</font>",
		batchScopeMsg: (count, total, granted) => `应用需要授权 **${count}** 个用户权限（共 ${total} 个，已授权 ${granted} 个）。`,
		scopePreviewLabel: "**将要授权的权限**",
		scopeListLabel: "**将要授权的权限列表**",
		scopeDesc: "授权后，应用将能够以你的身份执行相关操作。",
		requiredScopes: "所需权限：",
		authSuccess: "授权成功",
		authSuccessBody: (brandName) => `你的${brandName}账号已成功授权，正在为你继续执行操作。\n\n<font color='grey'>如需撤销授权，可随时告诉我。</font>`,
		authIncomplete: "授权未完成",
		authExpiredBody: "授权链接已过期，请重新发起授权。",
		authMismatchTitle: "授权失败，操作账号与发起账号不一致",
		authMismatchBody: (brandName) => `检测到当前进行授权操作的${brandName}账号与发起授权请求的账号不一致。为保障数据安全，本次授权已被拒绝。\n\n<font color='grey'>请授权请求的发起人使用其账号，点击授权链接完成授权。</font>`
	},
	en_us: {
		authRequired: "Authorize to continue",
		goAuth: "Authorize Now",
		expiresHint: (min) => `<font color='grey'>This link will time out in ${min} minutes, so you'll need a new one if it expires.</font>`,
		batchAuthHint: "<font color='grey'>💡 If you'd like to grant all permissions at once, just say \"Authorize all\", and I'll take care of it.</font>",
		batchScopeMsg: (count, total, granted) => `The app requires ${count} additional user token permissions (${granted} of ${total} granted).`,
		scopePreviewLabel: "**Permissions to authorize**",
		scopeListLabel: "**Permissions to authorize**",
		scopeDesc: "Once authorized, the app can perform actions on your behalf.",
		requiredScopes: "Required permissions:",
		authSuccess: "Authorized",
		authSuccessBody: (brandName) => `${brandName} account authorized. Continuing with your request.\n\n<font color='grey'>Let me know if you ever need to revoke the permissions.</font>`,
		authIncomplete: "Authorization incomplete",
		authExpiredBody: "The link is no longer active. Please restart the process.",
		authMismatchTitle: "Authorization failed: Account mismatch",
		authMismatchBody: (brandName) => `The ${brandName} account used for authorization does not match the account that initiated the request. To protect your data, this request has been denied.\n\n<font color='grey'>Only the person who started this request can authorize it using their account.</font>`
	}
};
/** 构造 i18n_content 对象（双语） */
function i18nContent(zh, en) {
	return {
		zh_cn: zh,
		en_us: en
	};
}
/** 构造带 i18n_content 的 plain_text（默认语言为英文） */
function i18nPlainText(zh, en) {
	return {
		tag: "plain_text",
		content: en,
		i18n_content: i18nContent(zh, en)
	};
}
function buildAuthCard(params) {
	const { verificationUriComplete, expiresMin, scope, isBatchAuth, totalAppScopes, alreadyGranted, batchInfo, filteredScopes, appId, showBatchAuthHint, brand } = params;
	const inAppUrl = toInAppWebUrl(verificationUriComplete, brand);
	const multiUrl = {
		url: inAppUrl,
		pc_url: inAppUrl,
		android_url: inAppUrl,
		ios_url: inAppUrl
	};
	const scopeParams = {
		scope,
		isBatchAuth,
		totalAppScopes,
		alreadyGranted,
		batchInfo,
		filteredScopes,
		appId
	};
	const scopeDescZh = formatScopeDescription("zh_cn", scopeParams);
	const scopeDescEn = formatScopeDescription("en_us", scopeParams);
	const zhT = CARD_TEXTS.zh_cn;
	const enT = CARD_TEXTS.en_us;
	const elements = [
		{
			tag: "markdown",
			content: scopeDescEn,
			i18n_content: i18nContent(scopeDescZh, scopeDescEn),
			text_size: "normal"
		},
		{
			tag: "column_set",
			flex_mode: "none",
			horizontal_align: "right",
			columns: [{
				tag: "column",
				width: "auto",
				elements: [{
					tag: "button",
					text: i18nPlainText(zhT.goAuth, enT.goAuth),
					type: "primary",
					size: "medium",
					multi_url: multiUrl
				}]
			}]
		},
		{
			tag: "markdown",
			content: enT.expiresHint(expiresMin),
			i18n_content: i18nContent(zhT.expiresHint(expiresMin), enT.expiresHint(expiresMin)),
			text_size: "notation"
		},
		...showBatchAuthHint ? [{
			tag: "markdown",
			content: enT.batchAuthHint,
			i18n_content: i18nContent(zhT.batchAuthHint, enT.batchAuthHint),
			text_size: "notation"
		}] : []
	];
	return {
		schema: "2.0",
		config: {
			wide_screen_mode: false,
			...I18N_CONFIG$1,
			style: { color: { "light-yellow-bg": {
				light_mode: "rgba(255, 214, 102, 0.12)",
				dark_mode: "rgba(255, 214, 102, 0.08)"
			} } }
		},
		header: {
			title: i18nPlainText(zhT.authRequired, enT.authRequired),
			subtitle: {
				tag: "plain_text",
				content: ""
			},
			template: "blue",
			padding: "12px 12px 12px 12px",
			icon: {
				tag: "standard_icon",
				token: "lock-chat_filled"
			}
		},
		body: { elements }
	};
}
/** scope 字符串 → 可读描述（支持多语言） */
function formatScopeDescription(locale, params) {
	const { scope, isBatchAuth, totalAppScopes, alreadyGranted, batchInfo } = params;
	const t = CARD_TEXTS[locale];
	const scopes = scope?.split(/\s+/).filter(Boolean);
	if (isBatchAuth && scopes && scopes.length > 0) {
		let message = t.batchScopeMsg(scopes.length, totalAppScopes ?? 0, alreadyGranted ?? 0);
		if (scopes.length > 5) {
			const previewScopes = scopes.slice(0, 3).join("\n");
			message += `\n\n${t.scopePreviewLabel}：\n${previewScopes}\n...\n`;
		} else {
			const scopeList = scopes.map((s, idx) => `${idx + 1}. ${s}`).join("\n");
			message += `\n\n${t.scopeListLabel}：\n${scopeList}\n`;
		}
		if (batchInfo) message += `\n\n${batchInfo}`;
		return message;
	}
	if (!scopes?.length) return t.scopeDesc;
	return t.scopeDesc + "\n\n" + t.requiredScopes + "\n" + scopes.map((s) => `- ${s}`).join("\n");
}
function toInAppWebUrl(targetUrl, brand) {
	const lkMeta = encodeURIComponent(JSON.stringify({ "page-meta": {
		showNavBar: "false",
		showBottomNavBar: "false"
	} }));
	const fullUrl = `${targetUrl}${targetUrl.includes("?") ? "&" : "?"}lk_meta=${lkMeta}`;
	const encoded = encodeURIComponent(fullUrl);
	return `${applinkDomain(brand)}/client/web_url/open?mode=sidebar-semi&max_width=800&reload=false&url=${encoded}`;
}
function buildAuthSuccessCard(brand) {
	const zhT = CARD_TEXTS.zh_cn;
	const enT = CARD_TEXTS.en_us;
	const brandZh = brand === "lark" ? "Lark" : "飞书";
	const brandEn = brand === "lark" ? "Lark" : "Feishu";
	return {
		schema: "2.0",
		config: {
			wide_screen_mode: false,
			...I18N_CONFIG$1,
			style: { color: { "light-green-bg": {
				light_mode: "rgba(52, 199, 89, 0.12)",
				dark_mode: "rgba(52, 199, 89, 0.08)"
			} } }
		},
		header: {
			title: i18nPlainText(zhT.authSuccess, enT.authSuccess),
			subtitle: {
				tag: "plain_text",
				content: ""
			},
			template: "green",
			padding: "12px 12px 12px 12px",
			icon: {
				tag: "standard_icon",
				token: "yes_filled"
			}
		},
		body: { elements: [{
			tag: "markdown",
			content: enT.authSuccessBody(brandEn),
			i18n_content: i18nContent(zhT.authSuccessBody(brandZh), enT.authSuccessBody(brandEn))
		}] }
	};
}
function buildAuthFailedCard(_reason) {
	const zhT = CARD_TEXTS.zh_cn;
	const enT = CARD_TEXTS.en_us;
	return {
		schema: "2.0",
		config: {
			wide_screen_mode: false,
			...I18N_CONFIG$1,
			style: { color: { "light-grey-bg": {
				light_mode: "rgba(142, 142, 147, 0.12)",
				dark_mode: "rgba(142, 142, 147, 0.08)"
			} } }
		},
		header: {
			title: i18nPlainText(zhT.authIncomplete, enT.authIncomplete),
			subtitle: {
				tag: "plain_text",
				content: ""
			},
			template: "yellow",
			padding: "12px 12px 12px 12px",
			icon: {
				tag: "standard_icon",
				token: "warning_filled"
			}
		},
		body: { elements: [{
			tag: "markdown",
			content: enT.authExpiredBody,
			i18n_content: i18nContent(zhT.authExpiredBody, enT.authExpiredBody)
		}] }
	};
}
function buildAuthIdentityMismatchCard(brand) {
	const zhT = CARD_TEXTS.zh_cn;
	const enT = CARD_TEXTS.en_us;
	const brandZh = brand === "lark" ? "Lark" : "飞书";
	const brandEn = brand === "lark" ? "Lark" : "Feishu";
	return {
		schema: "2.0",
		config: {
			wide_screen_mode: false,
			...I18N_CONFIG$1
		},
		header: {
			title: i18nPlainText(zhT.authMismatchTitle, enT.authMismatchTitle),
			subtitle: {
				tag: "plain_text",
				content: ""
			},
			template: "red",
			padding: "12px 12px 12px 12px",
			icon: {
				tag: "standard_icon",
				token: "close_filled"
			}
		},
		body: { elements: [{
			tag: "markdown",
			content: enT.authMismatchBody(brandEn),
			i18n_content: i18nContent(zhT.authMismatchBody(brandZh), enT.authMismatchBody(brandEn))
		}] }
	};
}
//#endregion
//#region src/tools/helpers.ts
/**
* 获取飞书客户端的标准模式
*
* 这是所有工具通用的逻辑：
* 1. 优先使用 LarkTicket 中的 accountId 动态解析账号
* 2. 如果没有 LarkTicket，回退到 accountIndex 指定的账号
* 3. 返回创建好的客户端实例
*
* @param config - OpenClaw 配置对象
* @param accountIndex - 使用第几个账号（默认 0，即第一个），仅在无 LarkTicket 时使用
* @returns 飞书 SDK 客户端实例
* @throws 如果没有启用的账号
*
* @example
* ```typescript
* export function registerMyTool(api: OpenClawPluginApi) {
*   const getClient = createClientGetter(api.config);
*
*   api.registerTool({
*     name: "my_tool",
*     async execute(_toolCallId, params) {
*       const client = getClient();
*       const res = await client.im.message.create({ ... });
*       return formatToolResult(res.data);
*     }
*   });
* }
* ```
*/
function createClientGetter(config, accountIndex = 0) {
	return () => {
		const ticket = getTicket();
		if (ticket?.accountId) {
			const account = getLarkAccount(config, ticket.accountId);
			if (account.enabled && account.configured) return LarkClient.fromAccount(account).sdk;
		}
		const accounts = getEnabledLarkAccounts(config);
		if (accounts.length === 0) throw new Error("No enabled Feishu accounts configured. Please add appId and appSecret in config under channels.feishu");
		if (accountIndex >= accounts.length) throw new Error(`Requested account index ${accountIndex} but only ${accounts.length} accounts available`);
		const account = accounts[accountIndex];
		return LarkClient.fromAccount(account).sdk;
	};
}
/**
* 获取当前请求对应的飞书账号信息
*
* 优先使用 LarkTicket 中的 accountId，回退到第一个启用的账号。
*
* @param config - OpenClaw 配置对象
* @returns 解析后的账号信息
* @throws 如果没有启用的账号
*
* @example
* ```typescript
* const account = getFirstAccount(api.config);
* const client = LarkClient.fromAccount(account);
* ```
*/
function getFirstAccount(config) {
	const ticket = getTicket();
	if (ticket?.accountId) {
		const account = getLarkAccount(config, ticket.accountId);
		if (account.enabled && account.configured) return account;
	}
	const accounts = getEnabledLarkAccounts(config);
	if (accounts.length === 0) throw new Error("No enabled Feishu accounts configured. Please add appId and appSecret in config under channels.feishu");
	return accounts[0];
}
/**
* 创建工具上下文，一次性返回所有常用的辅助工具
*
* 这是推荐的模式，避免在每个工具中重复调用 createClientGetter 和 createToolLogger。
*
* @param api - OpenClaw 插件 API
* @param toolName - 工具名称
* @param options - 可选配置
* @returns 工具上下文对象
*
* @example
* ```typescript
* export function registerMyTool(api: OpenClawPluginApi) {
*   if (!api.config) return;
*
*   const { toolClient, log } = createToolContext(api, "my_tool");
*
*   api.registerTool({
*     name: "my_tool",
*     async execute(_toolCallId, params) {
*       const client = getClient();
*       log.info(`Processing action: ${params.action}`);
*       const res = await client.im.message.create({ ... });
*       return formatToolResult(res.data);
*     }
*   });
* }
* ```
*/
function createToolContext(api, toolName, options) {
	if (!api.config) throw new Error("No config available");
	const config = api.config;
	const accountIndex = options?.accountIndex ?? 0;
	return {
		getClient: createClientGetter(config, accountIndex),
		toolClient: () => createToolClient(config, accountIndex),
		log: createToolLogger(api, toolName)
	};
}
/**
* 检查工具是否应该被注册（根据 channels.feishu.tools.deny 配置）。
*
* 在工具注册函数开头调用此函数，如果返回 `false` 则应该直接 return。
*
* @param api - OpenClaw Plugin API
* @param toolName - 工具名称
* @returns `true` 如果应该继续注册，`false` 如果应该跳过
*
* @example
* ```typescript
* export function registerMyTool(api: OpenClawPluginApi) {
*   if (!checkToolRegistration(api, 'feishu_my_tool')) {
*     return;
*   }
*
*   const { toolClient, log } = createToolContext(api, 'feishu_my_tool');
*   api.registerTool({ ... });
* }
* ```
*/
function checkToolRegistration(api, toolName) {
	if (!api.config) return false;
	if (!shouldRegisterTool(api.config, toolName)) {
		api.logger.info?.(`${toolName}: Skipped registration (in deny list)`);
		return false;
	}
	return true;
}
/**
* 包装的工具注册函数，自动检查 channels.feishu.tools.deny 配置。
*
* 用法：将 `api.registerTool(...)` 替换为 `registerTool(api, ...)`。
*
* @param api - OpenClaw Plugin API
* @param tool - 工具配置对象或工具工厂函数
* @param opts - 可选的工具注册选项
*
* @example
* ```typescript
* // 旧代码：
* api.registerTool({ name: 'feishu_my_tool', ... });
*
* // 新代码：
* registerTool(api, { name: 'feishu_my_tool', ... });
* ```
*/
function registerTool(api, tool, opts) {
	const toolName = typeof tool === "function" ? tool.name : tool.name;
	if (!toolName) {
		api.registerTool(tool, opts);
		return true;
	}
	if (!checkToolRegistration(api, toolName)) return false;
	api.registerTool(tool, opts);
	return true;
}
/**
* 格式化工具返回值为 OpenClaw 期望的格式
*
* @param data - 要返回的数据（会被序列化为 JSON）
* @param options - 可选配置
* @returns OpenClaw 工具返回值格式
*
* @example
* ```typescript
* // 简单使用
* return formatToolResult({ success: true, user_id: "ou_xxx" });
*
* // 自定义 JSON 格式化
* return formatToolResult(data, { indent: 4 });
* ```
*/
function formatToolResult(data, options = {}) {
	const { indent = 2 } = options;
	return {
		content: [{
			type: "text",
			text: JSON.stringify(data, null, indent)
		}],
		details: data
	};
}
/**
* 创建带工具名前缀的日志函数
*
* @param api - OpenClaw 插件 API
* @param toolName - 工具名称
* @returns 日志函数对象
*
* @example
* ```typescript
* export function registerMyTool(api: OpenClawPluginApi) {
*   const log = createToolLogger(api, "my_tool");
*
*   log.info("Tool started");
*   log.warn("Missing optional param: user_id");
*   log.error("API call failed");
*   log.debug("Intermediate state", { count: 5 });
* }
* ```
*/
function createToolLogger(api, toolName) {
	const prefix = `${toolName}:`;
	return {
		info: (msg) => {
			if (api.logger.info) api.logger.info(`${prefix} ${msg}`);
		},
		warn: (msg) => {
			if (api.logger.warn) api.logger.warn(`${prefix} ${msg}`);
		},
		error: (msg) => {
			if (api.logger.error) api.logger.error(`${prefix} ${msg}`);
		},
		debug: (msg) => {
			if (api.logger.debug) api.logger.debug(`${prefix} ${msg}`);
		}
	};
}
//#endregion
//#region src/tools/auto-auth.ts
const log$2 = larkLogger("tools/auto-auth");
/**
* 防抖缓冲区 Map。
*
* Key 规则：
*   用户授权：`user:${accountId}:${senderOpenId}:${messageId}`
*   应用授权：`app:${accountId}:${chatId}:${messageId}`
*/
const authBatches = /* @__PURE__ */ new Map();
/** 防抖窗口（毫秒） */
const AUTH_DEBOUNCE_MS = 50;
/** 用户授权防抖窗口（毫秒）。比 app auth 的 50ms 更长，保证应用权限卡片先发出。 */
const AUTH_USER_DEBOUNCE_MS = 150;
/**
* Scope 更新防抖窗口（毫秒）。
* 比初始防抖更长，因为工具调用可能间隔数十到数百毫秒顺序到达。
* 需要等足够久以收集所有后续到达的 scope 后再一次性更新卡片。
*/
const AUTH_UPDATE_DEBOUNCE_MS = 500;
/**
* 冷却期（毫秒）。
* flushFn 执行完毕后，entry 继续保留在 Map 中这么长时间，
* 防止后续顺序到达的工具调用创建重复卡片。
*/
const AUTH_COOLDOWN_MS = 3e4;
/**
* 将授权请求入队到防抖缓冲区。
*
* 同一 bufferKey 的请求会被合并：
* - collecting 阶段：scope 集合取并集，共享同一个 flushFn 执行结果
* - executing 阶段：flushFn 已在运行，后续请求直接复用已有结果（不重复发卡片）
*
* @param bufferKey - 缓冲区 key（区分不同用户/会话）
* @param scopes - 本次请求需要的 scope 列表
* @param ctx - 上下文信息（仅第一个请求的被采用）
* @param flushFn - 定时器到期后执行的实际授权函数，接收合并后的 scope 数组
*/
function enqueueAuthRequest(bufferKey, scopes, ctx, flushFn, debounceMs = AUTH_DEBOUNCE_MS) {
	const existing = authBatches.get(bufferKey);
	if (existing) {
		for (const s of scopes) existing.scopes.add(s);
		if (existing.phase === "executing") {
			log$2.info(`auth in-flight, piggyback → key=${bufferKey}, scopes=[${[...existing.scopes].join(", ")}]`);
			if (existing.updateTimer) clearTimeout(existing.updateTimer);
			existing.updateTimer = setTimeout(async () => {
				existing.updateTimer = null;
				if (existing.isUpdating) {
					existing.pendingReupdate = true;
					log$2.info(`scope update deferred (previous update still running) → key=${bufferKey}`);
					return;
				}
				existing.isUpdating = true;
				try {
					const mergedScopes = [...existing.scopes];
					log$2.info(`scope update flush → key=${bufferKey}, scopes=[${mergedScopes.join(", ")}]`);
					await existing.flushFn(mergedScopes);
				} catch (err) {
					log$2.warn(`scope update failed: ${err}`);
				} finally {
					existing.isUpdating = false;
					if (existing.pendingReupdate) {
						existing.pendingReupdate = false;
						const finalScopes = [...existing.scopes];
						log$2.info(`scope reupdate → key=${bufferKey}, scopes=[${finalScopes.join(", ")}]`);
						try {
							await existing.flushFn(finalScopes);
						} catch (err) {
							log$2.warn(`scope reupdate failed: ${err}`);
						}
					}
				}
			}, AUTH_UPDATE_DEBOUNCE_MS);
			return existing.resultPromise;
		}
		log$2.info(`debounce merge → key=${bufferKey}, scopes=[${[...existing.scopes].join(", ")}]`);
		return new Promise((resolve, reject) => {
			existing.waiters.push({
				resolve,
				reject
			});
		});
	}
	const entry = {
		phase: "collecting",
		scopes: new Set(scopes),
		waiters: [],
		timer: null,
		resultPromise: null,
		updateTimer: null,
		isUpdating: false,
		pendingReupdate: false,
		flushFn: null,
		account: ctx.account,
		cfg: ctx.cfg,
		ticket: ctx.ticket
	};
	const promise = new Promise((resolve, reject) => {
		entry.waiters.push({
			resolve,
			reject
		});
	});
	entry.timer = setTimeout(async () => {
		entry.phase = "executing";
		entry.timer = null;
		entry.flushFn = flushFn;
		const mergedScopes = [...entry.scopes];
		log$2.info(`debounce flush → key=${bufferKey}, waiters=${entry.waiters.length}, scopes=[${mergedScopes.join(", ")}]`);
		entry.resultPromise = flushFn(mergedScopes);
		try {
			const result = await entry.resultPromise;
			for (const w of entry.waiters) w.resolve(result);
		} catch (err) {
			for (const w of entry.waiters) w.reject(err);
		} finally {
			setTimeout(() => authBatches.delete(bufferKey), AUTH_COOLDOWN_MS);
		}
	}, debounceMs);
	authBatches.set(bufferKey, entry);
	return promise;
}
/** TTL：15 分钟后自动清理，防止内存泄漏。 */
const PENDING_FLOW_TTL_MS = 900 * 1e3;
/** 计算去重 key（chatId + messageId + 有序 scopes）。 */
function makeDedupKey(chatId, messageId, scopes) {
	return chatId + "\0" + messageId + "\0" + [...scopes].sort().join(",");
}
/**
* 应用权限授权流管理器 — 统一管理三个关联索引的一致性。
*
* 替代原来散布的 pendingAppAuthFlows / dedupIndex / activeAppCardIndex 三个 Map，
* 确保注册、删除、迁移操作的原子性。
*/
var AppAuthFlowManager = class {
	flows = /* @__PURE__ */ new Map();
	dedupIndex = /* @__PURE__ */ new Map();
	activeCardIndex = /* @__PURE__ */ new Map();
	/** 原子注册新流程（同时写入 3 个索引 + 设置统一 TTL） */
	register(operationId, flow, dedupKey, activeCardKey) {
		const registered = {
			...flow,
			dedupKey,
			activeCardKey
		};
		this.flows.set(operationId, registered);
		this.dedupIndex.set(dedupKey, operationId);
		this.activeCardIndex.set(activeCardKey, operationId);
		setTimeout(() => {
			if (!this.flows.has(operationId)) return;
			this.remove(operationId);
		}, PENDING_FLOW_TTL_MS);
	}
	/** 只需 operationId 即可原子清理所有索引 */
	remove(operationId) {
		const flow = this.flows.get(operationId);
		if (!flow) return;
		if (flow.ticket?.senderOpenId) {
			const deferKey = `${flow.accountId}:${flow.ticket.senderOpenId}:${flow.ticket.messageId}`;
			deferredUserAuth.delete(deferKey);
		}
		this.flows.delete(operationId);
		if (this.dedupIndex.get(flow.dedupKey) === operationId) this.dedupIndex.delete(flow.dedupKey);
		if (this.activeCardIndex.get(flow.activeCardKey) === operationId) this.activeCardIndex.delete(flow.activeCardKey);
	}
	/**
	* 迁移到新 operationId（卡片复用场景：按钮回调需要匹配新 ID）。
	* 原子操作：清理旧索引 → 更新 flow → 建立新索引 → 注册新 TTL。
	*
	* 修复原代码卡片复用路径缺少 TTL 注册导致的内存泄漏。
	*/
	migrateToNewOperationId(oldOperationId, newOperationId, updates) {
		const flow = this.flows.get(oldOperationId);
		if (!flow) return void 0;
		this.flows.delete(oldOperationId);
		if (updates?.dedupKey) {
			if (this.dedupIndex.get(flow.dedupKey) === oldOperationId) this.dedupIndex.delete(flow.dedupKey);
			flow.dedupKey = updates.dedupKey;
		}
		if (updates?.requiredScopes) flow.requiredScopes = updates.requiredScopes;
		if (updates?.scopeNeedType) flow.scopeNeedType = updates.scopeNeedType;
		this.flows.set(newOperationId, flow);
		this.dedupIndex.set(flow.dedupKey, newOperationId);
		this.activeCardIndex.set(flow.activeCardKey, newOperationId);
		setTimeout(() => {
			if (!this.flows.has(newOperationId)) return;
			this.remove(newOperationId);
		}, PENDING_FLOW_TTL_MS);
		return flow;
	}
	/** 通过 operationId 查询（card action 回调用） */
	getByOperationId(id) {
		return this.flows.get(id);
	}
	/** 通过去重键查询（避免发送重复卡片） */
	getByDedupKey(key) {
		const opId = this.dedupIndex.get(key);
		if (!opId) return void 0;
		const flow = this.flows.get(opId);
		return flow ? {
			operationId: opId,
			flow
		} : void 0;
	}
	/** 通过活跃卡片键查询（同消息卡片复用） */
	getByActiveCardKey(key) {
		const opId = this.activeCardIndex.get(key);
		if (!opId) return void 0;
		const flow = this.flows.get(opId);
		return flow ? {
			operationId: opId,
			flow
		} : void 0;
	}
};
const appAuthFlows = new AppAuthFlowManager();
/** 延迟用户授权队列。Key: `${accountId}:${senderOpenId}:${messageId}` */
const deferredUserAuth = /* @__PURE__ */ new Map();
/**
* 检查指定消息上下文是否有未完成的应用权限授权流程。
* 检查两个来源：
*   1. authBatches 中的 app auth entry（collecting/executing 阶段）
*   2. appAuthFlows 中的活跃流（卡片已发送，等待用户点击"已完成"）
*/
function hasActiveAppAuthForMessage(ticket) {
	const appKey = `app:${ticket.accountId}:${ticket.chatId}:${ticket.messageId}`;
	const appEntry = authBatches.get(appKey);
	if (appEntry && (appEntry.phase === "collecting" || appEntry.phase === "executing")) return true;
	const activeCardKey = `${ticket.chatId}:${ticket.messageId}`;
	return !!appAuthFlows.getByActiveCardKey(activeCardKey);
}
/**
* 将用户授权 scope 添加到延迟队列。
* 多个工具调用的 scope 会被合并到同一个 entry。
*/
function addToDeferredUserAuth(ticket, scopes, account, cfg) {
	const key = `${ticket.accountId}:${ticket.senderOpenId}:${ticket.messageId}`;
	const existing = deferredUserAuth.get(key);
	if (existing) {
		for (const s of scopes) existing.scopes.add(s);
		log$2.info(`deferred user auth scope merge → key=${key}, scopes=[${[...existing.scopes].join(", ")}]`);
	} else {
		deferredUserAuth.set(key, {
			scopes: new Set(scopes),
			account,
			cfg,
			ticket
		});
		log$2.info(`deferred user auth created → key=${key}, scopes=[${scopes.join(", ")}]`);
	}
}
/** v2 卡片 i18n 配置 */
const I18N_CONFIG = {
	update_multi: true,
	locales: ["zh_cn", "en_us"]
};
/**
* 构建应用权限引导卡片。
*
* 橙色 header，列出缺失的 scope，提供权限管理链接和"已完成"按钮。
*/
function buildAppScopeMissingCard(params) {
	const { missingScopes, appId, operationId, brand } = params;
	const openDomain = brand === "lark" ? "https://open.larksuite.com" : "https://open.feishu.cn";
	const multiUrl = {
		url: appId ? `${openDomain}/app/${appId}/auth?q=${encodeURIComponent(missingScopes.join(","))}&op_from=feishu-openclaw&token_type=user` : `${openDomain}/`,
		pc_url: "",
		android_url: "",
		ios_url: ""
	};
	const scopeList = missingScopes.map((s) => `• ${s}`).join("\n");
	return {
		schema: "2.0",
		config: {
			wide_screen_mode: true,
			...I18N_CONFIG
		},
		header: {
			title: {
				tag: "plain_text",
				content: "🔐 Permissions required to continue",
				i18n_content: {
					zh_cn: "🔐 需要申请权限才能继续",
					en_us: "🔐 Permissions required to continue"
				}
			},
			template: "orange"
		},
		body: { elements: [
			{
				tag: "markdown",
				content: `Please request **all** the following permissions to proceed:\n\n${scopeList}`,
				i18n_content: {
					zh_cn: `调用前，请你先申请以下**所有**权限：\n\n${scopeList}`,
					en_us: `Please request **all** the following permissions to proceed:\n\n${scopeList}`
				},
				text_size: "normal"
			},
			{ tag: "hr" },
			{
				tag: "markdown",
				content: "**Step 1: Request all permissions**",
				i18n_content: {
					zh_cn: "**第一步：申请所有权限**",
					en_us: "**Step 1: Request all permissions**"
				},
				text_size: "normal"
			},
			{
				tag: "button",
				text: {
					tag: "plain_text",
					content: "Request Now",
					i18n_content: {
						zh_cn: "去申请",
						en_us: "Request Now"
					}
				},
				type: "primary",
				multi_url: multiUrl
			},
			{
				tag: "markdown",
				content: "**Step 2: Create version and get approval**",
				i18n_content: {
					zh_cn: "**第二步：创建版本并审核通过**",
					en_us: "**Step 2: Create version and get approval**"
				},
				text_size: "normal"
			},
			{
				tag: "button",
				text: {
					tag: "plain_text",
					content: "Done",
					i18n_content: {
						zh_cn: "已完成",
						en_us: "Done"
					}
				},
				type: "default",
				value: {
					action: "app_auth_done",
					operation_id: operationId
				}
			}
		] }
	};
}
/**
* 构建应用权限引导卡片的"处理中"状态（用户点击按钮后更新）。
*/
function buildAppAuthProgressCard() {
	return {
		schema: "2.0",
		config: {
			wide_screen_mode: false,
			...I18N_CONFIG
		},
		header: {
			title: {
				tag: "plain_text",
				content: "Permissions enabled",
				i18n_content: {
					zh_cn: "应用权限已开通",
					en_us: "Permissions enabled"
				}
			},
			subtitle: {
				tag: "plain_text",
				content: ""
			},
			template: "green",
			padding: "12px 12px 12px 12px",
			icon: {
				tag: "standard_icon",
				token: "yes_filled"
			}
		},
		body: { elements: [{
			tag: "markdown",
			content: "App permissions ready. Starting user authorization...",
			i18n_content: {
				zh_cn: "你的应用权限已开通，正在为你发起用户授权",
				en_us: "App permissions ready. Starting user authorization..."
			},
			text_size: "normal"
		}] }
	};
}
/**
* 发送应用权限引导卡片，并将 flow 存入 pendingAppAuthFlows。
* 返回工具结果（告知 AI 等待用户操作）。
*/
async function sendAppScopeCard(params) {
	const { account, missingScopes, appId, scopeNeedType, tokenType, cfg, ticket } = params;
	const { accountId, chatId, messageId } = ticket;
	const activeCardKey = `${chatId}:${messageId}`;
	const dedup = makeDedupKey(chatId, messageId, missingScopes);
	if (appAuthFlows.getByDedupKey(dedup)) {
		log$2.info(`dedup – app-scope card already pending for chatId=${chatId}, scopes=[${missingScopes.join(", ")}], skipping duplicate send`);
		return json({
			awaiting_app_authorization: true,
			message: "已向用户发送授权引导卡片，等待用户完成授权操作。请告知用户：按照卡片提示完成授权，完成后系统将自动重试之前的操作。请等待用户完成卡片操作，不要建议其他替代方案。",
			missing_scopes: missingScopes
		});
	}
	const activeEntry = appAuthFlows.getByActiveCardKey(activeCardKey);
	if (activeEntry) {
		const { operationId: activeOpId, flow: activeFlow } = activeEntry;
		const newOperationId = Date.now().toString(36) + Math.random().toString(36).slice(2);
		const card = buildAppScopeMissingCard({
			missingScopes,
			appId,
			operationId: newOperationId,
			brand: account.brand
		});
		const newSeq = activeFlow.sequence + 1;
		const newDedup = makeDedupKey(chatId, messageId, missingScopes);
		const migrated = appAuthFlows.migrateToNewOperationId(activeOpId, newOperationId, {
			dedupKey: newDedup,
			requiredScopes: missingScopes,
			scopeNeedType
		});
		if (!migrated) log$2.info(`migrate raced, falling through to new card creation`);
		else try {
			await updateCardKitCardForAuth({
				cfg,
				cardId: activeFlow.cardId,
				card,
				sequence: newSeq,
				accountId
			});
			log$2.info(`app-scope card updated in-place, cardId=${activeFlow.cardId}, seq=${newSeq}, scopes=[${missingScopes.join(", ")}]`);
			migrated.sequence = newSeq;
			return json({
				awaiting_app_authorization: true,
				message: "已向用户发送授权引导卡片，等待用户完成授权操作。请告知用户：按照卡片提示完成授权，完成后系统将自动重试之前的操作。请等待用户完成卡片操作，不要建议其他替代方案。",
				missing_scopes: missingScopes
			});
		} catch (err) {
			appAuthFlows.remove(newOperationId);
			log$2.warn(`failed to update existing app-scope card, creating new one: ${err}`);
		}
	}
	const operationId = Date.now().toString(36) + Math.random().toString(36).slice(2);
	const cardId = await createCardEntity({
		cfg,
		card: buildAppScopeMissingCard({
			missingScopes,
			appId,
			operationId,
			brand: account.brand
		}),
		accountId
	});
	if (!cardId) {
		log$2.warn("createCardEntity failed for app-scope card, falling back");
		return json({
			error: "app_scope_missing",
			missing_scopes: missingScopes,
			message: `应用缺少以下权限：${missingScopes.join(", ")}，请管理员在开放平台开通后重试。` + (appId ? `\n权限管理：${account.brand === "lark" ? "https://open.larksuite.com" : "https://open.feishu.cn"}/app/${appId}/permission` : "")
		});
	}
	await sendCardByCardId({
		cfg,
		to: chatId,
		cardId,
		replyToMessageId: ticket.messageId?.startsWith("om_") ? ticket.messageId : void 0,
		replyInThread: Boolean(ticket?.threadId),
		accountId
	});
	const flow = {
		appId: appId ?? account.appId,
		accountId,
		cardId,
		sequence: 0,
		requiredScopes: missingScopes,
		scopeNeedType,
		tokenType,
		cfg,
		ticket
	};
	appAuthFlows.register(operationId, flow, dedup, activeCardKey);
	log$2.info(`app-scope card sent, operationId=${operationId}, scopes=[${missingScopes.join(", ")}]`);
	return json({
		awaiting_app_authorization: true,
		message: "已向用户发送授权引导卡片，等待用户完成授权操作。请告知用户：按照卡片提示完成授权，完成后系统将自动重试之前的操作。请等待用户完成卡片操作，不要建议其他替代方案。",
		missing_scopes: missingScopes
	});
}
/**
* 处理 card.action.trigger 回调事件（由 monitor.ts 调用）。
*
* 当用户点击应用权限引导卡片的"我已完成，继续授权"按钮时：
* 1. 更新卡片为"处理中"状态
* 2. 清除应用 scope 缓存
* 3. 发送中间合成消息告知 AI
* 4. 发起 OAuth Device Flow
*
* 注意：函数体内的主要逻辑通过 setImmediate + fire-and-forget 异步执行，
* 确保 Feishu card.action.trigger 回调在 3 秒内返回。
*/
async function handleCardAction(data, cfg, accountId) {
	let action;
	let operationId;
	let senderOpenId;
	try {
		const event = data;
		action = event.action?.value?.action;
		operationId = event.action?.value?.operation_id;
		senderOpenId = event.operator?.open_id;
	} catch {
		return;
	}
	if (action !== "app_auth_done" || !operationId) return;
	const flow = appAuthFlows.getByOperationId(operationId);
	if (!flow) {
		log$2.warn(`card action ${operationId} not found (expired or already handled)`);
		return;
	}
	log$2.info(`app_auth_done clicked by ${senderOpenId}, operationId=${operationId}`);
	invalidateAppScopeCache(flow.appId);
	const acct = getLarkAccount(flow.cfg, flow.accountId);
	if (!acct.configured) {
		log$2.warn(`account ${flow.accountId} not configured, skipping OAuth`);
		return;
	}
	const sdk = LarkClient.fromAccount(acct).sdk;
	let grantedScopes = [];
	try {
		grantedScopes = await getAppGrantedScopes(sdk, flow.appId, flow.tokenType);
	} catch (err) {
		log$2.warn(`failed to re-check app scopes: ${err}, proceeding anyway`);
	}
	if (!isAppScopeSatisfied(grantedScopes, flow.requiredScopes, flow.scopeNeedType)) {
		log$2.warn(`app scopes still missing after user confirmation: [${flow.requiredScopes.join(", ")}]`);
		return { toast: {
			type: "error",
			content: "权限尚未开通，请确认已申请并审核通过后再试"
		} };
	}
	log$2.info(`app scopes verified, proceeding with OAuth`);
	const deferKey = flow.ticket.senderOpenId ? `${flow.accountId}:${flow.ticket.senderOpenId}:${flow.ticket.messageId}` : void 0;
	const consumedDeferred = deferKey ? deferredUserAuth.get(deferKey) : void 0;
	if (consumedDeferred && deferKey) {
		deferredUserAuth.delete(deferKey);
		log$2.info(`consumed deferred user auth scopes: [${[...consumedDeferred.scopes].join(", ")}]`);
	}
	appAuthFlows.remove(operationId);
	const successCard = buildAppAuthProgressCard();
	setImmediate(async () => {
		try {
			try {
				await updateCardKitCardForAuth({
					cfg,
					cardId: flow.cardId,
					card: successCard,
					sequence: flow.sequence + 1,
					accountId
				});
			} catch (err) {
				log$2.warn(`failed to update app-scope card to progress via API: ${err}`);
			}
			if (!flow.ticket.senderOpenId) {
				log$2.warn("no senderOpenId in ticket, skipping OAuth");
				return;
			}
			const mergedScopes = new Set(flow.requiredScopes.filter((s) => s !== "offline_access"));
			if (consumedDeferred) for (const s of consumedDeferred.scopes) mergedScopes.add(s);
			const userBatchKey = `user:${flow.accountId}:${flow.ticket.senderOpenId}:${flow.ticket.messageId}`;
			const userBatch = authBatches.get(userBatchKey);
			if (userBatch) {
				for (const s of userBatch.scopes) mergedScopes.add(s);
				log$2.info(`merged user batch scopes into app auth completion: [${[...mergedScopes].join(", ")}]`);
			}
			if (mergedScopes.size === 0) {
				log$2.info("no business scopes to authorize after app auth, sending synthetic message for retry");
				const syntheticMsgId = `${flow.ticket.messageId}:app-auth-complete`;
				const syntheticEvent = {
					sender: { sender_id: { open_id: flow.ticket.senderOpenId } },
					message: {
						message_id: syntheticMsgId,
						chat_id: flow.ticket.chatId,
						chat_type: flow.ticket.chatType ?? "p2p",
						message_type: "text",
						content: JSON.stringify({ text: "应用权限已开通，请继续执行之前的操作。" }),
						thread_id: flow.ticket.threadId
					}
				};
				const syntheticRuntime = {
					log: (msg) => log$2.info(msg),
					error: (msg) => log$2.error(msg)
				};
				const { promise } = enqueueFeishuChatTask({
					accountId: flow.accountId,
					chatId: flow.ticket.chatId,
					threadId: flow.ticket.threadId,
					task: async () => {
						await withTicket({
							messageId: syntheticMsgId,
							chatId: flow.ticket.chatId,
							accountId: flow.accountId,
							startTime: Date.now(),
							senderOpenId: flow.ticket.senderOpenId,
							chatType: flow.ticket.chatType,
							threadId: flow.ticket.threadId
						}, () => handleFeishuMessage({
							cfg: flow.cfg,
							event: syntheticEvent,
							accountId: flow.accountId,
							forceMention: true,
							runtime: syntheticRuntime,
							replyToMessageId: flow.ticket.messageId
						}));
					}
				});
				await promise;
				log$2.info("synthetic message dispatched after app-auth-only completion");
			} else await executeAuthorize({
				account: acct,
				senderOpenId: flow.ticket.senderOpenId,
				scope: [...mergedScopes].join(" "),
				showBatchAuthHint: true,
				forceAuth: true,
				cfg: flow.cfg,
				ticket: flow.ticket
			});
		} catch (err) {
			log$2.error(`handleCardAction background task failed: ${err}`);
		}
	});
	return {
		toast: {
			type: "success",
			content: "权限确认成功"
		},
		card: {
			type: "raw",
			data: successCard
		}
	};
}
/**
* 统一处理 `client.invoke()` 抛出的错误，支持自动发起 OAuth 授权。
*
* 替代 `handleInvokeError`，在工具层直接处理授权问题：
* - 用户授权类错误 → 直接 executeAuthorize（发 Device Flow 卡片）
* - 应用权限缺失 → 发送引导卡片，用户确认后自动接力 OAuth
* - 其他错误 → 回退到 handleInvokeError 的标准处理
*
* @param err - invoke() 或其他逻辑抛出的错误
* @param cfg - OpenClaw 配置对象（从工具注册函数的闭包中获取）
*/
async function handleInvokeErrorWithAutoAuth(err, cfg) {
	const ticket = getTicket();
	if (err instanceof OwnerAccessDeniedError) return json({
		error: "permission_denied",
		message: "当前应用仅限所有者（App Owner）使用。您没有权限使用相关功能。",
		user_open_id: err.userOpenId
	});
	if (ticket) {
		const senderOpenId = ticket.senderOpenId;
		if (senderOpenId) {
			if (err instanceof UserAuthRequiredError && err.appScopeVerified) {
				const scopes = err.requiredScopes;
				try {
					const acct = getLarkAccount(cfg, ticket.accountId);
					if (acct.configured) {
						if (hasActiveAppAuthForMessage(ticket)) {
							addToDeferredUserAuth(ticket, scopes, acct, cfg);
							log$2.info(`UserAuthRequiredError deferred (app auth pending), scopes=[${scopes.join(", ")}]`);
							return json({
								awaiting_app_authorization: true,
								user_auth_deferred: true,
								message: "应用权限尚未开通，将在应用权限通过后自动为您发起用户授权。请先按照应用权限卡片的提示完成操作。请等待用户完成卡片操作，不要建议其他替代方案。",
								deferred_scopes: scopes
							});
						}
						const bufferKey = `user:${ticket.accountId}:${senderOpenId}:${ticket.messageId}`;
						log$2.info(`UserAuthRequiredError → enqueue, key=${bufferKey}, scopes=[${scopes.join(", ")}]`);
						return await enqueueAuthRequest(bufferKey, scopes, {
							account: acct,
							cfg,
							ticket
						}, async (mergedScopes) => {
							const appKey = `app:${ticket.accountId}:${ticket.chatId}:${ticket.messageId}`;
							const appEntry = authBatches.get(appKey);
							if (appEntry?.resultPromise) await appEntry.resultPromise.catch(() => {});
							return executeAuthorize({
								account: acct,
								senderOpenId,
								scope: mergedScopes.join(" "),
								showBatchAuthHint: true,
								cfg,
								ticket
							});
						}, AUTH_USER_DEBOUNCE_MS);
					}
				} catch (autoAuthErr) {
					log$2.warn(`executeAuthorize failed: ${autoAuthErr}, falling back`);
				}
			}
			if (err instanceof UserScopeInsufficientError) {
				const scopes = err.missingScopes;
				try {
					const acct = getLarkAccount(cfg, ticket.accountId);
					if (acct.configured) {
						if (hasActiveAppAuthForMessage(ticket)) {
							addToDeferredUserAuth(ticket, scopes, acct, cfg);
							log$2.info(`UserScopeInsufficientError deferred (app auth pending), scopes=[${scopes.join(", ")}]`);
							return json({
								awaiting_app_authorization: true,
								user_auth_deferred: true,
								message: "应用权限尚未开通，将在应用权限通过后自动为您发起用户授权。请先按照应用权限卡片的提示完成操作。请等待用户完成卡片操作，不要建议其他替代方案。",
								deferred_scopes: scopes
							});
						}
						const bufferKey = `user:${ticket.accountId}:${senderOpenId}:${ticket.messageId}`;
						log$2.info(`UserScopeInsufficientError → enqueue, key=${bufferKey}, scopes=[${scopes.join(", ")}]`);
						return await enqueueAuthRequest(bufferKey, scopes, {
							account: acct,
							cfg,
							ticket
						}, async (mergedScopes) => {
							const appKey = `app:${ticket.accountId}:${ticket.chatId}:${ticket.messageId}`;
							const appEntry = authBatches.get(appKey);
							if (appEntry?.resultPromise) await appEntry.resultPromise.catch(() => {});
							return executeAuthorize({
								account: acct,
								senderOpenId,
								scope: mergedScopes.join(" "),
								showBatchAuthHint: true,
								cfg,
								ticket
							});
						}, AUTH_USER_DEBOUNCE_MS);
					}
				} catch (autoAuthErr) {
					log$2.warn(`executeAuthorize failed: ${autoAuthErr}, falling back`);
				}
			}
		} else log$2.error(`senderOpenId not found ${err}`);
		if (err instanceof AppScopeMissingError && ticket.chatId) {
			const appScopeErr = err;
			try {
				const acct = getLarkAccount(cfg, ticket.accountId);
				if (acct.configured) {
					if (senderOpenId && appScopeErr.allRequiredScopes?.length) {
						addToDeferredUserAuth(ticket, appScopeErr.allRequiredScopes, acct, cfg);
						log$2.info(`AppScopeMissingError → deferred allRequiredScopes=[${appScopeErr.allRequiredScopes.join(", ")}]`);
					}
					const bufferKey = `app:${ticket.accountId}:${ticket.chatId}:${ticket.messageId}`;
					log$2.info(`AppScopeMissingError → enqueue, key=${bufferKey}, scopes=[${appScopeErr.missingScopes.join(", ")}]`);
					return await enqueueAuthRequest(bufferKey, appScopeErr.missingScopes, {
						account: acct,
						cfg,
						ticket
					}, (mergedScopes) => sendAppScopeCard({
						account: acct,
						missingScopes: mergedScopes,
						appId: appScopeErr.appId,
						scopeNeedType: "all",
						tokenType: appScopeErr.tokenType,
						cfg,
						ticket
					}));
				}
			} catch (cardErr) {
				log$2.warn(`sendAppScopeCard failed: ${cardErr}, falling back`);
			}
		}
	} else log$2.error(`ticket not found ${err}`);
	return json({ error: formatLarkError(err) });
}
//#endregion
//#region src/tools/oapi/helpers.ts
/**
* 格式化返回值为 JSON（OAPI 工具常用简化接口）
*
* 这是对 formatToolResult 的简化封装，函数名更短便于频繁使用。
*
* @param data - 要返回的数据
* @returns 格式化的工具返回值
*
* @example
* ```typescript
* return json({ task: taskData });
* return json({ error: "Invalid parameter" });
* ```
*/
function json(data) {
	return formatToolResult(data);
}
/**
* 解析时间字符串为 Unix 时间戳（秒）
*
* 支持多种格式：
* 1. ISO 8601 / RFC 3339（带时区）："2024-01-01T00:00:00+08:00"
* 2. 不带时区的格式（默认为北京时间 UTC+8）：
*    - "2026-02-25 14:30"
*    - "2026-02-25 14:30:00"
*    - "2026-02-25T14:30:00"
*
* @param input - 时间字符串
* @returns Unix 时间戳字符串（秒），解析失败返回 null
*
* @example
* ```typescript
* parseTimeToTimestamp("2026-02-25T14:30:00+08:00")  // => "1740459000"
* parseTimeToTimestamp("2026-02-25 14:30")           // => "1740459000" (默认北京时间)
* parseTimeToTimestamp("2026-02-25T14:30:00")        // => "1740459000" (默认北京时间)
* parseTimeToTimestamp("invalid")                    // => null
* ```
*/
function parseTimeToTimestamp(input) {
	try {
		const trimmed = input.trim();
		if (/[Zz]$|[+-]\d{2}:\d{2}$/.test(trimmed)) {
			const date = new Date(trimmed);
			if (isNaN(date.getTime())) return null;
			return Math.floor(date.getTime() / 1e3).toString();
		}
		const match = trimmed.replace("T", " ").match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
		if (!match) {
			const date = new Date(trimmed);
			if (isNaN(date.getTime())) return null;
			return Math.floor(date.getTime() / 1e3).toString();
		}
		const [, year, month, day, hour, minute, second] = match;
		const utcDate = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour) - 8, parseInt(minute), parseInt(second ?? "0")));
		return Math.floor(utcDate.getTime() / 1e3).toString();
	} catch {
		return null;
	}
}
/**
* 解析时间字符串为 Unix 时间戳（毫秒）
*
* 支持多种格式：
* 1. ISO 8601 / RFC 3339（带时区）："2024-01-01T00:00:00+08:00"
* 2. 不带时区的格式（默认为北京时间 UTC+8）：
*    - "2026-02-25 14:30"
*    - "2026-02-25 14:30:00"
*    - "2026-02-25T14:30:00"
*
* @param input - 时间字符串
* @returns Unix 时间戳字符串（毫秒），解析失败返回 null
*
* @example
* ```typescript
* parseTimeToTimestampMs("2026-02-25T14:30:00+08:00")  // => "1740459000000"
* parseTimeToTimestampMs("2026-02-25 14:30")           // => "1740459000000" (默认北京时间)
* parseTimeToTimestampMs("2026-02-25T14:30:00")        // => "1740459000000" (默认北京时间)
* parseTimeToTimestampMs("invalid")                    // => null
* ```
*/
function parseTimeToTimestampMs(input) {
	try {
		const trimmed = input.trim();
		if (/[Zz]$|[+-]\d{2}:\d{2}$/.test(trimmed)) {
			const date = new Date(trimmed);
			if (isNaN(date.getTime())) return null;
			return date.getTime().toString();
		}
		const match = trimmed.replace("T", " ").match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
		if (!match) {
			const date = new Date(trimmed);
			if (isNaN(date.getTime())) return null;
			return date.getTime().toString();
		}
		const [, year, month, day, hour, minute, second] = match;
		return new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour) - 8, parseInt(minute), parseInt(second ?? "0"))).getTime().toString();
	} catch {
		return null;
	}
}
/**
* 解析时间字符串为 RFC 3339 格式（用于 freebusy API）
*
* 支持多种格式：
* 1. ISO 8601 / RFC 3339（带时区）："2024-01-01T00:00:00+08:00" - 直接返回
* 2. 不带时区的格式（默认为北京时间 UTC+8）：
*    - "2026-02-25 14:30" - 转换为 "2026-02-25T14:30:00+08:00"
*    - "2026-02-25 14:30:00" - 转换为 "2026-02-25T14:30:00+08:00"
*    - "2026-02-25T14:30:00" - 转换为 "2026-02-25T14:30:00+08:00"
*
* @param input - 时间字符串
* @returns RFC 3339 格式的时间字符串，解析失败返回 null
*
* @example
* ```typescript
* parseTimeToRFC3339("2026-02-25T14:30:00+08:00")  // => "2026-02-25T14:30:00+08:00"
* parseTimeToRFC3339("2026-02-25 14:30")           // => "2026-02-25T14:30:00+08:00"
* parseTimeToRFC3339("2026-02-25T14:30:00")        // => "2026-02-25T14:30:00+08:00"
* ```
*/
function parseTimeToRFC3339(input) {
	try {
		const trimmed = input.trim();
		if (/[Zz]$|[+-]\d{2}:\d{2}$/.test(trimmed)) {
			const date = new Date(trimmed);
			if (isNaN(date.getTime())) return null;
			return trimmed;
		}
		const match = trimmed.replace("T", " ").match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
		if (!match) {
			const date = new Date(trimmed);
			if (isNaN(date.getTime())) return null;
			return trimmed.includes("T") ? `${trimmed}+08:00` : trimmed;
		}
		const [, year, month, day, hour, minute, second] = match;
		return `${year}-${month}-${day}T${hour}:${minute}:${second ?? "00"}+08:00`;
	} catch {
		return null;
	}
}
/**
* 转换时间范围对象（用于 search 等 API）
*
* 将包含 ISO 8601 格式时间字符串的时间范围转换为时间戳。
*
* @param timeRange - 时间范围对象，包含可选的 start 和 end 字段
* @param unit - 时间戳单位，'s' 为秒，'ms' 为毫秒，默认为 's'
* @returns 转换后的时间范围对象，包含数字类型的时间戳
* @throws 如果时间格式错误
*
* @example
* ```typescript
* convertTimeRange({ start: "2026-02-25T14:00:00+08:00", end: "2026-02-25T18:00:00+08:00" })
* // => { start: 1740459000, end: 1740473400 }
*
* convertTimeRange({ start: "2026-02-25T14:00:00+08:00" }, 'ms')
* // => { start: 1740459000000 }
* ```
*/
function convertTimeRange(timeRange, unit = "s") {
	if (!timeRange) return void 0;
	const result = {};
	const parseFn = unit === "ms" ? parseTimeToTimestampMs : parseTimeToTimestamp;
	if (timeRange.start) {
		const ts = parseFn(timeRange.start);
		if (!ts) throw new Error(`Invalid time format for start. Must use ISO 8601 / RFC 3339 with timezone, e.g. "2024-01-01T00:00:00+08:00". Received: ${timeRange.start}`);
		result.start = parseInt(ts, 10);
	}
	if (timeRange.end) {
		const ts = parseFn(timeRange.end);
		if (!ts) throw new Error(`Invalid time format for end. Must use ISO 8601 / RFC 3339 with timezone, e.g. "2024-01-01T00:00:00+08:00". Received: ${timeRange.end}`);
		result.end = parseInt(ts, 10);
	}
	return Object.keys(result).length > 0 ? result : void 0;
}
const SHANGHAI_OFFSET_SUFFIX = "+08:00";
function pad2(value) {
	return String(value).padStart(2, "0");
}
/**
* Convert a Unix timestamp (seconds or milliseconds) to ISO 8601 string
* in the Asia/Shanghai timezone.
*
* Auto-detects seconds vs milliseconds based on magnitude.
*
* @returns e.g. `"2026-02-25T14:30:00+08:00"`, or `null` on invalid input
*/
function unixTimestampToISO8601(raw) {
	if (raw === void 0 || raw === null) return null;
	const text = typeof raw === "number" ? String(raw) : String(raw).trim();
	if (!/^-?\d+$/.test(text)) return null;
	const num = Number(text);
	if (!Number.isFinite(num)) return null;
	const utcMs = Math.abs(num) >= 0xe8d4a51000 ? num : num * 1e3;
	const beijingDate = new Date(utcMs + 480 * 60 * 1e3);
	if (Number.isNaN(beijingDate.getTime())) return null;
	return `${beijingDate.getUTCFullYear()}-${pad2(beijingDate.getUTCMonth() + 1)}-${pad2(beijingDate.getUTCDate())}T${pad2(beijingDate.getUTCHours())}:${pad2(beijingDate.getUTCMinutes())}:${pad2(beijingDate.getUTCSeconds())}${SHANGHAI_OFFSET_SUFFIX}`;
}
/**
* Check whether an error is a structured invoke-level auth/permission error.
*
* Useful in intermediate catch blocks that need to let auth errors bubble up
* to the outer `handleInvokeErrorWithAutoAuth`.
*
* For "allow-to-fail" sub-operations, prefer `client.tryInvoke()` over
* manual `isInvokeError` + throw.
*/
function isInvokeError(err) {
	return err instanceof UserAuthRequiredError || err instanceof AppScopeMissingError || err instanceof UserScopeInsufficientError;
}
/**
* 创建 LLM 友好的字符串枚举 schema。
*
* 与 `Type.Union([Type.Literal('a'), Type.Literal('b')])` 不同，
* 本函数生成 `{ type: 'string', enum: ['a', 'b'] }` 格式，
* 兼容性更好。
*/
function StringEnum(values, options) {
	return Type.Unsafe({
		type: "string",
		enum: values,
		...options
	});
}
//#endregion
//#region src/tools/oauth.ts
const log$1 = larkLogger("tools/oauth");
const FeishuOAuthSchema = Type.Object({ action: Type.Union([Type.Literal("revoke")], { description: "revoke: 撤销当前用户已保存的授权凭据" }) }, { description: "飞书用户撤销授权工具。仅在用户明确说\"撤销授权\"、\"取消授权\"、\"退出登录\"、\"清除授权\"时调用。【严禁调用场景】用户说\"重新授权\"、\"发起授权\"、\"重新发起\"、\"授权失败\"、\"授权过期\"时，绝对不要调用此工具，授权流程由系统自动处理。" });
const pendingFlows = /* @__PURE__ */ new Map();
/**
* 使用刚获取的 UAT 调用 /authen/v1/user_info，
* 验证实际完成 OAuth 授权的用户 open_id 是否与预期的 senderOpenId 一致。
*
* 防止群聊中其他用户点击授权链接后，错误的 UAT 被绑定到 owner 的身份。
*/
async function verifyTokenIdentity(brand, accessToken, expectedOpenId) {
	const url = `${brand === "lark" ? "https://open.larksuite.com" : "https://open.feishu.cn"}/open-apis/authen/v1/user_info`;
	try {
		const data = await (await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })).json();
		if (data.code !== 0) {
			log$1.warn(`user_info API error: code=${data.code}, msg=${data.msg}`);
			return { valid: false };
		}
		const actualOpenId = data.data?.open_id;
		if (!actualOpenId) {
			log$1.warn("user_info API returned no open_id");
			return { valid: false };
		}
		return {
			valid: actualOpenId === expectedOpenId,
			actualOpenId
		};
	} catch (err) {
		log$1.warn(`identity verification request failed: ${err}`);
		return { valid: false };
	}
}
function registerFeishuOAuthTool(api) {
	if (!api.config) return;
	const cfg = api.config;
	registerTool(api, {
		name: "feishu_oauth",
		label: "Feishu OAuth",
		description: "飞书用户撤销授权工具。仅在用户明确说\"撤销授权\"、\"取消授权\"、\"退出登录\"、\"清除授权\"时调用 revoke。【严禁调用场景】用户说\"重新授权\"、\"发起授权\"、\"重新发起\"、\"授权失败\"、\"授权过期\"时，绝对不要调用此工具，授权流程由系统自动处理，无需人工干预。不需要传入 user_open_id，系统自动从消息上下文获取当前用户。",
		parameters: FeishuOAuthSchema,
		async execute(_toolCallId, params) {
			const p = params;
			const ticket = getTicket();
			const senderOpenId = ticket?.senderOpenId;
			if (!senderOpenId) return json({ error: "无法获取当前用户身份（senderOpenId），请在飞书对话中使用此工具。" });
			const acct = getLarkAccount(cfg, ticket.accountId);
			if (!acct.configured) return json({ error: `账号 ${ticket.accountId} 缺少 appId 或 appSecret 配置` });
			const account = acct;
			try {
				switch (p.action) {
					case "revoke":
						await revokeUAT(account.appId, senderOpenId);
						return json({
							success: true,
							message: "用户授权已撤销。"
						});
					default: return json({ error: `未知操作: ${p.action}` });
				}
			} catch (err) {
				log$1.error(`${p.action} failed: ${err}`);
				return json({ error: formatLarkError(err) });
			}
		}
	}, { name: "feishu_oauth" });
	api.logger.info?.("feishu_oauth: Registered feishu_oauth tool");
}
/**
* 执行 OAuth 授权流程（Device Flow）
* 可被 feishu_oauth 和 feishu_oauth_batch_auth 共享调用
*/
async function executeAuthorize(params) {
	const { account, senderOpenId, scope, isBatchAuth, totalAppScopes, alreadyGranted, batchInfo, skipSyntheticMessage, showBatchAuthHint, forceAuth, onAuthComplete, cfg, ticket } = params;
	const { appId, appSecret, brand, accountId } = account;
	const sdk = LarkClient.fromAccount(account).sdk;
	try {
		await assertOwnerAccessStrict(account, sdk, senderOpenId);
	} catch (err) {
		if (err instanceof OwnerAccessDeniedError) {
			log$1.warn(`non-owner user ${senderOpenId} attempted to authorize`);
			return json({
				error: "permission_denied",
				message: "当前应用仅限所有者（App Owner）使用。您没有权限发起授权，无法使用相关功能。"
			});
		}
		throw err;
	}
	let effectiveScope = scope;
	const existing = forceAuth ? null : await getStoredToken(appId, senderOpenId);
	if (existing && tokenStatus(existing) !== "expired") if (effectiveScope) {
		const requestedScopes = effectiveScope.split(/\s+/).filter(Boolean);
		const grantedScopes = new Set((existing.scope ?? "").split(/\s+/).filter(Boolean));
		const missingScopes = requestedScopes.filter((s) => !grantedScopes.has(s));
		if (missingScopes.length > 0) log$1.info(`existing token missing scopes [${missingScopes.join(", ")}], starting incremental auth`);
		else {
			if (onAuthComplete) try {
				await onAuthComplete();
			} catch (e) {
				log$1.warn(`onAuthComplete failed: ${e}`);
			}
			return json({
				success: true,
				message: "用户已授权，scope 已覆盖。",
				authorized: true,
				scope: existing.scope
			});
		}
	} else {
		if (onAuthComplete) try {
			await onAuthComplete();
		} catch (e) {
			log$1.warn(`onAuthComplete failed: ${e}`);
		}
		return json({
			success: true,
			message: "用户已授权，无需重复授权。",
			authorized: true,
			scope: existing.scope
		});
	}
	const flowKey = `${appId}:${senderOpenId}`;
	let reuseCardId;
	let reuseSeq = 0;
	if (pendingFlows.has(flowKey)) {
		const oldFlow = pendingFlows.get(flowKey);
		const currentMessageId = ticket?.messageId ?? "";
		if (oldFlow.messageId === currentMessageId) {
			oldFlow.superseded = true;
			oldFlow.controller.abort();
			reuseCardId = oldFlow.cardId;
			reuseSeq = oldFlow.sequence;
			pendingFlows.delete(flowKey);
			if (oldFlow.scope) {
				const oldScopes = oldFlow.scope.split(/\s+/).filter(Boolean);
				const newScopes = effectiveScope?.split(/\s+/).filter(Boolean) ?? [];
				const merged = new Set([...oldScopes, ...newScopes]);
				effectiveScope = [...merged].join(" ");
				log$1.info(`scope merge on reuse: [${[...merged].join(", ")}]`);
			}
			log$1.info(`same message, replacing flow for user=${senderOpenId}, app=${appId}, reusing cardId=${reuseCardId}`);
		} else {
			oldFlow.superseded = true;
			oldFlow.controller.abort();
			pendingFlows.delete(flowKey);
			log$1.info(`new message, cancelling old flow for user=${senderOpenId}, app=${appId}, old cardId=${oldFlow.cardId}`);
			try {
				await updateCardKitCardForAuth({
					cfg,
					cardId: oldFlow.cardId,
					card: buildAuthFailedCard("新的授权请求已发起"),
					sequence: oldFlow.sequence + 1,
					accountId
				});
			} catch (e) {
				log$1.warn(`failed to update old card to expired: ${e}`);
			}
		}
	}
	let filteredScope = effectiveScope;
	let unavailableScopes = [];
	if (effectiveScope) try {
		const sdk = LarkClient.fromAccount(account).sdk;
		const requestedScopes = effectiveScope.split(/\s+/).filter(Boolean);
		const appScopes = await getAppGrantedScopes(sdk, appId, "user");
		const availableScopes = requestedScopes.filter((s) => appScopes.includes(s));
		unavailableScopes = requestedScopes.filter((s) => !appScopes.includes(s));
		if (unavailableScopes.length > 0) {
			log$1.info(`app has not granted scopes [${unavailableScopes.join(", ")}], filtering them out`);
			if (availableScopes.length === 0) {
				const permissionUrl = `${brand === "lark" ? "https://open.larksuite.com" : "https://open.feishu.cn"}/app/${appId}/permission`;
				return json({
					error: "app_scopes_not_granted",
					message: `应用未开通任何请求的用户权限，无法发起授权。请先在开放平台开通以下权限：\n${unavailableScopes.map((s) => `- ${s}`).join("\n")}\n\n权限管理地址：${permissionUrl}`,
					unavailable_scopes: unavailableScopes,
					app_permission_url: permissionUrl
				});
			}
			filteredScope = availableScopes.join(" ");
			log$1.info(`proceeding with available scopes [${availableScopes.join(", ")}]`);
		}
	} catch (err) {
		log$1.warn(`failed to check app scopes, proceeding anyway: ${err}`);
	}
	const deviceAuth = await requestDeviceAuthorization({
		appId,
		appSecret,
		brand,
		scope: filteredScope
	});
	const authCard = buildAuthCard({
		verificationUriComplete: deviceAuth.verificationUriComplete,
		expiresMin: Math.round(deviceAuth.expiresIn / 60),
		scope: filteredScope,
		isBatchAuth,
		totalAppScopes,
		alreadyGranted,
		batchInfo,
		filteredScopes: unavailableScopes.length > 0 ? unavailableScopes : void 0,
		appId,
		showBatchAuthHint,
		brand
	});
	let cardId;
	let seq;
	const chatId = ticket?.chatId;
	if (!chatId || !ticket) return json({ error: "无法确定发送目标" });
	if (reuseCardId) {
		const newSeq = reuseSeq + 1;
		try {
			await updateCardKitCardForAuth({
				cfg,
				cardId: reuseCardId,
				card: authCard,
				sequence: newSeq,
				accountId
			});
			log$1.info(`updated existing card ${reuseCardId} with merged scopes, seq=${newSeq}`);
		} catch (err) {
			log$1.warn(`failed to update existing card, creating new one: ${err}`);
			const newCardId = await createCardEntity({
				cfg,
				card: authCard,
				accountId
			});
			if (!newCardId) return json({ error: "创建授权卡片失败" });
			if (chatId) await sendCardByCardId({
				cfg,
				to: chatId,
				cardId: newCardId,
				replyToMessageId: ticket?.messageId?.startsWith("om_") ? ticket.messageId : void 0,
				replyInThread: Boolean(ticket?.threadId),
				accountId
			});
			cardId = newCardId;
			seq = 1;
			reuseCardId = void 0;
		}
		if (reuseCardId) {
			cardId = reuseCardId;
			seq = newSeq;
		} else {
			cardId = cardId;
			seq = seq;
		}
	} else {
		const newCardId = await createCardEntity({
			cfg,
			card: authCard,
			accountId
		});
		if (!newCardId) return json({ error: "创建授权卡片失败" });
		await sendCardByCardId({
			cfg,
			to: chatId,
			cardId: newCardId,
			replyToMessageId: ticket?.messageId?.startsWith("om_") ? ticket.messageId : void 0,
			replyInThread: Boolean(ticket?.threadId),
			accountId
		});
		cardId = newCardId;
		seq = 1;
	}
	const abortController = new AbortController();
	const currentFlow = {
		controller: abortController,
		cardId,
		sequence: seq,
		messageId: ticket?.messageId ?? "",
		superseded: false,
		scope: effectiveScope
	};
	pendingFlows.set(flowKey, currentFlow);
	let pendingFlowDelete = false;
	pollDeviceToken({
		appId,
		appSecret,
		brand,
		deviceCode: deviceAuth.deviceCode,
		interval: deviceAuth.interval,
		expiresIn: deviceAuth.expiresIn,
		signal: abortController.signal
	}).then(async (result) => {
		if (currentFlow.superseded) {
			log$1.info(`flow superseded, skipping card update for cardId=${cardId}`);
			return;
		}
		if (result.ok) {
			const identity = await verifyTokenIdentity(brand, result.token.accessToken, senderOpenId);
			if (!identity.valid) {
				log$1.warn(`identity mismatch! expected=${senderOpenId}, actual=${identity.actualOpenId ?? "unknown"}, cardId=${cardId}`);
				try {
					await updateCardKitCardForAuth({
						cfg,
						cardId,
						card: buildAuthIdentityMismatchCard(brand),
						sequence: ++seq,
						accountId
					});
				} catch (e) {
					log$1.warn(`failed to update card for identity mismatch: ${e}`);
				}
				pendingFlows.delete(flowKey);
				pendingFlowDelete = true;
				return;
			}
			const now = Date.now();
			await setStoredToken({
				userOpenId: senderOpenId,
				appId,
				accessToken: result.token.accessToken,
				refreshToken: result.token.refreshToken,
				expiresAt: now + result.token.expiresIn * 1e3,
				refreshExpiresAt: now + result.token.refreshExpiresIn * 1e3,
				scope: result.token.scope,
				grantedAt: now
			});
			try {
				await updateCardKitCardForAuth({
					cfg,
					cardId,
					card: buildAuthSuccessCard(brand),
					sequence: ++seq,
					accountId
				});
			} catch (e) {
				log$1.warn(`failed to update card to success: ${e}`);
			}
			pendingFlows.delete(flowKey);
			pendingFlowDelete = true;
			if (onAuthComplete) try {
				await onAuthComplete();
			} catch (e) {
				log$1.warn(`onAuthComplete failed: ${e}`);
			}
			if (skipSyntheticMessage) log$1.info("skipSyntheticMessage=true, skipping synthetic message");
			else try {
				const syntheticMsgId = `${ticket.messageId}:auth-complete`;
				const syntheticEvent = {
					sender: { sender_id: { open_id: senderOpenId } },
					message: {
						message_id: syntheticMsgId,
						chat_id: chatId,
						chat_type: ticket.chatType ?? "p2p",
						message_type: "text",
						content: JSON.stringify({ text: "我已完成飞书账号授权，请继续执行之前的操作。" }),
						thread_id: ticket.threadId
					}
				};
				const syntheticRuntime = {
					log: (msg) => log$1.info(msg),
					error: (msg) => log$1.error(msg)
				};
				const { status, promise } = enqueueFeishuChatTask({
					accountId,
					chatId,
					threadId: ticket.threadId,
					task: async () => {
						await withTicket({
							messageId: syntheticMsgId,
							chatId,
							accountId,
							startTime: Date.now(),
							senderOpenId,
							chatType: ticket.chatType,
							threadId: ticket.threadId
						}, () => handleFeishuMessage({
							cfg,
							event: syntheticEvent,
							accountId,
							forceMention: true,
							runtime: syntheticRuntime,
							replyToMessageId: ticket.messageId
						}));
					}
				});
				log$1.info(`synthetic message queued (${status})`);
				await promise;
				log$1.info("synthetic message dispatched after successful auth");
			} catch (e) {
				log$1.warn(`failed to send synthetic message after auth: ${e}`);
			}
		} else {
			try {
				await updateCardKitCardForAuth({
					cfg,
					cardId,
					card: buildAuthFailedCard(result.message),
					sequence: ++seq,
					accountId
				});
			} catch (e) {
				log$1.warn(`failed to update card to failure: ${e}`);
			}
			pendingFlows.delete(flowKey);
			pendingFlowDelete = true;
		}
	}).catch((err) => {
		log$1.error(`polling error: ${err}`);
	}).finally(() => {
		if (!pendingFlowDelete) {
			if (pendingFlows.get(flowKey) === currentFlow) pendingFlows.delete(flowKey);
		}
	});
	const scopeCount = filteredScope.split(/\s+/).filter(Boolean).length;
	let message = isBatchAuth ? `已发送批量授权请求卡片，共需授权 ${scopeCount} 个权限。请在卡片中完成授权。` : "已发送授权请求卡片，请用户在卡片中点击链接完成授权。授权完成后请重新执行之前的操作。";
	if (batchInfo) message += batchInfo;
	if (unavailableScopes.length > 0) {
		const permissionUrl = `${brand === "lark" ? "https://open.larksuite.com" : "https://open.feishu.cn"}/app/${appId}/permission`;
		message += `\n\n⚠️ **注意**：以下权限因应用未开通而被跳过，如需使用请先在开放平台开通：\n${unavailableScopes.map((s) => `- ${s}`).join("\n")}\n\n权限管理地址：${permissionUrl}`;
	}
	const openDomainForResult = brand === "lark" ? "https://open.larksuite.com" : "https://open.feishu.cn";
	return json({
		success: true,
		message,
		awaiting_authorization: true,
		filtered_scopes: unavailableScopes.length > 0 ? unavailableScopes : void 0,
		app_permission_url: unavailableScopes.length > 0 ? `${openDomainForResult}/app/${appId}/permission` : void 0
	});
}
//#endregion
//#region src/tools/onboarding-auth.ts
const log = larkLogger("tools/onboarding-auth");
const MAX_SCOPES_PER_BATCH = 100;
/**
* 配对后触发 onboarding OAuth 授权。
*
* 流程：
*   1. 检查 userOpenId === 应用 owner，不匹配则静默跳过
*   2. 读取 onboarding-scopes.json 中的 user scope 列表
*   3. 分批处理（每批最多 50 个），第一批直接发起 OAuth Device Flow
*   4. 每批授权完成后通过 onAuthComplete 回调自动发起下一批
*/
async function triggerOnboarding(params) {
	const { cfg, userOpenId, accountId } = params;
	const acct = getLarkAccount(cfg, accountId);
	if (!acct.configured) {
		log.warn(`account ${accountId} not configured, skipping`);
		return;
	}
	const sdk = LarkClient.fromAccount(acct).sdk;
	const { appId } = acct;
	const ownerOpenId = await getAppOwnerFallback(acct, sdk);
	if (!ownerOpenId) {
		log.info(`app ${appId} has no owner info, skipping`);
		return;
	}
	if (userOpenId !== ownerOpenId) {
		log.info(`user ${userOpenId} is not app owner (${ownerOpenId}), skipping`);
		return;
	}
	log.info(`user ${userOpenId} is app owner, starting OAuth`);
	let allUserScopes;
	try {
		allUserScopes = await getAppGrantedScopes(sdk, appId, "user");
	} catch (err) {
		log.warn(`failed to get app granted scopes: ${err}`);
		return;
	}
	allUserScopes = filterSensitiveScopes(allUserScopes);
	if (allUserScopes.length === 0) {
		log.info("no user scopes configured, skipping");
		return;
	}
	const batches = [];
	for (let i = 0; i < allUserScopes.length; i += MAX_SCOPES_PER_BATCH) batches.push(allUserScopes.slice(i, i + MAX_SCOPES_PER_BATCH));
	log.info(`${allUserScopes.length} user scopes, ${batches.length} batch(es)`);
	const startBatch = async (batchIndex) => {
		if (batchIndex >= batches.length) {
			log.info("all batches completed");
			return;
		}
		const batch = batches[batchIndex];
		const scope = batch.join(" ");
		let batchInfo = "";
		if (batches.length > 1) {
			batchInfo = `\n\n📋 授权进度：第 ${batchIndex + 1}/${batches.length} 批（本批 ${batch.length} 个权限，共 ${allUserScopes.length} 个）`;
			if (batchIndex < batches.length - 1) batchInfo += `\n授权完成后将自动发起下一批。`;
			else batchInfo += `\n这是最后一批，授权完成后即可使用所有功能。`;
		}
		const ticket = {
			messageId: `onboarding:${Date.now()}`,
			chatId: userOpenId,
			accountId,
			startTime: Date.now(),
			senderOpenId: userOpenId,
			chatType: "p2p"
		};
		log.info(`starting batch ${batchIndex + 1}/${batches.length}, scopes=${batch.length}`);
		try {
			await executeAuthorize({
				account: acct,
				senderOpenId: userOpenId,
				scope,
				isBatchAuth: true,
				totalAppScopes: allUserScopes.length,
				alreadyGranted: batchIndex * MAX_SCOPES_PER_BATCH,
				batchInfo,
				skipSyntheticMessage: true,
				cfg,
				ticket,
				onAuthComplete: async () => {
					log.info(`batch ${batchIndex + 1}/${batches.length} auth completed`);
					await startBatch(batchIndex + 1);
				}
			});
		} catch (err) {
			log.error(`batch ${batchIndex + 1} failed: ${err}`);
		}
	};
	await startBatch(0);
}
//#endregion
//#region src/messaging/inbound/dedup.ts
const DEFAULT_TTL_MS = 720 * 60 * 1e3;
const DEFAULT_MAX_ENTRIES = 5e3;
const SWEEP_INTERVAL_MS = 300 * 1e3;
const DEFAULT_EXPIRY_MS = 1800 * 1e3;
/**
* Check whether a message is too old to process.
*
* Feishu message `create_time` is a millisecond Unix timestamp encoded
* as a string.  When a WebSocket reconnects after a long outage, stale
* messages may be redelivered — this function lets callers discard them
* before entering the full handling pipeline.
*/
function isMessageExpired(createTimeStr, expiryMs = DEFAULT_EXPIRY_MS) {
	if (!createTimeStr) return false;
	const createTime = parseInt(createTimeStr, 10);
	if (Number.isNaN(createTime)) return false;
	return Date.now() - createTime > expiryMs;
}
var MessageDedup = class {
	store = /* @__PURE__ */ new Map();
	ttlMs;
	maxEntries;
	sweepTimer;
	constructor(opts = {}) {
		this.ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
		this.maxEntries = opts.maxEntries ?? DEFAULT_MAX_ENTRIES;
		this.sweepTimer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
		this.sweepTimer.unref();
	}
	/**
	* Try to record a message ID.
	*
	* @param id   Unique message identifier (e.g. Feishu `message_id`).
	* @param scope Optional scope prefix (e.g. accountId) to namespace IDs.
	* @returns `true` if the message is **new**; `false` if it is a duplicate.
	*/
	tryRecord(id, scope) {
		const key = scope ? `${scope}:${id}` : id;
		const now = Date.now();
		const existing = this.store.get(key);
		if (existing !== void 0) {
			if (now - existing < this.ttlMs) return false;
			this.store.delete(key);
		}
		if (this.store.size >= this.maxEntries) {
			const oldest = this.store.keys().next().value;
			if (oldest !== void 0) this.store.delete(oldest);
		}
		this.store.set(key, now);
		return true;
	}
	/** Current number of tracked entries (for diagnostics). */
	get size() {
		return this.store.size;
	}
	/** Remove all entries and stop the periodic sweep. */
	clear() {
		clearInterval(this.sweepTimer);
		this.store.clear();
	}
	/** Stop the periodic sweep timer and clear all tracked entries. */
	dispose() {
		clearInterval(this.sweepTimer);
		this.store.clear();
	}
	/**
	* Sweep expired entries from the front of the map.
	* Because entries are in insertion order (FIFO), we can stop as soon as
	* we hit one that hasn't expired yet.
	*/
	sweep() {
		const now = Date.now();
		for (const [key, ts] of this.store) {
			if (now - ts < this.ttlMs) break;
			this.store.delete(key);
		}
	}
};
//#endregion
//#region src/messaging/inbound/reaction-handler.ts
/**
* Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
* SPDX-License-Identifier: MIT
*
* Reaction event handler for the Lark/Feishu channel plugin.
*
* Handles `im.message.reaction.created_v1` events by building a
* {@link MessageContext} directly and dispatching to the agent via
* {@link dispatchToAgent}, bypassing the full 7-stage message pipeline.
*
* Controlled by `reactionNotifications` (default: "own"):
*   - `"off"`  — reaction events are silently ignored.
*   - `"own"`  — only reactions on the bot's own messages are dispatched.
*   - `"all"`  — reactions on any message in the chat are dispatched.
*/
const logger = larkLogger("inbound/reaction-handler");
const REACTION_VERIFY_TIMEOUT_MS = 3e3;
/**
* Pre-resolve reaction context before enqueuing.
*
* Performs account config checks, safety filters, API fetch of the
* original message, ownership verification, chat type resolution, and
* thread-capable detection.  Returns `null` when the reaction should
* be skipped (mode off, safety filter, timeout, ownership mismatch,
* thread-capable group with threadSession enabled).
*
* This function is intentionally separated so that the caller
* (event-handlers.ts) can resolve the real chatId *before* enqueuing,
* ensuring the reaction shares the same queue key as normal messages
* for the same chat.
*/
async function resolveReactionContext(params) {
	const { cfg, event, botOpenId, runtime, accountId } = params;
	const log = runtime?.log ?? ((...args) => logger.info(args.map(String).join(" ")));
	const account = getLarkAccount(cfg, accountId);
	const reactionMode = account.config?.reactionNotifications ?? "own";
	if (reactionMode === "off") return null;
	const emojiType = event.reaction_type?.emoji_type;
	const messageId = event.message_id;
	const operatorOpenId = event.user_id?.open_id ?? "";
	if (!emojiType || !messageId || !operatorOpenId) return null;
	if (event.operator_type === "app" || operatorOpenId === botOpenId) {
		log(`feishu[${accountId}]: ignoring app/self reaction on ${messageId}`);
		return null;
	}
	if (emojiType === "Typing") return null;
	if (reactionMode === "own" && !botOpenId) {
		log(`feishu[${accountId}]: bot open_id unavailable, skipping reaction on ${messageId}`);
		return null;
	}
	const msg = await Promise.race([getMessageFeishu({
		cfg,
		messageId,
		accountId
	}), new Promise((resolve) => setTimeout(() => resolve(null), REACTION_VERIFY_TIMEOUT_MS))]).catch(() => null);
	if (!msg) {
		log(`feishu[${accountId}]: reacted message ${messageId} not found or timed out, skipping`);
		return null;
	}
	const isBotMessage = msg.senderType === "app" && msg.senderId === account.appId;
	const isOtherBotMessage = msg.senderType === "app" && account.appId && msg.senderId !== account.appId;
	if (reactionMode === "own" && !isBotMessage || reactionMode === "all" && isOtherBotMessage) {
		log(`feishu[${accountId}]: reaction on ${isOtherBotMessage ? "other bot" : "non-bot"} message ${messageId}, skipping`);
		return null;
	}
	const rawChatId = event.chat_id?.trim() || msg.chatId?.trim() || "";
	const effectiveChatId = rawChatId || `p2p:${operatorOpenId}`;
	let chatType = event.chat_type === "group" ? "group" : event.chat_type === "p2p" || event.chat_type === "private" ? "p2p" : msg.chatType === "group" || msg.chatType === "p2p" ? msg.chatType : "p2p";
	if (rawChatId && chatType === "p2p" && !event.chat_type && !msg.chatType) try {
		chatType = await getChatTypeFeishu({
			cfg,
			chatId: rawChatId,
			accountId
		});
	} catch {}
	let threadCapable = false;
	const threadSessionEnabled = account.config?.threadSession === true;
	if (rawChatId && chatType === "group") {
		threadCapable = await isThreadCapableGroup({
			cfg,
			chatId: rawChatId,
			accountId
		});
		if (threadSessionEnabled && threadCapable) {
			log(`feishu[${accountId}]: reaction on thread-capable group ${rawChatId}, skipping (threadSession enabled)`);
			return null;
		}
	}
	return {
		chatId: effectiveChatId,
		chatType,
		threadId: msg.threadId,
		threadCapable,
		msg
	};
}
async function handleFeishuReaction(params) {
	const { cfg, event, runtime, chatHistories, accountId, preResolved } = params;
	const log = runtime?.log ?? ((...args) => logger.info(args.map(String).join(" ")));
	const error = runtime?.error ?? ((...args) => logger.error(args.map(String).join(" ")));
	const emojiType = event.reaction_type?.emoji_type;
	const messageId = event.message_id;
	const operatorOpenId = event.user_id?.open_id ?? "";
	const account = getLarkAccount(cfg, accountId);
	const accountFeishuCfg = account.config;
	const accountScopedCfg = {
		...cfg,
		channels: {
			...cfg.channels,
			feishu: accountFeishuCfg
		}
	};
	const excerpt = preResolved.msg.content.length > 200 ? preResolved.msg.content.slice(0, 200) + "…" : preResolved.msg.content;
	const syntheticText = excerpt ? `[reacted with ${emojiType} to message ${messageId}: "${excerpt}"]` : `[reacted with ${emojiType} to message ${messageId}]`;
	const syntheticMessageId = `${messageId}:reaction:${emojiType}:${crypto.randomUUID()}`;
	let ctx = {
		chatId: preResolved.chatId,
		messageId: syntheticMessageId,
		senderId: operatorOpenId,
		chatType: preResolved.chatType,
		content: syntheticText,
		contentType: "text",
		resources: [],
		mentions: [],
		threadId: preResolved.threadId,
		rawMessage: {
			message_id: syntheticMessageId,
			chat_id: preResolved.chatId,
			chat_type: preResolved.chatType,
			message_type: "text",
			content: JSON.stringify({ text: syntheticText }),
			create_time: event.action_time ?? String(Date.now()),
			thread_id: preResolved.threadId
		},
		rawSender: {
			sender_id: {
				open_id: operatorOpenId,
				user_id: event.user_id?.user_id,
				union_id: event.user_id?.union_id
			},
			sender_type: "user"
		}
	};
	const senderResult = await resolveUserName({
		account,
		openId: operatorOpenId,
		log
	});
	if (senderResult.name) ctx = {
		...ctx,
		senderName: senderResult.name
	};
	log(`feishu[${accountId}]: reaction "${emojiType}" by ${operatorOpenId} on ${messageId} (chatId=${preResolved.chatId}, chatType=${preResolved.chatType}${preResolved.threadId ? `, thread=${preResolved.threadId}` : ""}), dispatching to AI`);
	logger.info(`reaction "${emojiType}" by ${operatorOpenId} on ${messageId} (chatType=${preResolved.chatType})`);
	const isGroup = ctx.chatType === "group";
	const groupConfig = isGroup ? resolveFeishuGroupConfig({
		cfg: accountFeishuCfg,
		groupId: ctx.chatId
	}) : void 0;
	const defaultGroupConfig = isGroup ? accountFeishuCfg?.groups?.["*"] : void 0;
	const historyLimit = Math.max(0, accountFeishuCfg?.historyLimit ?? accountScopedCfg.messages?.groupChat?.historyLimit ?? DEFAULT_GROUP_HISTORY_LIMIT);
	try {
		await dispatchToAgent({
			ctx,
			permissionError: void 0,
			mediaPayload: {},
			quotedContent: void 0,
			account,
			accountScopedCfg,
			runtime,
			chatHistories,
			historyLimit,
			replyToMessageId: messageId,
			commandAuthorized: false,
			groupConfig,
			defaultGroupConfig,
			skipTyping: true
		});
	} catch (err) {
		error(`feishu[${accountId}]: error dispatching reaction event: ${String(err)}`);
	}
}
//#endregion
//#region src/channel/event-handlers.ts
const elog = larkLogger("channel/event-handlers");
/**
* Verify that the event's app_id matches the current account.
*
* Lark SDK EventDispatcher flattens the v2 envelope header (which
* contains `app_id`) into the handler `data` object, so `app_id` is
* available directly on `data`.
*
* Returns `false` (discard event) when the app_id does not match.
*/
function isEventOwnershipValid(ctx, data) {
	const expectedAppId = ctx.lark.account.appId;
	if (!expectedAppId) return true;
	const eventAppId = data.app_id;
	if (eventAppId == null) return true;
	if (eventAppId !== expectedAppId) {
		elog.warn("event app_id mismatch, discarding", {
			accountId: ctx.accountId,
			expected: expectedAppId,
			received: String(eventAppId)
		});
		return false;
	}
	return true;
}
async function handleMessageEvent(ctx, data) {
	if (!isEventOwnershipValid(ctx, data)) return;
	const { accountId, log, error } = ctx;
	try {
		const event = data;
		const msgId = event.message?.message_id ?? "unknown";
		const chatId = event.message?.chat_id ?? "";
		const threadId = event.message?.thread_id || void 0;
		if (!ctx.messageDedup.tryRecord(msgId, accountId)) {
			log(`feishu[${accountId}]: duplicate message ${msgId}, skipping`);
			return;
		}
		if (isMessageExpired(event.message?.create_time)) {
			log(`feishu[${accountId}]: message ${msgId} expired, discarding`);
			return;
		}
		const abortText = extractRawTextFromEvent(event);
		if (abortText && isLikelyAbortText(abortText)) {
			const queueKey = buildQueueKey(accountId, chatId, threadId);
			if (hasActiveTask(queueKey)) {
				const active = getActiveDispatcher(queueKey);
				if (active) {
					log(`feishu[${accountId}]: abort fast-path triggered for chat ${chatId} (text="${abortText}")`);
					active.abortController?.abort();
					active.abortCard().catch((err) => {
						error(`feishu[${accountId}]: abort fast-path abortCard failed: ${String(err)}`);
					});
				}
			}
		}
		const { status } = enqueueFeishuChatTask({
			accountId,
			chatId,
			threadId,
			task: async () => {
				try {
					await withTicket({
						messageId: msgId,
						chatId,
						accountId,
						startTime: Date.now(),
						senderOpenId: event.sender?.sender_id?.open_id || "",
						chatType: event.message?.chat_type || void 0,
						threadId
					}, () => handleFeishuMessage({
						cfg: ctx.cfg,
						event,
						botOpenId: ctx.lark.botOpenId,
						runtime: ctx.runtime,
						chatHistories: ctx.chatHistories,
						accountId
					}));
				} catch (err) {
					error(`feishu[${accountId}]: error handling message: ${String(err)}`);
				}
			}
		});
		log(`feishu[${accountId}]: message ${msgId} in chat ${chatId}${threadId ? ` thread ${threadId}` : ""} — ${status}`);
	} catch (err) {
		error(`feishu[${accountId}]: error handling message: ${String(err)}`);
	}
}
async function handleReactionEvent(ctx, data) {
	if (!isEventOwnershipValid(ctx, data)) return;
	const { accountId, log, error } = ctx;
	try {
		const event = data;
		const msgId = event.message_id ?? "unknown";
		log(`feishu[${accountId}]: reaction event on message ${msgId}`);
		const emojiType = event.reaction_type?.emoji_type ?? "";
		const operatorOpenId = event.user_id?.open_id ?? "";
		const dedupKey = `${msgId}:reaction:${emojiType}:${operatorOpenId}`;
		if (!ctx.messageDedup.tryRecord(dedupKey, accountId)) {
			log(`feishu[${accountId}]: duplicate reaction ${dedupKey}, skipping`);
			return;
		}
		if (isMessageExpired(event.action_time)) {
			log(`feishu[${accountId}]: reaction on ${msgId} expired, discarding`);
			return;
		}
		const preResolved = await resolveReactionContext({
			cfg: ctx.cfg,
			event,
			botOpenId: ctx.lark.botOpenId,
			runtime: ctx.runtime,
			accountId
		});
		if (!preResolved) return;
		const { status } = enqueueFeishuChatTask({
			accountId,
			chatId: preResolved.chatId,
			threadId: preResolved.threadId,
			task: async () => {
				try {
					await withTicket({
						messageId: msgId,
						chatId: preResolved.chatId,
						accountId,
						startTime: Date.now(),
						senderOpenId: operatorOpenId,
						chatType: preResolved.chatType,
						threadId: preResolved.threadId
					}, () => handleFeishuReaction({
						cfg: ctx.cfg,
						event,
						botOpenId: ctx.lark.botOpenId,
						runtime: ctx.runtime,
						chatHistories: ctx.chatHistories,
						accountId,
						preResolved
					}));
				} catch (err) {
					error(`feishu[${accountId}]: error handling reaction: ${String(err)}`);
				}
			}
		});
		log(`feishu[${accountId}]: reaction on ${msgId} (chatId=${preResolved.chatId}) — ${status}`);
	} catch (err) {
		error(`feishu[${accountId}]: error handling reaction event: ${String(err)}`);
	}
}
async function handleBotMembershipEvent(ctx, data, action) {
	if (!isEventOwnershipValid(ctx, data)) return;
	const { accountId, log, error } = ctx;
	try {
		log(`feishu[${accountId}]: bot ${action} ${action === "removed" ? "from" : "to"} chat ${data.chat_id}`);
	} catch (err) {
		error(`feishu[${accountId}]: error handling bot ${action} event: ${String(err)}`);
	}
}
async function handleCardActionEvent(ctx, data) {
	try {
		return await handleCardAction(data, ctx.cfg, ctx.accountId);
	} catch (err) {
		elog.warn(`card.action.trigger handler error: ${err}`);
	}
}
//#endregion
//#region src/channel/monitor.ts
var monitor_exports = /* @__PURE__ */ __exportAll({ monitorFeishuProvider: () => monitorFeishuProvider });
const mlog = larkLogger("channel/monitor");
/**
* Start monitoring a single Feishu account.
*
* Creates a LarkClient, probes bot identity, registers event handlers,
* and starts a WebSocket connection. Returns a Promise that resolves
* when the abort signal fires (or immediately if already aborted).
*/
async function monitorSingleAccount(params) {
	const { account, runtime, abortSignal } = params;
	const { accountId } = account;
	const log = runtime?.log ?? ((...args) => mlog.info(args.map(String).join(" ")));
	const error = runtime?.error ?? ((...args) => mlog.error(args.map(String).join(" ")));
	if ((account.config.connectionMode ?? "websocket") !== "websocket") {
		log(`feishu[${accountId}]: webhook mode not implemented in monitor`);
		return;
	}
	const dedupCfg = account.config.dedup;
	const messageDedup = new MessageDedup({
		ttlMs: dedupCfg?.ttlMs,
		maxEntries: dedupCfg?.maxEntries
	});
	log(`feishu[${accountId}]: message dedup enabled (ttl=${messageDedup["ttlMs"]}ms, max=${messageDedup["maxEntries"]})`);
	log(`feishu[${accountId}]: starting WebSocket connection...`);
	const lark = LarkClient.fromAccount(account);
	lark.messageDedup = messageDedup;
	const ctx = {
		get cfg() {
			return LarkClient.runtime.config.loadConfig();
		},
		lark,
		accountId,
		chatHistories: /* @__PURE__ */ new Map(),
		messageDedup,
		runtime,
		log,
		error
	};
	await lark.startWS({
		handlers: {
			"im.message.receive_v1": (data) => handleMessageEvent(ctx, data),
			"im.message.message_read_v1": async () => {},
			"im.message.reaction.created_v1": (data) => handleReactionEvent(ctx, data),
			"im.message.reaction.deleted_v1": async () => {},
			"im.chat.access_event.bot_p2p_chat_entered_v1": async () => {},
			"im.chat.member.bot.added_v1": (data) => handleBotMembershipEvent(ctx, data, "added"),
			"im.chat.member.bot.deleted_v1": (data) => handleBotMembershipEvent(ctx, data, "removed"),
			"card.action.trigger": ((data) => handleCardActionEvent(ctx, data))
		},
		abortSignal
	});
	log(`feishu[${accountId}]: bot open_id resolved: ${lark.botOpenId ?? "unknown"}`);
	log(`feishu[${accountId}]: WebSocket client started`);
	mlog.info(`websocket started for account ${accountId}`);
}
/**
* Start monitoring for all enabled Feishu accounts (or a single
* account when `opts.accountId` is specified).
*/
async function monitorFeishuProvider(opts = {}) {
	const cfg = opts.config;
	if (!cfg) throw new Error("Config is required for Feishu monitor");
	LarkClient.setGlobalConfig(cfg);
	const log = opts.runtime?.log ?? ((...args) => mlog.info(args.map(String).join(" ")));
	if (opts.accountId) {
		const account = getLarkAccount(cfg, opts.accountId);
		if (!account.enabled || !account.configured) throw new Error(`Feishu account "${opts.accountId}" not configured or disabled`);
		await monitorSingleAccount({
			cfg,
			account,
			runtime: opts.runtime,
			abortSignal: opts.abortSignal
		});
		await drainShutdownHooks({ log });
		return;
	}
	const accounts = getEnabledLarkAccounts(cfg);
	if (accounts.length === 0) throw new Error("No enabled Feishu accounts configured");
	log(`feishu: starting ${accounts.length} account(s): ${accounts.map((a) => a.accountId).join(", ")}`);
	await Promise.all(accounts.map((account) => monitorSingleAccount({
		cfg,
		account,
		runtime: opts.runtime,
		abortSignal: opts.abortSignal
	})));
	await drainShutdownHooks({ log });
}
//#endregion
export { nonBotMentions as $, wwwDomain as A, getAppGrantedScopes as B, formatDiagReportCli as C, resolveAnyEnabledToolsConfig as D, traceByMessageId as E, getMessageFeishu as F, buildMentionedCardContent as G, sendCardFeishu as H, parseMessageEvent as I, formatMentionAllForCard as J, buildMentionedMessage as K, buildConvertContextFromItem as L, filterSensitiveScopes as M, getStoredToken as N, mcpDomain as O, checkMessageGate as P, mentionedBot as Q, convertMessageContent as R, analyzeTrace as S, runDiagnosis as T, sendMessageFeishu as U, editMessageFeishu as V, updateCardFeishu as W, formatMentionForCard as X, formatMentionAllForText as Y, formatMentionForText as Z, createToolContext as _, triggerOnboarding as a, formatLarkError as at, registerTool as b, StringEnum as c, sendImageLark as ct, json as d, uploadImageLark as dt, resolveFeishuGroupToolPolicy as et, parseTimeToRFC3339 as f, validateLocalMediaRoots as ft, handleInvokeErrorWithAutoAuth as g, resolveReceiveIdType as gt, unixTimestampToISO8601 as h, parseFeishuRouteTarget as ht, isMessageExpired as i, assertLarkOk as it, probeFeishu as j, openPlatformDomain as k, convertTimeRange as l, uploadAndSendMediaLark as lt, parseTimeToTimestampMs as m, normalizeFeishuTarget as mt, monitor_exports as n, sendMediaLark as nt, executeAuthorize as o, sendAudioLark as ot, parseTimeToTimestamp as p, looksLikeFeishuId as pt, extractMessageBody as q, handleFeishuReaction as r, sendTextLark as rt, registerFeishuOAuthTool as s, sendFileLark as st, monitorFeishuProvider as t, sendCardLark as tt, isInvokeError as u, uploadFileLark as ut, formatToolResult as v, formatTraceOutput as w, registerCommands as x, getFirstAccount as y, extractMentionOpenId as z };
