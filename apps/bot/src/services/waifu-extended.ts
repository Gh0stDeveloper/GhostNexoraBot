import { economy } from './economy.js'
import { getClaim, listHarem, type WaifuClaim } from './waifu.js'

const db = economy.db
const now = () => Date.now()

export type AnimeSeries = {
  animeId: number
  title: string
  imageUrl?: string
  sourceUrl: string
  score?: number
}

export type SeriesCharacter = {
  characterId: number
  name: string
  imageUrl?: string
  role?: string
}

type JikanAnime = {
  mal_id?: number
  title?: string
  url?: string
  score?: number | null
  images?: { jpg?: { image_url?: string | null; large_image_url?: string | null }; webp?: { image_url?: string | null; large_image_url?: string | null } }
}

type JikanCharacterNode = {
  character?: {
    mal_id?: number
    name?: string
    images?: { jpg?: { image_url?: string | null }; webp?: { image_url?: string | null } }
  }
  role?: string
}

db.exec(`
  CREATE TABLE IF NOT EXISTS waifu_votes (
    character_id INTEGER NOT NULL,
    user_jid TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY(character_id, user_jid)
  );
  CREATE TABLE IF NOT EXISTS waifu_trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proposer_jid TEXT NOT NULL,
    target_jid TEXT NOT NULL,
    offered_character_id INTEGER NOT NULL,
    requested_character_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_waifu_trade_target ON waifu_trades(target_jid, status, expires_at);
`)

function normalize(text: string) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

function rowToClaim(row: Record<string, unknown>): WaifuClaim {
  return {
    characterId: Number(row.characterId),
    ownerJid: String(row.ownerJid),
    name: String(row.name),
    nameKanji: row.nameKanji ? String(row.nameKanji) : undefined,
    imageUrl: String(row.imageUrl),
    sourceUrl: String(row.sourceUrl),
    favorites: Number(row.favorites ?? 0),
    rarity: String(row.rarity) as WaifuClaim['rarity'],
    value: Number(row.value),
    claimPrice: Number(row.claimPrice),
    claimedAt: Number(row.claimedAt),
  }
}

export function findOwnedCharacter(ownerJid: string, query: string) {
  const text = query.trim()
  if (!text) return null
  if (/^\d+$/.test(text)) {
    const claim = getClaim(Number(text))
    return claim?.ownerJid === ownerJid ? claim : null
  }
  const rows = db.prepare(`SELECT character_id AS characterId, owner_jid AS ownerJid, name,
    name_kanji AS nameKanji, image_url AS imageUrl, source_url AS sourceUrl, favorites,
    rarity, value, claim_price AS claimPrice, claimed_at AS claimedAt
    FROM waifu_claims WHERE owner_jid = ? ORDER BY value DESC`).all(ownerJid) as Array<Record<string, unknown>>
  const needle = normalize(text)
  const claims = rows.map(rowToClaim)
  return claims.find((claim) => normalize(claim.name) === needle)
    ?? claims.find((claim) => normalize(claim.name).includes(needle))
    ?? null
}

export function releaseCharacter(ownerJid: string, query: string) {
  const claim = findOwnedCharacter(ownerJid, query)
  if (!claim) throw new Error('No encontré ese personaje en tu harem.')
  db.prepare('DELETE FROM waifu_claims WHERE character_id = ? AND owner_jid = ?').run(claim.characterId, ownerJid)
  return claim
}

export function giveAllCharacters(ownerJid: string, targetJid: string) {
  if (ownerJid === targetJid) throw new Error('No puedes transferirte tu propio harem.')
  const total = listHarem(ownerJid, 1, 1).total
  if (!total) throw new Error('Tu harem está vacío.')
  economy.balance(targetJid)
  const result = db.prepare('UPDATE waifu_claims SET owner_jid = ?, claimed_at = ? WHERE owner_jid = ?').run(targetJid, now(), ownerJid)
  return Number(result.changes)
}

export function voteCharacter(userJid: string, characterId: number) {
  const claim = getClaim(characterId)
  if (!claim) throw new Error('Ese personaje todavía no ha sido reclamado en la colección.')
  const existing = db.prepare('SELECT 1 FROM waifu_votes WHERE character_id = ? AND user_jid = ?').get(characterId, userJid)
  if (existing) {
    db.prepare('DELETE FROM waifu_votes WHERE character_id = ? AND user_jid = ?').run(characterId, userJid)
    return { claim, voted: false, votes: countVotes(characterId) }
  }
  db.prepare('INSERT INTO waifu_votes(character_id, user_jid, created_at) VALUES(?, ?, ?)').run(characterId, userJid, now())
  return { claim, voted: true, votes: countVotes(characterId) }
}

export function countVotes(characterId: number) {
  const row = db.prepare('SELECT COUNT(*) AS count FROM waifu_votes WHERE character_id = ?').get(characterId) as { count?: number }
  return Number(row.count ?? 0)
}

export function topCharacters(limit = 10) {
  return db.prepare(`SELECT c.character_id AS characterId, c.owner_jid AS ownerJid, c.name,
    c.image_url AS imageUrl, c.rarity, c.value, c.favorites,
    COUNT(v.user_jid) AS votes
    FROM waifu_claims c LEFT JOIN waifu_votes v ON v.character_id = c.character_id
    GROUP BY c.character_id
    ORDER BY votes DESC, c.value DESC, c.favorites DESC LIMIT ?`)
    .all(Math.max(1, Math.min(25, limit))) as Array<{
      characterId: number; ownerJid: string; name: string; imageUrl: string; rarity: string; value: number; favorites: number; votes: number
    }>
}

