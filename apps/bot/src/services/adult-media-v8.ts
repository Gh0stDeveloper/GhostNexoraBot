import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { config } from '../config.js'
import { economy } from './economy.js'

const db = economy.db
const root = path.join(config.dataDir, 'adult-reaction-media')
const MAX_PER_COMMAND = 25
const MAX_IMPORT_BYTES = 12 * 1024 * 1024
const allowedCommands = new Set([
  'fuck', 'preñar', 'prenar', 'cum', 'room', 'finishrp',
  'flirt', 'tease', 'seduce', 'kiss18', 'cuddle18',
  'global', 'hentai',
])

const prohibitedMedia = /\b(child|children|underage|minor|preteen|pre-teen|niñ[oa]s?|menor(?:es)?)\b/i

db.exec(`CREATE TABLE IF NOT EXISTS adult_reaction_media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  command_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  label TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
); CREATE INDEX IF NOT EXISTS idx_adult_media_command ON adult_reaction_media(command_name, id);`)

function cleanCommand(value: string) {
  return value.trim().toLowerCase().replace(/^\./, '')
}

export function adultMediaCommandAllowed(value: string) {
  return allowedCommands.has(cleanCommand(value))
}

export function listAllowedAdultMediaCommands() {
  return [...allowedCommands].sort()
}

export async function addAdultReactionMedia(
  command: string,
  data: Buffer,
  mimeType: string,
  createdBy: string,
  label?: string,
) {
  const target = cleanCommand(command)
  if (!adultMediaCommandAllowed(target)) {
    throw new Error(`Comando no permitido para medios de reacción. Usa uno de: ${[...allowedCommands].join(', ')}`)
  }
  if (data.length > MAX_IMPORT_BYTES) {
    throw new Error(`El archivo supera el límite de ${(MAX_IMPORT_BYTES / 1024 / 1024).toFixed(0)} MB por medio.`)
  }
  if (prohibitedMedia.test(label || '')) {
    throw new Error('Etiqueta bloqueada por el filtro de seguridad.')
  }

  const count = Number(
    (db.prepare('SELECT COUNT(*) as count FROM adult_reaction_media WHERE command_name = ?').get(target) as { count: number }).count,
  )
  if (count >= MAX_PER_COMMAND) {
    throw new Error(`Ese comando ya tiene ${MAX_PER_COMMAND} medios. Elimina uno antes de añadir otro.`)
  }

  await mkdir(root, { recursive: true })
  const id = Number((db.prepare('SELECT COALESCE(MAX(id),0)+1 as id FROM adult_reaction_media').get() as { id: number }).id)
  const ext = /gif/i.test(mimeType) ? 'gif' : /webm/i.test(mimeType) ? 'webm' : /png|jpe?g|webp/i.test(mimeType) ? 'img' : 'mp4'
  const filePath = path.join(root, `${target}-${id}.${ext === 'img' ? 'bin' : ext}`)
  await writeFile(filePath, data, { mode: 0o600 })
  db.prepare(
    'INSERT INTO adult_reaction_media(command_name,file_path,mime_type,label,created_by,created_at) VALUES(?,?,?,?,?,?)',
  ).run(target, filePath, mimeType || 'video/mp4', label?.slice(0, 80) || null, createdBy, Date.now())
  return { id, command: target, count: count + 1 }
}

export async function importAdultReactionMediaFromUrl(
  command: string,
  url: string,
  createdBy: string,
) {
  const target = cleanCommand(command)
  if (!adultMediaCommandAllowed(target)) {
    throw new Error(`Comando no permitido. Usa uno de: ${[...allowedCommands].join(', ')}`)
  }
  if (prohibitedMedia.test(url)) {
    throw new Error('URL bloqueada por el filtro de seguridad.')
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`URL inválida: ${url}`)
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Solo se permiten URLs HTTP/HTTPS.')
  }

  const response = await fetch(parsed.toString(), {
    redirect: 'follow',
    headers: {
      'user-agent': 'GhostNexoraBot/1.3',
      accept: 'image/*,video/*,*/*',
    },
    signal: AbortSignal.timeout(45_000),
  })
  if (!response.ok) throw new Error(`No se pudo descargar (${response.status}): ${url}`)

  const mime = (response.headers.get('content-type') || '').split(';')[0]?.trim() || 'application/octet-stream'
  if (!/^(image\/(gif|png|jpe?g|webp)|video\/(mp4|webm|gif)|application\/octet-stream)/i.test(mime)) {
    throw new Error(`Tipo no permitido (${mime}). Usa GIF, MP4, WEBM o imagen.`)
  }

  const declared = Number(response.headers.get('content-length') ?? 0)
  if (declared > MAX_IMPORT_BYTES) {
    throw new Error(`El archivo remoto supera ${(MAX_IMPORT_BYTES / 1024 / 1024).toFixed(0)} MB.`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length < 32) throw new Error('Archivo remoto vacío o demasiado pequeño.')
  if (buffer.length > MAX_IMPORT_BYTES) {
    throw new Error(`El archivo supera ${(MAX_IMPORT_BYTES / 1024 / 1024).toFixed(0)} MB.`)
  }

  const label = parsed.pathname.split('/').pop()?.slice(0, 60) || 'import'
  return addAdultReactionMedia(target, buffer, mime, createdBy, label)
}

export function listAdultReactionMedia(command?: string) {
  if (command) {
    return db
      .prepare(
        'SELECT id,command_name as command,label,mime_type as mimeType,created_by as createdBy FROM adult_reaction_media WHERE command_name = ? ORDER BY id',
      )
      .all(cleanCommand(command))
  }
  return db
    .prepare(
      'SELECT id,command_name as command,label,mime_type as mimeType,created_by as createdBy FROM adult_reaction_media ORDER BY command_name,id',
    )
    .all()
}

export async function removeAdultReactionMedia(id: number) {
  const row = db.prepare('SELECT file_path as filePath FROM adult_reaction_media WHERE id = ?').get(id) as
    | { filePath?: string }
    | undefined
  if (!row) throw new Error('Medio de reacción no encontrado.')
  db.prepare('DELETE FROM adult_reaction_media WHERE id = ?').run(id)
  if (row.filePath) await rm(row.filePath, { force: true }).catch(() => undefined)
}

export function clearAdultReactionMedia(command: string) {
  const target = cleanCommand(command)
  const rows = db
    .prepare('SELECT id,file_path as filePath FROM adult_reaction_media WHERE command_name = ?')
    .all(target) as Array<{ id: number; filePath: string }>
  db.prepare('DELETE FROM adult_reaction_media WHERE command_name = ?').run(target)
  return Promise.all(rows.map((row) => rm(row.filePath, { force: true }).catch(() => undefined)))
}

/** Prefer command-specific pool, then global/hentai shared pool. */
export async function pickAdultReactionMedia(command: string) {
  const target = cleanCommand(command)
  const pools = [target]
  if (target !== 'global' && target !== 'hentai') pools.push('global', 'hentai')

  for (const pool of pools) {
    const rows = db
      .prepare(
        'SELECT id,file_path as filePath,mime_type as mimeType,label FROM adult_reaction_media WHERE command_name = ? ORDER BY id',
      )
      .all(pool) as Array<{ id: number; filePath: string; mimeType: string; label?: string | null }>
    if (!rows.length) continue
    const row = rows[Math.floor(Math.random() * rows.length)]!
    try {
      const data = await readFile(row.filePath)
      return { ...row, data, pool }
    } catch {
      continue
    }
  }
  return null
}
