import { randomUUID } from 'node:crypto'
import { generateWAMessageFromContent, type WAMessage, type WASocket } from 'baileys'
import { logger } from '../utils/logger.js'

/**
 * Envía un juego/UI HTML embebido vía richResponseMessage (formato experimental Meta AI).
 *
 * Importante: WhatsApp puede aceptar o rechazar este payload de forma intermitente.
 * Cuando el cliente no lo soporta muestra "Actualizar WhatsApp" aunque el relay haya
 * tenido éxito en el servidor. No es un fallo del bot ni del LLM worker.
 */

type HtmlPrimitiveName =
  | 'GenAIaeacdsnwHtmlPrimitive'
  | 'FOAHtmlPrimitiveDemoDONOTUSE'
  | 'GenAIHtmlPrimitive'

function buildSections(html: string, typename: HtmlPrimitiveName, trustedSources: string[]) {
  return [
    {
      view_model: {
        primitive: {
          __typename: typename,
          payload: html,
          trusted_sources: trustedSources,
        },
        __typename: 'GenAISingleLayoutViewModel',
      },
    },
  ]
}

function buildContent(
  html: string,
  title: string,
  trustedSources: string[],
  typename: HtmlPrimitiveName,
  withBotForwardMeta: boolean,
) {
  const unifiedData = Buffer.from(
    JSON.stringify({
      response_id: randomUUID(),
      sections: buildSections(html, typename, trustedSources),
    }),
  ).toString('base64')

  // Evitamos isForwarded/forwardingScore (etiqueta "Reenviado"),
  // pero algunos clientes solo renderizan rich HTML si hay metadata de bot AI.
  const richContext = withBotForwardMeta
    ? {
        forwardedAiBotMessageInfo: { botJid: '0@bot' },
      }
    : {}

  return {
    messageContextInfo: {
      deviceListMetadata: {},
      deviceListMetadataVersion: 2,
      botMetadata: {
        messageDisclaimerText: title,
        richResponseSourcesMetadata: { sources: [] as unknown[] },
      },
    },
    botForwardedMessage: {
      message: {
        richResponseMessage: {
          messageType: 1,
          submessages: [] as unknown[],
          unifiedResponse: { data: unifiedData },
          contextInfo: richContext,
        },
      },
    },
  }
}

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

  const title = options.title ?? 'Ghost Nexora'
  const trustedSources = options.trustedSources ?? ['nixel.dev']

  // Orden de intento: el primitivo más usado por forks de juegos, luego el original Nixel.
  const attempts: Array<{ typename: HtmlPrimitiveName; withBotForwardMeta: boolean }> = [
    { typename: 'FOAHtmlPrimitiveDemoDONOTUSE', withBotForwardMeta: true },
    { typename: 'GenAIaeacdsnwHtmlPrimitive', withBotForwardMeta: true },
    { typename: 'GenAIaeacdsnwHtmlPrimitive', withBotForwardMeta: false },
    { typename: 'GenAIHtmlPrimitive', withBotForwardMeta: true },
  ]

  let lastError: unknown
  for (const attempt of attempts) {
    try {
      const content = buildContent(
        html,
        title,
        trustedSources,
        attempt.typename,
        attempt.withBotForwardMeta,
      )
      const message = generateWAMessageFromContent(chatId, content as never, {
        userJid,
        quoted: options.quoted,
      })
      await socket.relayMessage(chatId, message.message!, {
        messageId: message.key.id!,
      })
      logger.info(
        {
          chatId,
          messageId: message.key.id,
          title,
          typename: attempt.typename,
          withBotForwardMeta: attempt.withBotForwardMeta,
        },
        'ai-html message relayed',
      )
      return message
    } catch (error) {
      lastError = error
      logger.warn(
        {
          error,
          typename: attempt.typename,
          withBotForwardMeta: attempt.withBotForwardMeta,
        },
        'ai-html attempt failed; trying next variant',
      )
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('WhatsApp rechazó todos los formatos de juego HTML interactivo.')
}

/** Texto de ayuda cuando el cliente muestra "Actualizar WhatsApp" o el relay falla. */
export function htmlGameUnavailableText(prefix: string, command: string) {
  return [
    '🎮 *Juego interactivo no disponible*',
    '━━━━━━━━━━━━━━',
    'WhatsApp está rechazando el mensaje HTML experimental en este momento.',
    'El bot *sí envió* el mensaje, pero tu app no lo puede mostrar ("Actualizar WhatsApp").',
    '',
    'Esto *no* es por el entrenamiento LLM ni por procesos del servidor.',
    'Es una limitación intermitente del formato Meta AI HTML en WhatsApp.',
    '',
    'Qué puedes hacer:',
    '• Probar en otro chat (privado vs grupo)',
    '• Probar en otro dispositivo / actualizar WhatsApp de verdad',
    '• Esperar un rato e intentar de nuevo',
    '',
    `Comando: *${prefix}${command}*`,
  ].join('\n')
}
