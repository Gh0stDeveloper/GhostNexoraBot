import { economy, COIN_SYMBOL } from './economy.js'

export type WaifuRarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary' | 'Mythic'

export type WaifuCharacter = {
  characterId: number
  name: string
  nameKanji?: string
  imageUrl: string
  sourceUrl: string
  favorites: number
  rarity: WaifuRarity
  value: number
  claimPrice: number
}

export type WaifuClaim = WaifuCharacter & {
  ownerJid: string
  claimedAt: number
}

type JikanCharacter = {
  mal_id?: number
  url?: string
  name?: string
  name_kanji?: string | null
  favorites?: number | null
  images?: {
    jpg?: { image_url?: string | null; large_image_url?: string | null }
    webp?: { image_url?: string | null; large_image_url?: string | null }
  }
}

const db = economy.db
const now = () => Date.now()
const ROLL_COOLDOWN_MS = 30_000
const ROLL_TTL_MS = 5 * 60_000
const JIKAN_BASE = 'https://api.jikan.moe/v4'
const JIKAN_MIN_GAP_MS = 420
const JIKAN_MAX_ATTEMPTS = 4
const transientJikanStatuses = new Set([429, 500, 502, 503, 504])
let jikanNextRequestAt = 0
let jikanQueue: Promise<void> = Promise.resolve()

