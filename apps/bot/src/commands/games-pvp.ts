import type { BotCommand, CommandContext } from '../types.js'
import { getContextInfo } from '../utils/message.js'
import { games, renderTtt } from '../services/games.js'
import { parseCheckersMove, pvpGames, renderCheckers, renderPvpTtt } from '../services/games-pvp.js'
import { sendInteractiveCard } from '../services/interactive.js'

const fmt = (value: number) => `${Math.floor(value).toLocaleString('es-MX')} NXC`

function plainBet(args: string[]) {
  const raw = args.find((arg) => /^\d[\d,_]*$/.test(arg))
  if (!raw) return 0
  const value = Number(raw.replace(/[,_]/g, ''))
  if (!Number.isFinite(value) || value < 0) throw new Error('La apuesta no es válida.')
  return Math.floor(value)
}

function checkersBet(args: string[]) {
  if (args.some((arg) => ['gratis', 'free'].includes(arg.toLowerCase()))) return 0
  return plainBet(args)
}

async function canonicalTarget(ctx: CommandContext) {
  const mention = getContextInfo(ctx.message)?.mentionedJid?.[0]
  const direct = ctx.args.find((arg) => /^\+?\d{8,15}$/.test(arg.replace(/[ -]/g, '')))?.replace(/\D/g, '')
  const candidate = mention ?? (direct ? `${direct}@s.whatsapp.net` : null)
  if (!candidate) return null
  const metadata = await ctx.socket.groupMetadata(ctx.chatId).catch(() => null)
  if (!metadata) return candidate
  const participant = metadata.participants.find((item) => [item.id, item.lid, item.phoneNumber].filter(Boolean).includes(candidate))
  return participant?.phoneNumber ?? participant?.id ?? candidate
}

function cards(hand: Array<{ label: string }>) { return hand.map((card) => card.label).join(' · ') }

