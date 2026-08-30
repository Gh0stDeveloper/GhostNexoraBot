import type { BotCommand } from '../types.js'
import { sendAiHtmlMessage } from '../services/ai-html.js'
import { buildDinoRunnerHtml } from '../services/dino-game.js'

export const dinoCommands: BotCommand[] = [
  {
    name: 'dino',
    aliases: ['dinosaur', 'dinorunner', 'chrome-dino'],
    category: 'games',
    description: 'Juego interactivo Dino Runner (toca para saltar).',
    usage: 'dino',
    async handler(ctx) {
      try {
        await sendAiHtmlMessage(ctx.socket, ctx.chatId, buildDinoRunnerHtml(), {
          title: 'Dino Runner · Ghost Nexora',
          trustedSources: ['nixel.dev'],
          quoted: ctx.message,
        })
      } catch (error) {
        await ctx.reply(
          [
            '🦖 *DINO RUNNER*',
            '━━━━━━━━━━━━━━',
            'No pude enviar el juego interactivo en este chat/cliente.',
            'WhatsApp solo muestra este tipo de mensaje en versiones que soportan HTML AI rich.',
            '',
            `Detalle: ${error instanceof Error ? error.message : String(error)}`,
            '',
            `Prueba de nuevo con *${ctx.prefix}dino* o actualiza WhatsApp.`,
          ].join('\n'),
        )
      }
    },
  },
]
