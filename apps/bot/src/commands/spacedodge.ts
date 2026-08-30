import type { BotCommand } from '../types.js'
import { sendAiHtmlMessage } from '../services/ai-html.js'
import { buildSpaceDodgeHtml } from '../services/space-dodge-game.js'

export const spaceDodgeCommands: BotCommand[] = [
  {
    name: 'spacedodge',
    aliases: ['space', 'dodge', 'navedodge'],
    category: 'games',
    description: 'Space Dodge: esquiva asteroides con la nave.',
    usage: 'spacedodge',
    async handler(ctx) {
      try {
        await sendAiHtmlMessage(ctx.socket, ctx.chatId, buildSpaceDodgeHtml(), {
          title: 'Space Dodge · Ghost Nexora',
          trustedSources: ['nixel.dev'],
          quoted: ctx.message,
        })
      } catch (error) {
        await ctx.reply(
          [
            '🚀 *SPACE DODGE*',
            '━━━━━━━━━━━━━━',
            'No pude enviar el juego interactivo en este chat/cliente.',
            `Detalle: ${error instanceof Error ? error.message : String(error)}`,
            `Prueba *${ctx.prefix}spacedodge* de nuevo.`,
          ].join('\n'),
        )
      }
    },
  },
]
