import type { BotCommand } from '../types.js'
import { games, renderTtt } from '../services/games.js'

const fmt = (value: number) => `${Math.floor(value).toLocaleString('es-MX')} NXC`

function parseBet(value?: string) {
  if (!value) return 0
  const amount = Number(value.replace(/[,_]/g, ''))
  if (!Number.isFinite(amount) || amount < 0) throw new Error('La apuesta debe ser una cantidad válida.')
  return Math.floor(amount)
}

function cards(items: Array<{ label: string }>) { return items.map((item) => item.label).join(' · ') }

export const gameCommands: BotCommand[] = [
  {
    name: 'flip', aliases: ['coinflip', 'moneda'], category: 'games', description: 'Cara o cruz con apuesta opcional.', usage: 'flip [cara|cruz] [apuesta]',
    async handler(ctx) {
      const requested = (ctx.args[0] ?? '').toLowerCase()
      const choice: 'cara' | 'cruz' = requested === 'cara' || requested === 'cruz' ? requested : Math.random() < 0.5 ? 'cara' : 'cruz'
      const bet = parseBet(requested === 'cara' || requested === 'cruz' ? ctx.args[1] : ctx.args[0])
      const result = games.flip(ctx.sender, choice, bet)
      await ctx.reply([
        '╭━━〔 🪙 *CARA O CRUZ* 〕━━╮',
        `┃ Elegiste » *${result.choice.toUpperCase()}*`,
        `┃ Salió » *${result.landed.toUpperCase()}*`,
        `┃ Resultado » *${result.won ? 'GANASTE' : 'PERDISTE'}*`,
        result.bet ? `┃ Apuesta » *${fmt(result.bet)}*` : '┃ Partida » sin apuesta',
        `┃ Cartera » *${fmt(result.balance.wallet)}*`,
        '╰━━━━━━━━━━━━━━━━╯',
      ].join('\n'))
    },
  },
  {
    name: 'dados', aliases: ['dice', 'dado'], category: 'games', description: 'Lanza dados contra el bot con apuesta opcional.', usage: 'dados [apuesta]',
    async handler(ctx) {
      const result = games.dice(ctx.sender, parseBet(ctx.args[0]))
      const label = result.result === 'win' ? 'GANASTE' : result.result === 'draw' ? 'EMPATE' : 'PERDISTE'
      await ctx.reply([
        '╭━━〔 🎲 *DUELO DE DADOS* 〕━━╮',
        `┃ Tú » *${result.player}*`,
        `┃ Bot » *${result.bot}*`,
        `┃ Resultado » *${label}*`,
        result.bet ? `┃ Apuesta » *${fmt(result.bet)}*` : '┃ Partida » sin apuesta',
        `┃ Cartera » *${fmt(result.balance.wallet)}*`,
        '╰━━━━━━━━━━━━━━━━╯',
      ].join('\n'))
    },
  },
  {
    name: 'bj', aliases: ['blackjack'], category: 'games', description: 'Blackjack automático contra el bot con apuesta opcional.', usage: 'bj [apuesta]',
    async handler(ctx) {
      const result = games.blackjack(ctx.sender, parseBet(ctx.args[0]))
      const label = result.result === 'win' ? 'GANASTE' : result.result === 'draw' ? 'EMPATE' : 'PERDISTE'
      await ctx.reply([
        '╭━━〔 🃏 *BLACKJACK* 〕━━╮',
        `┃ Tú » ${cards(result.player)} = *${result.playerValue}*`,
        `┃ Dealer » ${cards(result.dealer)} = *${result.dealerValue}*`,
        `┃ Resultado » *${label}${result.natural ? ' · BLACKJACK' : ''}*`,
        result.bet ? `┃ Apuesta » *${fmt(result.bet)}*` : '┃ Partida » sin apuesta',
        `┃ Cartera » *${fmt(result.balance.wallet)}*`,
        '╰━━━━━━━━━━━━━━━━╯',
      ].join('\n'))
    },
  },
  {
    name: 'ttt', aliases: ['lttt', 'tictactoe', 'tresenraya'], category: 'games', description: 'Tres en raya de texto contra la IA.', usage: 'ttt [apuesta] | ttt <1-9> | ttt cancel',
    async handler(ctx) {
      const first = (ctx.args[0] ?? '').toLowerCase()
      const active = games.ttt(ctx.sender)
      if (first === 'cancel' || first === 'cancelar') {
        const game = games.cancelTtt(ctx.sender)
        if (!game) throw new Error('No tienes una partida activa.')
        await ctx.reply(`🛑 *PARTIDA CANCELADA*\n${game.bet ? `La apuesta de ${fmt(game.bet)} fue devuelta.` : 'No había apuesta.'}`)
        return
      }
      if (active) {
        const cell = Number(first)
        if (!Number.isInteger(cell)) {
          await ctx.reply(`🎮 *TRES EN RAYA*\n━━━━━━━━━━━━━━\n${renderTtt(active.board)}\n\nTú juegas con ❌. Usa *${ctx.prefix}ttt <1-9>* para elegir una casilla.`)
          return
        }
        const result = games.moveTtt(ctx.sender, cell)
        if (!result.done) {
          await ctx.reply(`🎮 *TRES EN RAYA*\n━━━━━━━━━━━━━━\n${renderTtt(result.board)}\n\nTu turno: *${ctx.prefix}ttt <1-9>*`)
          return
        }
        const label = result.state === 'X' ? 'GANASTE' : result.state === 'draw' ? 'EMPATE' : 'GANÓ EL BOT'
        await ctx.reply(`🏁 *PARTIDA TERMINADA*\n━━━━━━━━━━━━━━\n${renderTtt(result.board)}\n\nResultado: *${label}*${result.bet ? `\nApuesta: ${fmt(result.bet)}\nCartera: ${fmt(result.balance.wallet)}` : ''}`)
        return
      }
      const bet = parseBet(ctx.args[0])
      const game = games.startTtt(ctx.sender, bet)
      await ctx.reply(`🎮 *TRES EN RAYA · VS IA*\n━━━━━━━━━━━━━━\n${renderTtt(game.board)}\n\nTú eres ❌ · Bot es ⭕\n${game.bet ? `Apuesta: *${fmt(game.bet)}*\n` : ''}Juega con *${ctx.prefix}ttt <1-9>*.`)
    },
  },
]
