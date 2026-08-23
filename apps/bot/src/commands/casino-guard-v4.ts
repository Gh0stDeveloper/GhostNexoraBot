import type { BotCommand, CommandContext } from '../types.js'
import { casinoPlay, casinoSummary } from '../services/world-v4.js'

const nxc = (value: number) => `${Math.floor(value).toLocaleString('es-MX')} NXC`

async function guardedGame(ctx: CommandContext, game: 'slots' | 'roulette' | 'dice') {
  const bet = Math.floor(Number(ctx.args[0]))
  if (!Number.isFinite(bet)) throw new Error('Indica una apuesta válida en NXC.')
  const summary = casinoSummary(ctx.sender)
  if (summary.net - bet < -summary.maxLoss) {
    const remainingRisk = Math.max(0, summary.maxLoss + summary.net)
    throw new Error(`Esta apuesta podría superar tu límite diario de pérdidas. Riesgo disponible hoy: ${nxc(remainingRisk)}.`)
  }
  const result = casinoPlay(ctx.sender, game, bet, ctx.args[1])
  await ctx.reply(`🎰 *${game.toUpperCase()}*\nResultado: *${result.result}*\nApuesta: ${nxc(result.bet)}\nPremio: ${nxc(result.payout)}\nBalance neto: ${result.net >= 0 ? '+' : ''}${nxc(result.net)}\nCartera+banco: *${nxc(result.balance.total)}*`)
}

export const casinoGuardV4Commands: BotCommand[] = [
  { name: 'slots', aliases: ['tragamonedas'], category: 'games', description: 'Slots NXC con límite estricto de pérdidas.', handler: (ctx) => guardedGame(ctx, 'slots') },
  { name: 'roulette', aliases: ['ruleta'], category: 'games', description: 'Ruleta NXC con límite estricto de pérdidas.', handler: (ctx) => guardedGame(ctx, 'roulette') },
  { name: 'dicebet', aliases: ['dadoapuesta'], category: 'games', description: 'Apuesta de dado NXC con límite estricto de pérdidas.', handler: (ctx) => guardedGame(ctx, 'dice') },
]
