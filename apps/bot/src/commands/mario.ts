import type { BotCommand } from '../types.js'
import { htmlGameUnavailableText, sendAiHtmlMessage } from '../services/ai-html.js'
import { buildMarioGameHtml } from '../services/mario-game.js'

export const marioCommands: BotCommand[] = [
  {
    name: 'mario',
    aliases: ['supermario', 'mariobros', 'mariogame'],
    category: 'games',
    description: 'Mini juego interactivo de plataformas estilo Super Mario, completamente en español.',
    usage: 'mario',
    async handler(ctx) {
      try {
        await sendAiHtmlMessage(ctx.socket, ctx.chatId, buildMarioGameHtml(), {
          title: 'Super Mario · Ghost Nexora Bot',
          trustedSources: [],
          quoted: ctx.message,
        })
      } catch (error) {
        await ctx.reply([
          '🍄 *SUPER MARIO · GHOST NEXORA*',
          '━━━━━━━━━━━━━━',
          htmlGameUnavailableText(ctx.prefix, 'mario'),
          '',
          `Detalle: ${error instanceof Error ? error.message : String(error)}`,
        ].join('\n'))
      }
    },
  },
]
