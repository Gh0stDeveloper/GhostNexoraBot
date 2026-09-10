import { randomBytes } from 'node:crypto'
import { generateWAMessageFromContent, type WAMessage, type WASocket } from 'baileys'
import { logger } from '../../utils/logger.js'
import { withTimeout } from '../../utils/timeout.js'

const AI_BOT_JID = '867051314767696@bot'

export type RichResponseSubmessage = Record<string, unknown>

export type WhatsAppRichResponseInput = {
  responseId?: string
  submessages: RichResponseSubmessage[]
  unifiedData?: string
  timeoutMs?: number
  timeoutLabel?: string
  logLabel?: string
}

export function createRichResponseId() {
  return `message-${Date.now()}-${randomBytes(4).toString('hex')}`
}

function forwardedContext() {
  return {
    mentionedJid: [] as string[],
    groupMentions: [] as unknown[],
    statusAttributions: [] as unknown[],
    forwardingScore: 1,
    isForwarded: true,
    forwardedAiBotMessageInfo: { botJid: AI_BOT_JID },
    forwardOrigin: 4,
  }
}

/**
 * Único constructor estable del sobre `botForwardedMessage/richResponseMessage`
 * usado por `.view` y los juegos HTML. Mantener ambos flujos en este helper evita
 * que vuelvan a divergir en metadata, messageId o relay options.
 */
export async function relayWhatsAppRichResponse(
  socket: WASocket,
  chatId: string,
  input: WhatsAppRichResponseInput,
): Promise<WAMessage> {
  const userJid = socket.user?.id
  if (!userJid) throw new Error('La sesión de WhatsApp todavía no está autenticada.')

  const responseId = input.responseId ?? createRichResponseId()
  const richResponseMessage: Record<string, unknown> = {
    messageType: 1,
    submessages: input.submessages,
    ...(input.unifiedData ? { unifiedResponse: { data: input.unifiedData } } : {}),
    contextInfo: forwardedContext(),
  }

  const slots: Record<string, unknown> = {
    messageContextInfo: {
      deviceListMetadata: {},
      deviceListMetadataVersion: 2,
      messageSecret: randomBytes(32).toString('base64'),
      botMetadata: {
        messageDisclaimerText: '',
        botResponseId: responseId,
      },
    },
    botForwardedMessage: {
      message: { richResponseMessage },
    },
  }

  const message = generateWAMessageFromContent(chatId, slots as never, { userJid })
  const messageId = message.key.id
  if (!messageId || !message.message) throw new Error('WhatsApp rich response did not generate a message ID.')

  await withTimeout(
    socket.relayMessage(chatId, message.message, { messageId }),
    input.timeoutMs ?? 25_000,
    input.timeoutLabel ?? 'WhatsApp rich response relay',
  )

  logger.info({
    chatId,
    messageId,
    responseId,
    submessages: input.submessages.length,
    unified: Boolean(input.unifiedData),
    transport: 'view-compatible-rich-response',
    label: input.logLabel,
  }, 'WhatsApp rich response relay completed')

  return message
}
