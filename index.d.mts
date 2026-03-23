import { HistoryEntry } from "openclaw/plugin-sdk/reply-history";
import { z } from "zod";
import { ChannelMessageActionAdapter, ChannelPlugin, ClawdbotConfig, OpenClawConfig, OpenClawPluginApi, RuntimeEnv } from "openclaw/plugin-sdk";
//#region src/core/config-schema.d.ts
declare const FeishuConfigSchema: z.ZodObject<{
  appId: z.ZodOptional<z.ZodString>;
  appSecret: z.ZodOptional<z.ZodString>;
  encryptKey: z.ZodOptional<z.ZodString>;
  verificationToken: z.ZodOptional<z.ZodString>;
  name: z.ZodOptional<z.ZodString>;
  enabled: z.ZodOptional<z.ZodBoolean>;
  domain: z.ZodOptional<z.ZodUnion<readonly [z.ZodLiteral<"feishu">, z.ZodLiteral<"lark">, z.ZodString]>>;
  connectionMode: z.ZodOptional<z.ZodEnum<{
    websocket: "websocket";
    webhook: "webhook";
  }>>;
  webhookPath: z.ZodOptional<z.ZodString>;
  webhookPort: z.ZodOptional<z.ZodNumber>;
  dmPolicy: z.ZodOptional<z.ZodEnum<{
    open: "open";
    allowlist: "allowlist";
    disabled: "disabled";
    pairing: "pairing";
  }>>;
  allowFrom: z.ZodPipe<z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>, z.ZodTransform<string[] | undefined, string | string[] | undefined>>;
  groupPolicy: z.ZodOptional<z.ZodEnum<{
    open: "open";
    allowlist: "allowlist";
    disabled: "disabled";
  }>>;
  groupAllowFrom: z.ZodPipe<z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>, z.ZodTransform<string[] | undefined, string | string[] | undefined>>;
  requireMention: z.ZodOptional<z.ZodBoolean>;
  groups: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
    groupPolicy: z.ZodOptional<z.ZodEnum<{
      open: "open";
      allowlist: "allowlist";
      disabled: "disabled";
    }>>;
    requireMention: z.ZodOptional<z.ZodBoolean>;
    tools: z.ZodOptional<z.ZodObject<{
      allow: z.ZodOptional<z.ZodArray<z.ZodString>>;
      deny: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
    skills: z.ZodOptional<z.ZodArray<z.ZodString>>;
    enabled: z.ZodOptional<z.ZodBoolean>;
    allowFrom: z.ZodPipe<z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>, z.ZodTransform<string[] | undefined, string | string[] | undefined>>;
    systemPrompt: z.ZodOptional<z.ZodString>;
  }, z.core.$strip>>>;
  historyLimit: z.ZodOptional<z.ZodNumber>;
  dmHistoryLimit: z.ZodOptional<z.ZodNumber>;
  dms: z.ZodOptional<z.ZodObject<{
    historyLimit: z.ZodOptional<z.ZodNumber>;
  }, z.core.$strip>>;
  textChunkLimit: z.ZodOptional<z.ZodNumber>;
  chunkMode: z.ZodOptional<z.ZodEnum<{
    newline: "newline";
    paragraph: "paragraph";
    none: "none";
  }>>;
  blockStreamingCoalesce: z.ZodOptional<z.ZodObject<{
    minChars: z.ZodOptional<z.ZodNumber>;
    maxChars: z.ZodOptional<z.ZodNumber>;
    idleMs: z.ZodOptional<z.ZodNumber>;
  }, z.core.$strip>>;
  mediaMaxMb: z.ZodOptional<z.ZodNumber>;
  heartbeat: z.ZodOptional<z.ZodObject<{
    every: z.ZodOptional<z.ZodString>;
    activeHours: z.ZodOptional<z.ZodObject<{
      start: z.ZodOptional<z.ZodString>;
      end: z.ZodOptional<z.ZodString>;
      timezone: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    target: z.ZodOptional<z.ZodString>;
    to: z.ZodOptional<z.ZodString>;
    prompt: z.ZodOptional<z.ZodString>;
    accountId: z.ZodOptional<z.ZodString>;
  }, z.core.$strip>>;
  replyMode: z.ZodOptional<z.ZodUnion<readonly [z.ZodEnum<{
    auto: "auto";
    static: "static";
    streaming: "streaming";
  }>, z.ZodObject<{
    default: z.ZodOptional<z.ZodEnum<{
      auto: "auto";
      static: "static";
      streaming: "streaming";
    }>>;
    group: z.ZodOptional<z.ZodEnum<{
      auto: "auto";
      static: "static";
      streaming: "streaming";
    }>>;
    direct: z.ZodOptional<z.ZodEnum<{
      auto: "auto";
      static: "static";
      streaming: "streaming";
    }>>;
  }, z.core.$strip>]>>;
  streaming: z.ZodOptional<z.ZodBoolean>;
  blockStreaming: z.ZodOptional<z.ZodBoolean>;
  tools: z.ZodOptional<z.ZodObject<{
    doc: z.ZodOptional<z.ZodBoolean>;
    wiki: z.ZodOptional<z.ZodBoolean>;
    drive: z.ZodOptional<z.ZodBoolean>;
    perm: z.ZodOptional<z.ZodBoolean>;
    scopes: z.ZodOptional<z.ZodBoolean>;
  }, z.core.$strip>>;
  footer: z.ZodOptional<z.ZodObject<{
    status: z.ZodOptional<z.ZodBoolean>;
    elapsed: z.ZodOptional<z.ZodBoolean>;
  }, z.core.$strip>>;
  markdown: z.ZodOptional<z.ZodObject<{
    tables: z.ZodOptional<z.ZodEnum<{
      off: "off";
      bullets: "bullets";
      code: "code";
    }>>;
  }, z.core.$strip>>;
  configWrites: z.ZodOptional<z.ZodBoolean>;
  capabilities: z.ZodOptional<z.ZodObject<{
    image: z.ZodOptional<z.ZodBoolean>;
    audio: z.ZodOptional<z.ZodBoolean>;
    video: z.ZodOptional<z.ZodBoolean>;
  }, z.core.$strip>>;
  dedup: z.ZodOptional<z.ZodObject<{
    ttlMs: z.ZodOptional<z.ZodNumber>;
    maxEntries: z.ZodOptional<z.ZodNumber>;
  }, z.core.$strip>>;
  reactionNotifications: z.ZodOptional<z.ZodEnum<{
    off: "off";
    own: "own";
    all: "all";
  }>>;
  threadSession: z.ZodOptional<z.ZodBoolean>;
  uat: z.ZodOptional<z.ZodObject<{
    enabled: z.ZodOptional<z.ZodBoolean>;
    allowedScopes: z.ZodOptional<z.ZodArray<z.ZodString>>;
    blockedScopes: z.ZodOptional<z.ZodArray<z.ZodString>>;
  }, z.core.$strip>>;
  accounts: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
    appId: z.ZodOptional<z.ZodString>;
    appSecret: z.ZodOptional<z.ZodString>;
    encryptKey: z.ZodOptional<z.ZodString>;
    verificationToken: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    enabled: z.ZodOptional<z.ZodBoolean>;
    domain: z.ZodOptional<z.ZodUnion<readonly [z.ZodLiteral<"feishu">, z.ZodLiteral<"lark">, z.ZodString]>>;
    connectionMode: z.ZodOptional<z.ZodEnum<{
      websocket: "websocket";
      webhook: "webhook";
    }>>;
    webhookPath: z.ZodOptional<z.ZodString>;
    webhookPort: z.ZodOptional<z.ZodNumber>;
    dmPolicy: z.ZodOptional<z.ZodEnum<{
      open: "open";
      allowlist: "allowlist";
      disabled: "disabled";
      pairing: "pairing";
    }>>;
    allowFrom: z.ZodPipe<z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>, z.ZodTransform<string[] | undefined, string | string[] | undefined>>;
    groupPolicy: z.ZodOptional<z.ZodEnum<{
      open: "open";
      allowlist: "allowlist";
      disabled: "disabled";
    }>>;
    groupAllowFrom: z.ZodPipe<z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>, z.ZodTransform<string[] | undefined, string | string[] | undefined>>;
    requireMention: z.ZodOptional<z.ZodBoolean>;
    groups: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
      groupPolicy: z.ZodOptional<z.ZodEnum<{
        open: "open";
        allowlist: "allowlist";
        disabled: "disabled";
      }>>;
      requireMention: z.ZodOptional<z.ZodBoolean>;
      tools: z.ZodOptional<z.ZodObject<{
        allow: z.ZodOptional<z.ZodArray<z.ZodString>>;
        deny: z.ZodOptional<z.ZodArray<z.ZodString>>;
      }, z.core.$strip>>;
      skills: z.ZodOptional<z.ZodArray<z.ZodString>>;
      enabled: z.ZodOptional<z.ZodBoolean>;
      allowFrom: z.ZodPipe<z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>, z.ZodTransform<string[] | undefined, string | string[] | undefined>>;
      systemPrompt: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
    historyLimit: z.ZodOptional<z.ZodNumber>;
    dmHistoryLimit: z.ZodOptional<z.ZodNumber>;
    dms: z.ZodOptional<z.ZodObject<{
      historyLimit: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    textChunkLimit: z.ZodOptional<z.ZodNumber>;
    chunkMode: z.ZodOptional<z.ZodEnum<{
      newline: "newline";
      paragraph: "paragraph";
      none: "none";
    }>>;
    blockStreamingCoalesce: z.ZodOptional<z.ZodObject<{
      minChars: z.ZodOptional<z.ZodNumber>;
      maxChars: z.ZodOptional<z.ZodNumber>;
      idleMs: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    mediaMaxMb: z.ZodOptional<z.ZodNumber>;
    heartbeat: z.ZodOptional<z.ZodObject<{
      every: z.ZodOptional<z.ZodString>;
      activeHours: z.ZodOptional<z.ZodObject<{
        start: z.ZodOptional<z.ZodString>;
        end: z.ZodOptional<z.ZodString>;
        timezone: z.ZodOptional<z.ZodString>;
      }, z.core.$strip>>;
      target: z.ZodOptional<z.ZodString>;
      to: z.ZodOptional<z.ZodString>;
      prompt: z.ZodOptional<z.ZodString>;
      accountId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    replyMode: z.ZodOptional<z.ZodUnion<readonly [z.ZodEnum<{
      auto: "auto";
      static: "static";
      streaming: "streaming";
    }>, z.ZodObject<{
      default: z.ZodOptional<z.ZodEnum<{
        auto: "auto";
        static: "static";
        streaming: "streaming";
      }>>;
      group: z.ZodOptional<z.ZodEnum<{
        auto: "auto";
        static: "static";
        streaming: "streaming";
      }>>;
      direct: z.ZodOptional<z.ZodEnum<{
        auto: "auto";
        static: "static";
        streaming: "streaming";
      }>>;
    }, z.core.$strip>]>>;
    streaming: z.ZodOptional<z.ZodBoolean>;
    blockStreaming: z.ZodOptional<z.ZodBoolean>;
    tools: z.ZodOptional<z.ZodObject<{
      doc: z.ZodOptional<z.ZodBoolean>;
      wiki: z.ZodOptional<z.ZodBoolean>;
      drive: z.ZodOptional<z.ZodBoolean>;
      perm: z.ZodOptional<z.ZodBoolean>;
      scopes: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>;
    footer: z.ZodOptional<z.ZodObject<{
      status: z.ZodOptional<z.ZodBoolean>;
      elapsed: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>;
    markdown: z.ZodOptional<z.ZodObject<{
      tables: z.ZodOptional<z.ZodEnum<{
        off: "off";
        bullets: "bullets";
        code: "code";
      }>>;
    }, z.core.$strip>>;
    configWrites: z.ZodOptional<z.ZodBoolean>;
    capabilities: z.ZodOptional<z.ZodObject<{
      image: z.ZodOptional<z.ZodBoolean>;
      audio: z.ZodOptional<z.ZodBoolean>;
      video: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>;
    dedup: z.ZodOptional<z.ZodObject<{
      ttlMs: z.ZodOptional<z.ZodNumber>;
      maxEntries: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    reactionNotifications: z.ZodOptional<z.ZodEnum<{
      off: "off";
      own: "own";
      all: "all";
    }>>;
    threadSession: z.ZodOptional<z.ZodBoolean>;
    uat: z.ZodOptional<z.ZodObject<{
      enabled: z.ZodOptional<z.ZodBoolean>;
      allowedScopes: z.ZodOptional<z.ZodArray<z.ZodString>>;
      blockedScopes: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
  }, z.core.$strip>>>;
}, z.core.$strip>;
//#endregion
//#region src/core/types.d.ts
/** Fully resolved top-level Feishu channel configuration. */
type FeishuConfig = z.infer<typeof FeishuConfigSchema>;
/**
 * The Lark platform brand.
 * - `"feishu"` targets the China-mainland Feishu service.
 * - `"lark"` targets the international Lark service.
 * - Any other string is treated as a custom base URL.
 */
type LarkBrand = 'feishu' | 'lark' | (string & {});
/** Common fields shared by all resolved account states. */
interface LarkAccountBase {
  accountId: string;
  enabled: boolean;
  name?: string;
  encryptKey?: string;
  verificationToken?: string;
  brand: LarkBrand;
  config: FeishuConfig;
}
/** An account with both `appId` and `appSecret` present. */
type ConfiguredLarkAccount = LarkAccountBase & {
  configured: true;
  appId: string;
  appSecret: string;
};
/** An account that is missing `appId` and/or `appSecret`. */
type UnconfiguredLarkAccount = LarkAccountBase & {
  configured: false;
  appId?: string;
  appSecret?: string;
};
/** A resolved Lark account — either fully configured or not. */
type LarkAccount = ConfiguredLarkAccount | UnconfiguredLarkAccount;
/** Result of probing an app's connectivity / permissions. */
interface FeishuProbeResult {
  ok: boolean;
  error?: string;
  appId?: string;
  botName?: string;
  botOpenId?: string;
}
//#endregion
//#region src/messaging/inbound/dedup.d.ts
/**
 * Check whether a message is too old to process.
 *
 * Feishu message `create_time` is a millisecond Unix timestamp encoded
 * as a string.  When a WebSocket reconnects after a long outage, stale
 * messages may be redelivered — this function lets callers discard them
 * before entering the full handling pipeline.
 */
declare function isMessageExpired(createTimeStr: string | undefined, expiryMs?: number): boolean;
//#endregion
//#region src/core/lark-client.d.ts
/** Credential set accepted by the ephemeral `fromCredentials` factory. */
interface LarkClientCredentials {
  accountId?: string;
  appId?: string;
  appSecret?: string;
  brand?: LarkBrand;
}
//#endregion
//#region src/channel/types.d.ts
interface MonitorFeishuOpts {
  config?: ClawdbotConfig;
  runtime?: RuntimeEnv;
  abortSignal?: AbortSignal;
  accountId?: string;
}
//#endregion
//#region src/channel/monitor.d.ts
/**
 * Start monitoring for all enabled Feishu accounts (or a single
 * account when `opts.accountId` is specified).
 */
declare function monitorFeishuProvider(opts?: MonitorFeishuOpts): Promise<void>;
//#endregion
//#region src/messaging/types.d.ts
/**
 * Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 *
 * Messaging type definitions for the Lark/Feishu channel plugin.
 *
 * Pure shape types for inbound message events, normalised message context,
 * mention targets, and media metadata.
 */
interface FeishuMessageEvent {
  sender: {
    sender_id: {
      open_id?: string;
      user_id?: string;
      union_id?: string;
    };
    sender_type?: string;
    tenant_key?: string;
  };
  message: {
    message_id: string;
    root_id?: string;
    parent_id?: string;
    create_time?: string;
    update_time?: string;
    chat_id: string;
    thread_id?: string;
    chat_type: 'p2p' | 'group';
    message_type: string;
    content: string;
    mentions?: Array<{
      key: string;
      id: {
        open_id?: string;
        user_id?: string;
        union_id?: string;
      };
      name: string;
      tenant_key?: string;
    }>;
    user_agent?: string;
  };
}
interface FeishuReactionCreatedEvent {
  message_id: string;
  chat_id?: string;
  chat_type?: 'p2p' | 'group' | 'private';
  reaction_type?: {
    emoji_type?: string;
  };
  operator_type?: string;
  user_id?: {
    open_id?: string;
    user_id?: string;
    union_id?: string;
  };
  action_time?: string;
}
/** Metadata describing a media resource in a message (no binary data). */
interface ResourceDescriptor {
  type: 'image' | 'file' | 'audio' | 'video' | 'sticker';
  /** image_key or file_key from the raw message content. */
  fileKey: string;
  /** Original file name (file/video messages). */
  fileName?: string;
  /** Duration in milliseconds (audio/video messages). */
  duration?: number;
  /** Video cover image key. */
  coverImageKey?: string;
}
/** Structured @mention information from a message. */
interface MentionInfo {
  /** Placeholder key in raw content (e.g. "@_user_1"). */
  key: string;
  /** Feishu Open ID of the mentioned user. */
  openId: string;
  /** Display name. */
  name: string;
  /** Whether this mention targets the bot itself. */
  isBot: boolean;
}
/** Raw message body, directly mapped from FeishuMessageEvent.message. */
interface RawMessage {
  message_id: string;
  root_id?: string;
  parent_id?: string;
  create_time?: string;
  update_time?: string;
  chat_id: string;
  thread_id?: string;
  chat_type: 'p2p' | 'group';
  message_type: string;
  content: string;
  mentions?: Array<{
    key: string;
    id: {
      open_id?: string;
      user_id?: string;
      union_id?: string;
    };
    name: string;
    tenant_key?: string;
  }>;
  user_agent?: string;
}
/** Raw sender data, directly mapped from FeishuMessageEvent.sender. */
interface RawSender {
  sender_id: {
    open_id?: string;
    user_id?: string;
    union_id?: string;
  };
  sender_type?: string;
  tenant_key?: string;
}
/** Normalised representation of an inbound Feishu message. */
interface MessageContext {
  chatId: string;
  messageId: string;
  senderId: string;
  senderName?: string;
  chatType: 'p2p' | 'group';
  content: string;
  contentType: string;
  /** Media resource descriptors extracted during parsing. */
  resources: ResourceDescriptor[];
  /** All @mentions in the message (including bot). */
  mentions: MentionInfo[];
  rootId?: string;
  parentId?: string;
  threadId?: string;
  createTime?: number;
  rawMessage: RawMessage;
  rawSender: RawSender;
}
/** @deprecated Use {@link MessageContext} instead. */
type FeishuMessageContext = MessageContext;
/** Result of sending a message via the Feishu API. */
interface FeishuSendResult {
  messageId: string;
  chatId: string;
  /**
   * Human-readable warning when the send succeeded but with degradation
   * (e.g. media upload failed, fell back to a text link).
   *
   * Populated so upstream callers (and the AI) can detect that the
   * delivery was not fully as intended and take corrective action.
   */
  warning?: string;
}
//#endregion
//#region src/messaging/outbound/send.d.ts
/**
 * Parameters for sending a text / post message.
 */
interface SendFeishuMessageParams {
  cfg: ClawdbotConfig;
  /** Target identifier (chat_id, open_id, or user_id). */
  to: string;
  /** Message text content (supports Feishu markdown subset). */
  text: string;
  /** When set, the message is sent as a threaded reply. */
  replyToMessageId?: string;
  /** Optional mention targets to prepend to the message. */
  mentions?: MentionInfo[];
  /** Optional account identifier for multi-account setups. */
  accountId?: string;
  /** When true, the reply appears in the thread instead of main chat. */
  replyInThread?: boolean;
  /**
   * Optional multi-locale texts for i18n post messages.
   * When provided, builds a multi-locale post structure (e.g. { zh_cn: ..., en_us: ... })
   * and the `text` field is ignored. Feishu client auto-selects locale based on user language.
   */
  i18nTexts?: Record<string, string>;
}
/**
 * Parameters for sending an interactive card message.
 */
interface SendFeishuCardParams {
  cfg: ClawdbotConfig;
  /** Target identifier (chat_id, open_id, or user_id). */
  to: string;
  /** The full interactive card JSON payload. */
  card: Record<string, unknown>;
  /** When set, the card is sent as a threaded reply. */
  replyToMessageId?: string;
  /** Optional account identifier for multi-account setups. */
  accountId?: string;
  /** When true, the reply appears in the thread instead of main chat. */
  replyInThread?: boolean;
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
declare function sendMessageFeishu(params: SendFeishuMessageParams): Promise<FeishuSendResult>;
/**
 * Send an interactive card message to a chat or user.
 *
 * @param params - See {@link SendFeishuCardParams}.
 * @returns The send result containing the new message ID.
 */
declare function sendCardFeishu(params: SendFeishuCardParams): Promise<FeishuSendResult>;
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
declare function updateCardFeishu(params: {
  cfg: ClawdbotConfig;
  messageId: string;
  card: Record<string, unknown>;
  accountId?: string;
}): Promise<void>;
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
declare function editMessageFeishu(params: {
  cfg: ClawdbotConfig;
  messageId: string;
  text: string;
  accountId?: string;
}): Promise<void>;
//#endregion
//#region src/messaging/shared/message-lookup.d.ts
/**
 * Normalised information about a Feishu message, returned by
 * {@link getMessageFeishu}.
 */
interface FeishuMessageInfo {
  /** Unique Feishu message ID. */
  messageId: string;
  /** Chat ID where the message lives. */
  chatId: string;
  /** Chat type ("p2p" or "group"), when available in the API response. */
  chatType?: string;
  /** Open ID of the sender (if available). */
  senderId?: string;
  /** Display name of the sender (resolved from user-name cache). */
  senderName?: string;
  /** Feishu sender type: "user" for human users, "app" for bots/apps. */
  senderType?: string;
  /** The parsed text / content of the message. */
  content: string;
  /** Feishu content type indicator (text, post, image, interactive, ...). */
  contentType: string;
  /** Unix-millisecond timestamp of when the message was created. */
  createTime?: number;
  /** Thread ID if the message belongs to a thread (omt_xxx format). */
  threadId?: string;
}
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
declare function getMessageFeishu(params: {
  cfg: ClawdbotConfig;
  messageId: string;
  accountId?: string; /** When true, merge_forward content is recursively expanded via API. */
  expandForward?: boolean;
}): Promise<FeishuMessageInfo | null>;
//#endregion
//#region src/messaging/outbound/media.d.ts
/**
 * Result of uploading an image to Feishu.
 */
interface UploadImageResult {
  /** The image_key assigned by Feishu, used to reference the image. */
  imageKey: string;
}
/**
 * Result of uploading a file to Feishu.
 */
interface UploadFileResult {
  /** The file_key assigned by Feishu, used to reference the file. */
  fileKey: string;
}
/**
 * Result of sending a media (image or file) message.
 */
interface SendMediaResult {
  /** Platform-assigned message ID. */
  messageId: string;
  /** Chat ID where the media was sent. */
  chatId: string;
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
declare function uploadImageLark(params: {
  cfg: OpenClawConfig;
  image: Buffer | string;
  imageType?: 'message' | 'avatar';
  accountId?: string;
}): Promise<UploadImageResult>;
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
declare function uploadFileLark(params: {
  cfg: OpenClawConfig;
  file: Buffer | string;
  fileName: string;
  fileType: 'opus' | 'mp4' | 'pdf' | 'doc' | 'xls' | 'ppt' | 'stream';
  duration?: number;
  accountId?: string;
}): Promise<UploadFileResult>;
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
declare function sendImageLark(params: {
  cfg: OpenClawConfig;
  to: string;
  imageKey: string;
  replyToMessageId?: string;
  replyInThread?: boolean;
  accountId?: string;
}): Promise<SendMediaResult>;
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
declare function sendFileLark(params: {
  cfg: OpenClawConfig;
  to: string;
  fileKey: string;
  replyToMessageId?: string;
  replyInThread?: boolean;
  accountId?: string;
}): Promise<SendMediaResult>;
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
declare function sendAudioLark(params: {
  cfg: OpenClawConfig;
  to: string;
  fileKey: string;
  replyToMessageId?: string;
  replyInThread?: boolean;
  accountId?: string;
}): Promise<SendMediaResult>;
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
declare function uploadAndSendMediaLark(params: {
  cfg: OpenClawConfig;
  to: string;
  mediaUrl?: string;
  mediaBuffer?: Buffer;
  fileName?: string;
  replyToMessageId?: string;
  replyInThread?: boolean;
  accountId?: string; /** Allowed root directories for local file access (SSRF prevention). */
  mediaLocalRoots?: readonly string[];
}): Promise<SendMediaResult>;
//#endregion
//#region src/messaging/outbound/deliver.d.ts
/**
 * Parameters for sending a text message via Feishu.
 */
interface SendTextLarkParams {
  /** Plugin configuration. */
  cfg: ClawdbotConfig;
  /** Target identifier (chat_id, open_id, or user_id). */
  to: string;
  /** Message text content (supports Feishu markdown subset). */
  text: string;
  /** When set, the message is sent as a threaded reply. */
  replyToMessageId?: string;
  /** When true, the reply appears in the thread instead of main chat. */
  replyInThread?: boolean;
  /** Optional account identifier for multi-account setups. */
  accountId?: string;
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
declare function sendTextLark(params: SendTextLarkParams): Promise<FeishuSendResult>;
/**
 * Parameters for sending an interactive card message via Feishu.
 */
interface SendCardLarkParams {
  /** Plugin configuration. */
  cfg: ClawdbotConfig;
  /** Target identifier (chat_id, open_id, or user_id). */
  to: string;
  /**
   * Complete card JSON object (v1 Message Card or v2 CardKit).
   *
   * - **v1**: top-level `config`, `header`, `elements`.
   * - **v2**: `schema: "2.0"`, `config`, `header`, `body.elements`.
   *
   * The Feishu server determines the version by the presence of
   * `schema: "2.0"`.
   */
  card: Record<string, unknown>;
  /** When set, the card is sent as a threaded reply. */
  replyToMessageId?: string;
  /** When true, the reply appears in the thread instead of main chat. */
  replyInThread?: boolean;
  /** Optional account identifier for multi-account setups. */
  accountId?: string;
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
declare function sendCardLark(params: SendCardLarkParams): Promise<FeishuSendResult>;
/**
 * Parameters for sending a single media message via Feishu.
 */
interface SendMediaLarkParams {
  /** Plugin configuration. */
  cfg: ClawdbotConfig;
  /** Target identifier (chat_id, open_id, or user_id). */
  to: string;
  /** Media URL to upload and send. */
  mediaUrl: string;
  /** When set, the message is sent as a threaded reply. */
  replyToMessageId?: string;
  /** When true, the reply appears in the thread instead of main chat. */
  replyInThread?: boolean;
  /** Optional account identifier for multi-account setups. */
  accountId?: string;
  /** Allowed root directories for local file access (SSRF prevention). */
  mediaLocalRoots?: readonly string[];
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
declare function sendMediaLark(params: SendMediaLarkParams): Promise<FeishuSendResult>;
//#endregion
//#region src/messaging/outbound/outbound.d.ts
/**
 * Channel-specific payload for Feishu, carried in `ReplyPayload.channelData.feishu`.
 *
 * Callers (skills, tools, programmatic code) populate this structure to send
 * Feishu-native content that the standard text/media path cannot express.
 *
 * Both card v1 (Message Card) and v2 (CardKit) formats are supported.
 * The Feishu server distinguishes the version by the presence of `schema: "2.0"`.
 *
 * @example
 * ```ts
 * // --- v1 Message Card (default) ---
 * const v1Reply: ReplyPayload = {
 *   channelData: {
 *     feishu: {
 *       card: {
 *         config: { wide_screen_mode: true },
 *         header: {
 *           title: { tag: "plain_text", content: "Task Created" },
 *           template: "green",
 *         },
 *         elements: [
 *           { tag: "div", text: { tag: "lark_md", content: "**Title:** Fix login bug" } },
 *           { tag: "action", actions: [
 *             { tag: "button", text: { tag: "plain_text", content: "View" }, type: "primary", url: "https://..." },
 *           ]},
 *         ],
 *       },
 *     },
 *   },
 * };
 *
 * // --- v2 CardKit ---
 * const v2Reply: ReplyPayload = {
 *   channelData: {
 *     feishu: {
 *       card: {
 *         schema: "2.0",
 *         config: { wide_screen_mode: true },
 *         header: {
 *           title: { tag: "plain_text", content: "Task Created" },
 *           template: "green",
 *         },
 *         body: {
 *           elements: [
 *             { tag: "markdown", content: "**Title:** Fix login bug" },
 *           ],
 *         },
 *       },
 *     },
 *   },
 * };
 * ```
 */
interface FeishuChannelData {
  /**
   * A complete Feishu interactive card JSON object (v1 or v2).
   *
   * The card is sent as-is via `msg_type: "interactive"`. The Feishu server
   * uses the presence of `schema: "2.0"` to determine the card version.
   *
   * **v1 (Message Card)** — default when no `schema` field is present.
   * Top-level fields: `config`, `header`, `elements`.
   * Element tags: `div`, `action`, `button`, `button_group`, `note`,
   * `img`, `hr`, `column_set`, `markdown` (limited), `lark_md` (in div.text).
   *
   * **v2 (CardKit)** — activated by `schema: "2.0"`.
   * Top-level fields: `schema`, `config`, `header`, `body.elements`.
   * Element tags: `markdown`, `plain_text`, `hr`, `collapsible_panel`,
   * `column_set`, `table`, `image`, `button`, `select_static`, `overflow`.
   * Not supported in v2: `action`, `button_group`, `note`, `div` + `lark_md`.
   *
   * @see https://open.larkoffice.com/document/feishu-cards/card-json-v2-structure (v2)
   * @see https://open.feishu.cn/document/uAjLw4CM/ukzMukzMukzM/feishu-cards/card-components (v1)
   */
  card?: Record<string, unknown>;
}
//#endregion
//#region src/channel/probe.d.ts
/**
 * Probe the Feishu bot connection by calling the bot/v3/info API.
 *
 * Returns a result indicating whether the bot is reachable and its
 * basic identity (name, open_id).  Used by onboarding and status
 * checks to verify credentials before committing them to config.
 */
declare function probeFeishu(credentials?: LarkClientCredentials): Promise<FeishuProbeResult>;
//#endregion
//#region src/messaging/outbound/reactions.d.ts
/**
 * Represents a single reaction on a Feishu message.
 */
interface FeishuReaction {
  /** Unique reaction ID assigned by the platform. */
  reactionId: string;
  /** The emoji type string (e.g. "THUMBSUP", "HEART"). */
  emojiType: string;
  /** Whether the reaction was added by an app or a human user. */
  operatorType: 'app' | 'user';
  /** Open ID of the operator who added the reaction. */
  operatorId: string;
}
/**
 * Well-known Feishu emoji type strings.
 *
 * This is a convenience map so consumers do not need to memorise the
 * exact string identifiers. It is intentionally non-exhaustive --
 * Feishu supports many more emoji types. Any valid emoji type string
 * can be passed directly to the API functions.
 */
declare const FeishuEmoji: {
  readonly THUMBSUP: "THUMBSUP";
  readonly THUMBSDOWN: "THUMBSDOWN";
  readonly HEART: "HEART";
  readonly SMILE: "SMILE";
  readonly JOYFUL: "JOYFUL";
  readonly FROWN: "FROWN";
  readonly BLUSH: "BLUSH";
  readonly OK: "OK";
  readonly CLAP: "CLAP";
  readonly FIREWORKS: "FIREWORKS";
  readonly PARTY: "PARTY";
  readonly MUSCLE: "MUSCLE";
  readonly FIRE: "FIRE";
  readonly EYES: "EYES";
  readonly THINKING: "THINKING";
  readonly PRAISE: "PRAISE";
  readonly PRAY: "PRAY";
  readonly ROCKET: "ROCKET";
  readonly DONE: "DONE";
  readonly SKULL: "SKULL";
  readonly HUNDREDPOINTS: "HUNDREDPOINTS";
  readonly FACEPALM: "FACEPALM";
  readonly CHECK: "CHECK";
  readonly CROSSMARK: "CrossMark";
  readonly COOL: "COOL";
  readonly TYPING: "Typing";
  readonly SPEECHLESS: "SPEECHLESS";
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
declare const VALID_FEISHU_EMOJI_TYPES: ReadonlySet<string>;
/**
 * Add an emoji reaction to a Feishu message.
 *
 * @param params.cfg       - Plugin configuration with Feishu credentials.
 * @param params.messageId - The message to react to.
 * @param params.emojiType - The emoji type string (e.g. "THUMBSUP").
 * @param params.accountId - Optional account identifier for multi-account setups.
 * @returns An object containing the platform-assigned reaction ID.
 */
declare function addReactionFeishu(params: {
  cfg: OpenClawConfig;
  messageId: string;
  emojiType: string;
  accountId?: string;
}): Promise<{
  reactionId: string;
}>;
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
declare function removeReactionFeishu(params: {
  cfg: OpenClawConfig;
  messageId: string;
  reactionId: string;
  accountId?: string;
}): Promise<void>;
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
declare function listReactionsFeishu(params: {
  cfg: OpenClawConfig;
  messageId: string;
  emojiType?: string;
  accountId?: string;
}): Promise<FeishuReaction[]>;
//#endregion
//#region src/messaging/outbound/forward.d.ts
/**
 * Forward an existing message to another chat or user.
 *
 * @param params.cfg       - Plugin configuration with Feishu credentials.
 * @param params.messageId - The message ID to forward.
 * @param params.to        - Target identifier (chat_id, open_id, or user_id).
 * @param params.accountId - Optional account identifier for multi-account setups.
 * @returns The send result containing the new forwarded message ID.
 */
declare function forwardMessageFeishu(params: {
  cfg: OpenClawConfig;
  messageId: string;
  to: string;
  accountId?: string;
}): Promise<FeishuSendResult>;
//#endregion
//#region src/messaging/outbound/chat-manage.d.ts
interface FeishuChatMember {
  /** Member ID (open_id by default). */
  memberId: string;
  /** Display name of the member. */
  name: string;
  /** ID type: "open_id", "union_id", or "user_id". */
  memberIdType: string;
}
/**
 * Update chat settings such as name or avatar.
 */
declare function updateChatFeishu(params: {
  cfg: OpenClawConfig;
  chatId: string;
  name?: string;
  avatar?: string;
  accountId?: string;
}): Promise<void>;
/**
 * Add members to a chat by their open_id list.
 */
declare function addChatMembersFeishu(params: {
  cfg: OpenClawConfig;
  chatId: string;
  memberIds: string[];
  accountId?: string;
}): Promise<void>;
/**
 * Remove members from a chat by their open_id list.
 */
declare function removeChatMembersFeishu(params: {
  cfg: OpenClawConfig;
  chatId: string;
  memberIds: string[];
  accountId?: string;
}): Promise<void>;
/**
 * List members of a chat.
 *
 * Returns a single page (up to 100 members) to avoid unnecessary data
 * overhead for large groups.  Use the returned `pageToken` to fetch
 * subsequent pages when needed.
 */
declare function listChatMembersFeishu(params: {
  cfg: OpenClawConfig;
  chatId: string;
  accountId?: string; /** Optional page token for pagination. */
  pageToken?: string;
}): Promise<{
  members: FeishuChatMember[];
  pageToken?: string;
  hasMore: boolean;
}>;
//#endregion
//#region src/messaging/outbound/actions.d.ts
declare const feishuMessageActions: ChannelMessageActionAdapter;
//#endregion
//#region src/messaging/inbound/mention.d.ts
/** Whether the bot was @-mentioned. */
declare function mentionedBot(ctx: MessageContext): boolean;
/** All non-bot mentions. */
declare function nonBotMentions(ctx: MessageContext): MentionInfo[];
/**
 * Remove all @mention placeholder keys from the message text.
 */
declare function extractMessageBody(text: string, allMentionKeys: string[]): string;
/**
 * Format a mention for a Feishu text / post message.
 * @returns e.g. `<at user_id="ou_xxx">Alice</at>`
 */
declare function formatMentionForText(target: MentionInfo): string;
/** Format an @everyone mention for text / post. */
declare function formatMentionAllForText(): string;
/**
 * Format a mention for a Feishu Interactive Card.
 * @returns e.g. `<at id=ou_xxx></at>`
 */
declare function formatMentionForCard(target: MentionInfo): string;
/** Format an @everyone mention for card. */
declare function formatMentionAllForCard(): string;
/** Prepend @mention tags (text format) to a message body. */
declare function buildMentionedMessage(targets: MentionInfo[], message: string): string;
/** Prepend @mention tags (card format) to card markdown content. */
declare function buildMentionedCardContent(targets: MentionInfo[], message: string): string;
//#endregion
//#region src/channel/plugin.d.ts
declare const feishuPlugin: ChannelPlugin<LarkAccount>;
//#endregion
//#region src/messaging/inbound/reaction-handler.d.ts
interface ReactionContext {
  /** Real chatId (from message API, or `p2p:${operatorOpenId}` fallback). */
  chatId: string;
  /** Resolved chat type. */
  chatType: 'p2p' | 'group';
  /** Thread ID from the fetched message, if any. */
  threadId?: string;
  /** Whether the chat is thread-capable (topic or thread-mode group). */
  threadCapable?: boolean;
  /** Fetched message info used to build the synthetic event. */
  msg: FeishuMessageInfo;
}
declare function handleFeishuReaction(params: {
  cfg: ClawdbotConfig;
  event: FeishuReactionCreatedEvent;
  botOpenId?: string;
  runtime?: RuntimeEnv;
  chatHistories?: Map<string, HistoryEntry[]>;
  accountId?: string; /** Pre-resolved context from resolveReactionContext(). */
  preResolved: ReactionContext;
}): Promise<void>;
//#endregion
//#region src/messaging/inbound/parse.d.ts
/**
 * Parse a raw Feishu message event into a normalised MessageContext.
 *
 * @param expandCtx  When provided, cfg/accountId are used to create
 *                   callbacks for async converters (e.g. merge_forward)
 *                   to fetch sub-messages and resolve sender names.
 */
declare function parseMessageEvent(event: FeishuMessageEvent, botOpenId?: string, expandCtx?: {
  /** account 级别的 ClawdbotConfig（channels.feishu 已替换为 per-account 合并后的配置） */cfg: ClawdbotConfig;
  accountId?: string;
}): Promise<MessageContext>;
//#endregion
//#region src/messaging/inbound/gate.d.ts
interface GateResult {
  allowed: boolean;
  reason?: string;
  /** When a group message is rejected due to missing bot mention, the
   *  caller should record this entry into the chat history map. */
  historyEntry?: HistoryEntry;
}
/**
 * Check whether an inbound message passes all access-control gates.
 *
 * The DM gate is async because it may read from the pairing store
 * and send pairing request messages.
 */
declare function checkMessageGate(params: {
  ctx: MessageContext;
  accountFeishuCfg?: FeishuConfig;
  account: LarkAccount; /** account 级别的 ClawdbotConfig（channels.feishu 已替换为 per-account 合并后的配置） */
  accountScopedCfg?: ClawdbotConfig;
  log: (...args: unknown[]) => void;
}): Promise<GateResult>;
//#endregion
//#region index.d.ts
declare const plugin: {
  id: string;
  name: string;
  description: string;
  configSchema: Record<string, unknown>;
  register(api: OpenClawPluginApi): void;
};
//#endregion
export { type FeishuChannelData, FeishuEmoji, type FeishuMessageContext, type FeishuReactionCreatedEvent, type MentionInfo, type MessageContext, type RawMessage, type RawSender, type SendCardLarkParams, type SendMediaLarkParams, type SendTextLarkParams, VALID_FEISHU_EMOJI_TYPES, addChatMembersFeishu, addReactionFeishu, buildMentionedCardContent, buildMentionedMessage, checkMessageGate, plugin as default, editMessageFeishu, extractMessageBody, feishuMessageActions, feishuPlugin, formatMentionAllForCard, formatMentionAllForText, formatMentionForCard, formatMentionForText, forwardMessageFeishu, getMessageFeishu, handleFeishuReaction, isMessageExpired, listChatMembersFeishu, listReactionsFeishu, mentionedBot, monitorFeishuProvider, nonBotMentions, parseMessageEvent, probeFeishu, removeChatMembersFeishu, removeReactionFeishu, sendAudioLark, sendCardFeishu, sendCardLark, sendFileLark, sendImageLark, sendMediaLark, sendMessageFeishu, sendTextLark, updateCardFeishu, updateChatFeishu, uploadAndSendMediaLark, uploadFileLark, uploadImageLark };