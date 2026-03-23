import { t as __exportAll } from "./rolldown-runtime-wcPFST8Q.mjs";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk/account-id";
import * as Lark from "@larksuiteoapi/node-sdk";
import { AsyncLocalStorage } from "node:async_hooks";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
//#region src/core/accounts.ts
/**
* Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
* SPDX-License-Identifier: MIT
*
* Lark multi-account management.
*
* Account overrides live under `cfg.channels.feishu.accounts`.
* Each account may override any top-level Feishu config field;
* unset fields fall back to the top-level defaults.
*/
const normalizeAccountId$1 = typeof normalizeAccountId === "function" ? normalizeAccountId : (id) => id?.trim().toLowerCase() || void 0;
/** Extract the `channels.feishu` section from the top-level config. */
function getLarkConfig(cfg) {
	return cfg?.channels?.feishu;
}
/** Return the per-account override map, if present. */
function getAccountMap(section) {
	return section.accounts;
}
/** Strip the `accounts` key and return the remaining top-level config. */
function baseConfig(section) {
	const { accounts: _ignored, ...rest } = section;
	return rest;
}
/** Merge base config with account override (account fields take precedence). */
function mergeAccountConfig(base, override) {
	return {
		...base,
		...override
	};
}
/** Coerce a domain string to `LarkBrand`, defaulting to `"feishu"`. */
function toBrand(domain) {
	return domain ?? "feishu";
}
/**
* List all account IDs defined in the Lark config.
*
* Returns `[DEFAULT_ACCOUNT_ID]` when no explicit accounts exist.
*/
function getLarkAccountIds(cfg) {
	const section = getLarkConfig(cfg);
	if (!section) return [DEFAULT_ACCOUNT_ID];
	const accountMap = getAccountMap(section);
	if (!accountMap || Object.keys(accountMap).length === 0) return [DEFAULT_ACCOUNT_ID];
	const accountIds = Object.keys(accountMap);
	if (!accountIds.some((id) => id.trim().toLowerCase() === DEFAULT_ACCOUNT_ID)) {
		const base = baseConfig(section);
		if (base.appId && base.appSecret) return [DEFAULT_ACCOUNT_ID, ...accountIds];
	}
	return accountIds;
}
/** Return the first (default) account ID. */
function getDefaultLarkAccountId(cfg) {
	return getLarkAccountIds(cfg)[0];
}
/**
* Resolve a single account by merging the top-level config with
* account-level overrides.  Account fields take precedence.
*
* Falls back to the default account when `accountId` is omitted or `null`.
*/
function getLarkAccount(cfg, accountId) {
	const requestedId = accountId ? normalizeAccountId$1(accountId) ?? DEFAULT_ACCOUNT_ID : DEFAULT_ACCOUNT_ID;
	const section = getLarkConfig(cfg);
	if (!section) return {
		accountId: requestedId,
		enabled: false,
		configured: false,
		brand: "feishu",
		config: {}
	};
	const base = baseConfig(section);
	const accountMap = getAccountMap(section);
	const accountOverride = accountMap && requestedId !== DEFAULT_ACCOUNT_ID ? accountMap[requestedId] : void 0;
	const merged = accountOverride ? mergeAccountConfig(base, accountOverride) : { ...base };
	const appId = merged.appId;
	const appSecret = merged.appSecret;
	const configured = !!(appId && appSecret);
	const enabled = !!(merged.enabled ?? configured);
	const brand = toBrand(merged.domain);
	if (configured) return {
		accountId: requestedId,
		enabled,
		configured: true,
		name: merged.name ?? void 0,
		appId,
		appSecret,
		encryptKey: merged.encryptKey ?? void 0,
		verificationToken: merged.verificationToken ?? void 0,
		brand,
		config: merged
	};
	return {
		accountId: requestedId,
		enabled,
		configured: false,
		name: merged.name ?? void 0,
		appId: appId ?? void 0,
		appSecret: appSecret ?? void 0,
		encryptKey: merged.encryptKey ?? void 0,
		verificationToken: merged.verificationToken ?? void 0,
		brand,
		config: merged
	};
}
/**
* Build an account-scoped config view for downstream helpers that read from
* `cfg.channels.feishu`.
*
* In multi-account mode, many runtime helpers expect the merged account config
* to already be exposed at `cfg.channels.feishu`. This mirrors the inbound
* path behavior so outbound/tooling code resolves per-account settings
* consistently.
*
* @param cfg - Original top-level plugin config
* @param accountId - Optional target account ID
* @returns Config with `channels.feishu` replaced by the merged account config
*/
function createAccountScopedConfig(cfg, accountId) {
	const account = getLarkAccount(cfg, accountId);
	return {
		...cfg,
		channels: {
			...cfg.channels,
			feishu: account.config
		}
	};
}
/** Return all accounts that are both configured and enabled. */
function getEnabledLarkAccounts(cfg) {
	const ids = getLarkAccountIds(cfg);
	const results = [];
	for (const id of ids) {
		const account = getLarkAccount(cfg, id);
		if (account.enabled && account.configured) results.push(account);
	}
	return results;
}
//#endregion
//#region src/core/lark-ticket.ts
/**
* Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
* SPDX-License-Identifier: MIT
*
* Request-level ticket for the Feishu plugin.
*
* Uses Node.js AsyncLocalStorage to propagate a ticket (message_id,
* chat_id, account_id) through the entire async call chain without passing
* parameters explicitly.  Call {@link withTicket} at the event entry point
* (monitor.ts) and use {@link getTicket} anywhere downstream.
*/
const store = new AsyncLocalStorage();
/**
* Run `fn` within a ticket context.  All async operations spawned inside
* `fn` will inherit the context and can access it via {@link getTicket}.
*/
function withTicket(ticket, fn) {
	return store.run(ticket, fn);
}
/** Return the current ticket, or `undefined` if not inside withTicket. */
function getTicket() {
	return store.getStore();
}
/** Milliseconds elapsed since the current ticket was created, or 0. */
function ticketElapsed() {
	const t = store.getStore();
	return t ? Date.now() - t.startTime : 0;
}
//#endregion
//#region src/core/lark-logger.ts
const CYAN = "\x1B[36m";
const YELLOW = "\x1B[33m";
const RED = "\x1B[31m";
const GRAY = "\x1B[90m";
const RESET = "\x1B[0m";
function consoleFallback(subsystem) {
	const tag = `feishu/${subsystem}`;
	return {
		debug: (msg, meta) => console.debug(`${GRAY}[${tag}]${RESET}`, msg, ...meta ? [meta] : []),
		info: (msg, meta) => console.log(`${CYAN}[${tag}]${RESET}`, msg, ...meta ? [meta] : []),
		warn: (msg, meta) => console.warn(`${YELLOW}[${tag}]${RESET}`, msg, ...meta ? [meta] : []),
		error: (msg, meta) => console.error(`${RED}[${tag}]${RESET}`, msg, ...meta ? [meta] : [])
	};
}
function resolveRuntimeLogger(subsystem) {
	try {
		return LarkClient.runtime.logging.getChildLogger({ subsystem: `feishu/${subsystem}` });
	} catch {
		return null;
	}
}
function getTraceMeta() {
	const ctx = getTicket();
	if (!ctx) return null;
	const trace = {
		accountId: ctx.accountId,
		messageId: ctx.messageId,
		chatId: ctx.chatId
	};
	if (ctx.senderOpenId) trace.senderOpenId = ctx.senderOpenId;
	return trace;
}
function enrichMeta(meta) {
	const trace = getTraceMeta();
	if (!trace) return meta ?? {};
	return meta ? {
		...trace,
		...meta
	} : trace;
}
/**
* Build a trace-aware prefix like `feishu[default][msg:om_xxx]:`.
*
* Mirrors the format used by `trace.ts` so log lines are consistent
* across the old and new logging systems.
*/
function buildTracePrefix() {
	const ctx = getTicket();
	if (!ctx) return "feishu:";
	return `feishu[${ctx.accountId}][msg:${ctx.messageId}]:`;
}
/**
* Format message with inline meta for text-based log output.
*
* RuntimeLogger implementations typically ignore the `meta` parameter in
* their text output (gateway.log / console).  To ensure meta is always
* visible, we serialize user-supplied meta into the message string and
* prepend the trace context prefix (accountId + messageId).
*
* Example:
*   formatMessage("card.create response", { code: 0, cardId: "c_xxx" })
*   → "feishu[default][msg:om_xxx]: card.create response (code=0, cardId=c_xxx)"
*/
function formatMessage(message, meta) {
	const prefix = buildTracePrefix();
	if (!meta || Object.keys(meta).length === 0) return `${prefix} ${message}`;
	const parts = Object.entries(meta).map(([k, v]) => {
		if (v === void 0 || v === null) return null;
		if (typeof v === "object") return `${k}=${JSON.stringify(v)}`;
		return `${k}=${v}`;
	}).filter(Boolean);
	return parts.length > 0 ? `${prefix} ${message} (${parts.join(", ")})` : `${prefix} ${message}`;
}
function createLarkLogger(subsystem) {
	let cachedLogger = null;
	let resolved = false;
	function getLogger() {
		if (!resolved) {
			cachedLogger = resolveRuntimeLogger(subsystem);
			if (cachedLogger) resolved = true;
		}
		return cachedLogger ?? consoleFallback(subsystem);
	}
	return {
		subsystem,
		debug(message, meta) {
			getLogger().debug?.(formatMessage(message, meta), enrichMeta(meta));
		},
		info(message, meta) {
			getLogger().info(formatMessage(message, meta), enrichMeta(meta));
		},
		warn(message, meta) {
			getLogger().warn(formatMessage(message, meta), enrichMeta(meta));
		},
		error(message, meta) {
			getLogger().error(formatMessage(message, meta), enrichMeta(meta));
		},
		child(name) {
			return createLarkLogger(`${subsystem}/${name}`);
		}
	};
}
function larkLogger(subsystem) {
	return createLarkLogger(subsystem);
}
//#endregion
//#region src/core/chat-info-cache.ts
const log$1 = larkLogger("core/chat-info-cache");
const DEFAULT_MAX_SIZE$1 = 500;
const DEFAULT_TTL_MS$1 = 3600 * 1e3;
var ChatInfoCache = class {
	map = /* @__PURE__ */ new Map();
	maxSize;
	ttlMs;
	constructor(maxSize = DEFAULT_MAX_SIZE$1, ttlMs = DEFAULT_TTL_MS$1) {
		this.maxSize = maxSize;
		this.ttlMs = ttlMs;
	}
	get(chatId) {
		const entry = this.map.get(chatId);
		if (!entry) return void 0;
		if (entry.expireAt <= Date.now()) {
			this.map.delete(chatId);
			return;
		}
		this.map.delete(chatId);
		this.map.set(chatId, entry);
		return entry.info;
	}
	set(chatId, info) {
		this.map.delete(chatId);
		this.map.set(chatId, {
			info,
			expireAt: Date.now() + this.ttlMs
		});
		this.evict();
	}
	clear() {
		this.map.clear();
	}
	evict() {
		while (this.map.size > this.maxSize) {
			const oldest = this.map.keys().next().value;
			if (oldest !== void 0) this.map.delete(oldest);
		}
	}
};
const registry$1 = /* @__PURE__ */ new Map();
function getChatInfoCache(accountId) {
	let c = registry$1.get(accountId);
	if (!c) {
		c = new ChatInfoCache();
		registry$1.set(accountId, c);
	}
	return c;
}
/** Clear chat-info caches (called from LarkClient.clearCache). */
function clearChatInfoCache(accountId) {
	if (accountId !== void 0) {
		registry$1.get(accountId)?.clear();
		registry$1.delete(accountId);
	} else {
		for (const c of registry$1.values()) c.clear();
		registry$1.clear();
	}
}
/**
* Determine whether a group supports thread sessions.
*
* Returns `true` when the group is a topic group (`chat_mode=topic`) or
* a normal group with thread message mode (`group_message_type=thread`).
*
* Results are cached per-account with a 1-hour TTL to minimise OAPI calls.
*/
async function isThreadCapableGroup(params) {
	const { cfg, chatId, accountId } = params;
	const info = await getChatInfo({
		cfg,
		chatId,
		accountId
	});
	if (!info) return false;
	return info.chatMode === "topic" || info.groupMessageType === "thread";
}
/**
* Fetch (or read from cache) the chat metadata for a given chat ID.
*
* Returns `undefined` when the API call fails (best-effort).
*/
async function getChatInfo(params) {
	const { cfg, chatId, accountId } = params;
	const cache = getChatInfoCache(accountId ?? "default");
	const cached = cache.get(chatId);
	if (cached) return cached;
	try {
		const data = (await LarkClient.fromCfg(cfg, accountId).sdk.im.chat.get({ path: { chat_id: chatId } }))?.data;
		const chatMode = data?.chat_mode ?? "group";
		const groupMessageType = data?.group_message_type;
		const info = {
			chatMode,
			groupMessageType
		};
		cache.set(chatId, info);
		log$1.info(`resolved ${chatId} → chat_mode=${chatMode}, group_message_type=${groupMessageType ?? "N/A"}`);
		return info;
	} catch (err) {
		log$1.error(`failed to get chat info for ${chatId}: ${String(err)}`);
		return;
	}
}
/**
* Determine the chat type (p2p or group) for a given chat ID.
*
* Delegates to the shared {@link getChatInfo} cache (account-scoped LRU with
* 1-hour TTL) so that chat metadata is fetched at most once across all
* call-sites (dispatch, reaction handler, etc.).
*
* Falls back to "p2p" if the API call fails.
*/
async function getChatTypeFeishu(params) {
	const { cfg, chatId, accountId } = params;
	const info = await getChatInfo({
		cfg,
		chatId,
		accountId
	});
	if (!info) return "p2p";
	return info.chatMode === "group" || info.chatMode === "topic" ? "group" : "p2p";
}
//#endregion
//#region src/core/version.ts
/**
* Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
* SPDX-License-Identifier: MIT
*
* 插件版本号管理
*
* 从 package.json 读取版本号并生成 User-Agent 字符串。
*/
/** 缓存的版本号 */
let cachedVersion;
/**
* 获取插件版本号（从 package.json 读取）
*
* @returns 版本号字符串，如 "2026.2.28.5"；读取失败返回 "unknown"
*/
function getPluginVersion() {
	if (cachedVersion) return cachedVersion;
	try {
		const raw = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json"), "utf8");
		cachedVersion = JSON.parse(raw).version ?? "unknown";
		return cachedVersion;
	} catch {
		cachedVersion = "unknown";
		return cachedVersion;
	}
}
/**
* 生成 User-Agent 字符串
*
* @returns User-Agent 字符串，格式：`openclaw-lark/{version}`
*
* @example
* ```typescript
* getUserAgent() // => "openclaw-lark/2026.2.28.5"
* ```
*/
function getUserAgent() {
	return `openclaw-lark/${getPluginVersion()}`;
}
//#endregion
//#region src/core/lark-client.ts
/**
* Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
* SPDX-License-Identifier: MIT
*
* Feishu / Lark SDK client management.
*
* Provides `LarkClient` — a unified manager for Lark SDK client instances,
* WebSocket connections, EventDispatcher lifecycle, and bot identity.
*
* Consumers obtain instances via factory methods:
*   - `LarkClient.fromCfg(cfg, accountId)` — resolve account from config
*   - `LarkClient.fromAccount(account)` — from a pre-resolved account
*   - `LarkClient.fromCredentials(credentials)` — ephemeral instance (not cached)
*/
const log = larkLogger("core/lark-client");
const GLOBAL_LARK_USER_AGENT_KEY = "LARK_USER_AGENT";
function installGlobalUserAgent() {
	globalThis[GLOBAL_LARK_USER_AGENT_KEY] = getUserAgent();
}
installGlobalUserAgent();
Lark.defaultHttpInstance.interceptors.request.handlers = [];
Lark.defaultHttpInstance.interceptors.request.use((req) => {
	if (req.headers) req.headers["User-Agent"] = getUserAgent();
	return req;
}, void 0, { synchronous: true });
const BRAND_TO_DOMAIN = {
	feishu: Lark.Domain.Feishu,
	lark: Lark.Domain.Lark
};
/** Map a `LarkBrand` to the SDK `domain` parameter. */
function resolveBrand(brand) {
	return BRAND_TO_DOMAIN[brand ?? "feishu"] ?? brand.replace(/\/+$/, "");
}
/** Instance cache keyed by accountId. */
const cache = /* @__PURE__ */ new Map();
/**
* Compare two SecretRef-shaped objects by their identity fields.
* Key-order independent, unlike JSON.stringify.
*/
function secretRefsEqual(a, b) {
	return a.source === b.source && a.provider === b.provider && a.id === b.id;
}
/**
* Compare two credential values that may be strings or SecretRef objects.
*
* - Both strings: direct `===`.
* - Both SecretRef objects: compare `source`, `provider`, `id` explicitly.
* - Mixed (string vs SecretRef): treat as equal — the platform resolves the
*   SecretRef at startup (producing the cached string) but `loadConfig()`
*   returns the raw object on subsequent calls.  Detecting SecretRef identity
*   changes is not useful here because the platform does not re-resolve
*   feishu secrets on reload, so a new SecretRef would be equally unusable.
*/
function credentialsEqual(a, b) {
	if (a === b) return true;
	if (typeof a === "string" && typeof b === "string") return false;
	if (a && b && typeof a === "object" && typeof b === "object") return secretRefsEqual(a, b);
	if (typeof a === "string" && b && typeof b === "object" || typeof b === "string" && a && typeof a === "object") return true;
	return false;
}
var LarkClient = class LarkClient {
	account;
	_sdk = null;
	_wsClient = null;
	_botOpenId;
	_botName;
	_lastProbeResult = null;
	_lastProbeAt = 0;
	/** Attached message deduplicator — disposed together with the client. */
	messageDedup = null;
	static _runtime = null;
	/** Persist the runtime instance for later retrieval (activate 阶段调用一次). */
	static setRuntime(runtime) {
		LarkClient._runtime = runtime;
	}
	/** Retrieve the stored runtime instance. Throws if not yet initialised. */
	static get runtime() {
		if (!LarkClient._runtime) throw new Error("Feishu plugin runtime has not been initialised. Ensure LarkClient.setRuntime() is called during plugin activation.");
		return LarkClient._runtime;
	}
	static _globalConfig = null;
	/** Store the original global config (called during monitor startup). */
	static setGlobalConfig(cfg) {
		LarkClient._globalConfig = cfg;
	}
	/** Retrieve the stored global config, or `null` if not yet set. */
	static get globalConfig() {
		return LarkClient._globalConfig;
	}
	constructor(account) {
		this.account = account;
	}
	/** Shorthand for `this.account.accountId`. */
	get accountId() {
		return this.account.accountId;
	}
	/** Resolve account from config and return a cached `LarkClient`. */
	static fromCfg(cfg, accountId) {
		return LarkClient.fromAccount(getLarkAccount(cfg, accountId));
	}
	/**
	* Get (or create) a cached `LarkClient` for the given account.
	* If the cached instance has stale credentials it is replaced.
	*/
	static fromAccount(account) {
		const existing = cache.get(account.accountId);
		if (existing && existing.account.appId === account.appId && credentialsEqual(existing.account.appSecret, account.appSecret)) return existing;
		if (existing) {
			log.info(`credentials changed, disposing stale instance`, { accountId: account.accountId });
			existing.dispose();
		}
		const instance = new LarkClient(account);
		cache.set(account.accountId, instance);
		return instance;
	}
	/**
	* Create an ephemeral `LarkClient` from bare credentials.
	* The instance is **not** added to the global cache — suitable for
	* one-off probe / diagnose calls that should not pollute account state.
	*/
	static fromCredentials(credentials) {
		const base = {
			accountId: credentials.accountId ?? "default",
			enabled: true,
			brand: credentials.brand ?? "feishu",
			config: {}
		};
		return new LarkClient(credentials.appId && credentials.appSecret ? {
			...base,
			configured: true,
			appId: credentials.appId,
			appSecret: credentials.appSecret
		} : {
			...base,
			configured: false,
			appId: credentials.appId,
			appSecret: credentials.appSecret
		});
	}
	/** Look up a cached instance by accountId. */
	static get(accountId) {
		return cache.get(accountId) ?? null;
	}
	/**
	* Dispose one or all cached instances.
	* With `accountId` — dispose that single instance.
	* Without — dispose every cached instance and clear the cache.
	*/
	static async clearCache(accountId) {
		const { clearUserNameCache } = await Promise.resolve().then(() => user_name_cache_exports);
		if (accountId !== void 0) {
			cache.get(accountId)?.dispose();
			clearUserNameCache(accountId);
			clearChatInfoCache(accountId);
		} else {
			for (const inst of cache.values()) inst.dispose();
			clearUserNameCache();
			clearChatInfoCache();
		}
	}
	/** Lazily-created Lark SDK client. */
	get sdk() {
		if (!this._sdk) {
			const { appId, appSecret } = this.requireCredentials();
			this._sdk = new Lark.Client({
				appId,
				appSecret,
				appType: Lark.AppType.SelfBuild,
				domain: resolveBrand(this.account.brand)
			});
		}
		return this._sdk;
	}
	/**
	* Probe bot identity via the `bot/v3/info` API.
	* Results are cached on the instance for subsequent access via
	* `botOpenId` / `botName`.
	*/
	async probe(opts) {
		const maxAge = opts?.maxAgeMs ?? 0;
		if (maxAge > 0 && this._lastProbeResult && Date.now() - this._lastProbeAt < maxAge) return this._lastProbeResult;
		if (!this.account.appId || !this.account.appSecret) return {
			ok: false,
			error: "missing credentials (appId, appSecret)"
		};
		try {
			const res = await this.sdk.request({
				method: "GET",
				url: "/open-apis/bot/v3/info",
				data: {}
			});
			if (res.code !== 0) {
				const result = {
					ok: false,
					appId: this.account.appId,
					error: `API error: ${res.msg || `code ${res.code}`}`
				};
				this._lastProbeResult = result;
				this._lastProbeAt = Date.now();
				return result;
			}
			const bot = res.bot || res.data?.bot;
			this._botOpenId = bot?.open_id;
			this._botName = bot?.bot_name;
			const result = {
				ok: true,
				appId: this.account.appId,
				botName: this._botName,
				botOpenId: this._botOpenId
			};
			this._lastProbeResult = result;
			this._lastProbeAt = Date.now();
			return result;
		} catch (err) {
			const result = {
				ok: false,
				appId: this.account.appId,
				error: err instanceof Error ? err.message : String(err)
			};
			this._lastProbeResult = result;
			this._lastProbeAt = Date.now();
			return result;
		}
	}
	/** Cached bot open_id (available after `probe()` or `startWS()`). */
	get botOpenId() {
		return this._botOpenId;
	}
	/** Cached bot name (available after `probe()` or `startWS()`). */
	get botName() {
		return this._botName;
	}
	/**
	* Start WebSocket event monitoring.
	*
	* Flow: probe bot identity → EventDispatcher → WSClient → start.
	* The returned Promise resolves when `abortSignal` fires.
	*/
	async startWS(opts) {
		const { handlers, abortSignal, autoProbe = true } = opts;
		if (autoProbe) await this.probe();
		const dispatcher = new Lark.EventDispatcher({
			encryptKey: this.account.encryptKey ?? "",
			verificationToken: this.account.verificationToken ?? ""
		});
		dispatcher.register(handlers);
		const { appId, appSecret } = this.requireCredentials();
		if (this._wsClient) {
			log.warn(`closing previous WSClient before reconnect`, { accountId: this.accountId });
			try {
				this._wsClient.close({ force: true });
			} catch {}
			this._wsClient = null;
		}
		this._wsClient = new Lark.WSClient({
			appId,
			appSecret,
			domain: resolveBrand(this.account.brand),
			loggerLevel: Lark.LoggerLevel.info
		});
		const wsClientAny = this._wsClient;
		const origHandleEventData = wsClientAny.handleEventData.bind(wsClientAny);
		wsClientAny.handleEventData = (data) => {
			if (data.headers?.find?.((h) => h.key === "type")?.value === "card") return origHandleEventData({
				...data,
				headers: data.headers.map((h) => h.key === "type" ? {
					...h,
					value: "event"
				} : h)
			});
			return origHandleEventData(data);
		};
		await this.waitForAbort(dispatcher, abortSignal);
	}
	/** Whether a WebSocket client is currently active. */
	get wsConnected() {
		return this._wsClient !== null;
	}
	/** Disconnect WebSocket but keep instance in cache. */
	disconnect() {
		if (this._wsClient) {
			log.info(`disconnecting WebSocket`, { accountId: this.accountId });
			try {
				this._wsClient.close({ force: true });
			} catch {}
		}
		this._wsClient = null;
		if (this.messageDedup) {
			log.info(`disposing message dedup`, {
				accountId: this.accountId,
				size: this.messageDedup.size
			});
			this.messageDedup.dispose();
			this.messageDedup = null;
		}
	}
	/** Disconnect + remove from cache. */
	dispose() {
		this.disconnect();
		cache.delete(this.accountId);
	}
	/** Assert credentials exist or throw. */
	requireCredentials() {
		const appId = this.account.appId;
		const appSecret = this.account.appSecret;
		if (!appId || !appSecret) throw new Error(`LarkClient[${this.accountId}]: appId and appSecret are required`);
		return {
			appId,
			appSecret
		};
	}
	/**
	* Start the WSClient and return a promise that resolves when the
	* abort signal fires (or immediately if already aborted).
	*/
	waitForAbort(dispatcher, signal) {
		return new Promise((resolve, reject) => {
			if (signal?.aborted) {
				this.disconnect();
				return resolve();
			}
			signal?.addEventListener("abort", () => {
				this.disconnect();
				resolve();
			}, { once: true });
			try {
				this._wsClient.start({ eventDispatcher: dispatcher });
			} catch (err) {
				this.disconnect();
				reject(err);
			}
		});
	}
};
//#endregion
//#region src/core/permission-url.ts
/**
* Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
* SPDX-License-Identifier: MIT
*
* Permission URL extraction utilities.
*
* Shared functions for extracting and processing permission grant URLs
* from Feishu API error messages.
*/
/**
* Permission priority for sorting.
* Lower number = higher priority.
* - read: 1 (highest)
* - write: 2
* - other / both read+write: 3 (lowest)
*/
function getPermissionPriority(scope) {
	const lowerScope = scope.toLowerCase();
	const hasRead = lowerScope.includes("read");
	const hasWrite = lowerScope.includes("write");
	if (hasRead && !hasWrite) return 1;
	if (hasWrite && !hasRead) return 2;
	return 3;
}
/**
* Extract the highest-priority permission from a scope list.
* Returns the permission with the lowest priority number (read > write > other).
*/
function extractHighestPriorityScope(scopeList) {
	return scopeList.split(",").sort((a, b) => getPermissionPriority(a) - getPermissionPriority(b))[0] ?? "";
}
/**
* Extract permission grant URL from a Feishu error message and optimize it
* by keeping only the highest-priority permission.
*
* @param msg - The error message containing the grant URL
* @returns The optimized grant URL with single permission, or empty string if not found
*/
function extractPermissionGrantUrl(msg) {
	const urlMatch = msg.match(/https:\/\/[^\s]+\/app\/[^\s]+/);
	if (!urlMatch?.[0]) return "";
	try {
		const url = new URL(urlMatch[0]);
		const firstScope = extractHighestPriorityScope(url.searchParams.get("q") ?? "");
		if (firstScope) url.searchParams.set("q", firstScope);
		return url.href;
	} catch {
		return urlMatch[0];
	}
}
/**
* Extract permission scopes from a Feishu error message.
* Looks for scopes in the format [scope1,scope2,...]
*/
function extractPermissionScopes(msg) {
	return msg.match(/\[([^\]]+)\]/)?.[1] ?? "unknown";
}
//#endregion
//#region src/core/auth-errors.ts
/**
* Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
* SPDX-License-Identifier: MIT
*
* auth-errors.ts — 统一错误类型定义。
*
* 所有与认证/授权/scope 相关的错误类型集中在此文件，
* 解除 tool-client ↔ app-scope-checker 循环依赖。
*
* 其他模块应直接 import 此文件，或通过 tool-client / uat-client 的 re-export 使用。
*/
/** 飞书 OAPI 错误码常量，替代各处硬编码的 magic number。 */
const LARK_ERROR = {
	APP_SCOPE_MISSING: 99991672,
	USER_SCOPE_INSUFFICIENT: 99991679,
	TOKEN_INVALID: 99991668,
	TOKEN_EXPIRED: 99991677,
	REFRESH_TOKEN_INVALID: 20026,
	REFRESH_TOKEN_EXPIRED: 20037,
	REFRESH_TOKEN_REVOKED: 20064,
	REFRESH_TOKEN_ALREADY_USED: 20073,
	REFRESH_SERVER_ERROR: 20050,
	MESSAGE_RECALLED: 230011,
	MESSAGE_DELETED: 231003
};
/** refresh token 端点可重试的错误码集合（服务端瞬时故障）。遇到后重试一次，仍失败则清 token。 */
const REFRESH_TOKEN_RETRYABLE = new Set([LARK_ERROR.REFRESH_SERVER_ERROR]);
/** 消息终止错误码集合（撤回/删除），遇到后应停止对该消息的后续操作。 */
const MESSAGE_TERMINAL_CODES = new Set([LARK_ERROR.MESSAGE_RECALLED, LARK_ERROR.MESSAGE_DELETED]);
/** access_token 失效相关的错误码集合，遇到后可尝试刷新重试。 */
const TOKEN_RETRY_CODES = new Set([LARK_ERROR.TOKEN_INVALID, LARK_ERROR.TOKEN_EXPIRED]);
/**
* Thrown when no valid UAT exists and the user needs to (re-)authorise.
* Callers should catch this and trigger the OAuth flow.
*/
var NeedAuthorizationError = class extends Error {
	userOpenId;
	constructor(userOpenId) {
		super("need_user_authorization");
		this.name = "NeedAuthorizationError";
		this.userOpenId = userOpenId;
	}
};
/**
* 应用缺少 application:application:self_manage 权限，无法查询应用权限配置。
*
* 需要管理员在飞书开放平台开通 application:application:self_manage 权限。
*/
var AppScopeCheckFailedError = class extends Error {
	/** 应用 ID，用于生成开放平台权限管理链接。 */
	appId;
	constructor(appId) {
		super("应用缺少 application:application:self_manage 权限，无法查询应用权限配置。请管理员在开放平台开通该权限。");
		this.name = "AppScopeCheckFailedError";
		this.appId = appId;
	}
};
/**
* 应用未开通 OAPI 所需 scope。
*
* 需要管理员在飞书开放平台开通权限。
*/
var AppScopeMissingError = class extends Error {
	apiName;
	/** OAPI 需要但 APP 未开通的 scope 列表。 */
	missingScopes;
	/** 工具的全部所需 scope（含已开通的），用于应用权限完成后一次性发起用户授权。 */
	allRequiredScopes;
	/** 应用 ID，用于生成开放平台权限管理链接。 */
	appId;
	scopeNeedType;
	/** 触发此错误时使用的 token 类型，用于保持 card action 二次校验一致。 */
	tokenType;
	constructor(info, scopeNeedType, tokenType, allRequiredScopes) {
		if (scopeNeedType === "one") super(`应用缺少权限 [${info.scopes.join(", ")}](开启任一权限即可)，请管理员在开放平台开通。`);
		else super(`应用缺少权限 [${info.scopes.join(", ")}]，请管理员在开放平台开通。`);
		this.name = "AppScopeMissingError";
		this.apiName = info.apiName;
		this.missingScopes = info.scopes;
		this.allRequiredScopes = allRequiredScopes;
		this.appId = info.appId;
		this.scopeNeedType = scopeNeedType;
		this.tokenType = tokenType;
	}
};
/**
* 用户未授权或 scope 不足，需要发起 OAuth 授权。
*
* `requiredScopes` 为 APP∩OAPI 的有效 scope，可直接传给
* `feishu_oauth authorize --scope`。
*/
var UserAuthRequiredError = class extends Error {
	userOpenId;
	apiName;
	/** APP∩OAPI 交集 scope，传给 OAuth authorize。 */
	requiredScopes;
	/** 应用 scope 是否已验证通过。false 时 requiredScopes 可能不准确。 */
	appScopeVerified;
	/** 应用 ID，用于生成开放平台权限管理链接。 */
	appId;
	constructor(userOpenId, info) {
		super("need_user_authorization");
		this.name = "UserAuthRequiredError";
		this.userOpenId = userOpenId;
		this.apiName = info.apiName;
		this.requiredScopes = info.scopes;
		this.appId = info.appId;
		this.appScopeVerified = info.appScopeVerified ?? true;
	}
};
/**
* 服务端报 99991679 — 用户 token 的 scope 不足。
*
* 需要增量授权：用缺失的 scope 发起新 Device Flow。
*/
var UserScopeInsufficientError = class extends Error {
	userOpenId;
	apiName;
	/** 缺失的 scope 列表。 */
	missingScopes;
	constructor(userOpenId, info) {
		super("user_scope_insufficient");
		this.name = "UserScopeInsufficientError";
		this.userOpenId = userOpenId;
		this.apiName = info.apiName;
		this.missingScopes = info.scopes;
	}
};
//#endregion
//#region src/messaging/inbound/permission.ts
/**
* Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
* SPDX-License-Identifier: MIT
*
* Permission error extraction and cooldown tracking for Feishu API calls.
*
* Extracted from bot.ts: PermissionError type, extractPermissionError,
* PERMISSION_ERROR_COOLDOWN_MS, permissionErrorNotifiedAt.
*/
function extractPermissionError(err) {
	if (!err || typeof err !== "object") return null;
	const data = err.response?.data;
	if (!data || typeof data !== "object") return null;
	const feishuErr = data;
	if (feishuErr.code !== LARK_ERROR.APP_SCOPE_MISSING) return null;
	const msg = feishuErr.msg ?? "";
	const grantUrl = extractPermissionGrantUrl(msg);
	if (!grantUrl) return null;
	return {
		code: feishuErr.code,
		message: msg,
		grantUrl
	};
}
const PERMISSION_ERROR_COOLDOWN_MS = 300 * 1e3;
const permissionErrorNotifiedAt = /* @__PURE__ */ new Map();
//#endregion
//#region src/messaging/inbound/user-name-cache.ts
var user_name_cache_exports = /* @__PURE__ */ __exportAll({
	UserNameCache: () => UserNameCache,
	batchResolveUserNames: () => batchResolveUserNames,
	clearUserNameCache: () => clearUserNameCache,
	createBatchResolveNames: () => createBatchResolveNames,
	getUserNameCache: () => getUserNameCache,
	resolveUserName: () => resolveUserName
});
const DEFAULT_MAX_SIZE = 500;
const DEFAULT_TTL_MS = 1800 * 1e3;
var UserNameCache = class {
	map = /* @__PURE__ */ new Map();
	maxSize;
	ttlMs;
	constructor(maxSize = DEFAULT_MAX_SIZE, ttlMs = DEFAULT_TTL_MS) {
		this.maxSize = maxSize;
		this.ttlMs = ttlMs;
	}
	/** Check whether the cache holds a (possibly empty) entry for this openId. */
	has(openId) {
		const entry = this.map.get(openId);
		if (!entry) return false;
		if (entry.expireAt <= Date.now()) {
			this.map.delete(openId);
			return false;
		}
		return true;
	}
	/** Get a cached name (refreshes LRU position). Returns `undefined` on miss or expiry. */
	get(openId) {
		const entry = this.map.get(openId);
		if (!entry) return void 0;
		if (entry.expireAt <= Date.now()) {
			this.map.delete(openId);
			return;
		}
		this.map.delete(openId);
		this.map.set(openId, entry);
		return entry.name;
	}
	/** Write a single entry (evicts oldest if over capacity). */
	set(openId, name) {
		this.map.delete(openId);
		this.map.set(openId, {
			name,
			expireAt: Date.now() + this.ttlMs
		});
		this.evict();
	}
	/** Write multiple entries at once. */
	setMany(entries) {
		for (const [openId, name] of entries) {
			this.map.delete(openId);
			this.map.set(openId, {
				name,
				expireAt: Date.now() + this.ttlMs
			});
		}
		this.evict();
	}
	/** Return openIds that are NOT present (or expired) in the cache. */
	filterMissing(openIds) {
		return openIds.filter((id) => !this.has(id));
	}
	/** Bulk read — returns a Map of openId→name for all hits (including empty-string names). */
	getMany(openIds) {
		const result = /* @__PURE__ */ new Map();
		for (const id of openIds) if (this.has(id)) result.set(id, this.get(id) ?? "");
		return result;
	}
	/** Clear all entries. */
	clear() {
		this.map.clear();
	}
	evict() {
		while (this.map.size > this.maxSize) {
			const oldest = this.map.keys().next().value;
			if (oldest !== void 0) this.map.delete(oldest);
		}
	}
};
const registry = /* @__PURE__ */ new Map();
/** Get (or create) the UserNameCache for a given account. */
function getUserNameCache(accountId) {
	let c = registry.get(accountId);
	if (!c) {
		c = new UserNameCache();
		registry.set(accountId, c);
	}
	return c;
}
/**
* Clear user-name caches.
* - With `accountId`: clear that single cache.
* - Without: clear all caches.
*/
function clearUserNameCache(accountId) {
	if (accountId !== void 0) {
		registry.get(accountId)?.clear();
		registry.delete(accountId);
	} else {
		for (const c of registry.values()) c.clear();
		registry.clear();
	}
}
/** Max user_ids per API call (Feishu limit). */
const BATCH_SIZE = 50;
/**
* Batch-resolve user display names.
*
* 1. Check cache → collect misses
* 2. Deduplicate
* 3. Call `GET /open-apis/contact/v3/users/batch` in chunks of 50
* 4. Write results back to cache
* 5. Return full Map<openId, name> (cache hits + API results)
*
* Best-effort: API errors are logged but never thrown.
*/
async function batchResolveUserNames(params) {
	const { account, openIds, log } = params;
	if (!account.configured || openIds.length === 0) return /* @__PURE__ */ new Map();
	const cache = getUserNameCache(account.accountId);
	const result = cache.getMany(openIds);
	const missing = [...new Set(cache.filterMissing(openIds))];
	if (missing.length === 0) return result;
	const client = LarkClient.fromAccount(account).sdk;
	for (let i = 0; i < missing.length; i += BATCH_SIZE) {
		const chunk = missing.slice(i, i + BATCH_SIZE);
		try {
			const items = (await client.contact.user.batch({ params: {
				user_ids: chunk,
				user_id_type: "open_id"
			} }))?.data?.items ?? [];
			const resolved = /* @__PURE__ */ new Set();
			for (const item of items) {
				const openId = item.open_id;
				if (!openId) continue;
				const name = item.name || item.display_name || item.nickname || item.en_name || "";
				cache.set(openId, name);
				result.set(openId, name);
				resolved.add(openId);
			}
			for (const id of chunk) if (!resolved.has(id)) {
				cache.set(id, "");
				result.set(id, "");
			}
		} catch (err) {
			log(`batchResolveUserNames: failed: ${String(err)}`);
		}
	}
	return result;
}
/**
* Create a `batchResolveNames` callback for use in `ConvertContext`.
*
* The returned function calls `batchResolveUserNames` with the given
* account and log function, populating the TAT user-name cache.
*/
function createBatchResolveNames(account, log) {
	return async (openIds) => {
		await batchResolveUserNames({
			account,
			openIds,
			log
		});
	};
}
/**
* Resolve a single user's display name.
*
* Checks the account-scoped cache first, then falls back to the
* `contact.user.get` API (same as the old `resolveFeishuSenderName`).
*/
async function resolveUserName(params) {
	const { account, openId, log } = params;
	if (!account.configured || !openId) return {};
	const cache = getUserNameCache(account.accountId);
	if (cache.has(openId)) return { name: cache.get(openId) ?? "" };
	try {
		const res = await LarkClient.fromAccount(account).sdk.contact.user.get({
			path: { user_id: openId },
			params: { user_id_type: "open_id" }
		});
		const name = res?.data?.user?.name || res?.data?.user?.display_name || res?.data?.user?.nickname || res?.data?.user?.en_name || "";
		cache.set(openId, name);
		return { name: name || void 0 };
	} catch (err) {
		const permErr = extractPermissionError(err);
		if (permErr) {
			log(`feishu: permission error resolving user name: code=${permErr.code}`);
			cache.set(openId, "");
			return { permissionError: permErr };
		}
		log(`feishu: failed to resolve user name for ${openId}: ${String(err)}`);
		return {};
	}
}
//#endregion
export { getEnabledLarkAccounts as A, isThreadCapableGroup as C, withTicket as D, ticketElapsed as E, getLarkAccountIds as M, createAccountScopedConfig as O, getChatTypeFeishu as S, getTicket as T, extractPermissionGrantUrl as _, user_name_cache_exports as a, getPluginVersion as b, AppScopeCheckFailedError as c, MESSAGE_TERMINAL_CODES as d, NeedAuthorizationError as f, UserScopeInsufficientError as g, UserAuthRequiredError as h, resolveUserName as i, getLarkAccount as j, getDefaultLarkAccountId as k, AppScopeMissingError as l, TOKEN_RETRY_CODES as m, createBatchResolveNames as n, PERMISSION_ERROR_COOLDOWN_MS as o, REFRESH_TOKEN_RETRYABLE as p, getUserNameCache as r, permissionErrorNotifiedAt as s, batchResolveUserNames as t, LARK_ERROR as u, extractPermissionScopes as v, larkLogger as w, getUserAgent as x, LarkClient as y };
