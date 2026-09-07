import type { BotCommand } from '../types.js'
import { sendAiHtmlMessage } from '../services/ai-html.js'
import { buildDinoRunnerHtml } from '../services/dino-game.js'
import { arcadeV17Commands } from './arcade-v17.js'

const dinoCommand: BotCommand = {
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
}

// `index.ts` ya registra dinoCommands. V17 se agrupa aquí para conservar un único
// punto de entrada del arcade sin alterar el orden histórico del registro global.
export const dinoCommands: BotCommand[] = [dinoCommand, ...arcadeV17Commands]