export function createTrade(proposerJid: string, targetJid: string, offeredQuery: string, requestedQuery: string) {
  if (proposerJid === targetJid) throw new Error('No puedes hacer trade contigo mismo.')
  const offered = findOwnedCharacter(proposerJid, offeredQuery)
  if (!offered) throw new Error(`No tienes el personaje ofrecido: ${offeredQuery}.`)
  const requested = findOwnedCharacter(targetJid, requestedQuery)
  if (!requested) throw new Error(`El otro usuario no posee el personaje solicitado: ${requestedQuery}.`)
  const expiresAt = now() + 10 * 60_000
  const result = db.prepare(`INSERT INTO waifu_trades(proposer_jid, target_jid, offered_character_id, requested_character_id, expires_at, created_at)
    VALUES(?, ?, ?, ?, ?, ?)`).run(proposerJid, targetJid, offered.characterId, requested.characterId, expiresAt, now())
  return { id: Number(result.lastInsertRowid), offered, requested, expiresAt }
}

export function acceptTrade(targetJid: string, tradeId: number) {
  const trade = db.prepare(`SELECT id, proposer_jid AS proposerJid, target_jid AS targetJid,
    offered_character_id AS offeredCharacterId, requested_character_id AS requestedCharacterId,
    expires_at AS expiresAt, status FROM waifu_trades WHERE id = ?`).get(tradeId) as {
      id: number; proposerJid: string; targetJid: string; offeredCharacterId: number; requestedCharacterId: number; expiresAt: number; status: string
    } | undefined
  if (!trade || trade.status !== 'pending') throw new Error('Ese trade ya no está disponible.')
  if (trade.targetJid !== targetJid) throw new Error('Solo el destinatario puede aceptar este trade.')
  if (trade.expiresAt <= now()) {
    db.prepare(`UPDATE waifu_trades SET status = 'expired' WHERE id = ?`).run(trade.id)
    throw new Error('El trade expiró.')
  }
  const offered = getClaim(trade.offeredCharacterId)
  const requested = getClaim(trade.requestedCharacterId)
  if (!offered || offered.ownerJid !== trade.proposerJid || !requested || requested.ownerJid !== trade.targetJid) {
    db.prepare(`UPDATE waifu_trades SET status = 'invalid' WHERE id = ?`).run(trade.id)
    throw new Error('El trade dejó de ser válido porque cambió la propiedad de un personaje.')
  }
  db.exec('BEGIN IMMEDIATE')
  try {
    db.prepare('UPDATE waifu_claims SET owner_jid = ?, claimed_at = ? WHERE character_id = ?').run(trade.targetJid, now(), offered.characterId)
    db.prepare('UPDATE waifu_claims SET owner_jid = ?, claimed_at = ? WHERE character_id = ?').run(trade.proposerJid, now(), requested.characterId)
    db.prepare(`UPDATE waifu_trades SET status = 'accepted' WHERE id = ?`).run(trade.id)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  return { trade, offered, requested }
}

async function jikan<T>(url: string): Promise<T> {
  let last: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': 'GhostNexoraBot/1.1' },
        signal: AbortSignal.timeout(18_000),
      })
      if (!response.ok) throw new Error(`Jikan HTTP ${response.status}`)
      return await response.json() as T
    } catch (error) {
      last = error
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 900 * (attempt + 1)))
    }
  }
  throw last instanceof Error ? last : new Error('Jikan no respondió.')
}

export async function searchAnimeSeries(query: string, limit = 8) {
  const payload = await jikan<{ data?: JikanAnime[] }>(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=${Math.max(1, Math.min(12, limit))}&order_by=members&sort=desc`)
  return (payload.data ?? []).flatMap((item) => {
    const animeId = Number(item.mal_id ?? 0)
    const title = item.title?.trim()
    if (!animeId || !title) return []
    return [{
      animeId,
      title,
      sourceUrl: item.url ?? `https://myanimelist.net/anime/${animeId}`,
      imageUrl: item.images?.webp?.large_image_url ?? item.images?.jpg?.large_image_url ?? item.images?.webp?.image_url ?? item.images?.jpg?.image_url ?? undefined,
      score: item.score ?? undefined,
    } satisfies AnimeSeries]
  })
}

export async function seriesCharacters(animeId: number, limit = 12) {
  const payload = await jikan<{ data?: JikanCharacterNode[] }>(`https://api.jikan.moe/v4/anime/${animeId}/characters`)
  return (payload.data ?? []).slice(0, Math.max(1, Math.min(24, limit))).flatMap((node) => {
    const characterId = Number(node.character?.mal_id ?? 0)
    const name = node.character?.name?.trim()
    if (!characterId || !name) return []
    return [{
      characterId,
      name,
      imageUrl: node.character?.images?.webp?.image_url ?? node.character?.images?.jpg?.image_url ?? undefined,
      role: node.role,
    } satisfies SeriesCharacter]
  })
}

export async function popularSeries(page = 1, limit = 12) {
  const safePage = Math.max(1, Math.floor(page))
  const payload = await jikan<{ data?: JikanAnime[] }>(`https://api.jikan.moe/v4/top/anime?page=${safePage}&limit=${Math.max(1, Math.min(25, limit))}`)
  return (payload.data ?? []).flatMap((item) => {
    const animeId = Number(item.mal_id ?? 0)
    const title = item.title?.trim()
    if (!animeId || !title) return []
    return [{ animeId, title, sourceUrl: item.url ?? `https://myanimelist.net/anime/${animeId}`, score: item.score ?? undefined } satisfies AnimeSeries]
  })
}
