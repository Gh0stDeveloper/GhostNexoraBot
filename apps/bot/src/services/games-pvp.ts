import { economy, COIN_SYMBOL } from './economy.js'

const db = economy.db
const now = () => Date.now()
const CHALLENGE_TTL = 10 * 60_000
const BOT_ID = '__ghost_nexora_bot__'

function ledger(userJid: string, kind: string, amount: number, note?: string, counterparty?: string) {
  db.prepare('INSERT INTO economy_ledger(user_jid, kind, amount, counterparty_jid, note, created_at) VALUES(?, ?, ?, ?, ?, ?)')
    .run(userJid, kind, amount, counterparty ?? null, note ?? null, now())
}

function debit(userJid: string, amount: number, note: string, counterparty?: string) {
  const value = Math.max(0, Math.floor(amount))
  economy.balance(userJid)
  if (!value) return 0
  const balance = economy.balance(userJid)
  if (balance.wallet < value) throw new Error(`Necesitas ${value.toLocaleString('es-MX')} ${COIN_SYMBOL} en la cartera.`)
  db.prepare('UPDATE economy_users SET wallet = wallet - ? WHERE user_jid = ?').run(value, userJid)
  ledger(userJid, 'game_bet', -value, note, counterparty)
  return value
}

function credit(userJid: string, amount: number, kind: string, note: string, counterparty?: string) {
  const value = Math.max(0, Math.floor(amount))
  if (!value) return
  economy.balance(userJid)
  db.prepare('UPDATE economy_users SET wallet = wallet + ? WHERE user_jid = ?').run(value, userJid)
  ledger(userJid, kind, value, note, counterparty)
}

function ensureDifferent(a: string, b: string) {
  if (!a || !b || a === b) throw new Error('Debes elegir a otro usuario.')
}

db.exec(`
  CREATE TABLE IF NOT EXISTS game_ttt_pvp (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_jid TEXT NOT NULL,
    player_x TEXT NOT NULL,
    player_o TEXT NOT NULL,
    board TEXT NOT NULL DEFAULT '---------',
    turn TEXT NOT NULL DEFAULT 'x',
    bet INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_game_ttt_pvp_chat ON game_ttt_pvp(chat_jid, status, updated_at);
  CREATE INDEX IF NOT EXISTS idx_game_ttt_pvp_players ON game_ttt_pvp(player_x, player_o, status);

  CREATE TABLE IF NOT EXISTS game_bj_pvp (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_jid TEXT NOT NULL,
    challenger_jid TEXT NOT NULL,
    target_jid TEXT NOT NULL,
    bet INTEGER NOT NULL DEFAULT 0,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_game_bj_pvp_target ON game_bj_pvp(target_jid, expires_at);

  CREATE TABLE IF NOT EXISTS game_checkers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_jid TEXT NOT NULL,
    player_x TEXT NOT NULL,
    player_o TEXT NOT NULL,
    board TEXT NOT NULL,
    turn TEXT NOT NULL DEFAULT 'x',
    forced_from INTEGER,
    bet INTEGER NOT NULL DEFAULT 0,
    mode TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_game_checkers_chat ON game_checkers(chat_jid, status, updated_at);
`)

