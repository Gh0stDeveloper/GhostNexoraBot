import type { BotCommand } from '../types.js'
import { sendAiHtmlMessage } from '../services/ai-html.js'
import { buildGatoGameHtml } from '../services/gato-game.js'

export const gatoCommands: BotCommand[] = [
  {
    name: 'gato',
    aliases: ['tictactoehtml', 'tresenrayahtml', 'ox'],
    category: 'games',
    description: 'Gato (tres en raya) interactivo contra la IA.',
    usage: 'gato',
    async handler(ctx) {
      try {
        await sendAiHtmlMessage(ctx.socket, ctx.chatId, buildGatoGameHtml(), {
          title: 'Gato · Ghost Nexora',
          trustedSources: ['nixel.dev'],
          quoted: ctx.message,
        })
      } catch (error) {
        await ctx.reply(
          [
            '⭕ *GATO*',
            '━━━━━━━━━━━━━━',
            'No pude enviar el juego interactivo en este chat/cliente.',
            `Detalle: ${error instanceof Error ? error.message : String(error)}`,
            `Prueba *${ctx.prefix}gato* de nuevo.`,
          ].join('\n'),
        )
      }
    },
  },
]
