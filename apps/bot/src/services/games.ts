import { economy, COIN_SYMBOL } from './economy.js'

const db = economy.db
const now = () => Date.now()

db.exec(`
  CREATE TABLE IF NOT EXISTS game_ttt (
    user_jid TEXT PRIMARY KEY,
    board TEXT NOT NULL,
    bet INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`)

function ledger(userJid: string, kind: string, amount: number, note?: string) {
  db.prepare('INSERT INTO economy_ledger(user_jid, kind, amount, note, created_at) VALUES(?, ?, ?, ?, ?)')
    .run(userJid, kind, amount, note ?? null, now())
}

function debitBet(userJid: string, amount: number, note: string) {
  const value = Math.max(0, Math.floor(amount))
  if (!value) return 0
  const balance = economy.balance(userJid)
  if (balance.wallet < value) throw new Error(`Necesitas ${value.toLocaleString('es-MX')} ${COIN_SYMBOL} en la cartera.`)
  db.prepare('UPDATE economy_users SET wallet = wallet - ? WHERE user_jid = ?').run(value, userJid)
  ledger(userJid, 'game_bet', -value, note)
  return value
}

function credit(userJid: string, amount: number, kind: string, note: string) {
  const value = Math.max(0, Math.floor(amount))
  if (!value) return
  economy.balance(userJid)
  db.prepare('UPDATE economy_users SET wallet = wallet + ? WHERE user_jid = ?').run(value, userJid)
  ledger(userJid, kind, value, note)
}

function card() {
  const raw = 1 + Math.floor(Math.random() * 13)
  const label = raw === 1 ? 'A' : raw === 11 ? 'J' : raw === 12 ? 'Q' : raw === 13 ? 'K' : String(raw)
  return { value: raw === 1 ? 11 : Math.min(raw, 10), label }
}

function handValue(cards: Array<{ value: number }>) {
  let total = cards.reduce((sum, item) => sum + item.value, 0)
  let aces = cards.filter((item) => item.value === 11).length
  while (total > 21 && aces > 0) { total -= 10; aces-- }
  return total
}

function winner(board: string[]) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ]
  for (const [a, b, c] of lines) {
    if (board[a] !== '-' && board[a] === board[b] && board[b] === board[c]) return board[a]
  }
  return board.includes('-') ? null : 'draw'
}

function botMove(board: string[]) {
  const open = board.map((value, index) => value === '-' ? index : -1).filter((index) => index >= 0)
  if (!open.length) return

  const winning = open.find((index) => {
    const copy = [...board]; copy[index] = 'O'; return winner(copy) === 'O'
  })
  if (winning !== undefined) { board[winning] = 'O'; return }

  const blocking = open.find((index) => {
    const copy = [...board]; copy[index] = 'X'; return winner(copy) === 'X'
  })
  if (blocking !== undefined) { board[blocking] = 'O'; return }

  if (board[4] === '-') { board[4] = 'O'; return }
  const choices = board.map((value, index) => value === '-' ? index : -1).filter((index) => index >= 0)
  const choice = choices[Math.floor(Math.random() * choices.length)]
  if (choice !== undefined) board[choice] = 'O'
}

export function renderTtt(board: string) {
  const cells = board.split('').map((value, index) => value === '-' ? String(index + 1) : value === 'X' ? '❌' : '⭕')
  return `${cells[0]} │ ${cells[1]} │ ${cells[2]}\n──┼──┼──\n${cells[3]} │ ${cells[4]} │ ${cells[5]}\n──┼──┼──\n${cells[6]} │ ${cells[7]} │ ${cells[8]}`
}

