import type { ClawdbotConfig } from 'openclaw/plugin-sdk';
import type { AcpToolCallbackEvent } from '../../card/reply-dispatcher-types';
import { registerAcpSessionCallback } from '../../channel/acp-tool-callback';
import { larkLogger } from '../../core/lark-logger';
import { sendAcpUserInputCard } from './acp-user-input-cards';
import { sendAcpApprovalConfirmationCard } from './authorization-confirmation-cards';

const log = larkLogger('inbound/runtime-callbacks');

export function registerInboundRuntimeCallbacks(params: {
  sessionKey: string;
  cfg: ClawdbotConfig;
  accountId: string;
  persona: string;
  chatType?: string;
  senderId?: string;
  chatId: string;
  replyToMessageId: string;
  showToolUse: boolean;
  handleToolEvent: (event: AcpToolCallbackEvent) => void | Promise<void>;
  abortCard: () => Promise<void>;
}): (() => void) | undefined {
  return registerAcpSessionCallback(params.sessionKey, async (event) => {
    if (event.type === 'tool_call') {
      if (params.showToolUse) {
        await params.handleToolEvent(event);
      }
      return;
    }
    if (event.type === 'turn_completed') {
      if (/interrupted|aborted|cancelled|canceled/i.test(event.status ?? '')) {
        log.info('runtime turn completed as interrupted, aborting card', {
          sessionKey: params.sessionKey,
          turnId: event.turnId,
          status: event.status,
        });
        await params.abortCard();
      }
      return;
    }
    if (event.type === 'user_input_requested') {
      await sendAcpUserInputCard({
        cfg: params.cfg,
        accountId: params.accountId,
        chatId: params.chatId,
        replyToMessageId: params.replyToMessageId,
        sessionKey: params.sessionKey,
        requestId: event.requestId,
        senderOpenId: params.senderId,
        questions: event.questions,
      });
      return;
    }
    await sendAcpApprovalConfirmationCard({
      cfg: params.cfg,
      accountId: params.accountId,
      persona: params.persona,
      ctx: {
        chatType: params.chatType,
        senderId: params.senderId,
        chatId: params.chatId,
        messageId: params.replyToMessageId,
        sessionKey: params.sessionKey,
        threadSessionKey: params.sessionKey,
      },
      event,
    });
  });
}
