import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { execa } from 'execa'
import { config } from '../config.js'
import { economy } from './economy.js'

const db = economy.db
const root = path.join(config.dataDir, 'adult-reaction-media')
const MAX_PER_COMMAND = 25
const MAX_IMPORT_BYTES = 12 * 1024 * 1024
const allowedCommands = new Set([
  'fuck', 'preñar', 'prenar', 'cum', 'room', 'finishrp',
  'dick', 'pene', 'cock',
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

const commandAliases: Record<string, string[]> = {
  fuck: ['fuck', 'room'],
  'preñar': ['preñar', 'prenar'],
  cum: ['cum', 'finishrp'],
  dick: ['dick', 'pene', 'cock'],
}

export function canonicalAdultMediaCommand(value: string) {
  const clean = cleanCommand(value)
  for (const [canonical, aliases] of Object.entries(commandAliases)) {
    if (aliases.includes(clean)) return canonical
  }
  return clean
}

export function equivalentAdultMediaCommands(value: string) {
  const clean = cleanCommand(value)
  const canonical = canonicalAdultMediaCommand(clean)
  return commandAliases[canonical] ? [...commandAliases[canonical]!] : [clean]
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
  const requested = cleanCommand(command)
  const target = canonicalAdultMediaCommand(requested)
  if (!adultMediaCommandAllowed(requested)) {
    throw new Error('Comando no permitido para medios de reacción. Usa uno de: ' + [...allowedCommands].join(', '))
  }
  if (data.length > MAX_IMPORT_BYTES) {
    throw new Error('El archivo supera el límite de ' + (MAX_IMPORT_BYTES / 1024 / 1024).toFixed(0) + ' MB por medio.')
  }
  if (prohibitedMedia.test(label || '')) {
    throw new Error('Etiqueta bloqueada por el filtro de seguridad.')
  }

  const count = Number(
    (db.prepare('SELECT COUNT(*) as count FROM adult_reaction_media WHERE command_name = ?').get(target) as { count: number }).count,
  )
  if (count >= MAX_PER_COMMAND) {
    throw new Error('Ese comando ya tiene ' + MAX_PER_COMMAND + ' medios. Elimina uno antes de añadir otro.')
  }

  await mkdir(root, { recursive: true })
  const id = Number((db.prepare('SELECT COALESCE(MAX(id),0)+1 as id FROM adult_reaction_media').get() as { id: number }).id)
  const ext = /gif/i.test(mimeType) ? 'gif' : /webm/i.test(mimeType) ? 'webm' : /png|jpe?g|webp/i.test(mimeType) ? 'img' : 'mp4'
  const filePath = path.join(root, target + '-' + id + '.' + (ext === 'img' ? 'bin' : ext))
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
  const requested = cleanCommand(command)
  const target = canonicalAdultMediaCommand(requested)
  if (!adultMediaCommandAllowed(requested)) {
    throw new Error('Comando no permitido. Usa uno de: ' + [...allowedCommands].join(', '))
  }
  if (prohibitedMedia.test(url)) {
    throw new Error('URL bloqueada por el filtro de seguridad.')
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('URL inválida: ' + url)
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
  if (!response.ok) throw new Error('No se pudo descargar (' + response.status + '): ' + url)

  const mime = (response.headers.get('content-type') || '').split(';')[0]?.trim() || 'application/octet-stream'
  if (!/^(image\/(gif|png|jpe?g|webp)|video\/(mp4|webm|gif)|application\/octet-stream)/i.test(mime)) {
    throw new Error('Tipo no permitido (' + mime + '). Usa GIF, MP4, WEBM o imagen.')
  }

  const declared = Number(response.headers.get('content-length') ?? 0)
  if (declared > MAX_IMPORT_BYTES) {
    throw new Error('El archivo remoto supera ' + (MAX_IMPORT_BYTES / 1024 / 1024).toFixed(0) + ' MB.')
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length < 32) throw new Error('Archivo remoto vacío o demasiado pequeño.')
  if (buffer.length > MAX_IMPORT_BYTES) {
    throw new Error('El archivo supera ' + (MAX_IMPORT_BYTES / 1024 / 1024).toFixed(0) + ' MB.')
  }

  const label = parsed.pathname.split('/').pop()?.slice(0, 60) || 'import'
  return addAdultReactionMedia(target, buffer, mime, createdBy, label)
}

export function listAdultReactionMedia(command?: string) {
  if (command) {
    const pools = equivalentAdultMediaCommands(command)
    const placeholders = pools.map(() => '?').join(',')
    return db
      .prepare(
        `SELECT id,command_name as command,label,mime_type as mimeType,created_by as createdBy FROM adult_reaction_media WHERE command_name IN (${placeholders}) ORDER BY command_name,id`,
      )
      .all(...pools)
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
  const pools = equivalentAdultMediaCommands(command)
  const placeholders = pools.map(() => '?').join(',')
  const rows = db
    .prepare(`SELECT id,file_path as filePath FROM adult_reaction_media WHERE command_name IN (${placeholders})`)
    .all(...pools) as Array<{ id: number; filePath: string }>
  db.prepare(`DELETE FROM adult_reaction_media WHERE command_name IN (${placeholders})`).run(...pools)
  return Promise.all(rows.map((row) => rm(row.filePath, { force: true }).catch(() => undefined)))
}

export async function normalizeAdultReactionMediaForWhatsapp(data: Buffer, mimeType: string) {
  if (!/^(image\/gif|video\/(gif|webm))$/i.test(mimeType)) {
    return { data, mimeType }
  }

  const { stdout } = await execa('ffmpeg', [
    '-hide_banner', '-loglevel', 'error',
    '-i', 'pipe:0',
    '-vf', "scale='min(480,iw)':-2:flags=lanczos,fps=15",
    '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-movflags', 'frag_keyframe+empty_moov',
    '-f', 'mp4', 'pipe:1',
  ], {
    input: data,
    encoding: 'buffer',
    timeout: 45_000,
    maxBuffer: 25 * 1024 * 1024,
  })

  return { data: Buffer.from(stdout), mimeType: 'video/mp4' }
}

/** Prefer every equivalent command pool, then global/hentai shared pools. */
export async function pickAdultReactionMedia(command: string) {
  const target = cleanCommand(command)
  const canonical = canonicalAdultMediaCommand(target)
  const pools = equivalentAdultMediaCommands(canonical)
  if (canonical !== 'global' && canonical !== 'hentai') pools.push('global', 'hentai')

  const seen = new Set<string>()
  for (const pool of pools) {
    if (seen.has(pool)) continue
    seen.add(pool)
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
