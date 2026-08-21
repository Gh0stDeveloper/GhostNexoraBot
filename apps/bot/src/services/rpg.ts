import { economy, COIN_SYMBOL } from './economy.js'

const db = economy.db
const now = () => Date.now()

export type RpgItem = 'tiempo' | 'deseo' | 'fortuna' | 'sombras' | 'escudo' | 'renacer' | 'maldicion'

export const RPG_ITEMS: Record<RpgItem, { price: number; description: string }> = {
  tiempo: { price: 600, description: 'Reinicia inmediatamente el cooldown de .work.' },
  deseo: { price: 1200, description: 'Concede una recompensa aleatoria y puede otorgar gemas.' },
  fortuna: { price: 1800, description: '+25% de recompensa de trabajo durante 2 horas.' },
  sombras: { price: 1600, description: '+20% extra en crímenes exitosos durante 2 horas.' },
  escudo: { price: 1400, description: 'Bloquea intentos de robo durante 6 horas.' },
  renacer: { price: 2500, description: 'Reinicia cooldowns de trabajo, robo, crime y slut.' },
  maldicion: { price: 2200, description: 'Reduce 20% la recompensa de trabajo del objetivo durante 1 hora.' },
}

db.exec(`
  CREATE TABLE IF NOT EXISTS rpg_users (
    user_jid TEXT PRIMARY KEY,
    gems INTEGER NOT NULL DEFAULT 5,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS rpg_inventory (
    user_jid TEXT NOT NULL,
    item TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(user_jid, item)
  );
  CREATE TABLE IF NOT EXISTS rpg_buffs (
    user_jid TEXT NOT NULL,
    kind TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    source_jid TEXT,
    created_at INTEGER NOT NULL,
    PRIMARY KEY(user_jid, kind)
  );
`)

function ensure(userJid: string) {
  economy.balance(userJid)
  db.prepare('INSERT OR IGNORE INTO rpg_users(user_jid, created_at, updated_at) VALUES(?, ?, ?)').run(userJid, now(), now())
}

function ledger(userJid: string, kind: string, amount: number, note?: string) {
  db.prepare('INSERT INTO economy_ledger(user_jid, kind, amount, note, created_at) VALUES(?, ?, ?, ?, ?)')
    .run(userJid, kind, amount, note ?? null, now())
}

function changeWallet(userJid: string, amount: number, kind: string, note?: string) {
  ensure(userJid)
  const value = Math.trunc(amount)
  if (value < 0 && economy.balance(userJid).wallet < Math.abs(value)) throw new Error('No tienes suficientes Nexora Coins en la cartera.')
  db.prepare('UPDATE economy_users SET wallet = wallet + ? WHERE user_jid = ?').run(value, userJid)
  ledger(userJid, kind, value, note)
  return economy.balance(userJid)
}

function inventory(userJid: string) {
  ensure(userJid)
  const rows = db.prepare('SELECT item, quantity FROM rpg_inventory WHERE user_jid = ? AND quantity > 0 ORDER BY item').all(userJid) as Array<{ item: RpgItem; quantity: number }>
  return Object.fromEntries(rows.map((row) => [row.item, Number(row.quantity)])) as Partial<Record<RpgItem, number>>
}

function consume(userJid: string, item: RpgItem) {
  ensure(userJid)
  const row = db.prepare('SELECT quantity FROM rpg_inventory WHERE user_jid = ? AND item = ?').get(userJid, item) as { quantity?: number } | undefined
  if (Number(row?.quantity ?? 0) <= 0) throw new Error(`No tienes el ítem ${item}. Cómpralo con .comprar ${item}.`)
  db.prepare('UPDATE rpg_inventory SET quantity = quantity - 1 WHERE user_jid = ? AND item = ?').run(userJid, item)
}

function setBuff(userJid: string, kind: string, durationMs: number, sourceJid?: string) {
  ensure(userJid)
  const existing = db.prepare('SELECT expires_at AS expiresAt FROM rpg_buffs WHERE user_jid = ? AND kind = ?').get(userJid, kind) as { expiresAt?: number } | undefined
  const expiresAt = Math.max(now(), Number(existing?.expiresAt ?? 0)) + durationMs
  db.prepare(`INSERT INTO rpg_buffs(user_jid, kind, expires_at, source_jid, created_at) VALUES(?, ?, ?, ?, ?)
    ON CONFLICT(user_jid, kind) DO UPDATE SET expires_at = excluded.expires_at, source_jid = excluded.source_jid, created_at = excluded.created_at`)
    .run(userJid, kind, expiresAt, sourceJid ?? null, now())
  return expiresAt
}

