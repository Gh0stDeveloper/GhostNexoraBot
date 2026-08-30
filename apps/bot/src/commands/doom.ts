import type { BotCommand } from '../types.js'
import { sendAiHtmlMessage } from '../services/ai-html.js'
import { buildDoomGameHtml } from '../services/doom-game.js'

export const doomCommands: BotCommand[] = [
  {
    name: 'doom',
    aliases: ['minidoom', 'fps'],
    category: 'games',
    description: 'Mini Doom FPS interactivo (mover, girar y disparar).',
    usage: 'doom',
    async handler(ctx) {
      try {
        await sendAiHtmlMessage(ctx.socket, ctx.chatId, buildDoomGameHtml(), {
          title: 'Mini Doom · Ghost Nexora',
          trustedSources: ['nixel.dev'],
          quoted: ctx.message,
        })
      } catch (error) {
        await ctx.reply(
          [
            '🔥 *MINI DOOM*',
            '━━━━━━━━━━━━━━',
            'No pude enviar el juego interactivo en este chat/cliente.',
            'WhatsApp solo muestra este tipo de mensaje en versiones que soportan HTML AI rich.',
            '',
            `Detalle: ${error instanceof Error ? error.message : String(error)}`,
            '',
            `Prueba de nuevo con *${ctx.prefix}doom* o actualiza WhatsApp.`,
          ].join('\n'),
        )
      }
    },
  },
]
