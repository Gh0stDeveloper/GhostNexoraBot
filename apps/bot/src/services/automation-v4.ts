import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import type { WASocket } from 'baileys'
import { economy } from './economy.js'
import { logger } from '../utils/logger.js'

const db = economy.db
const now = () => Date.now()

db.exec(`
  CREATE TABLE IF NOT EXISTS scheduled_announcements_v4 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_jid TEXT NOT NULL,
    created_by TEXT NOT NULL,
    message TEXT NOT NULL,
    interval_ms INTEGER NOT NULL,
    next_run_at INTEGER NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_announcements_due_v4 ON scheduled_announcements_v4(enabled, next_run_at);
  CREATE TABLE IF NOT EXISTS rss_feeds_v4 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_jid TEXT NOT NULL,
    created_by TEXT NOT NULL,
    url TEXT NOT NULL,
    label TEXT,
    last_guid TEXT,
    next_check_at INTEGER NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    UNIQUE(group_jid, url)
  );
  CREATE INDEX IF NOT EXISTS idx_rss_due_v4 ON rss_feeds_v4(enabled, next_check_at);
  CREATE TABLE IF NOT EXISTS support_tickets_v4 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_jid TEXT NOT NULL,
    chat_jid TEXT NOT NULL,
    subject TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    closed_by TEXT
  );
  CREATE TABLE IF NOT EXISTS support_ticket_messages_v4 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL,
    sender_jid TEXT NOT NULL,
    sender_role TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(ticket_id) REFERENCES support_tickets_v4(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_ticket_messages_v4 ON support_ticket_messages_v4(ticket_id, created_at);
  CREATE TABLE IF NOT EXISTS polls_v4 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_jid TEXT NOT NULL,
    created_by TEXT NOT NULL,
    message_id TEXT,
    question TEXT NOT NULL,
    options_json TEXT NOT NULL,
    selectable_count INTEGER NOT NULL DEFAULT 1,
    closes_at INTEGER,
    created_at INTEGER NOT NULL
  );
`)

export function parseDuration(input: string, minMs = 60_000, maxMs = 30 * 86400_000) {
  const match = input.trim().toLowerCase().match(/^(\d+)(m|h|d)$/)
  if (!match) throw new Error('Duración inválida. Usa por ejemplo 30m, 2h o 1d.')
  const value = Number(match[1])
  const unit = match[2]
  const ms = value * (unit === 'm' ? 60_000 : unit === 'h' ? 3600_000 : 86400_000)
  if (ms < minMs || ms > maxMs) throw new Error('La duración está fuera del rango permitido.')
  return ms
}

export function formatDuration(ms: number) {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(ms / 3600_000)
  if (hours < 48) return `${hours}h`
  return `${Math.round(ms / 86400_000)}d`
}

export function addAnnouncement(groupJid: string, createdBy: string, message: string, intervalMs: number) {
  const text = message.trim().slice(0, 3500)
  if (!text) throw new Error('El anuncio no puede estar vacío.')
  if (intervalMs < 5 * 60_000) throw new Error('El intervalo mínimo es 5 minutos.')
  const result = db.prepare('INSERT INTO scheduled_announcements_v4(group_jid, created_by, message, interval_ms, next_run_at, created_at) VALUES(?, ?, ?, ?, ?, ?)')
    .run(groupJid, createdBy, text, intervalMs, now() + intervalMs, now())
  return Number(result.lastInsertRowid)
}

export function listAnnouncements(groupJid: string) {
  return db.prepare(`SELECT id, message, interval_ms as intervalMs, next_run_at as nextRunAt, enabled, created_by as createdBy
    FROM scheduled_announcements_v4 WHERE group_jid = ? ORDER BY id DESC`).all(groupJid) as Array<{ id: number; message: string; intervalMs: number; nextRunAt: number; enabled: number; createdBy: string }>
}

export function removeAnnouncement(groupJid: string, id: number) {
  const result = db.prepare('DELETE FROM scheduled_announcements_v4 WHERE id = ? AND group_jid = ?').run(id, groupJid)
  if (Number(result.changes) !== 1) throw new Error('Anuncio programado no encontrado.')
}

function isPrivateIpv4(ip: string) {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4) return true
  const [a, b] = parts
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224
}

function isPrivateIp(ip: string) {
  if (isIP(ip) === 4) return isPrivateIpv4(ip)
  const lower = ip.toLowerCase()
  return lower === '::1' || lower === '::' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80:') || lower.startsWith('::ffff:127.') || lower.startsWith('::ffff:10.') || lower.startsWith('::ffff:192.168.')
}

