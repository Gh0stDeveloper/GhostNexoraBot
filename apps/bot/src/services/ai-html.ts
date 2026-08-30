import { randomUUID } from 'node:crypto'
import { generateWAMessageFromContent, type WAMessage, type WASocket } from 'baileys'
import { logger } from '../utils/logger.js'

/**
 * Envía un juego/UI HTML embebido vía richResponseMessage (formato experimental Meta AI).
 *
 * Se marca como *reenviado desde el canal* (forwardedNewsletterMessageInfo), igual que
 * otros bots: muchos clientes solo renderizan el HTML si llega con esa atribución.
 *
 * Canal por defecto: https://whatsapp.com/channel/0029VbCWbix9RZAfkkKOqP2i
 * Override: WHATSAPP_CHANNEL_JID, WHATSAPP_CHANNEL_NAME, WHATSAPP_CHANNEL_INVITE
 */

type HtmlPrimitiveName =
  | 'GenAIaeacdsnwHtmlPrimitive'
  | 'FOAHtmlPrimitiveDemoDONOTUSE'
  | 'GenAIHtmlPrimitive'

const DEFAULT_CHANNEL_INVITE = '0029VbCWbix9RZAfkkKOqP2i'
const DEFAULT_CHANNEL_NAME = 'Ghost Nexora'

let cachedChannel: { jid: string; name: string } | null = null

async function resolveChannel(socket: WASocket): Promise<{ jid: string; name: string }> {
  if (cachedChannel) return cachedChannel

  const envJid = process.env.WHATSAPP_CHANNEL_JID?.trim()
  const envName = process.env.WHATSAPP_CHANNEL_NAME?.trim() || DEFAULT_CHANNEL_NAME
  if (envJid && envJid.includes('@newsletter')) {
    cachedChannel = { jid: envJid, name: envName }
    return cachedChannel
  }

  const invite =
    process.env.WHATSAPP_CHANNEL_INVITE?.trim() ||
    DEFAULT_CHANNEL_INVITE

  try {
    const metaFn = (socket as unknown as {
      newsletterMetadata?: (
        type: 'invite' | 'jid',
        key: string,
      ) => Promise<{ id?: string; name?: string } | null>
    }).newsletterMetadata

    if (typeof metaFn === 'function') {
      const meta = await metaFn.call(socket, 'invite', invite)
      if (meta?.id) {
        cachedChannel = {
          jid: meta.id.includes('@') ? meta.id : `${meta.id}@newsletter`,
          name: meta.name || envName,
        }
        logger.info({ channel: cachedChannel }, 'resolved WhatsApp channel for HTML games')
        return cachedChannel
      }
    }
  } catch (error) {
    logger.warn({ error, invite }, 'could not resolve channel invite; using fallback jid pattern')
  }

  // Fallback: algunos clientes aceptan solo el invite embebido en el nombre;
  // el jid real es necesario para la etiqueta del canal. Si no resolvimos,
  // usamos un placeholder que al menos activa isForwarded + newsletterName.
  cachedChannel = {
    jid: envJid || `120363000000000000@newsletter`,
    name: envName,
  }
  return cachedChannel
}

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
  channel: { jid: string; name: string },
) {
  const unifiedData = Buffer.from(
    JSON.stringify({
      response_id: randomUUID(),
      sections: buildSections(html, typename, trustedSources),
    }),
  ).toString('base64')

  const channelContext = {
    forwardingScore: 999,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid: channel.jid,
      newsletterName: channel.name,
      serverMessageId: 100,
    },
    forwardedAiBotMessageInfo: {
      botJid: '0@bot',
    },
  }

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
          contextInfo: channelContext,
        },
      },
      // Algunos clientes leen el contextInfo del wrapper
      contextInfo: channelContext,
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
  const channel = await resolveChannel(socket)

  // Primero el primitivo original Nixel (el que funcionó al inicio),
  // luego FOA (usado por forks de juegos).
  const attempts: HtmlPrimitiveName[] = [
    'GenAIaeacdsnwHtmlPrimitive',
    'FOAHtmlPrimitiveDemoDONOTUSE',
    'GenAIHtmlPrimitive',
  ]

  let lastError: unknown
  for (const typename of attempts) {
    try {
      const content = buildContent(html, title, trustedSources, typename, channel)
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
          typename,
          channelJid: channel.jid,
          channelName: channel.name,
        },
        'ai-html message relayed (channel-forwarded)',
      )
      return message
    } catch (error) {
      lastError = error
      logger.warn({ error, typename }, 'ai-html attempt failed; trying next variant')
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