function winnerTtt(board: string[]) {
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

export function renderPvpTtt(board: string) {
  const cells = board.split('').map((value, index) => value === '-' ? String(index + 1) : value === 'X' ? '❌' : '⭕')
  return `${cells[0]} │ ${cells[1]} │ ${cells[2]}\n──┼──┼──\n${cells[3]} │ ${cells[4]} │ ${cells[5]}\n──┼──┼──\n${cells[6]} │ ${cells[7]} │ ${cells[8]}`
}

function cleanupTttExpired() {
  const rows = db.prepare("SELECT id, player_x AS playerX, bet FROM game_ttt_pvp WHERE status = 'pending' AND expires_at <= ?").all(now()) as Array<{ id: number; playerX: string; bet: number }>
  for (const row of rows) {
    db.prepare('DELETE FROM game_ttt_pvp WHERE id = ?').run(row.id)
    if (row.bet) credit(row.playerX, row.bet, 'game_refund', 'ttt pvp challenge expired')
  }
}

function tttRow(id: number) {
  return db.prepare(`SELECT id, chat_jid AS chatJid, player_x AS playerX, player_o AS playerO, board, turn, bet, status,
    expires_at AS expiresAt, created_at AS createdAt, updated_at AS updatedAt FROM game_ttt_pvp WHERE id = ?`).get(id) as {
      id: number; chatJid: string; playerX: string; playerO: string; board: string; turn: 'x' | 'o'; bet: number;
      status: 'pending' | 'active'; expiresAt: number; createdAt: number; updatedAt: number
    } | undefined
}

function activeTtt(chatJid: string, userJid: string) {
  cleanupTttExpired()
  return db.prepare(`SELECT id, chat_jid AS chatJid, player_x AS playerX, player_o AS playerO, board, turn, bet, status,
    expires_at AS expiresAt, created_at AS createdAt, updated_at AS updatedAt FROM game_ttt_pvp
    WHERE chat_jid = ? AND status = 'active' AND (player_x = ? OR player_o = ?) ORDER BY updated_at DESC LIMIT 1`)
    .get(chatJid, userJid, userJid) as ReturnType<typeof tttRow>
}

function hasOpenTtt(chatJid: string, userJid: string) {
  cleanupTttExpired()
  return Boolean(db.prepare(`SELECT id FROM game_ttt_pvp WHERE chat_jid = ? AND status IN ('pending','active')
    AND (player_x = ? OR player_o = ?) LIMIT 1`).get(chatJid, userJid, userJid))
}

function cleanupBjExpired() {
  const rows = db.prepare('SELECT id, challenger_jid AS challengerJid, bet FROM game_bj_pvp WHERE expires_at <= ?').all(now()) as Array<{ id: number; challengerJid: string; bet: number }>
  for (const row of rows) {
    db.prepare('DELETE FROM game_bj_pvp WHERE id = ?').run(row.id)
    if (row.bet) credit(row.challengerJid, row.bet, 'game_refund', 'blackjack pvp challenge expired')
  }
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

function autoHand() {
  const cards = [card(), card()]
  while (handValue(cards) < 17) cards.push(card())
  return { cards, value: handValue(cards) }
}

const EMPTY = '.'
type Side = 'x' | 'o'
type CheckersMove = { from: number; to: number; capture?: number }

function initialCheckersBoard() {
  const board = Array<string>(64).fill(EMPTY)
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 8; col += 1) if ((row + col) % 2 === 1) board[row * 8 + col] = 'o'
  }
  for (let row = 5; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) if ((row + col) % 2 === 1) board[row * 8 + col] = 'x'
  }
  return board.join('')
}

function sideOf(piece: string): Side | null {
  if (piece === 'x' || piece === 'X') return 'x'
  if (piece === 'o' || piece === 'O') return 'o'
  return null
}

function coords(index: number) { return { row: Math.floor(index / 8), col: index % 8 } }
function idx(row: number, col: number) { return row * 8 + col }
function inside(row: number, col: number) { return row >= 0 && row < 8 && col >= 0 && col < 8 }

function moveDirections(piece: string) {
  if (piece === 'X' || piece === 'O') return [-1, 1]
  return piece === 'x' ? [-1] : [1]
}