async function runTttPvp(ctx: CommandContext) {
  const action = (ctx.args[0] ?? '').toLowerCase()
  if (['accept', 'aceptar'].includes(action)) {
    const game = pvpGames.acceptTtt(ctx.sender, ctx.chatId)
    await ctx.socket.sendMessage(ctx.chatId, {
      text: `🎮 *TRES EN RAYA PvP · INICIADO*\n━━━━━━━━━━━━━━\n${renderPvpTtt(game.board)}\n\n❌ @${game.playerX.split('@')[0]} inicia.\n⭕ @${game.playerO.split('@')[0]}\n${game.bet ? `💰 Apuesta por jugador: *${fmt(game.bet)}*` : '🆓 Partida gratuita'}\n\nJuega con *${ctx.prefix}tpvp <1-9>* o *${ctx.prefix}lttt <1-9>*.`,
      mentions: [game.playerX, game.playerO],
    }, { quoted: ctx.message })
    return
  }
  if (['reject', 'rechazar'].includes(action)) {
    const game = pvpGames.rejectTtt(ctx.sender, ctx.chatId)
    await ctx.socket.sendMessage(ctx.chatId, { text: `💔 @${game.playerO.split('@')[0]} rechazó el duelo de @${game.playerX.split('@')[0]}.${game.bet ? `\n💰 Se devolvieron ${fmt(game.bet)} al retador.` : ''}`, mentions: [game.playerX, game.playerO] }, { quoted: ctx.message })
    return
  }
  if (['cancel', 'cancelar', 'rendirse'].includes(action)) {
    const result = pvpGames.cancelTtt(ctx.chatId, ctx.sender)
    if (result.forfeited) {
      await ctx.socket.sendMessage(ctx.chatId, { text: `🏳️ Rendición registrada. @${result.winnerJid.split('@')[0]} gana el duelo${result.game.bet ? ` y recibe el pozo de ${fmt(result.game.bet * 2)}` : ''}.`, mentions: [result.winnerJid] }, { quoted: ctx.message })
    } else await ctx.reply(`🛑 Desafío cancelado.${result.game.bet ? ` Se devolvieron ${fmt(result.game.bet)}.` : ''}`)
    return
  }

  const active = pvpGames.tttActive(ctx.chatId, ctx.sender)
  const cell = Number(action)
  if (active && Number.isInteger(cell) && cell >= 1 && cell <= 9) {
    const result = pvpGames.moveTtt(ctx.chatId, ctx.sender, cell)
    if (!result.done) {
      const current = result.game.turn === 'x' ? result.game.playerX : result.game.playerO
      await ctx.socket.sendMessage(ctx.chatId, { text: `🎮 *TRES EN RAYA PvP*\n━━━━━━━━━━━━━━\n${renderPvpTtt(result.game.board)}\n\nTurno de @${current.split('@')[0]}.`, mentions: [current] }, { quoted: ctx.message })
      return
    }
    if (result.state === 'draw') {
      await ctx.reply(`🤝 *EMPATE*\n━━━━━━━━━━━━━━\n${renderPvpTtt(result.board)}\n${result.game.bet ? `Las apuestas de ${fmt(result.game.bet)} fueron devueltas.` : ''}`)
      return
    }
    await ctx.socket.sendMessage(ctx.chatId, { text: `🏆 *TRES EN RAYA PvP · VICTORIA*\n━━━━━━━━━━━━━━\n${renderPvpTtt(result.board)}\n\nGanador: @${result.winnerJid!.split('@')[0]}${result.game.bet ? `\n💰 Premio: *${fmt(result.game.bet * 2)}*` : ''}`, mentions: [result.winnerJid!] }, { quoted: ctx.message })
    return
  }
  if (active) {
    const current = active.turn === 'x' ? active.playerX : active.playerO
    await ctx.socket.sendMessage(ctx.chatId, { text: `🎮 *TRES EN RAYA PvP*\n━━━━━━━━━━━━━━\n${renderPvpTtt(active.board)}\n\nTurno: @${current.split('@')[0]}\nUsa *${ctx.prefix}tpvp <1-9>*.`, mentions: [current] }, { quoted: ctx.message })
    return
  }

  const target = await canonicalTarget(ctx)
  if (!target) throw new Error(`Menciona a un rival. Ejemplo: ${ctx.prefix}tpvp @usuario 500`)
  const game = pvpGames.createTttChallenge(ctx.chatId, ctx.sender, target, plainBet(ctx.args))
  await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
    title: '🎮 DESAFÍO · TRES EN RAYA PvP',
    body: `@${game.playerX.split('@')[0]} desafía a @${game.playerO.split('@')[0]}.\n\n${game.bet ? `💰 Apuesta: ${fmt(game.bet)} por jugador\n` : '🆓 Sin apuesta\n'}⏳ La invitación expira en 10 minutos.`,
    buttons: [
      { type: 'reply', text: '✅ Aceptar', id: `${ctx.prefix}tpvp accept` },
      { type: 'reply', text: '❌ Rechazar', id: `${ctx.prefix}tpvp reject` },
    ],
  })
}

async function runLocalTtt(ctx: CommandContext) {
  const first = (ctx.args[0] ?? '').toLowerCase()
  const active = games.ttt(ctx.sender)
  if (first === 'cancel' || first === 'cancelar') {
    const game = games.cancelTtt(ctx.sender)
    if (!game) throw new Error('No tienes una partida contra la IA activa.')
    await ctx.reply(`🛑 Partida cancelada.${game.bet ? ` La apuesta de ${fmt(game.bet)} fue devuelta.` : ''}`)
    return
  }
  if (active) {
    const cell = Number(first)
    if (!Number.isInteger(cell)) {
      await ctx.reply(`🎮 *LTTT · VS IA*\n━━━━━━━━━━━━━━\n${renderTtt(active.board)}\n\nUsa *${ctx.prefix}lttt <1-9>*.`)
      return
    }
    const result = games.moveTtt(ctx.sender, cell)
    if (!result.done) {
      await ctx.reply(`🎮 *LTTT · VS IA*\n━━━━━━━━━━━━━━\n${renderTtt(result.board)}\n\nTu turno: *${ctx.prefix}lttt <1-9>*`)
      return
    }
    const label = result.state === 'X' ? 'GANASTE' : result.state === 'draw' ? 'EMPATE' : 'GANÓ LA IA'
    await ctx.reply(`🏁 *LTTT TERMINADO*\n━━━━━━━━━━━━━━\n${renderTtt(result.board)}\n\n*${label}*${result.bet ? `\nApuesta: ${fmt(result.bet)}` : ''}`)
    return
  }
  const game = games.startTtt(ctx.sender, plainBet(ctx.args))
  await ctx.reply(`🎮 *LTTT · VS IA*\n━━━━━━━━━━━━━━\n${renderTtt(game.board)}\n\nTú eres ❌. Juega con *${ctx.prefix}lttt <1-9>*.`)
}