const rarityConfig: Record<WaifuRarity, { value: number; claimPrice: number; emoji: string }> = {
  Common: { value: 120, claimPrice: 60, emoji: '⚪' },
  Uncommon: { value: 260, claimPrice: 100, emoji: '🟢' },
  Rare: { value: 650, claimPrice: 180, emoji: '🔵' },
  Epic: { value: 1500, claimPrice: 350, emoji: '🟣' },
  Legendary: { value: 3400, claimPrice: 750, emoji: '🟠' },
  Mythic: { value: 7500, claimPrice: 1500, emoji: '🔴' },
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function paceJikan() {
  let release!: () => void
  const previous = jikanQueue
  jikanQueue = new Promise<void>((resolve) => { release = resolve })
  await previous
  try {
    const wait = Math.max(0, jikanNextRequestAt - Date.now())
    if (wait > 0) await sleep(wait)
    jikanNextRequestAt = Date.now() + JIKAN_MIN_GAP_MS
  } finally {
    release()
  }
}

function rarityFromFavorites(favorites: number): WaifuRarity {
  if (favorites >= 80_000) return 'Mythic'
  if (favorites >= 30_000) return 'Legendary'
  if (favorites >= 10_000) return 'Epic'
  if (favorites >= 2_500) return 'Rare'
  if (favorites >= 500) return 'Uncommon'
  return 'Common'
}

function fromJikan(input: JikanCharacter): WaifuCharacter {
  const characterId = Number(input.mal_id ?? 0)
  const name = input.name?.trim() ?? ''
  const imageUrl = input.images?.webp?.large_image_url ?? input.images?.jpg?.large_image_url ?? input.images?.webp?.image_url ?? input.images?.jpg?.image_url ?? ''
  const sourceUrl = input.url ?? (characterId ? `https://myanimelist.net/character/${characterId}` : '')
  const favorites = Math.max(0, Number(input.favorites ?? 0))
  if (!characterId || !name || !imageUrl || !sourceUrl) throw new Error('Jikan devolvió un personaje incompleto.')
  const rarity = rarityFromFavorites(favorites)
  const cfg = rarityConfig[rarity]
  return {
    characterId,
    name,
    nameKanji: input.name_kanji ?? undefined,
    imageUrl,
    sourceUrl,
    favorites,
    rarity,
    value: cfg.value,
    claimPrice: cfg.claimPrice,
  }
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
    rarity: String(row.rarity) as WaifuRarity,
    value: Number(row.value),
    claimPrice: Number(row.claimPrice),
    claimedAt: Number(row.claimedAt),
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS waifu_roll_meta (
    user_jid TEXT PRIMARY KEY,
    last_roll INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS waifu_rolls (
    user_jid TEXT PRIMARY KEY,
    character_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    name_kanji TEXT,
    image_url TEXT NOT NULL,
    source_url TEXT NOT NULL,
    favorites INTEGER NOT NULL DEFAULT 0,
    rarity TEXT NOT NULL,
    value INTEGER NOT NULL,
    claim_price INTEGER NOT NULL,
    rolled_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS waifu_claims (
    character_id INTEGER PRIMARY KEY,
    owner_jid TEXT NOT NULL,
    name TEXT NOT NULL,
    name_kanji TEXT,
    image_url TEXT NOT NULL,
    source_url TEXT NOT NULL,
    favorites INTEGER NOT NULL DEFAULT 0,
    rarity TEXT NOT NULL,
    value INTEGER NOT NULL,
    claim_price INTEGER NOT NULL,
    claimed_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_waifu_claims_owner ON waifu_claims(owner_jid, claimed_at DESC);
`)

async function fetchJikanJson<T>(url: string): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= JIKAN_MAX_ATTEMPTS; attempt += 1) {
    await paceJikan()
    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': 'GhostNexoraBot/1.1' },
        signal: AbortSignal.timeout(20_000),
      })
      if (response.ok) return response.json() as Promise<T>

      const error = new Error(`Jikan respondió HTTP ${response.status}.`)
      lastError = error
      if (!transientJikanStatuses.has(response.status) || attempt === JIKAN_MAX_ATTEMPTS) throw error

      const retryAfterHeader = response.headers.get('retry-after')
      const retryAfter = retryAfterHeader ? Math.max(0, Number(retryAfterHeader) * 1000) : 0
      const backoff = Math.min(6_000, 650 * (2 ** (attempt - 1))) + Math.floor(Math.random() * 250)
      await sleep(Math.max(retryAfter, backoff))
    } catch (error) {
      lastError = error
      const message = error instanceof Error ? error.message : String(error)
      const explicitHttp = /Jikan respondió HTTP (\d+)/.exec(message)
      const status = explicitHttp ? Number(explicitHttp[1]) : undefined
      if ((status && !transientJikanStatuses.has(status)) || attempt === JIKAN_MAX_ATTEMPTS) throw error
      const backoff = Math.min(6_000, 650 * (2 ** (attempt - 1))) + Math.floor(Math.random() * 250)
      await sleep(backoff)
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Jikan no respondió después de varios intentos.')
}

async function fetchRandomCharacter() {
  try {
    const payload = await fetchJikanJson<{ data?: JikanCharacter }>(`${JIKAN_BASE}/random/characters`)
    if (payload.data) return payload.data
  } catch {
    // /random puede sufrir 5xx con más frecuencia. Se usa /top como fallback de la misma API.
  }

  const page = 1 + Math.floor(Math.random() * 20)
  const payload = await fetchJikanJson<{ data?: JikanCharacter[] }>(`${JIKAN_BASE}/top/characters?page=${page}&limit=25`)
  const candidates = payload.data ?? []
  if (!candidates.length) throw new Error('Jikan no devolvió personajes disponibles.')
  return candidates[Math.floor(Math.random() * candidates.length)]!
}

export function rarityEmoji(rarity: WaifuRarity) {
  return rarityConfig[rarity].emoji
}

export function getClaim(characterId: number): WaifuClaim | null {
  const row = db.prepare(`SELECT
    character_id AS characterId, owner_jid AS ownerJid, name, name_kanji AS nameKanji,
    image_url AS imageUrl, source_url AS sourceUrl, favorites, rarity, value,
    claim_price AS claimPrice, claimed_at AS claimedAt
    FROM waifu_claims WHERE character_id = ?`).get(characterId) as Record<string, unknown> | undefined
  return row ? rowToClaim(row) : null
}

export async function rollWaifu(userJid: string) {
  const meta = db.prepare('SELECT last_roll AS lastRoll FROM waifu_roll_meta WHERE user_jid = ?').get(userJid) as { lastRoll?: number } | undefined
  const remaining = Math.max(0, Number(meta?.lastRoll ?? 0) + ROLL_COOLDOWN_MS - now())
  if (remaining > 0) return { ok: false as const, remaining }

  const character = fromJikan(await fetchRandomCharacter())
  const rolledAt = now()
  const expiresAt = rolledAt + ROLL_TTL_MS

  db.prepare(`INSERT INTO waifu_roll_meta(user_jid, last_roll) VALUES(?, ?)
    ON CONFLICT(user_jid) DO UPDATE SET last_roll = excluded.last_roll`).run(userJid, rolledAt)
  db.prepare(`INSERT INTO waifu_rolls(
      user_jid, character_id, name, name_kanji, image_url, source_url, favorites,
      rarity, value, claim_price, rolled_at, expires_at
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_jid) DO UPDATE SET
      character_id = excluded.character_id, name = excluded.name, name_kanji = excluded.name_kanji,
      image_url = excluded.image_url, source_url = excluded.source_url, favorites = excluded.favorites,
      rarity = excluded.rarity, value = excluded.value, claim_price = excluded.claim_price,
      rolled_at = excluded.rolled_at, expires_at = excluded.expires_at`)
    .run(userJid, character.characterId, character.name, character.nameKanji ?? null, character.imageUrl,
      character.sourceUrl, character.favorites, character.rarity, character.value, character.claimPrice, rolledAt, expiresAt)

  return { ok: true as const, character, owner: getClaim(character.characterId)?.ownerJid ?? null, expiresAt }
}

function currentRoll(userJid: string): WaifuCharacter & { expiresAt: number } | null {
  const row = db.prepare(`SELECT character_id AS characterId, name, name_kanji AS nameKanji,
    image_url AS imageUrl, source_url AS sourceUrl, favorites, rarity, value,
    claim_price AS claimPrice, expires_at AS expiresAt
    FROM waifu_rolls WHERE user_jid = ?`).get(userJid) as Record<string, unknown> | undefined
  if (!row || Number(row.expiresAt) <= now()) return null
  return {
    characterId: Number(row.characterId),
    name: String(row.name),
    nameKanji: row.nameKanji ? String(row.nameKanji) : undefined,
    imageUrl: String(row.imageUrl),
    sourceUrl: String(row.sourceUrl),
    favorites: Number(row.favorites ?? 0),
    rarity: String(row.rarity) as WaifuRarity,
    value: Number(row.value),
    claimPrice: Number(row.claimPrice),
    expiresAt: Number(row.expiresAt),
  }
}

export function claimCurrentWaifu(userJid: string) {
  const roll = currentRoll(userJid)
  if (!roll) throw new Error('No tienes un roll activo. Usa .rw y reclama antes de que expire.')
  const occupied = getClaim(roll.characterId)
  if (occupied) throw new Error('Ese personaje ya pertenece a otro usuario.')

  const balance = economy.balance(userJid)
  if (balance.wallet < roll.claimPrice) {
    throw new Error(`Necesitas ${roll.claimPrice.toLocaleString('es-MX')} ${COIN_SYMBOL} en la cartera. Retira del banco con .withdraw si hace falta.`)
  }

  db.exec('BEGIN IMMEDIATE')
  try {
    const recheck = db.prepare('SELECT owner_jid FROM waifu_claims WHERE character_id = ?').get(roll.characterId)
    if (recheck) throw new Error('Otro usuario reclamó ese personaje antes que tú.')
    db.prepare('UPDATE economy_users SET wallet = wallet - ? WHERE user_jid = ?').run(roll.claimPrice, userJid)
    db.prepare(`INSERT INTO waifu_claims(
      character_id, owner_jid, name, name_kanji, image_url, source_url, favorites,
      rarity, value, claim_price, claimed_at
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(roll.characterId, userJid, roll.name, roll.nameKanji ?? null, roll.imageUrl, roll.sourceUrl,
        roll.favorites, roll.rarity, roll.value, roll.claimPrice, now())
    db.prepare('INSERT INTO economy_ledger(user_jid, kind, amount, note, created_at) VALUES(?, ?, ?, ?, ?)')
      .run(userJid, 'waifu_claim', -roll.claimPrice, `MAL:${roll.characterId} ${roll.name}`, now())
    db.prepare('DELETE FROM waifu_rolls WHERE user_jid = ?').run(userJid)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }

  return { claim: getClaim(roll.characterId)!, balance: economy.balance(userJid) }
}

export function listHarem(ownerJid: string, page = 1, pageSize = 10) {
  const safeSize = Math.max(1, Math.min(12, pageSize))
  const totalRow = db.prepare('SELECT COUNT(*) AS count, COALESCE(SUM(value), 0) AS totalValue FROM waifu_claims WHERE owner_jid = ?')
    .get(ownerJid) as { count?: number; totalValue?: number }
  const total = Number(totalRow?.count ?? 0)
  const totalPages = Math.max(1, Math.ceil(total / safeSize))
  const safePage = Math.max(1, Math.min(totalPages, Math.floor(page) || 1))
  const rows = db.prepare(`SELECT character_id AS characterId, owner_jid AS ownerJid, name,
    name_kanji AS nameKanji, image_url AS imageUrl, source_url AS sourceUrl, favorites,
    rarity, value, claim_price AS claimPrice, claimed_at AS claimedAt
    FROM waifu_claims WHERE owner_jid = ? ORDER BY value DESC, claimed_at DESC LIMIT ? OFFSET ?`)
    .all(ownerJid, safeSize, (safePage - 1) * safeSize) as Array<Record<string, unknown>>
  return {
    items: rows.map(rowToClaim),
    total,
    totalValue: Number(totalRow?.totalValue ?? 0),
    page: safePage,
    totalPages,
  }
}

export function giveWaifu(ownerJid: string, targetJid: string, characterId: number) {
  if (ownerJid === targetJid) throw new Error('Ese personaje ya es tuyo.')
  const claim = getClaim(characterId)
  if (!claim || claim.ownerJid !== ownerJid) throw new Error('No eres propietario de ese personaje.')
  economy.balance(targetJid)
  db.prepare('UPDATE waifu_claims SET owner_jid = ?, claimed_at = ? WHERE character_id = ? AND owner_jid = ?')
    .run(targetJid, now(), characterId, ownerJid)
  return getClaim(characterId)!
}

export function sellWaifu(ownerJid: string, characterId: number) {
  const claim = getClaim(characterId)
  if (!claim || claim.ownerJid !== ownerJid) throw new Error('No eres propietario de ese personaje.')
  const payout = Math.max(1, Math.floor(claim.value * 0.65))
  db.exec('BEGIN IMMEDIATE')
  try {
    db.prepare('DELETE FROM waifu_claims WHERE character_id = ? AND owner_jid = ?').run(characterId, ownerJid)
    db.prepare('UPDATE economy_users SET wallet = wallet + ? WHERE user_jid = ?').run(payout, ownerJid)
    db.prepare('INSERT INTO economy_ledger(user_jid, kind, amount, note, created_at) VALUES(?, ?, ?, ?, ?)')
      .run(ownerJid, 'waifu_sell', payout, `MAL:${characterId} ${claim.name}`, now())
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  return { claim, payout, balance: economy.balance(ownerJid) }
}

export function waifuTop(limit = 10) {
  return db.prepare(`SELECT owner_jid AS ownerJid, COUNT(*) AS count, COALESCE(SUM(value), 0) AS totalValue
    FROM waifu_claims GROUP BY owner_jid ORDER BY totalValue DESC, count DESC LIMIT ?`)
    .all(Math.max(1, Math.min(25, limit))) as Array<{ ownerJid: string; count: number; totalValue: number }>
}

export async function searchWaifus(query: string, limit = 8) {
  const text = query.trim()
  if (!text) throw new Error('Indica un personaje para buscar.')
  const safeLimit = Math.max(1, Math.min(12, limit))
  let payload: { data?: JikanCharacter[] }
  try {
    payload = await fetchJikanJson<{ data?: JikanCharacter[] }>(`${JIKAN_BASE}/characters?q=${encodeURIComponent(text)}&limit=${safeLimit}&order_by=favorites&sort=desc`)
  } catch {
    // Una consulta simple ejerce menos carga en Jikan y suele sobrevivir mejor durante degradaciones.
    payload = await fetchJikanJson<{ data?: JikanCharacter[] }>(`${JIKAN_BASE}/characters?q=${encodeURIComponent(text)}&limit=${safeLimit}`)
  }
  return (payload.data ?? []).flatMap((item) => {
    try {
      const character = fromJikan(item)
      return [{ ...character, ownerJid: getClaim(character.characterId)?.ownerJid ?? null }]
    } catch {
      return []
    }
  })
}

export async function waifuInfo(characterId: number) {
  const existing = getClaim(characterId)
  let payload: { data?: JikanCharacter }
  try {
    payload = await fetchJikanJson<{ data?: JikanCharacter }>(`${JIKAN_BASE}/characters/${characterId}/full`)
  } catch {
    payload = await fetchJikanJson<{ data?: JikanCharacter }>(`${JIKAN_BASE}/characters/${characterId}`)
  }
  if (!payload.data) throw new Error('No encontré ese personaje en Jikan.')
  return { character: fromJikan(payload.data), ownerJid: existing?.ownerJid ?? null }
}