function capturesForPiece(board: string[], from: number): CheckersMove[] {
  const piece = board[from] ?? EMPTY
  const side = sideOf(piece)
  if (!side) return []
  const { row, col } = coords(from)
  const out: CheckersMove[] = []
  for (const dr of moveDirections(piece)) {
    for (const dc of [-1, 1]) {
      const middleRow = row + dr, middleCol = col + dc
      const targetRow = row + dr * 2, targetCol = col + dc * 2
      if (!inside(targetRow, targetCol) || !inside(middleRow, middleCol)) continue
      const middle = idx(middleRow, middleCol), target = idx(targetRow, targetCol)
      const middleSide = sideOf(board[middle] ?? EMPTY)
      if (middleSide && middleSide !== side && board[target] === EMPTY) out.push({ from, to: target, capture: middle })
    }
  }
  return out
}

function simpleMovesForPiece(board: string[], from: number): CheckersMove[] {
  const piece = board[from] ?? EMPTY
  if (!sideOf(piece)) return []
  const { row, col } = coords(from)
  const out: CheckersMove[] = []
  for (const dr of moveDirections(piece)) {
    for (const dc of [-1, 1]) {
      const targetRow = row + dr, targetCol = col + dc
      if (!inside(targetRow, targetCol)) continue
      const target = idx(targetRow, targetCol)
      if (board[target] === EMPTY) out.push({ from, to: target })
    }
  }
  return out
}

function legalCheckersMoves(board: string[], side: Side, forcedFrom: number | null = null) {
  const positions = forcedFrom !== null
    ? [forcedFrom]
    : board.map((piece, index) => sideOf(piece) === side ? index : -1).filter((index) => index >= 0)
  const captures = positions.flatMap((from) => capturesForPiece(board, from))
  if (captures.length) return captures
  if (forcedFrom !== null) return []
  return positions.flatMap((from) => simpleMovesForPiece(board, from))
}

function promote(piece: string, to: number) {
  const row = Math.floor(to / 8)
  if (piece === 'x' && row === 0) return 'X'
  if (piece === 'o' && row === 7) return 'O'
  return piece
}

function checkersWinner(board: string[], nextSide: Side) {
  const xCount = board.filter((piece) => sideOf(piece) === 'x').length
  const oCount = board.filter((piece) => sideOf(piece) === 'o').length
  if (!xCount) return 'o' as const
  if (!oCount) return 'x' as const
  if (!legalCheckersMoves(board, nextSide).length) return nextSide === 'x' ? 'o' as const : 'x' as const
  return null
}

function applyCheckersMove(board: string[], side: Side, move: CheckersMove) {
  const piece = board[move.from]!
  board[move.from] = EMPTY
  if (move.capture !== undefined) board[move.capture] = EMPTY
  board[move.to] = promote(piece, move.to)
  const continuation = move.capture !== undefined ? capturesForPiece(board, move.to) : []
  if (continuation.length) return { board, turn: side, forcedFrom: move.to, continued: true }
  const next: Side = side === 'x' ? 'o' : 'x'
  return { board, turn: next, forcedFrom: null, continued: false }
}

function parseCoord(value: string) {
  const match = /^([a-h])([1-8])$/i.exec(value.trim())
  if (!match) return null
  return idx(Number(match[2]) - 1, match[1]!.toLowerCase().charCodeAt(0) - 97)
}

export function parseCheckersMove(value: string) {
  const match = /^\s*([a-h][1-8])\s*(?:-|>|\s)\s*([a-h][1-8])\s*$/i.exec(value)
  if (!match) return null
  const from = parseCoord(match[1]!), to = parseCoord(match[2]!)
  return from === null || to === null ? null : { from, to }
}

export function renderCheckers(boardText: string) {
  const board = boardText.split('')
  const lines = ['    a  b  c  d  e  f  g  h']
  for (let row = 7; row >= 0; row -= 1) {
    const cells = []
    for (let col = 0; col < 8; col += 1) {
      const piece = board[idx(row, col)] ?? EMPTY
      cells.push(piece === 'x' ? '🔴' : piece === 'X' ? '🔶' : piece === 'o' ? '⚫' : piece === 'O' ? '🔷' : '▫️')
    }
    lines.push(`${row + 1}  ${cells.join(' ')}`)
  }
  return lines.join('\n')
}

