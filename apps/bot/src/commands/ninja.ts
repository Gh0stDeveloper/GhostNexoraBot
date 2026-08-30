import type { BotCommand } from '../types.js'
import { sendAiHtmlMessage } from '../services/ai-html.js'
import { buildNinjaGameHtml } from '../services/ninja-game.js'

export const ninjaCommands: BotCommand[] = [
  {
    name: 'ninja',
    aliases: ['fruitslice', 'fruitninja', 'cortarfruta'],
    category: 'games',
    description: 'Fruit Slice interactivo (desliza para cortar frutas, evita bombas).',
    usage: 'ninja',
    async handler(ctx) {
      try {
        await sendAiHtmlMessage(ctx.socket, ctx.chatId, buildNinjaGameHtml(), {
          title: 'Fruit Slice · Ghost Nexora',
          trustedSources: ['nixel.dev'],
          quoted: ctx.message,
        })
      } catch (error) {
        await ctx.reply(
          [
            '🥷 *FRUIT SLICE*',
            '━━━━━━━━━━━━━━',
            'No pude enviar el juego interactivo en este chat/cliente.',
            'WhatsApp solo muestra este tipo de mensaje en versiones que soportan HTML AI rich.',
            '',
            `Detalle: ${error instanceof Error ? error.message : String(error)}`,
            '',
            `Prueba de nuevo con *${ctx.prefix}ninja* o actualiza WhatsApp.`,
          ].join('\n'),
        )
      }
    },
  },
]
