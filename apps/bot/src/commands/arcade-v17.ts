import type { BotCommand, CommandContext } from '../types.js'
import { htmlGameUnavailableText, sendAiHtmlMessage } from '../services/ai-html.js'
import {
  build2048GameHtml,
  buildAsteroidsGameHtml,
  buildBreakoutGameHtml,
  buildFlappyGameHtml,
  buildMemoryGameHtml,
  buildPongGameHtml,
} from '../services/arcade-games-v17.js'

async function sendGame(ctx: CommandContext, command: string, title: string, icon: string, build: () => string) {
  try {
    await sendAiHtmlMessage(ctx.socket, ctx.chatId, build(), {
      title: `${title} · Ghost Nexora`,
      trustedSources: [],
      quoted: ctx.message,
    })
  } catch (error) {
    await ctx.reply([
      `${icon} *${title.toUpperCase()}*`,
      '━━━━━━━━━━━━━━',
      htmlGameUnavailableText(ctx.prefix, command),
      '',
      `Detalle: ${error instanceof Error ? error.message : String(error)}`,
    ].join('\n'))
  }
}

export const arcadeV17Commands: BotCommand[] = [
  {
    name: 'flappy', aliases: ['flappybird', 'skybird'], category: 'games',
    description: 'Arcade de vuelo: salta entre obstáculos y supera tu puntuación.', usage: 'flappy',
    async handler(ctx) { await sendGame(ctx, 'flappy', 'Flappy · Sky Run', '🐦', buildFlappyGameHtml) },
  },
  {
    name: 'breakout', aliases: ['brickbreaker', 'rompebloques'], category: 'games',
    description: 'Rompe todos los bloques controlando la barra y manteniendo la pelota en juego.', usage: 'breakout',
    async handler(ctx) { await sendGame(ctx, 'breakout', 'Breakout · Neon Bricks', '🧱', buildBreakoutGameHtml) },
  },
  {
    name: 'pong', aliases: ['cyberpong'], category: 'games',
    description: 'Pong táctil contra una IA ligera; gana el duelo de paletas.', usage: 'pong',
    async handler(ctx) { await sendGame(ctx, 'pong', 'Pong · Cyber Duel', '🏓', buildPongGameHtml) },
  },
  {
    name: '2048', aliases: ['merge2048', 'nexora2048'], category: 'games',
    description: 'Puzzle 2048 táctil: combina números iguales hasta alcanzar la ficha más alta.', usage: '2048',
    async handler(ctx) { await sendGame(ctx, '2048', '2048 · Neon Merge', '🔢', build2048GameHtml) },
  },
  {
    name: 'asteroids', aliases: ['asteroides', 'voidpatrol'], category: 'games',
    description: 'Arcade espacial: gira, acelera, dispara y destruye asteroides.', usage: 'asteroids',
    async handler(ctx) { await sendGame(ctx, 'asteroids', 'Asteroids · Void Patrol', '🚀', buildAsteroidsGameHtml) },
  },
  {
    name: 'memoria', aliases: ['memory', 'parejas'], category: 'games',
    description: 'Juego de memoria de 16 cartas para encontrar ocho parejas.', usage: 'memoria',
    async handler(ctx) { await sendGame(ctx, 'memoria', 'Memoria · Cyber Match', '🧠', buildMemoryGameHtml) },
  },
]
