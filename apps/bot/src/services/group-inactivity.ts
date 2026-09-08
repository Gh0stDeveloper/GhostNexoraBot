import { jidNormalizedUser } from 'baileys'
import { economy } from './economy.js'
import { preferredJid, resolveStoredIdentity } from './identity.js'
import { digitsFromJid } from '../utils/message.js'

const db = economy.db
const DAY_MS = 86_400_000
const DEFAULT_GROUP_DAYS = 7
const DEFAULT_MIN_MESSAGES = 0

db.exec(`
  CREATE TABLE IF NOT EXISTS group_inactivity_settings (
    group_jid TEXT PRIMARY KEY,
    inactive_days INTEGER NOT NULL DEFAULT ${DEFAULT_GROUP_DAYS},
    min_messages INTEGER NOT NULL DEFAULT ${DEFAULT_MIN_MESSAGES},
    updated_at INTEGER NOT NULL
  );
`)

export type GroupParticipantLike = {
  id: string
  phoneNumber?: string | null
  lid?: string | null
  admin?: string | null
}

export type GroupInactiveReason = 'last_activity' | 'low_messages' | 'both'

export type GroupInactiveMember = {
  participantJid: string
  userJid: string
  messages: number
  commands: number
  lastActivityAt: number
  inactiveDays: number
  reason: GroupInactiveReason
}

export type GroupUnknownMember = {
  participantJid: string
  userJid: string
}

export type GroupInactivitySettings = {
  days: number
  minMessages: number
}

export type GroupInactivityReport = {
  days: number
  minMessages: number
  cutoffAt: number
  trackedSince: number
  totalParticipants: number
  activeCount: number
  protectedCount: number
  inactive: GroupInactiveMember[]
  unknown: GroupUnknownMember[]
}

type ActivityRow = {
  userJid: string
  messages: number
  commands: number
  lastActivityAt: number
}

type InactivityOptions = {
  protectedJids?: string[]
  protectedNumbers?: string[]
  minMessages?: number
  now?: number
}

function normalizeJid(value?: string | null) {
  if (!value) return ''
  try { return jidNormalizedUser(value) } catch { return value }
}

function sameUser(left?: string | null, right?: string | null) {
  const a = normalizeJid(left)
  const b = normalizeJid(right)
  if (a && b && a === b) return true
  const ad = digitsFromJid(a)
  const bd = digitsFromJid(b)
  return Boolean(ad && bd && ad === bd)
}

function participantCandidates(participant: GroupParticipantLike) {
  const raw = [participant.phoneNumber, participant.id, participant.lid]
    .filter((value): value is string => Boolean(value))
    .map(normalizeJid)
  const resolved = raw.map((jid) => normalizeJid(resolveStoredIdentity(jid)))
  return [...new Set([...raw, ...resolved].filter(Boolean))]
}

function canonicalParticipant(participant: GroupParticipantLike) {
  const preferred = preferredJid([participant.phoneNumber, participant.id, participant.lid])
  return normalizeJid(resolveStoredIdentity(preferred) || preferred || participant.id)
}

function activityForParticipant(participant: GroupParticipantLike, rows: ActivityRow[]) {
  const candidates = participantCandidates(participant)
  const digits = new Set(candidates.map(digitsFromJid).filter(Boolean))
  const matches = rows.filter((row) => {
    const normalized = normalizeJid(row.userJid)
    if (candidates.includes(normalized)) return true
    const number = digitsFromJid(normalized)
    return Boolean(number && digits.has(number))
  })
  if (!matches.length) return null
  return {
    messages: matches.reduce((sum, row) => sum + Number(row.messages || 0), 0),
    commands: matches.reduce((sum, row) => sum + Number(row.commands || 0), 0),
    lastActivityAt: Math.max(...matches.map((row) => Number(row.lastActivityAt || 0))),
  }
}

function isProtected(participant: GroupParticipantLike, options: InactivityOptions) {
  if (participant.admin) return true
  const candidates = participantCandidates(participant)
  for (const protectedJid of options.protectedJids ?? []) {
    if (candidates.some((candidate) => sameUser(candidate, protectedJid))) return true
  }
  const numbers = new Set((options.protectedNumbers ?? []).map((value) => value.replace(/\D/g, '')).filter(Boolean))
  if (!numbers.size) return false
  return candidates.some((candidate) => numbers.has(digitsFromJid(candidate)))
}

export function normalizeInactiveDays(value: unknown, fallback = 30) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback
  const match = String(value).trim().toLowerCase().match(/^(\d{1,4})(?:d|dias|días)?$/)
  if (!match?.[1]) throw new Error('Indica los días como un número entre 1 y 3650. Ejemplo: 7')
  const days = Number(match[1])
  if (!Number.isInteger(days) || days < 1 || days > 3650) throw new Error('Los días deben estar entre 1 y 3650.')
  return days
}