async function assertPublicUrl(value: string) {
  let url: URL
  try { url = new URL(value) } catch { throw new Error('URL inválida.') }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Solo se aceptan feeds HTTP/HTTPS.')
  if (url.username || url.password) throw new Error('No se permiten credenciales embebidas en la URL.')
  const host = url.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) throw new Error('Host privado no permitido.')
  const records = await lookup(host, { all: true, verbatim: true })
  if (!records.length || records.some((record) => isPrivateIp(record.address))) throw new Error('El feed apunta a una red privada/no permitida.')
  return url
}

async function safeFetch(urlValue: string, redirects = 0): Promise<Response> {
  if (redirects > 3) throw new Error('Demasiadas redirecciones en el feed RSS.')
  const url = await assertPublicUrl(urlValue)
  const response = await fetch(url, {
    headers: { accept: 'application/rss+xml,application/atom+xml,text/xml,application/xml,*/*;q=0.5', 'user-agent': 'GhostNexoraBot-RSS/4.0' },
    redirect: 'manual',
    signal: AbortSignal.timeout(20_000),
  })
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get('location')
    if (!location) throw new Error('Redirección RSS sin destino.')
    return safeFetch(new URL(location, url).toString(), redirects + 1)
  }
  if (!response.ok) throw new Error(`Feed RSS respondió HTTP ${response.status}.`)
  const contentLength = Number(response.headers.get('content-length') ?? 0)
  if (contentLength > 2 * 1024 * 1024) throw new Error('El feed RSS excede 2 MB.')
  return response
}

function xmlDecode(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, '').trim()
}

function tag(block: string, names: string[]) {
  for (const name of names) {
    const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'))
    if (match?.[1]) return xmlDecode(match[1])
  }
  return ''
}

function entryLink(block: string) {
  const atom = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i)?.[1]
  return atom ? xmlDecode(atom) : tag(block, ['link'])
}

function parseFeed(xml: string) {
  const blocks = [...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((match) => match[2] ?? '')
  return blocks.slice(0, 20).map((block) => {
    const title = tag(block, ['title']) || 'Sin título'
    const link = entryLink(block)
    const guid = tag(block, ['guid', 'id']) || link || `${title}:${tag(block, ['pubDate', 'updated', 'published'])}`
    const published = tag(block, ['pubDate', 'updated', 'published'])
    return { guid: guid.slice(0, 500), title: title.slice(0, 300), link: link.slice(0, 1000), published: published.slice(0, 120) }
  }).filter((item) => item.guid)
}

export async function addRssFeed(groupJid: string, createdBy: string, url: string, label?: string) {
  const normalized = (await assertPublicUrl(url)).toString()
  const response = await safeFetch(normalized)
  const xml = await response.text()
  const items = parseFeed(xml)
  if (!items.length) throw new Error('No pude detectar entradas RSS/Atom en esa URL.')
  const result = db.prepare(`INSERT INTO rss_feeds_v4(group_jid, created_by, url, label, last_guid, next_check_at, created_at)
    VALUES(?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(group_jid, url) DO UPDATE SET label = excluded.label, enabled = 1, last_guid = excluded.last_guid, next_check_at = excluded.next_check_at`)
    .run(groupJid, createdBy, normalized, label?.trim().slice(0, 80) || null, items[0]!.guid, now() + 10 * 60_000, now())
  return Number(result.lastInsertRowid || 0)
}

export function listRssFeeds(groupJid: string) {
  return db.prepare('SELECT id, url, label, last_guid as lastGuid, next_check_at as nextCheckAt, enabled FROM rss_feeds_v4 WHERE group_jid = ? ORDER BY id DESC').all(groupJid) as Array<{ id: number; url: string; label?: string; lastGuid?: string; nextCheckAt: number; enabled: number }>
}

export function removeRssFeed(groupJid: string, id: number) {
  const result = db.prepare('DELETE FROM rss_feeds_v4 WHERE id = ? AND group_jid = ?').run(id, groupJid)
  if (Number(result.changes) !== 1) throw new Error('Feed RSS no encontrado.')
}

export function openTicket(userJid: string, chatJid: string, subject: string, message: string) {
  const subjectText = subject.trim().slice(0, 120)
  const body = message.trim().slice(0, 4000)
  if (!subjectText || !body) throw new Error('El ticket necesita asunto y mensaje.')
  const open = db.prepare("SELECT COUNT(*) as count FROM support_tickets_v4 WHERE user_jid = ? AND status = 'open'").get(userJid) as { count: number }
  if (Number(open.count) >= 3) throw new Error('Tienes 3 tickets abiertos. Cierra uno antes de crear otro.')
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = db.prepare('INSERT INTO support_tickets_v4(user_jid, chat_jid, subject, created_at, updated_at) VALUES(?, ?, ?, ?, ?)')
      .run(userJid, chatJid, subjectText, now(), now())
    const id = Number(result.lastInsertRowid)
    db.prepare('INSERT INTO support_ticket_messages_v4(ticket_id, sender_jid, sender_role, message, created_at) VALUES(?, ?, ?, ?, ?)')
      .run(id, userJid, 'user', body, now())
    db.exec('COMMIT')
    return id
  } catch (error) { db.exec('ROLLBACK'); throw error }
}

