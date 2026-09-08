import { DatabaseSync } from 'node:sqlite'
import { economy } from './economy.js'

const sharedControlFile = process.env.NEXORA_GLOBAL_CONTROL_DB || economy.file

export const opsDb = sharedControlFile === economy.file
  ? economy.db
  : new DatabaseSync(sharedControlFile)

if (sharedControlFile !== economy.file) {
  opsDb.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
}

export function opsInstanceKey() {
  const subbotId = Number(process.env.NEXORA_SUBBOT_ID ?? 0)
  return Number.isInteger(subbotId) && subbotId > 0 ? `subbot:${subbotId}` : 'main'
}

export function normalizeOpsInstanceKey(value?: string | null) {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw || raw === 'main' || raw === 'mainbot') return 'main'
  const match = /^subbot:(\d+)$/.exec(raw)
  if (!match?.[1]) throw new Error('Instancia inválida.')
  return `subbot:${Number(match[1])}`
}