export const pvpGameCommands: BotCommand[] = [
  {
    name: 'tpvp', aliases: ['tttpvp'], category: 'games', groupOnly: true,
    description: 'Tres en raya PvP con aceptación y apuesta opcional.', usage: 'tpvp @usuario [apuesta] | tpvp <1-9>',
    async handler(ctx) { await runTttPvp(ctx) },
  },
  {
    name: 'lttt', category: 'games', groupOnly: true,
    description: 'Tres en raya en texto: IA por defecto o PvP al mencionar un rival.', usage: 'lttt [apuesta] | lttt @usuario [apuesta]',
    async handler(ctx) {
      const target = await canonicalTarget(ctx)
      const action = (ctx.args[0] ?? '').toLowerCase()
      const pvpAction = ['accept', 'aceptar', 'reject', 'rechazar', 'cancel', 'cancelar', 'rendirse'].includes(action)
      if (target || pvpAction || pvpGames.tttActive(ctx.chatId, ctx.sender)) await runTttPvp(ctx)
      else await runLocalTtt(ctx)
    },
  },
  {
    name: 'bjvs', aliases: ['blackjackvs'], category: 'games', groupOnly: true,
    description: 'Blackjack PvP con apuesta opcional y aceptación del rival.', usage: 'bjvs [apuesta] @usuario | bjvs accept|reject',
    async handler(ctx) {
      const action = (ctx.args[0] ?? '').toLowerCase()
      if (['accept', 'aceptar'].includes(action)) {
        const result = pvpGames.acceptBj(ctx.sender, ctx.chatId)
        const winner = result.winnerJid
        await ctx.socket.sendMessage(ctx.chatId, {
          text: [
            '🃏 *BLACKJACK PvP · RESULTADO*',
            '━━━━━━━━━━━━━━',
            `@${result.challenge.challengerJid.split('@')[0]} » ${cards(result.challenger.cards)} = *${result.challenger.value}*`,
            `@${result.challenge.targetJid.split('@')[0]} » ${cards(result.target.cards)} = *${result.target.value}*`,
            winner ? `\n🏆 Ganador: @${winner.split('@')[0]}` : '\n🤝 Resultado: EMPATE',
            result.challenge.bet ? `💰 Pozo: *${fmt(result.challenge.bet * 2)}*` : '🆓 Sin apuesta',
          ].join('\n'),
          mentions: [result.challenge.challengerJid, result.challenge.targetJid],
        }, { quoted: ctx.message })
        return
      }
      if (['reject', 'rechazar'].includes(action)) {
        const challenge = pvpGames.rejectBj(ctx.sender, ctx.chatId)
        await ctx.socket.sendMessage(ctx.chatId, { text: `💔 @${challenge.targetJid.split('@')[0]} rechazó blackjack PvP.${challenge.bet ? ` Se devolvieron ${fmt(challenge.bet)} a @${challenge.challengerJid.split('@')[0]}.` : ''}`, mentions: [challenge.targetJid, challenge.challengerJid] }, { quoted: ctx.message })
        return
      }
      const target = await canonicalTarget(ctx)
      if (!target) throw new Error(`Menciona a un rival. Ejemplo: ${ctx.prefix}bjvs 500 @usuario`)
      const challenge = pvpGames.createBjChallenge(ctx.chatId, ctx.sender, target, plainBet(ctx.args))
      await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
        title: '🃏 BLACKJACK PvP',
        body: `@${challenge.challengerJid.split('@')[0]} desafía a @${challenge.targetJid.split('@')[0]}.\n${challenge.bet ? `💰 ${fmt(challenge.bet)} por jugador.` : '🆓 Partida gratuita.'}\n⏳ Expira en 10 minutos.`,
        buttons: [
          { type: 'reply', text: '✅ Aceptar', id: `${ctx.prefix}bjvs accept` },
          { type: 'reply', text: '❌ Rechazar', id: `${ctx.prefix}bjvs reject` },
        ],
      })
    },
  },
  {
    name: 'damas', aliases: ['checkers'], category: 'games', groupOnly: true,
    description: 'Damas PvP persistentes con capturas, coronación y apuesta opcional.', usage: 'damas [apuesta|gratis] @usuario | damas b6-a5',
    async handler(ctx) {
      const action = (ctx.args[0] ?? '').toLowerCase()
      if (['accept', 'aceptar'].includes(action)) {
        const game = pvpGames.acceptCheckers(ctx.sender, ctx.chatId)
        await ctx.socket.sendMessage(ctx.chatId, { text: `♟️ *DAMAS PvP · INICIADAS*\n━━━━━━━━━━━━━━\n${renderCheckers(game.board)}\n\n🔴 @${game.playerX.split('@')[0]} inicia.\n⚫ @${game.playerO.split('@')[0]}\n${game.bet ? `💰 ${fmt(game.bet)} por jugador` : '🆓 Gratis'}\n\nMovimiento: *${ctx.prefix}damas b6-a5*`, mentions: [game.playerX, game.playerO] }, { quoted: ctx.message })
        return
      }
      if (['reject', 'rechazar'].includes(action)) {
        const game = pvpGames.rejectCheckers(ctx.sender, ctx.chatId)
        await ctx.socket.sendMessage(ctx.chatId, { text: `💔 @${game.playerO.split('@')[0]} rechazó la partida de damas.${game.bet ? ` Se devolvieron ${fmt(game.bet)} al retador.` : ''}`, mentions: [game.playerX, game.playerO] }, { quoted: ctx.message })
        return
      }
      if (['cancel', 'cancelar', 'rendirse'].includes(action)) {
        const result = pvpGames.cancelCheckers(ctx.chatId, ctx.sender, 'pvp')
        if (result.forfeited) await ctx.socket.sendMessage(ctx.chatId, { text: `🏳️ Rendición. @${result.winnerJid.split('@')[0]} gana la partida${result.game.bet ? ` y el pozo de ${fmt(result.game.bet * 2)}` : ''}.`, mentions: [result.winnerJid] }, { quoted: ctx.message })
        else await ctx.reply(`🛑 Desafío de damas cancelado.${result.game.bet ? ` Se devolvieron ${fmt(result.game.bet)}.` : ''}`)
        return
      }

      const game = pvpGames.activeCheckers(ctx.chatId, ctx.sender, 'pvp')
      const move = parseCheckersMove(ctx.argText)
      if (game && move) {
        const result = pvpGames.moveCheckers(ctx.chatId, ctx.sender, move.from, move.to, 'pvp')
        if (result.done) {
          await ctx.socket.sendMessage(ctx.chatId, { text: `🏆 *DAMAS PvP · FINAL*\n━━━━━━━━━━━━━━\n${renderCheckers(result.board)}\n\nGanador: @${result.winnerJid.split('@')[0]}${result.game.bet ? `\n💰 Premio: ${fmt(result.game.bet * 2)}` : ''}`, mentions: [result.winnerJid] }, { quoted: ctx.message })
          return
        }
        const current = result.game.turn === 'x' ? result.game.playerX : result.game.playerO
        await ctx.socket.sendMessage(ctx.chatId, { text: `♟️ *DAMAS PvP*\n━━━━━━━━━━━━━━\n${renderCheckers(result.board)}\n\n${result.continued ? '⚠️ Debes continuar la captura con la misma pieza.\n' : ''}Turno: @${current.split('@')[0]}`, mentions: [current] }, { quoted: ctx.message })
        return
      }
      if (game) {
        const current = game.turn === 'x' ? game.playerX : game.playerO
        await ctx.socket.sendMessage(ctx.chatId, { text: `♟️ *DAMAS PvP*\n━━━━━━━━━━━━━━\n${renderCheckers(game.board)}\n\nTurno: @${current.split('@')[0]}\nMovimiento: *${ctx.prefix}damas b6-a5*`, mentions: [current] }, { quoted: ctx.message })
        return
      }

      const target = await canonicalTarget(ctx)
      if (!target) throw new Error(`Menciona a un rival. Ejemplo: ${ctx.prefix}damas 500 @usuario`)
      const challenge = pvpGames.createCheckersChallenge(ctx.chatId, ctx.sender, target, checkersBet(ctx.args))
      await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
        title: '♟️ DESAFÍO DE DAMAS',
        body: `@${challenge.playerX.split('@')[0]} desafía a @${challenge.playerO.split('@')[0]}.\n${challenge.bet ? `💰 ${fmt(challenge.bet)} por jugador.` : '🆓 Gratis.'}\n⏳ Expira en 10 minutos.`,
        buttons: [
          { type: 'reply', text: '✅ Aceptar', id: `${ctx.prefix}damas accept` },
          { type: 'reply', text: '❌ Rechazar', id: `${ctx.prefix}damas reject` },
        ],
      })
    },
  },
  {
    name: 'damasbot', aliases: ['checkersbot'], category: 'games', description: 'Damas persistentes contra la IA con apuesta opcional.', usage: 'damasbot [apuesta|gratis] | damasbot b6-a5',
    async handler(ctx) {
      const action = (ctx.args[0] ?? '').toLowerCase()
      if (['cancel', 'cancelar', 'rendirse'].includes(action)) {
        const result = pvpGames.cancelCheckers(ctx.chatId, ctx.sender, 'bot')
        await ctx.reply(`🏳️ Partida contra la IA terminada.${result.game.bet ? ' La apuesta se considera perdida por rendición.' : ''}`)
        return
      }
      const game = pvpGames.activeCheckers(ctx.chatId, ctx.sender, 'bot')
      const move = parseCheckersMove(ctx.argText)
      if (game && move) {
        const result = pvpGames.moveCheckers(ctx.chatId, ctx.sender, move.from, move.to, 'bot')
        if (result.done) {
          const userWon = result.winnerJid === ctx.sender
          await ctx.reply(`🏁 *DAMAS VS IA · FINAL*\n━━━━━━━━━━━━━━\n${renderCheckers(result.board)}\n\n${userWon ? '🏆 GANASTE' : '🤖 GANÓ LA IA'}${result.game.bet && userWon ? `\n💰 Premio: ${fmt(result.game.bet * 2)}` : ''}`)
          return
        }
        await ctx.reply(`♟️ *DAMAS VS IA*\n━━━━━━━━━━━━━━\n${renderCheckers(result.board)}\n\nTu turno. Movimiento: *${ctx.prefix}damasbot b6-a5*`)
        return
      }
      if (game) {
        await ctx.reply(`♟️ *DAMAS VS IA*\n━━━━━━━━━━━━━━\n${renderCheckers(game.board)}\n\nTú juegas con 🔴. Movimiento: *${ctx.prefix}damasbot b6-a5*`)
        return
      }
      const started = pvpGames.startCheckersBot(ctx.chatId, ctx.sender, checkersBet(ctx.args))
      await ctx.reply(`♟️ *DAMAS VS IA*\n━━━━━━━━━━━━━━\n${renderCheckers(started.board)}\n\nTú juegas con 🔴 y empiezas.${started.bet ? `\n💰 Apuesta: ${fmt(started.bet)}` : '\n🆓 Gratis'}\nMovimiento: *${ctx.prefix}damasbot b6-a5*`)
    },
  },
]
