import { randomBytes } from 'node:crypto'
import { generateWAMessageFromContent, type WAMessage, type WASocket } from 'baileys'
import { logger } from '../utils/logger.js'

const GAME_INPUT_GUARD = `<style id="gn-game-input-guard">html,body,*{-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important;-webkit-tap-highlight-color:transparent!important}button,[role=button],canvas,.gn-game-control{touch-action:none!important}</style><script>(function(){if(window.__ghostNexoraInputGuard)return;window.__ghostNexoraInputGuard=1;function block(e){if(e&&e.cancelable)e.preventDefault()}['contextmenu','selectstart','dragstart'].forEach(function(n){document.addEventListener(n,block,{capture:true,passive:false})});document.addEventListener('touchstart',function(e){var t=e.target;if(t&&t.closest&&t.closest('button,[role=button],canvas,.gn-game-control'))block(e)},{capture:true,passive:false});document.addEventListener('touchmove',function(e){var t=e.target;if(t&&t.closest&&t.closest('button,[role=button],canvas,.gn-game-control'))block(e)},{capture:true,passive:false})})();</script>`

export function protectGameHtmlInput(html: string) {
  if (html.includes('gn-game-input-guard')) return html
  return `${GAME_INPUT_GUARD}${html}`
}

/**
 * Envía los juegos/UI HTML con el MISMO sobre richResponse que usa `.view`.
 *
 * El transporte anterior de juegos añadía metadatos de newsletter, varios primitivos
 * experimentales y un relay con messageId. En varios clientes eso terminaba mostrando
 * "Actualizar WhatsApp", mientras `.view` sí renderizaba correctamente. Por eso este
 * servicio replica deliberadamente la estructura compatible de `.view`.
 *
 * Todos los comandos que usan sendAiHtmlMessage() heredan este transporte de forma
 * automática: Mario, Dino, Snake, Doom, Ninja, Space Dodge, Gato, Damas y Arcade V16.
 * Además inyecta una protección global contra selección, menú contextual y long-press
 * dentro de controles/canvas para que mantener un botón no seleccione el mensaje.
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

  const title = options.title?.trim() || 'Ghost Nexora Bot · JUEGO'
  const msgId = `message-${Date.now()}-${randomBytes(4).toString('hex')}`

  const payload = {
    response_id: msgId,
    sections: [
      {
        view_model: {
          primitive: {
            __typename: 'GenAIaeacdsnwHtmlPrimitive',
            payload: protectGameHtmlInput(html),
            trusted_sources: [] as string[],
          },
          __typename: 'GenAISingleLayoutViewModel',
        },
      },
    ],
  }

  const contextInfo = {
    mentionedJid: [] as string[],
    groupMentions: [] as unknown[],
    statusAttributions: [] as unknown[],
    forwardingScore: 1,
    isForwarded: true,
    forwardedAiBotMessageInfo: {
      botJid: '867051314767696@bot',
    },
    forwardOrigin: 4,
  }

  const slots: Record<string, unknown> = {
    messageContextInfo: {
      deviceListMetadata: {},
      deviceListMetadataVersion: 2,
      messageSecret: randomBytes(32).toString('base64'),
      botMetadata: {
        messageDisclaimerText: '',
        botResponseId: msgId,
      },
    },
    botForwardedMessage: {
      message: {
        richResponseMessage: {
          messageType: 1,
          submessages: [
            {
              messageType: 2,
              messageText: title,
            },
          ],
          unifiedResponse: {
            data: Buffer.from(JSON.stringify(payload)).toString('base64'),
          },
          contextInfo,
        },
      },
    },
  }

  // Se conservan estas opciones en la firma para no romper los comandos existentes,
  // pero se ignoran a propósito: `.view` usa trusted_sources vacío y no cita el mensaje
  // original dentro del sobre GenAI que sí funciona en el cliente objetivo.
  void options.trustedSources
  void options.quoted

  const message = generateWAMessageFromContent(chatId, slots as never, { userJid })
  await socket.relayMessage(chatId, message.message!, {})

  logger.info(
    {
      chatId,
      messageId: message.key.id,
      title,
      transport: 'view-compatible',
      primitive: 'GenAIaeacdsnwHtmlPrimitive',
    },
    'game HTML relayed with .view-compatible envelope',
  )

  return message
}

/** Texto de ayuda cuando WhatsApp rechaza incluso el mismo sobre que `.view`. */
export function htmlGameUnavailableText(prefix: string, command: string) {
  return [
    '🎮 *Juego interactivo no disponible*',
    '━━━━━━━━━━━━━━',
    'Este juego ahora usa el mismo formato HTML que *.view*.',
    'Si no aparece, WhatsApp rechazó el rich message antes de renderizarlo.',
    '',
    'Prueba:',
    '• Cerrar y volver a abrir el chat',
    '• Probar en privado o en otro grupo',
    '• Volver a ejecutar el comando',
    '',
    `Comando: *${prefix}${command}*`,
  ].join('\n')
}
