import type { WASocket } from 'baileys'
import { subbotManager } from '../core/subbots.js'
import { economy } from './economy.js'

const PERMANENT_MS = 100 * 365 * 86_400_000
const now = () => Date.now()

function normalizeUserJid(value: unknown) {
  const raw = String(value ?? '').trim()
  if (raw.endsWith('@s.whatsapp.net')) return raw
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 8 || digits.length > 20) throw new Error('Número de WhatsApp inválido.')
  return `${digits}@s.whatsapp.net`
}

function positiveInt(value: unknown, label: string, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Math.trunc(Number(value))
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > max) throw new Error(`${label} inválido.`)
  return parsed
}

function addNxc(userJid: string, amount: number) {
  economy.balance(userJid)
  economy.db.exec('BEGIN IMMEDIATE')
  try {
    economy.db.prepare('UPDATE economy_users SET wallet = wallet + ? WHERE user_jid = ?').run(amount, userJid)
    economy.db.prepare('INSERT INTO economy_ledger(user_jid, kind, amount, note, created_at) VALUES(?, ?, ?, ?, ?)')
      .run(userJid, 'admin_grant', amount, 'Web admin grant', now())
    economy.db.exec('COMMIT')
  } catch (error) {
    economy.db.exec('ROLLBACK')
    throw error
  }
  try {
    economy.walletDb.prepare(`INSERT INTO economy_global_ledger(
      user_jid, kind, amount, note, instance_role, instance_id, created_at
    ) VALUES(?, ?, ?, ?, 'main', NULL, ?)`).run(userJid, 'admin_grant', amount, 'Web admin grant', now())
  } catch {}
  return economy.balance(userJid)
}

function grantSubbot(userJid: string, body: Record<string, unknown>) {
  const permanent = String(body.duration ?? '').toLowerCase() === 'permanent'
  const durationMs = permanent
    ? PERMANENT_MS
    : positiveInt(body.durationMs ?? 7 * 86_400_000, 'Duración', PERMANENT_MS)
  const expiresAt = economy.grantEntitlement(userJid, 'subbot_slot', durationMs, {
    source: 'web-admin',
    permanent,
  })
  const active = economy.getActiveSubbot(userJid)
  let id: number
  if (active) {
    economy.db.prepare('UPDATE subbots SET expires_at = ? WHERE id = ?').run(expiresAt, active.id)
    id = active.id
  } else {
    id = economy.createSubbot(userJid, expiresAt)
  }
  return { id, expiresAt, permanent }
}

async function resetSubbot(body: Record<string, unknown>, ownOnly: boolean) {
  const id = positiveInt(body.id, 'ID de subbot', 2_147_483_647)
  const record = economy.listSubbots().find((item) => item.id === id)
  if (!record) throw new Error('La instancia de subbot no existe.')
  if (ownOnly) {
    const userJid = normalizeUserJid(body.userJid)
    if (record.ownerJid !== userJid) throw new Error('La instancia no pertenece a este usuario.')
  }
  await subbotManager.resetById(id)
  return { id }
}

async function broadcast(socket: WASocket | null, body: Record<string, unknown>) {
  if (!socket || !socket.authState.creds.registered) throw new Error('MainBot no está conectado a WhatsApp.')
  const message = String(body.message ?? '').trim()
  if (!message || message.length > 5000) throw new Error('El anuncio debe contener entre 1 y 5000 caracteres.')
  const participating = await socket.groupFetchAllParticipating()
  const groups = Object.keys(participating).filter((jid) => jid.endsWith('@g.us'))
  let sent = 0
  let failed = 0
  for (const groupJid of groups) {
    try {
      await socket.sendMessage(groupJid, { text: message })
      sent += 1
    } catch {
      failed += 1
    }
    if (groups.length > 1) await new Promise((resolve) => setTimeout(resolve, 120))
  }
  return { total: groups.length, sent, failed }
}

export async function executeAdminWebControl(body: Record<string, unknown>, mainSocket: WASocket | null) {
  const action = String(body.action ?? '')
  if (action === 'economy-sync') {
    return { ok: true, result: { top: economy.top(10) } }
  }
  if (action === 'add_nxc') {
    const userJid = normalizeUserJid(body.userJid)
    const amount = positiveInt(body.amount, 'Cantidad', 1_000_000_000)
    return { ok: true, result: { userJid, amount, balance: addNxc(userJid, amount) } }
  }
  if (action === 'grant_subbot') {
    const userJid = normalizeUserJid(body.userJid)
    return { ok: true, result: { userJid, ...grantSubbot(userJid, body) } }
  }
  if (action === 'reset_subbot') {
    return { ok: true, result: await resetSubbot(body, false) }
  }
  if (action === 'reset_own_subbot') {
    return { ok: true, result: await resetSubbot(body, true) }
  }
  if (action === 'broadcast') {
    return { ok: true, result: await broadcast(mainSocket, body) }
  }
  return { ok: false, error: 'unknown_action' }
}
