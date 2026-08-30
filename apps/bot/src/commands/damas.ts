import type { BotCommand } from '../types.js'
import { sendAiHtmlMessage } from '../services/ai-html.js'
import { buildDamasGameHtml } from '../services/damas-game.js'

export const damasCommands: BotCommand[] = [
  {
    name: 'damas',
    aliases: ['checkers', 'damash'],
    category: 'games',
    description: 'Damas interactivas contra la IA (captura obligatoria).',
    usage: 'damas',
    async handler(ctx) {
      try {
        await sendAiHtmlMessage(ctx.socket, ctx.chatId, buildDamasGameHtml(), {
          title: 'Damas · Ghost Nexora',
          trustedSources: ['nixel.dev'],
          quoted: ctx.message,
        })
      } catch (error) {
        await ctx.reply(
          [
            '♟️ *DAMAS*',
            '━━━━━━━━━━━━━━',
            'No pude enviar el juego interactivo en este chat/cliente.',
            `Detalle: ${error instanceof Error ? error.message : String(error)}`,
            `Prueba *${ctx.prefix}damas* de nuevo.`,
          ].join('\n'),
        )
      }
    },
  },
]
