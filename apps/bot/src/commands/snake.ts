import type { BotCommand } from '../types.js'
import { sendAiHtmlMessage } from '../services/ai-html.js'
import { buildSnakeGameHtml } from '../services/snake-game.js'

export const snakeCommands: BotCommand[] = [
  {
    name: 'snake',
    aliases: ['serpiente', 'snakegame'],
    category: 'games',
    description: 'Juego interactivo Snake (flechas o botones en pantalla).',
    usage: 'snake',
    async handler(ctx) {
      try {
        await sendAiHtmlMessage(ctx.socket, ctx.chatId, buildSnakeGameHtml(), {
          title: 'Snake · Ghost Nexora',
          trustedSources: ['nixel.dev'],
          quoted: ctx.message,
        })
      } catch (error) {
        await ctx.reply(
          [
            '🐍 *SNAKE*',
            '━━━━━━━━━━━━━━',
            'No pude enviar el juego interactivo en este chat/cliente.',
            'WhatsApp solo muestra este tipo de mensaje en versiones que soportan HTML AI rich.',
            '',
            `Detalle: ${error instanceof Error ? error.message : String(error)}`,
            '',
            `Prueba de nuevo con *${ctx.prefix}snake* o actualiza WhatsApp.`,
          ].join('\n'),
        )
      }
    },
  },
]