export function ticket(id: number) {
  const header = db.prepare(`SELECT id, user_jid as userJid, chat_jid as chatJid, subject, status, created_at as createdAt, updated_at as updatedAt, closed_by as closedBy
    FROM support_tickets_v4 WHERE id = ?`).get(id) as { id: number; userJid: string; chatJid: string; subject: string; status: string; createdAt: number; updatedAt: number; closedBy?: string } | undefined
  if (!header) return null
  const messages = db.prepare('SELECT sender_jid as senderJid, sender_role as senderRole, message, created_at as createdAt FROM support_ticket_messages_v4 WHERE ticket_id = ? ORDER BY id ASC').all(id) as Array<{ senderJid: string; senderRole: string; message: string; createdAt: number }>
  return { ...header, messages }
}

export function listTickets(userJid?: string, status?: string, limit = 25) {
  if (userJid) return db.prepare(`SELECT id, subject, status, created_at as createdAt, updated_at as updatedAt FROM support_tickets_v4
    WHERE user_jid = ? ORDER BY updated_at DESC LIMIT ?`).all(userJid, Math.max(1, Math.min(50, limit)))
  if (status) return db.prepare(`SELECT id, user_jid as userJid, chat_jid as chatJid, subject, status, created_at as createdAt, updated_at as updatedAt
    FROM support_tickets_v4 WHERE status = ? ORDER BY updated_at DESC LIMIT ?`).all(status, Math.max(1, Math.min(100, limit)))
  return db.prepare(`SELECT id, user_jid as userJid, chat_jid as chatJid, subject, status, created_at as createdAt, updated_at as updatedAt
    FROM support_tickets_v4 ORDER BY updated_at DESC LIMIT ?`).all(Math.max(1, Math.min(100, limit)))
}

export function replyTicket(id: number, senderJid: string, role: 'user' | 'staff', message: string) {
  const current = ticket(id)
  if (!current) throw new Error('Ticket no encontrado.')
  if (current.status !== 'open') throw new Error('El ticket está cerrado.')
  const body = message.trim().slice(0, 4000)
  if (!body) throw new Error('La respuesta no puede estar vacía.')
  db.prepare('INSERT INTO support_ticket_messages_v4(ticket_id, sender_jid, sender_role, message, created_at) VALUES(?, ?, ?, ?, ?)').run(id, senderJid, role, body, now())
  db.prepare('UPDATE support_tickets_v4 SET updated_at = ? WHERE id = ?').run(now(), id)
  return ticket(id)!
}

export function closeTicket(id: number, actorJid: string, canCloseAny = false) {
  const current = ticket(id)
  if (!current) throw new Error('Ticket no encontrado.')
  if (!canCloseAny && current.userJid !== actorJid) throw new Error('No puedes cerrar ese ticket.')
  if (current.status === 'closed') return current
  db.prepare("UPDATE support_tickets_v4 SET status = 'closed', updated_at = ?, closed_by = ? WHERE id = ?").run(now(), actorJid, id)
  return ticket(id)!
}

export function recordPoll(groupJid: string, createdBy: string, messageId: string | undefined, question: string, options: string[], selectableCount: number, closesAt?: number) {
  const result = db.prepare('INSERT INTO polls_v4(group_jid, created_by, message_id, question, options_json, selectable_count, closes_at, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)')
    .run(groupJid, createdBy, messageId ?? null, question.slice(0, 240), JSON.stringify(options), selectableCount, closesAt ?? null, now())
  return Number(result.lastInsertRowid)
}

export function listPolls(groupJid: string, limit = 10) {
  return db.prepare('SELECT id, question, selectable_count as selectableCount, closes_at as closesAt, created_at as createdAt FROM polls_v4 WHERE group_jid = ? ORDER BY id DESC LIMIT ?')
    .all(groupJid, Math.max(1, Math.min(25, limit))) as Array<{ id: number; question: string; selectableCount: number; closesAt?: number; createdAt: number }>
}