export const rpg = {
  profile(userJid: string) {
    ensure(userJid)
    const row = db.prepare('SELECT gems FROM rpg_users WHERE user_jid = ?').get(userJid) as { gems: number }
    const buffs = db.prepare('SELECT kind, expires_at AS expiresAt, source_jid AS sourceJid FROM rpg_buffs WHERE user_jid = ? AND expires_at > ? ORDER BY expires_at DESC')
      .all(userJid, now()) as Array<{ kind: string; expiresAt: number; sourceJid?: string | null }>
    return { gems: Number(row.gems), inventory: inventory(userJid), buffs }
  },

  hasBuff(userJid: string, kind: string) {
    ensure(userJid)
    const row = db.prepare('SELECT expires_at AS expiresAt FROM rpg_buffs WHERE user_jid = ? AND kind = ? AND expires_at > ?').get(userJid, kind, now()) as { expiresAt?: number } | undefined
    return Number(row?.expiresAt ?? 0) || null
  },

  buy(userJid: string, item: RpgItem, quantity = 1) {
    const cfg = RPG_ITEMS[item]
    if (!cfg) throw new Error('Ítem desconocido.')
    const qty = Math.max(1, Math.min(20, Math.floor(quantity)))
    const cost = cfg.price * qty
    changeWallet(userJid, -cost, 'rpg_purchase', `${item} x${qty}`)
    db.prepare(`INSERT INTO rpg_inventory(user_jid, item, quantity) VALUES(?, ?, ?)
      ON CONFLICT(user_jid, item) DO UPDATE SET quantity = quantity + excluded.quantity`).run(userJid, item, qty)
    return { item, quantity: qty, cost, balance: economy.balance(userJid) }
  },

  use(userJid: string, item: RpgItem, targetJid?: string) {
    consume(userJid, item)
    if (item === 'tiempo') {
      db.prepare('UPDATE economy_users SET last_work = 0 WHERE user_jid = ?').run(userJid)
      return { item, text: 'El cooldown de trabajo fue reiniciado.' }
    }
    if (item === 'deseo') {
      const reward = 400 + Math.floor(Math.random() * 2101)
      changeWallet(userJid, reward, 'rpg_wish', 'deseo')
      const gem = Math.random() < 0.35
      if (gem) db.prepare('UPDATE rpg_users SET gems = gems + 1, updated_at = ? WHERE user_jid = ?').run(now(), userJid)
      return { item, reward, gem, text: `El deseo concedió ${reward.toLocaleString('es-MX')} ${COIN_SYMBOL}${gem ? ' y 1 gema' : ''}.` }
    }
    if (item === 'fortuna') {
      const expiresAt = setBuff(userJid, 'fortune', 2 * 60 * 60_000, userJid)
      return { item, expiresAt, text: 'Fortuna activa: +25% en .work durante 2 horas.' }
    }
    if (item === 'sombras') {
      const expiresAt = setBuff(userJid, 'shadows', 2 * 60 * 60_000, userJid)
      return { item, expiresAt, text: 'Sombras activas: bonus en crímenes exitosos durante 2 horas.' }
    }
    if (item === 'escudo') {
      const expiresAt = setBuff(userJid, 'shield', 6 * 60 * 60_000, userJid)
      return { item, expiresAt, text: 'Escudo activo: intentos de robo bloqueados durante 6 horas.' }
    }
    if (item === 'renacer') {
      db.prepare('UPDATE economy_users SET last_work = 0, last_rob = 0 WHERE user_jid = ?').run(userJid)
      db.prepare('UPDATE economy_advanced_users SET last_crime = 0, last_slut = 0 WHERE user_jid = ?').run(userJid)
      return { item, text: 'Renacer completado: cooldowns principales reiniciados.' }
    }
    if (item === 'maldicion') {
      if (!targetJid || targetJid === userJid) throw new Error('Para usar maldición menciona a otro usuario.')
      const expiresAt = setBuff(targetJid, 'curse', 60 * 60_000, userJid)
      return { item, expiresAt, text: `Maldición aplicada a @${targetJid.split('@')[0]} durante 1 hora.`, targetJid }
    }
    throw new Error('Ítem no implementado.')
  },

  transferGems(fromJid: string, toJid: string, amount: number) {
    if (fromJid === toJid) throw new Error('No puedes transferirte gemas a ti mismo.')
    ensure(fromJid); ensure(toJid)
    const value = Math.floor(amount)
    if (value <= 0) throw new Error('Cantidad de gemas inválida.')
    const current = this.profile(fromJid).gems
    if (current < value) throw new Error('No tienes suficientes gemas.')
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare('UPDATE rpg_users SET gems = gems - ?, updated_at = ? WHERE user_jid = ?').run(value, now(), fromJid)
      db.prepare('UPDATE rpg_users SET gems = gems + ?, updated_at = ? WHERE user_jid = ?').run(value, now(), toJid)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    return { amount: value, from: this.profile(fromJid), to: this.profile(toJid) }
  },

  addGems(userJid: string, amount: number) {
    ensure(userJid)
    const value = Math.max(0, Math.floor(amount))
    db.prepare('UPDATE rpg_users SET gems = gems + ?, updated_at = ? WHERE user_jid = ?').run(value, now(), userJid)
    return this.profile(userJid)
  },

  adjustWallet(userJid: string, amount: number, kind: string, note?: string) {
    return changeWallet(userJid, amount, kind, note)
  },
}