function cleanupCheckersExpired() {
  const rows = db.prepare("SELECT id, player_x AS playerX, bet FROM game_checkers WHERE status = 'pending' AND expires_at <= ?").all(now()) as Array<{ id: number; playerX: string; bet: number }>
  for (const row of rows) {
    db.prepare('DELETE FROM game_checkers WHERE id = ?').run(row.id)
    if (row.bet) credit(row.playerX, row.bet, 'game_refund', 'checkers challenge expired')
  }
}

type CheckersRow = {
  id: number; chatJid: string; playerX: string; playerO: string; board: string; turn: Side; forcedFrom: number | null;
  bet: number; mode: 'pvp' | 'bot'; status: 'pending' | 'active'; expiresAt: number; createdAt: number; updatedAt: number
}

function checkersById(id: number) {
  return db.prepare(`SELECT id, chat_jid AS chatJid, player_x AS playerX, player_o AS playerO, board, turn,
    forced_from AS forcedFrom, bet, mode, status, expires_at AS expiresAt, created_at AS createdAt, updated_at AS updatedAt
    FROM game_checkers WHERE id = ?`).get(id) as CheckersRow | undefined
}

function activeCheckers(chatJid: string, userJid: string, mode?: 'pvp' | 'bot') {
  cleanupCheckersExpired()
  const modeClause = mode ? ' AND mode = ?' : ''
  const args = mode ? [chatJid, userJid, userJid, mode] : [chatJid, userJid, userJid]
  return db.prepare(`SELECT id, chat_jid AS chatJid, player_x AS playerX, player_o AS playerO, board, turn,
    forced_from AS forcedFrom, bet, mode, status, expires_at AS expiresAt, created_at AS createdAt, updated_at AS updatedAt
    FROM game_checkers WHERE chat_jid = ? AND status = 'active' AND (player_x = ? OR player_o = ?)${modeClause}
    ORDER BY updated_at DESC LIMIT 1`).get(...args) as CheckersRow | undefined
}

function hasOpenCheckers(chatJid: string, userJid: string) {
  cleanupCheckersExpired()
  return Boolean(db.prepare(`SELECT id FROM game_checkers WHERE chat_jid = ? AND status IN ('pending','active')
    AND (player_x = ? OR player_o = ?) LIMIT 1`).get(chatJid, userJid, userJid))
}

function finishCheckers(game: CheckersRow, winner: Side) {
  db.prepare('DELETE FROM game_checkers WHERE id = ?').run(game.id)
  const winnerJid = winner === 'x' ? game.playerX : game.playerO
  if (game.bet) {
    if (game.mode === 'pvp') credit(winnerJid, game.bet * 2, 'game_win', 'checkers pvp')
    else if (winnerJid !== BOT_ID) credit(winnerJid, game.bet * 2, 'game_win', 'checkers bot')
  }
  return { winner, winnerJid, balance: winnerJid === BOT_ID ? null : economy.balance(winnerJid) }
}

function persistCheckers(game: CheckersRow, board: string[], turn: Side, forcedFrom: number | null) {
  db.prepare('UPDATE game_checkers SET board = ?, turn = ?, forced_from = ?, updated_at = ? WHERE id = ?')
    .run(board.join(''), turn, forcedFrom, now(), game.id)
  return checkersById(game.id)!
}