async function sendDueAnnouncements(socket: WASocket) {
  const due = db.prepare(`SELECT id, group_jid as groupJid, message, interval_ms as intervalMs
    FROM scheduled_announcements_v4 WHERE enabled = 1 AND next_run_at <= ? ORDER BY next_run_at ASC LIMIT 20`).all(now()) as Array<{ id: number; groupJid: string; message: string; intervalMs: number }>
  for (const item of due) {
    try {
      await socket.sendMessage(item.groupJid, { text: `╭━━〔 📢 *ANUNCIO PROGRAMADO* 〕━━╮\n${item.message}\n╰━━━━━━━━━━━━━━━━╯` })
      db.prepare('UPDATE scheduled_announcements_v4 SET next_run_at = ? WHERE id = ?').run(now() + item.intervalMs, item.id)
    } catch (error) {
      logger.warn({ error, announcementId: item.id, groupJid: item.groupJid }, 'scheduled announcement failed')
      db.prepare('UPDATE scheduled_announcements_v4 SET next_run_at = ? WHERE id = ?').run(now() + Math.min(item.intervalMs, 15 * 60_000), item.id)
    }
  }
}

async function checkFeed(socket: WASocket, feed: { id: number; groupJid: string; url: string; label?: string; lastGuid?: string }) {
  try {
    const response = await safeFetch(feed.url)
    const xml = await response.text()
    if (Buffer.byteLength(xml, 'utf8') > 2 * 1024 * 1024) throw new Error('Feed RSS excede 2 MB.')
    const items = parseFeed(xml)
    if (!items.length) throw new Error('Feed sin entradas detectables.')
    const newest = items[0]!
    const unseen: typeof items = []
    for (const item of items) {
      if (item.guid === feed.lastGuid) break
      unseen.push(item)
    }
    for (const item of unseen.slice(0, 3).reverse()) {
      await socket.sendMessage(feed.groupJid, { text: [
        `📰 *${feed.label || 'RSS / NOTICIAS'}*`,
        `*${item.title}*`,
        item.published ? `🕒 ${item.published}` : '',
        item.link || '',
      ].filter(Boolean).join('\n') })
    }
    db.prepare('UPDATE rss_feeds_v4 SET last_guid = ?, next_check_at = ? WHERE id = ?').run(newest.guid, now() + 10 * 60_000, feed.id)
  } catch (error) {
    logger.warn({ error, feedId: feed.id, groupJid: feed.groupJid }, 'RSS check failed')
    db.prepare('UPDATE rss_feeds_v4 SET next_check_at = ? WHERE id = ?').run(now() + 30 * 60_000, feed.id)
  }
}

async function sendDueRss(socket: WASocket) {
  const feeds = db.prepare(`SELECT id, group_jid as groupJid, url, label, last_guid as lastGuid
    FROM rss_feeds_v4 WHERE enabled = 1 AND next_check_at <= ? ORDER BY next_check_at ASC LIMIT 10`).all(now()) as Array<{ id: number; groupJid: string; url: string; label?: string; lastGuid?: string }>
  for (const feed of feeds) await checkFeed(socket, feed)
}

let timer: NodeJS.Timeout | null = null
let running = false

export function startAutomationScheduler(socketProvider: () => WASocket | null) {
  if (timer) return
  const tick = async () => {
    if (running) return
    const socket = socketProvider()
    if (!socket) return
    running = true
    try {
      await sendDueAnnouncements(socket)
      await sendDueRss(socket)
    } finally { running = false }
  }
  timer = setInterval(() => { void tick().catch((error) => logger.error({ error }, 'automation scheduler tick failed')) }, 30_000)
  timer.unref()
  void tick().catch((error) => logger.error({ error }, 'initial automation scheduler tick failed'))
}

export function automationSummary() {
  const announcements = db.prepare('SELECT COUNT(*) as count FROM scheduled_announcements_v4 WHERE enabled = 1').get() as { count: number }
  const feeds = db.prepare('SELECT COUNT(*) as count FROM rss_feeds_v4 WHERE enabled = 1').get() as { count: number }
  const tickets = db.prepare("SELECT COUNT(*) as count FROM support_tickets_v4 WHERE status = 'open'").get() as { count: number }
  return { announcements: Number(announcements.count), rssFeeds: Number(feeds.count), openTickets: Number(tickets.count) }
}