export function normalizeInactiveMessages(value: unknown, fallback = 0) {
  if (value === undefined || value === null || String(value).trim() === '') return fallback
  const clean = String(value).trim().toLowerCase().replace(/(?:msg|msgs|mensajes?)$/, '')
  if (!/^\d{1,7}$/.test(clean)) throw new Error('El mínimo de mensajes debe ser un número entre 0 y 1,000,000.')
  const messages = Number(clean)
  if (!Number.isInteger(messages) || messages < 0 || messages > 1_000_000) throw new Error('El mínimo de mensajes debe estar entre 0 y 1,000,000.')
  return messages
}

export function getGroupInactivitySettings(groupJid: string): GroupInactivitySettings {
  const row = db.prepare('SELECT inactive_days AS days, min_messages AS minMessages FROM group_inactivity_settings WHERE group_jid = ?')
    .get(groupJid) as { days?: number; minMessages?: number } | undefined
  return {
    days: normalizeInactiveDays(row?.days, DEFAULT_GROUP_DAYS),
    minMessages: normalizeInactiveMessages(row?.minMessages, DEFAULT_MIN_MESSAGES),
  }
}

export function setGroupInactivitySettings(groupJid: string, days: number, minMessages: number): GroupInactivitySettings {
  const normalizedDays = normalizeInactiveDays(days, DEFAULT_GROUP_DAYS)
  const normalizedMessages = normalizeInactiveMessages(minMessages, DEFAULT_MIN_MESSAGES)
  db.prepare(`INSERT INTO group_inactivity_settings(group_jid, inactive_days, min_messages, updated_at)
    VALUES(?, ?, ?, ?)
    ON CONFLICT(group_jid) DO UPDATE SET inactive_days = excluded.inactive_days, min_messages = excluded.min_messages, updated_at = excluded.updated_at`)
    .run(groupJid, normalizedDays, normalizedMessages, Date.now())
  return { days: normalizedDays, minMessages: normalizedMessages }
}

export function groupInactivityReport(
  groupJid: string,
  participants: GroupParticipantLike[],
  days = 30,
  options: InactivityOptions = {},
): GroupInactivityReport {
  const timestamp = options.now ?? Date.now()
  const minMessages = normalizeInactiveMessages(options.minMessages, 0)
  const cutoffAt = timestamp - days * DAY_MS
  const activityRows = db.prepare(`SELECT user_jid AS userJid, messages, commands, last_activity_at AS lastActivityAt
    FROM group_user_activity_v4 WHERE group_jid = ?`).all(groupJid) as ActivityRow[]
  const groupRow = db.prepare('SELECT first_seen_at AS firstSeenAt FROM group_activity_v4 WHERE group_jid = ?')
    .get(groupJid) as { firstSeenAt?: number } | undefined

  const inactive: GroupInactiveMember[] = []
  const unknown: GroupUnknownMember[] = []
  let activeCount = 0
  let protectedCount = 0

  for (const participant of participants) {
    const participantJid = normalizeJid(participant.id || participant.phoneNumber || participant.lid)
    if (!participantJid) continue
    const userJid = canonicalParticipant(participant) || participantJid

    if (isProtected(participant, options)) {
      protectedCount += 1
      continue
    }

    const activity = activityForParticipant(participant, activityRows)
    if (!activity?.lastActivityAt) {
      unknown.push({ participantJid, userJid })
      continue
    }

    const stale = activity.lastActivityAt <= cutoffAt
    // minMessages=0 significa "criterio desactivado". Cuando se configura 5 o 10,
    // un miembro con esa cantidad o menos también es elegible aunque haya escrito recientemente.
    const lowMessages = minMessages > 0 && activity.messages <= minMessages

    if (stale || lowMessages) {
      inactive.push({
        participantJid,
        userJid,
        messages: activity.messages,
        commands: activity.commands,
        lastActivityAt: activity.lastActivityAt,
        inactiveDays: Math.max(0, Math.floor((timestamp - activity.lastActivityAt) / DAY_MS)),
        reason: stale && lowMessages ? 'both' : stale ? 'last_activity' : 'low_messages',
      })
    } else {
      activeCount += 1
    }
  }

  inactive.sort((a, b) => {
    if (a.reason === 'both' && b.reason !== 'both') return -1
    if (b.reason === 'both' && a.reason !== 'both') return 1
    return a.lastActivityAt - b.lastActivityAt || a.userJid.localeCompare(b.userJid)
  })
  unknown.sort((a, b) => a.userJid.localeCompare(b.userJid))

  return {
    days,
    minMessages,
    cutoffAt,
    trackedSince: Number(groupRow?.firstSeenAt ?? 0),
    totalParticipants: participants.length,
    activeCount,
    protectedCount,
    inactive,
    unknown,
  }
}