function moveCheckers(game: CheckersRow, actor: string, from: number, to: number) {
  const side: Side = actor === game.playerX ? 'x' : actor === game.playerO ? 'o' : (() => { throw new Error('No participas en esta partida.') })()
  if (game.turn !== side) throw new Error('Todavía no es tu turno.')
  const board = game.board.split('')
  const legal = legalCheckersMoves(board, side, game.forcedFrom)
  const chosen = legal.find((move) => move.from === from && move.to === to)
  if (!chosen) {
    if (legal.some((move) => move.capture !== undefined)) throw new Error('Hay una captura obligatoria; realiza uno de los saltos disponibles.')
    throw new Error('Ese movimiento no es válido.')
  }
  const applied = applyCheckersMove(board, side, chosen)
  if (!applied.continued) {
    const winner = checkersWinner(applied.board, applied.turn)
    if (winner) return { done: true as const, game, board: applied.board.join(''), ...finishCheckers(game, winner) }
  }
  const updated = persistCheckers(game, applied.board, applied.turn, applied.forcedFrom)
  return { done: false as const, game: updated, board: updated.board, continued: applied.continued }
}

function botCheckersTurns(game: CheckersRow) {
  let current = game
  while (current.turn === 'o') {
    const board = current.board.split('')
    const legal = legalCheckersMoves(board, 'o', current.forcedFrom)
    if (!legal.length) return { done: true as const, game: current, board: current.board, ...finishCheckers(current, 'x') }
    const captures = legal.filter((move) => move.capture !== undefined)
    const choices = captures.length ? captures : legal
    const selected = choices[Math.floor(Math.random() * choices.length)]!
    const result = moveCheckers(current, BOT_ID, selected.from, selected.to)
    if (result.done) return result
    current = result.game
    if (!result.continued && current.turn === 'x') break
  }
  return { done: false as const, game: current, board: current.board, continued: false }
}

