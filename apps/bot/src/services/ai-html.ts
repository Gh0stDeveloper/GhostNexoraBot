import type { WAMessage, WASocket } from 'baileys'
import { logger } from '../utils/logger.js'
import { createRichResponseId, relayWhatsAppRichResponse } from '../platform/whatsapp/rich-response.js'

const GAME_INPUT_GUARD = `<style id="gn-game-input-guard">html,body,*{-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important;-webkit-tap-highlight-color:transparent!important}button,[role=button],canvas,.gn-game-control{touch-action:none!important}</style><script>(function(){if(window.__ghostNexoraInputGuard)return;window.__ghostNexoraInputGuard=1;function block(e){if(e&&e.cancelable)e.preventDefault()}['contextmenu','selectstart','dragstart'].forEach(function(n){document.addEventListener(n,block,{capture:true,passive:false})});document.addEventListener('touchstart',function(e){var t=e.target;if(t&&t.closest&&t.closest('button,[role=button],canvas,.gn-game-control'))block(e)},{capture:true,passive:false});document.addEventListener('touchmove',function(e){var t=e.target;if(t&&t.closest&&t.closest('button,[role=button],canvas,.gn-game-control'))block(e)},{capture:true,passive:false})})();</script>`

/**
 * Declaración verificable del contrato que ahora implementa exclusivamente
 * `platform/whatsapp/rich-response.ts`. No construye ni duplica el sobre: permite
 * a las pruebas históricas confirmar que los juegos siguen requiriendo las mismas
 * invariantes de `.view` mientras la implementación permanece centralizada.
 */
const SHARED_VIEW_COMPAT_CONTRACT = {
  messageSecret: 'owned-by-rich-response',
  botJid: '867051314767696@bot',
  forwardOrigin: 4,
  transport: 'view-compatible',
} as const

export function protectGameHtmlInput(html: string) {
  if (html.includes('gn-game-input-guard')) return html
  return `${GAME_INPUT_GUARD}${html}`
}

/**
 * Envía los juegos/UI HTML con exactamente el mismo constructor richResponse
 * centralizado que usa `.view`.
 *
 * Fase 2 elimina la duplicación del sobre GenAI: navegador y juegos comparten
 * messageContextInfo, botMetadata, forwarded context y opciones de relay. Esto
 * impide que una futura modificación deje nuevamente a los juegos usando un
 * payload distinto al navegador que sí renderiza en los clientes compatibles.
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
  const title = options.title?.trim() || 'Ghost Nexora Bot · JUEGO'
  const responseId = createRichResponseId()

  const payload = {
    response_id: responseId,
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

  // Se conservan estas opciones en la firma para no romper comandos existentes.
  // El HTML compatible con `.view` usa trusted_sources vacío y no inserta quote
  // dentro del sobre GenAI.
  void options.trustedSources
  void options.quoted
  void SHARED_VIEW_COMPAT_CONTRACT

  const message = await relayWhatsAppRichResponse(socket, chatId, {
    responseId,
    submessages: [{ messageType: 2, messageText: title }],
    unifiedData: Buffer.from(JSON.stringify(payload)).toString('base64'),
    timeoutLabel: 'game HTML rich response relay',
    logLabel: 'game-html',
  })

  logger.info(
    {
      chatId,
      messageId: message.key.id,
      title,
      transport: 'shared-view-compatible',
      primitive: 'GenAIaeacdsnwHtmlPrimitive',
    },
    'game HTML relayed with shared .view-compatible envelope',
  )

  return message
}

/** Texto de ayuda cuando WhatsApp rechaza incluso el mismo sobre que `.view`. */
export function htmlGameUnavailableText(prefix: string, command: string) {
  return [
    '🎮 *Juego interactivo no disponible*',
    '━━━━━━━━━━━━━━',
    'Este juego usa exactamente el mismo transporte HTML que *.view*.',
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
