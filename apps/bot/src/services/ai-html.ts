import { randomUUID } from 'node:crypto'
import { generateWAMessageFromContent, type WAMessage, type WASocket } from 'baileys'
import { logger } from '../utils/logger.js'

/**
 * Envía un juego/UI HTML embebido vía richResponseMessage (formato experimental Meta AI).
 * No todos los clientes de WhatsApp lo renderizan; si falla el relay, el caller debe hacer fallback de texto.
 */
export async function sendAiHtmlMessage(
  socket: WASocket,
  chatId: string,
  html: string,
  options: {
    title?: string
    trustedSources?: string[]
    quoted?: WAMessage
  } = {},
) {
  const userJid = socket.user?.id
  if (!userJid) throw new Error('La sesión de WhatsApp todavía no está autenticada.')

  const sections = [
    {
      view_model: {
        primitive: {
          __typename: 'GenAIaeacdsnwHtmlPrimitive',
          payload: html,
          trusted_sources: options.trustedSources ?? ['nixel.dev'],
        },
        __typename: 'GenAISingleLayoutViewModel',
      },
    },
  ]

  const unifiedData = Buffer.from(
    JSON.stringify({
      response_id: randomUUID(),
      sections,
    }),
  ).toString('base64')

  const content = {
    messageContextInfo: {
      deviceListMetadata: {},
      deviceListMetadataVersion: 2,
      botMetadata: {
        messageDisclaimerText: options.title ?? 'Ghost Nexora',
        richResponseSourcesMetadata: { sources: [] as unknown[] },
      },
    },
    botForwardedMessage: {
      message: {
        richResponseMessage: {
          messageType: 1,
          submessages: [] as unknown[],
          unifiedResponse: { data: unifiedData },
          contextInfo: {
            forwardingScore: 1,
            isForwarded: true,
            forwardedAiBotMessageInfo: { botJid: '0@bot' },
            forwardOrigin: 4,
          },
        },
      },
    },
  }

  const message = generateWAMessageFromContent(chatId, content as never, {
    userJid,
    quoted: options.quoted,
  })

  await socket.relayMessage(chatId, message.message!, {
    messageId: message.key.id!,
  })

  logger.info({ chatId, messageId: message.key.id, title: options.title }, 'ai-html message relayed')
  return message
}
