import type { BotCommand, CommandContext } from '../types.js'
import { games, renderTtt } from '../services/games.js'
import { htmlGameUnavailableText, sendAiHtmlMessage } from '../services/ai-html.js'
import { buildMarioGameHtml } from '../services/mario-game.js'
import {
  buildBounceGameHtml,
  buildHaloArenaGameHtml,
  buildMinesweeperGameHtml,
  buildPacmanGameHtml,
  buildPianoTilesGameHtml,
} from '../services/arcade-games-v16.js'

const fmt = (value: number) => `${Math.floor(value).toLocaleString('es-MX')} NXC`

function parseBet(value?: string) {
  if (!value) return 0
  const amount = Number(value.replace(/[,_]/g, ''))
  if (!Number.isFinite(amount) || amount < 0) throw new Error('La apuesta debe ser una cantidad válida.')
  return Math.floor(amount)
}

function cards(items: Array<{ label: string }>) { return items.map((item) => item.label).join(' · ') }

function normalizeArcadeViewport(name: string, html: string) {
  if (name !== 'pacman') return html
  return html
    .replace('width="456" height="360"', 'width="456" height="480"')
    .replace('var ox=0,oy=-60;', 'var ox=0,oy=0;')
}

async function sendArcadeGame(ctx: CommandContext, name: string, title: string, icon: string, build: () => string) {
  try {
    const html = normalizeArcadeViewport(name, build())
    await sendAiHtmlMessage(ctx.socket, ctx.chatId, html, { title: `${title} · Ghost Nexora`, trustedSources: [], quoted: ctx.message })
  } catch (error) {
    await ctx.reply([
      `${icon} *${title.toUpperCase()}*`,
      '━━━━━━━━━━━━━━',
      htmlGameUnavailableText(ctx.prefix, name),
      '',
      `Detalle: ${error instanceof Error ? error.message : String(error)}`,
    ].join('\n'))
  }
}

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
  {
    name: 'pacman', aliases: ['pac-man', 'pac', 'comecocos'], category: 'games',
    description: 'Pac-Man interactivo: recorre el laberinto, come puntos y evita fantasmas.', usage: 'pacman',
    async handler(ctx) { await sendArcadeGame(ctx, 'pacman', 'Pac-Man', '🟡', buildPacmanGameHtml) },
  },
  {
    name: 'buscaminas', aliases: ['minesweeper', 'minas'], category: 'games',
    description: 'Buscaminas táctil 9x9 con modo descubrir y banderas.', usage: 'buscaminas',
    async handler(ctx) { await sendArcadeGame(ctx, 'buscaminas', 'Buscaminas', '💣', buildMinesweeperGameHtml) },
  },
  {
    name: 'halo', aliases: ['haloarena', 'scifiarena'], category: 'games',
    description: 'Mini shooter sci-fi de arena con escudo, oleadas, movimiento y disparo.', usage: 'halo',
    async handler(ctx) { await sendArcadeGame(ctx, 'halo', 'Halo · Arena Sci-Fi', '🛡️', buildHaloArenaGameHtml) },
  },
  {
    name: 'pianotiles', aliases: ['piano', 'tiles', 'pianotile'], category: 'games',
    description: 'Piano Tiles interactivo: toca las fichas correctas antes de que caigan.', usage: 'pianotiles',
    async handler(ctx) { await sendArcadeGame(ctx, 'pianotiles', 'Piano Tiles', '🎹', buildPianoTilesGameHtml) },
  },
  {
    name: 'bounce', aliases: ['redball', 'pelotaroja', 'nokiaball'], category: 'games',
    description: 'Juego de plataformas Red Ball/Bounce: salta obstáculos y recoge orbes.', usage: 'bounce',
    async handler(ctx) { await sendArcadeGame(ctx, 'bounce', 'Red Ball · Bounce', '🔴', buildBounceGameHtml) },
  },
]
