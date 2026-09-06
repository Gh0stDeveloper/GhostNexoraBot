import { economy, COIN_SYMBOL } from './economy.js'

const now = () => Date.now()

function instanceRole() {
  return process.env.NEXORA_INSTANCE_ROLE === 'subbot' ? 'subbot' : 'main'
}

function instanceId() {
  return Number(process.env.NEXORA_SUBBOT_ID || 0) || null
}

function localLedger(userJid: string, kind: string, amount: number, counterparty?: string, note?: string) {
  try {
    economy.db.prepare('INSERT INTO economy_ledger(user_jid, kind, amount, counterparty_jid, note, created_at) VALUES(?, ?, ?, ?, ?, ?)')
      .run(userJid, kind, amount, counterparty ?? null, note ?? null, now())
  } catch {
    // The global ledger is authoritative for wallet money. A legacy/local ledger
    // failure must not undo a transaction that already committed globally.
  }
}

function globalLedger(userJid: string, kind: string, amount: number, counterparty?: string, note?: string) {
  economy.walletDb.prepare(`INSERT INTO economy_global_ledger
    (user_jid, kind, amount, counterparty_jid, note, instance_role, instance_id, created_at)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(userJid, kind, amount, counterparty ?? null, note ?? null, instanceRole(), instanceId(), now())
}

function ensureGlobalUser(userJid: string) {
  // EconomyStore creates both the local profile row and the global wallet row.
  economy.balance(userJid)
}

export function atomicTransfer(fromJid: string, toJid: string, amount: number) {
  if (fromJid === toJid) throw new Error('No puedes transferirte a ti mismo.')
  const value = Math.floor(amount)
  if (!Number.isFinite(value) || value <= 0) throw new Error('La cantidad debe ser mayor a 0.')

  ensureGlobalUser(fromJid)
  ensureGlobalUser(toJid)
  const db = economy.walletDb

  db.exec('BEGIN IMMEDIATE')
  try {
    const sender = db.prepare('SELECT wallet FROM global_economy_users WHERE user_jid = ?').get(fromJid) as { wallet?: number } | undefined
    const available = Number(sender?.wallet ?? 0)
    if (available < value) throw new Error('No tienes suficientes Nexora Coins en la cartera.')

    const debit = db.prepare(`UPDATE global_economy_users
      SET wallet = wallet - ?, updated_at = ?
      WHERE user_jid = ? AND wallet >= ?`).run(value, now(), fromJid, value)
    if (Number(debit.changes) !== 1) throw new Error('El saldo cambió durante la transferencia. Inténtalo de nuevo.')

    db.prepare('UPDATE global_economy_users SET wallet = wallet + ?, updated_at = ? WHERE user_jid = ?')
      .run(value, now(), toJid)
    globalLedger(fromJid, 'transfer_out', -value, toJid)
    globalLedger(toJid, 'transfer_in', value, fromJid)
    db.exec('COMMIT')
  } catch (error) {
    try { db.exec('ROLLBACK') } catch {}
    throw error
  }

  localLedger(fromJid, 'transfer_out', -value, toJid)
  localLedger(toJid, 'transfer_in', value, fromJid)
  return economy.balance(fromJid)
}

export function atomicPurchase(
  userJid: string,
  price: number,
  kind: string,
  durationMs: number,
  metadata?: Record<string, unknown>,
) {
  const value = Math.floor(price)
  if (!Number.isFinite(value) || value <= 0) throw new Error('El precio del producto no es válido.')
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error('La duración del producto no es válida.')

  ensureGlobalUser(userJid)
  const db = economy.walletDb
  let walletUse = 0
  let bankUse = 0

  db.exec('BEGIN IMMEDIATE')
  try {
    const row = db.prepare('SELECT wallet, bank FROM global_economy_users WHERE user_jid = ?').get(userJid) as { wallet?: number; bank?: number } | undefined
    const wallet = Number(row?.wallet ?? 0)
    const bank = Number(row?.bank ?? 0)
    if (wallet + bank < value) throw new Error(`Necesitas ${value.toLocaleString()} ${COIN_SYMBOL}.`)

    walletUse = Math.min(wallet, value)
    bankUse = value - walletUse
    const debit = db.prepare(`UPDATE global_economy_users
      SET wallet = wallet - ?, bank = bank - ?, updated_at = ?
      WHERE user_jid = ? AND wallet >= ? AND bank >= ?`).run(walletUse, bankUse, now(), userJid, walletUse, bankUse)
    if (Number(debit.changes) !== 1) throw new Error('El saldo cambió durante la compra. Inténtalo de nuevo.')

    globalLedger(userJid, 'purchase', -value, undefined, kind)
    db.exec('COMMIT')
  } catch (error) {
    try { db.exec('ROLLBACK') } catch {}
    throw error
  }

  try {
    // In MainBot this writes the main control DB. In a subbot the entitlement
    // bridge redirects the same method to MainBot's control DB.
    const expiresAt = economy.grantEntitlement(userJid, kind, durationMs, metadata)
    localLedger(userJid, 'purchase', -value, undefined, kind)
    return { expiresAt, balance: economy.balance(userJid) }
  } catch (error) {
    // Never charge a user for a grant that could not be persisted.
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare('UPDATE global_economy_users SET wallet = wallet + ?, bank = bank + ?, updated_at = ? WHERE user_jid = ?')
        .run(walletUse, bankUse, now(), userJid)
      globalLedger(userJid, 'purchase_refund', value, undefined, `failed_entitlement:${kind}`)
      db.exec('COMMIT')
    } catch (refundError) {
      try { db.exec('ROLLBACK') } catch {}
      throw new Error(`La compra no pudo registrar el acceso y el reembolso automático falló: ${refundError instanceof Error ? refundError.message : String(refundError)}`)
    }
    throw error
  }
}

export function installAtomicWalletBridge() {
  economy.transfer = atomicTransfer as typeof economy.transfer
  economy.purchase = atomicPurchase as typeof economy.purchase
  return true
}