export const games = {
  flip(userJid: string, choice: 'cara' | 'cruz', bet = 0) {
    const value = debitBet(userJid, bet, 'flip')
    const landed: 'cara' | 'cruz' = Math.random() < 0.5 ? 'cara' : 'cruz'
    const won = choice === landed
    if (won && value) credit(userJid, value * 2, 'game_win', 'flip')
    return { choice, landed, won, bet: value, balance: economy.balance(userJid) }
  },

  dice(userJid: string, bet = 0) {
    const value = debitBet(userJid, bet, 'dice')
    const player = 1 + Math.floor(Math.random() * 6)
    const bot = 1 + Math.floor(Math.random() * 6)
    const result = player > bot ? 'win' : player < bot ? 'lose' : 'draw'
    if (value && result === 'win') credit(userJid, value * 2, 'game_win', 'dice')
    if (value && result === 'draw') credit(userJid, value, 'game_refund', 'dice')
    return { player, bot, result, bet: value, balance: economy.balance(userJid) }
  },

  blackjack(userJid: string, bet = 0) {
    const value = debitBet(userJid, bet, 'blackjack')
    const player = [card(), card()]
    const dealer = [card(), card()]
    while (handValue(player) < 17) player.push(card())
    while (handValue(dealer) < 17) dealer.push(card())
    const playerValue = handValue(player)
    const dealerValue = handValue(dealer)
    const natural = player.length === 2 && playerValue === 21
    let result: 'win' | 'lose' | 'draw'
    if (playerValue > 21) result = 'lose'
    else if (dealerValue > 21) result = 'win'
    else if (playerValue > dealerValue) result = 'win'
    else if (playerValue < dealerValue) result = 'lose'
    else result = 'draw'
    if (value && result === 'win') credit(userJid, natural ? Math.floor(value * 2.5) : value * 2, 'game_win', 'blackjack')
    if (value && result === 'draw') credit(userJid, value, 'game_refund', 'blackjack')
    return { player, dealer, playerValue, dealerValue, result, natural, bet: value, balance: economy.balance(userJid) }
  },

  ttt(userJid: string) {
    return db.prepare('SELECT board, bet, created_at AS createdAt, updated_at AS updatedAt FROM game_ttt WHERE user_jid = ?')
      .get(userJid) as { board: string; bet: number; createdAt: number; updatedAt: number } | undefined
  },

  startTtt(userJid: string, bet = 0) {
    const existing = this.ttt(userJid)
    if (existing) throw new Error('Ya tienes una partida activa. Juega con .ttt <1-9> o usa .ttt cancel.')
    const value = debitBet(userJid, bet, 'ttt')
    db.prepare('INSERT INTO game_ttt(user_jid, board, bet, created_at, updated_at) VALUES(?, ?, ?, ?, ?)')
      .run(userJid, '---------', value, now(), now())
    return this.ttt(userJid)!
  },

  cancelTtt(userJid: string) {
    const game = this.ttt(userJid)
    if (!game) return null
    db.prepare('DELETE FROM game_ttt WHERE user_jid = ?').run(userJid)
    if (game.bet) credit(userJid, game.bet, 'game_refund', 'ttt cancel')
    return game
  },

  moveTtt(userJid: string, cell: number) {
    const game = this.ttt(userJid)
    if (!game) throw new Error('No tienes una partida activa. Inicia con .ttt [apuesta].')
    const index = Math.floor(cell) - 1
    if (index < 0 || index > 8) throw new Error('Elige una casilla del 1 al 9.')
    const board = game.board.split('')
    if (board[index] !== '-') throw new Error('Esa casilla ya está ocupada.')
    board[index] = 'X'
    let state = winner(board)
    if (!state) { botMove(board); state = winner(board) }
    const serialized = board.join('')
    if (!state) {
      db.prepare('UPDATE game_ttt SET board = ?, updated_at = ? WHERE user_jid = ?').run(serialized, now(), userJid)
      return { done: false as const, board: serialized, bet: game.bet }
    }
    db.prepare('DELETE FROM game_ttt WHERE user_jid = ?').run(userJid)
    if (state === 'X' && game.bet) credit(userJid, game.bet * 2, 'game_win', 'ttt')
    if (state === 'draw' && game.bet) credit(userJid, game.bet, 'game_refund', 'ttt')
    return { done: true as const, board: serialized, bet: game.bet, state, balance: economy.balance(userJid) }
  },
}
