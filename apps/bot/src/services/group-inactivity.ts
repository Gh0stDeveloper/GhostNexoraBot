import { jidNormalizedUser } from 'baileys'
import { economy } from './economy.js'
import { preferredJid, resolveStoredIdentity } from './identity.js'
import { digitsFromJid } from '../utils/message.js'

const db = economy.db
const DAY_MS = 86_400_000

export type GroupParticipantLike = {
  id: string
  phoneNumber?: string | null
  lid?: string | null
  admin?: string | null
}

export type GroupInactiveMember = {
  participantJid: string
  userJid: string
  messages: number
  commands: number
  lastActivityAt: number
  inactiveDays: number
}

export type GroupUnknownMember = {
  participantJid: string
  userJid: string
}

export type GroupInactivityReport = {
  days: number
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
  if (!match?.[1]) throw new Error('Indica los días como un número entre 1 y 3650. Ejemplo: 30')
  const days = Number(match[1])
  if (!Number.isInteger(days) || days < 1 || days > 3650) throw new Error('Los días deben estar entre 1 y 3650.')
  return days
}

export function groupInactivityReport(
  groupJid: string,
  participants: GroupParticipantLike[],
  days = 30,
  options: InactivityOptions = {},
): GroupInactivityReport {
  const timestamp = options.now ?? Date.now()
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

    if (activity.lastActivityAt <= cutoffAt) {
      inactive.push({
        participantJid,
        userJid,
        messages: activity.messages,
        commands: activity.commands,
        lastActivityAt: activity.lastActivityAt,
        inactiveDays: Math.max(0, Math.floor((timestamp - activity.lastActivityAt) / DAY_MS)),
      })
    } else {
      activeCount += 1
    }
  }

  inactive.sort((a, b) => a.lastActivityAt - b.lastActivityAt || a.userJid.localeCompare(b.userJid))
  unknown.sort((a, b) => a.userJid.localeCompare(b.userJid))

  return {
    days,
    cutoffAt,
    trackedSince: Number(groupRow?.firstSeenAt ?? 0),
    totalParticipants: participants.length,
    activeCount,
    protectedCount,
    inactive,
    unknown,
  }
}