export const pvpGames = {
  tttActive(chatJid: string, userJid: string) { return activeTtt(chatJid, userJid) },

  createTttChallenge(chatJid: string, challenger: string, target: string, bet = 0) {
    ensureDifferent(challenger, target)
    if (hasOpenTtt(chatJid, challenger) || hasOpenTtt(chatJid, target)) throw new Error('Uno de los jugadores ya tiene un duelo de tres en raya pendiente o activo en este chat.')
    const value = debit(challenger, bet, 'ttt pvp challenge', target)
    const expiresAt = now() + CHALLENGE_TTL
    const result = db.prepare(`INSERT INTO game_ttt_pvp(chat_jid, player_x, player_o, board, turn, bet, status, expires_at, created_at, updated_at)
      VALUES(?, ?, ?, '---------', 'x', ?, 'pending', ?, ?, ?)`).run(chatJid, challenger, target, value, expiresAt, now(), now())
    return tttRow(Number(result.lastInsertRowid))!
  },

  pendingTtt(target: string, chatJid: string) {
    cleanupTttExpired()
    return db.prepare(`SELECT id, chat_jid AS chatJid, player_x AS playerX, player_o AS playerO, board, turn, bet, status,
      expires_at AS expiresAt, created_at AS createdAt, updated_at AS updatedAt FROM game_ttt_pvp
      WHERE chat_jid = ? AND player_o = ? AND status = 'pending' AND expires_at > ? ORDER BY created_at DESC LIMIT 1`)
      .get(chatJid, target, now()) as ReturnType<typeof tttRow>
  },

  acceptTtt(target: string, chatJid: string) {
    const challenge = this.pendingTtt(target, chatJid)
    if (!challenge) throw new Error('No tienes una invitación PvP pendiente en este chat.')
    db.exec('BEGIN IMMEDIATE')
    try {
      debit(target, challenge.bet, 'ttt pvp accept', challenge.playerX)
      db.prepare("UPDATE game_ttt_pvp SET status = 'active', updated_at = ? WHERE id = ? AND status = 'pending'").run(now(), challenge.id)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    return tttRow(challenge.id)!
  },

  rejectTtt(target: string, chatJid: string) {
    const challenge = this.pendingTtt(target, chatJid)
    if (!challenge) throw new Error('No tienes una invitación PvP pendiente.')
    db.prepare('DELETE FROM game_ttt_pvp WHERE id = ?').run(challenge.id)
    if (challenge.bet) credit(challenge.playerX, challenge.bet, 'game_refund', 'ttt pvp rejected', target)
    return challenge
  },

  moveTtt(chatJid: string, userJid: string, cell: number) {
    const game = activeTtt(chatJid, userJid)
    if (!game) throw new Error('No tienes una partida PvP activa.')
    const side = game.playerX === userJid ? 'x' : 'o'
    if (game.turn !== side) throw new Error('Todavía no es tu turno.')
    const index = Math.floor(cell) - 1
    if (index < 0 || index > 8) throw new Error('Elige una casilla del 1 al 9.')
    const board = game.board.split('')
    if (board[index] !== '-') throw new Error('Esa casilla ya está ocupada.')
    board[index] = side === 'x' ? 'X' : 'O'
    const state = winnerTtt(board)
    if (!state) {
      const next = side === 'x' ? 'o' : 'x'
      db.prepare('UPDATE game_ttt_pvp SET board = ?, turn = ?, updated_at = ? WHERE id = ?').run(board.join(''), next, now(), game.id)
      return { done: false as const, game: tttRow(game.id)! }
    }
    db.prepare('DELETE FROM game_ttt_pvp WHERE id = ?').run(game.id)
    if (state === 'draw') {
      if (game.bet) {
        credit(game.playerX, game.bet, 'game_refund', 'ttt pvp draw', game.playerO)
        credit(game.playerO, game.bet, 'game_refund', 'ttt pvp draw', game.playerX)
      }
      return { done: true as const, state, board: board.join(''), game }
    }
    const winnerJid = state === 'X' ? game.playerX : game.playerO
    if (game.bet) credit(winnerJid, game.bet * 2, 'game_win', 'ttt pvp', winnerJid === game.playerX ? game.playerO : game.playerX)
    return { done: true as const, state, board: board.join(''), game, winnerJid, balance: economy.balance(winnerJid) }
  },

  cancelTtt(chatJid: string, userJid: string) {
    cleanupTttExpired()
    const game = db.prepare(`SELECT id, chat_jid AS chatJid, player_x AS playerX, player_o AS playerO, board, turn, bet, status,
      expires_at AS expiresAt, created_at AS createdAt, updated_at AS updatedAt FROM game_ttt_pvp WHERE chat_jid = ?
      AND (player_x = ? OR player_o = ?) ORDER BY updated_at DESC LIMIT 1`).get(chatJid, userJid, userJid) as ReturnType<typeof tttRow>
    if (!game) throw new Error('No tienes un duelo PvP pendiente o activo.')
    db.prepare('DELETE FROM game_ttt_pvp WHERE id = ?').run(game.id)
    if (game.status === 'pending') {
      if (game.bet) credit(game.playerX, game.bet, 'game_refund', 'ttt pvp canceled')
      return { game, forfeited: false as const }
    }
    const winnerJid = game.playerX === userJid ? game.playerO : game.playerX
    if (game.bet) credit(winnerJid, game.bet * 2, 'game_win', 'ttt pvp forfeit', userJid)
    return { game, forfeited: true as const, winnerJid }
  },

  createBjChallenge(chatJid: string, challenger: string, target: string, bet = 0) {
    cleanupBjExpired()
    ensureDifferent(challenger, target)
    const pending = db.prepare('SELECT id FROM game_bj_pvp WHERE chat_jid = ? AND (challenger_jid IN (?, ?) OR target_jid IN (?, ?)) LIMIT 1')
      .get(chatJid, challenger, target, challenger, target)
    if (pending) throw new Error('Uno de los jugadores ya tiene un blackjack PvP pendiente.')
    const value = debit(challenger, bet, 'blackjack pvp challenge', target)
    const result = db.prepare('INSERT INTO game_bj_pvp(chat_jid, challenger_jid, target_jid, bet, expires_at, created_at) VALUES(?, ?, ?, ?, ?, ?)')
      .run(chatJid, challenger, target, value, now() + CHALLENGE_TTL, now())
    return { id: Number(result.lastInsertRowid), challengerJid: challenger, targetJid: target, bet: value }
  },

  pendingBj(target: string, chatJid: string) {
    cleanupBjExpired()
    return db.prepare(`SELECT id, challenger_jid AS challengerJid, target_jid AS targetJid, bet, expires_at AS expiresAt
      FROM game_bj_pvp WHERE chat_jid = ? AND target_jid = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 1`)
      .get(chatJid, target, now()) as { id: number; challengerJid: string; targetJid: string; bet: number; expiresAt: number } | undefined
  },

  rejectBj(target: string, chatJid: string) {
    const challenge = this.pendingBj(target, chatJid)
    if (!challenge) throw new Error('No tienes una invitación de blackjack PvP pendiente.')
    db.prepare('DELETE FROM game_bj_pvp WHERE id = ?').run(challenge.id)
    if (challenge.bet) credit(challenge.challengerJid, challenge.bet, 'game_refund', 'blackjack pvp rejected', target)
    return challenge
  },

  acceptBj(target: string, chatJid: string) {
    const challenge = this.pendingBj(target, chatJid)
    if (!challenge) throw new Error('No tienes una invitación de blackjack PvP pendiente.')
    db.exec('BEGIN IMMEDIATE')
    try {
      debit(target, challenge.bet, 'blackjack pvp accept', challenge.challengerJid)
      db.prepare('DELETE FROM game_bj_pvp WHERE id = ?').run(challenge.id)
      const a = autoHand(), b = autoHand()
      const aBust = a.value > 21, bBust = b.value > 21
      let winnerJid: string | null = null
      if (aBust && bBust) winnerJid = null
      else if (aBust) winnerJid = target
      else if (bBust) winnerJid = challenge.challengerJid
      else if (a.value > b.value) winnerJid = challenge.challengerJid
      else if (b.value > a.value) winnerJid = target
      if (challenge.bet) {
        if (winnerJid) credit(winnerJid, challenge.bet * 2, 'game_win', 'blackjack pvp', winnerJid === target ? challenge.challengerJid : target)
        else {
          credit(challenge.challengerJid, challenge.bet, 'game_refund', 'blackjack pvp draw', target)
          credit(target, challenge.bet, 'game_refund', 'blackjack pvp draw', challenge.challengerJid)
        }
      }
      db.exec('COMMIT')
      return { challenge, challenger: a, target: b, winnerJid }
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  },

  createCheckersChallenge(chatJid: string, challenger: string, target: string, bet = 0) {
    ensureDifferent(challenger, target)
    if (hasOpenCheckers(chatJid, challenger) || hasOpenCheckers(chatJid, target)) throw new Error('Uno de los jugadores ya tiene una partida de damas pendiente o activa en este chat.')
    const value = debit(challenger, bet, 'checkers pvp challenge', target)
    const result = db.prepare(`INSERT INTO game_checkers(chat_jid, player_x, player_o, board, turn, forced_from, bet, mode, status, expires_at, created_at, updated_at)
      VALUES(?, ?, ?, ?, 'x', NULL, ?, 'pvp', 'pending', ?, ?, ?)`).run(chatJid, challenger, target, initialCheckersBoard(), value, now() + CHALLENGE_TTL, now(), now())
    return checkersById(Number(result.lastInsertRowid))!
  },

  pendingCheckers(target: string, chatJid: string) {
    cleanupCheckersExpired()
    return db.prepare(`SELECT id, chat_jid AS chatJid, player_x AS playerX, player_o AS playerO, board, turn,
      forced_from AS forcedFrom, bet, mode, status, expires_at AS expiresAt, created_at AS createdAt, updated_at AS updatedAt
      FROM game_checkers WHERE chat_jid = ? AND player_o = ? AND mode = 'pvp' AND status = 'pending' AND expires_at > ?
      ORDER BY created_at DESC LIMIT 1`).get(chatJid, target, now()) as CheckersRow | undefined
  },

  acceptCheckers(target: string, chatJid: string) {
    const challenge = this.pendingCheckers(target, chatJid)
    if (!challenge) throw new Error('No tienes una invitación de damas pendiente.')
    db.exec('BEGIN IMMEDIATE')
    try {
      debit(target, challenge.bet, 'checkers pvp accept', challenge.playerX)
      db.prepare("UPDATE game_checkers SET status = 'active', updated_at = ? WHERE id = ? AND status = 'pending'").run(now(), challenge.id)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    return checkersById(challenge.id)!
  },

  rejectCheckers(target: string, chatJid: string) {
    const challenge = this.pendingCheckers(target, chatJid)
    if (!challenge) throw new Error('No tienes una invitación de damas pendiente.')
    db.prepare('DELETE FROM game_checkers WHERE id = ?').run(challenge.id)
    if (challenge.bet) credit(challenge.playerX, challenge.bet, 'game_refund', 'checkers rejected', target)
    return challenge
  },

  startCheckersBot(chatJid: string, userJid: string, bet = 0) {
    if (hasOpenCheckers(chatJid, userJid)) throw new Error('Ya tienes una partida de damas pendiente o activa en este chat.')
    const value = debit(userJid, bet, 'checkers bot')
    const result = db.prepare(`INSERT INTO game_checkers(chat_jid, player_x, player_o, board, turn, forced_from, bet, mode, status, expires_at, created_at, updated_at)
      VALUES(?, ?, ?, ?, 'x', NULL, ?, 'bot', 'active', ?, ?, ?)`).run(chatJid, userJid, BOT_ID, initialCheckersBoard(), value, now() + 24 * 60 * 60_000, now(), now())
    return checkersById(Number(result.lastInsertRowid))!
  },

  activeCheckers(chatJid: string, userJid: string, mode?: 'pvp' | 'bot') { return activeCheckers(chatJid, userJid, mode) },

  moveCheckers(chatJid: string, userJid: string, from: number, to: number, mode?: 'pvp' | 'bot') {
    const game = activeCheckers(chatJid, userJid, mode)
    if (!game) throw new Error('No tienes una partida de damas activa.')
    const moved = moveCheckers(game, userJid, from, to)
    if (moved.done || game.mode === 'pvp') return moved
    return botCheckersTurns(moved.game)
  },

  cancelCheckers(chatJid: string, userJid: string, mode?: 'pvp' | 'bot') {
    cleanupCheckersExpired()
    const modeClause = mode ? ' AND mode = ?' : ''
    const args = mode ? [chatJid, userJid, userJid, mode] : [chatJid, userJid, userJid]
    const game = db.prepare(`SELECT id, chat_jid AS chatJid, player_x AS playerX, player_o AS playerO, board, turn,
      forced_from AS forcedFrom, bet, mode, status, expires_at AS expiresAt, created_at AS createdAt, updated_at AS updatedAt
      FROM game_checkers WHERE chat_jid = ? AND (player_x = ? OR player_o = ?)${modeClause} ORDER BY updated_at DESC LIMIT 1`)
      .get(...args) as CheckersRow | undefined
    if (!game) throw new Error('No tienes una partida de damas pendiente o activa.')
    db.prepare('DELETE FROM game_checkers WHERE id = ?').run(game.id)
    if (game.status === 'pending') {
      if (game.bet) credit(game.playerX, game.bet, 'game_refund', 'checkers challenge canceled')
      return { game, forfeited: false as const }
    }
    if (game.mode === 'bot') return { game, forfeited: true as const, winnerJid: BOT_ID }
    const winnerJid = game.playerX === userJid ? game.playerO : game.playerX
    if (game.bet) credit(winnerJid, game.bet * 2, 'game_win', 'checkers pvp forfeit', userJid)
    return { game, forfeited: true as const, winnerJid }
  },
}
