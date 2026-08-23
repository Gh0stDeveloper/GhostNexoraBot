import { economy } from './economy.js'

export type JikanV2Character = {
  characterId: number
  name: string
  nameKanji?: string
  imageUrl: string
  sourceUrl: string
  favorites: number
  rarity: 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary' | 'Mythic'
  value: number
  claimPrice: number
}

type RawCharacter = {
  mal_id?: number; url?: string; name?: string; name_kanji?: string | null; favorites?: number | null
  images?: { jpg?: { image_url?: string | null; large_image_url?: string | null }; webp?: { image_url?: string | null; large_image_url?: string | null } }
}

const BASE = 'https://api.jikan.moe/v4'
const MIN_GAP = 1_050
const CACHE_TTL = 10 * 60_000
const cache = new Map<string, { at: number; value: unknown }>()
let nextAt = 0
let queue: Promise<void> = Promise.resolve()
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const rarityCfg = {
  Common: { value: 120, claimPrice: 60 }, Uncommon: { value: 260, claimPrice: 100 }, Rare: { value: 650, claimPrice: 180 },
  Epic: { value: 1500, claimPrice: 350 }, Legendary: { value: 3400, claimPrice: 750 }, Mythic: { value: 7500, claimPrice: 1500 },
} as const

async function pace() {
  let release!: () => void
  const previous = queue
  queue = new Promise<void>((resolve) => { release = resolve })
  await previous
  try {
    const wait = Math.max(0, nextAt - Date.now())
    if (wait) await sleep(wait)
    nextAt = Date.now() + MIN_GAP
  } finally { release() }
}

async function request<T>(url: string, useCache = true): Promise<T> {
  if (useCache) {
    const hit = cache.get(url)
    if (hit && Date.now() - hit.at < CACHE_TTL) return hit.value as T
  }
  let lastError: unknown
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await pace()
    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': 'GhostNexoraBot/2.0' },
        signal: AbortSignal.timeout(20_000),
      })
      if (response.ok) {
        const value = await response.json() as T
        if (useCache) cache.set(url, { at: Date.now(), value })
        return value
      }
      const retryable = response.status === 429 || response.status >= 500
      if (!retryable) throw new Error(`Jikan respondió HTTP ${response.status}.`)
      const retryHeader = Number(response.headers.get('retry-after') ?? 0)
      const wait = retryHeader > 0 ? retryHeader * 1000 : Math.min(8_000, 900 * 2 ** attempt)
      await sleep(wait + Math.floor(Math.random() * 250))
      lastError = new Error(`Jikan respondió HTTP ${response.status}.`)
    } catch (error) {
      lastError = error
      if (attempt === 4) break
      await sleep(Math.min(8_000, 900 * 2 ** attempt))
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Jikan no respondió.')
}

function rarity(favorites: number): JikanV2Character['rarity'] {
  if (favorites >= 80_000) return 'Mythic'
  if (favorites >= 30_000) return 'Legendary'
  if (favorites >= 10_000) return 'Epic'
  if (favorites >= 2_500) return 'Rare'
  if (favorites >= 500) return 'Uncommon'
  return 'Common'
}

function map(raw: RawCharacter): JikanV2Character {
  const characterId = Number(raw.mal_id ?? 0)
  const name = raw.name?.trim() ?? ''
  const imageUrl = raw.images?.webp?.large_image_url ?? raw.images?.jpg?.large_image_url ?? raw.images?.webp?.image_url ?? raw.images?.jpg?.image_url ?? ''
  const sourceUrl = raw.url ?? `https://myanimelist.net/character/${characterId}`
  const favorites = Math.max(0, Number(raw.favorites ?? 0))
  if (!characterId || !name || !imageUrl) throw new Error('Jikan devolvió datos incompletos.')
  const rank = rarity(favorites)
  return { characterId, name, nameKanji: raw.name_kanji ?? undefined, imageUrl, sourceUrl, favorites, rarity: rank, ...rarityCfg[rank] }
}

export async function jikanCharacter(id: number) {
  const payload = await request<{ data?: RawCharacter }>(`${BASE}/characters/${id}/full`)
  if (!payload.data) throw new Error('Jikan no encontró ese personaje.')
  return map(payload.data)
}

export async function jikanSearchCharacters(query: string, limit = 8) {
  const endpoint = new URL(`${BASE}/characters`)
  endpoint.searchParams.set('q', query.trim())
  endpoint.searchParams.set('order_by', 'favorites')
  endpoint.searchParams.set('sort', 'desc')
  endpoint.searchParams.set('limit', String(Math.max(1, Math.min(15, limit))))
  const payload = await request<{ data?: RawCharacter[] }>(endpoint.toString())
  return (payload.data ?? []).flatMap((item) => { try { return [map(item)] } catch { return [] } })
}

export async function jikanRandomCharacter() {
  try {
    const payload = await request<{ data?: RawCharacter }>(`${BASE}/random/characters`, false)
    if (payload.data) return map(payload.data)
  } catch { /* use top list fallback */ }
  const page = 1 + Math.floor(Math.random() * 12)
  const payload = await request<{ data?: RawCharacter[] }>(`${BASE}/top/characters?page=${page}&limit=25`)
  const rows = (payload.data ?? []).flatMap((item) => { try { return [map(item)] } catch { return [] } })
  if (!rows.length) throw new Error('Jikan no devolvió personajes utilizables.')
  return rows[Math.floor(Math.random() * rows.length)]!
}

export async function createV2WaifuRoll(userJid: string) {
  const db = economy.db
  const meta = db.prepare('SELECT last_roll as lastRoll FROM waifu_roll_meta WHERE user_jid = ?').get(userJid) as { lastRoll?: number } | undefined
  const remaining = Math.max(0, Number(meta?.lastRoll ?? 0) + 60_000 - Date.now())
  if (remaining) return { ok: false as const, remaining }
  const character = await jikanRandomCharacter()
  const rolledAt = Date.now()
  const expiresAt = rolledAt + 5 * 60_000
  db.prepare(`INSERT INTO waifu_roll_meta(user_jid, last_roll) VALUES(?, ?) ON CONFLICT(user_jid) DO UPDATE SET last_roll = excluded.last_roll`).run(userJid, rolledAt)
  db.prepare(`INSERT INTO waifu_rolls(user_jid, character_id, name, name_kanji, image_url, source_url, favorites, rarity, value, claim_price, rolled_at, expires_at)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_jid) DO UPDATE SET character_id = excluded.character_id, name = excluded.name, name_kanji = excluded.name_kanji,
    image_url = excluded.image_url, source_url = excluded.source_url, favorites = excluded.favorites, rarity = excluded.rarity, value = excluded.value,
    claim_price = excluded.claim_price, rolled_at = excluded.rolled_at, expires_at = excluded.expires_at`)
    .run(userJid, character.characterId, character.name, character.nameKanji ?? null, character.imageUrl, character.sourceUrl, character.favorites,
      character.rarity, character.value, character.claimPrice, rolledAt, expiresAt)
  const owner = db.prepare('SELECT owner_jid as ownerJid FROM waifu_claims WHERE character_id = ?').get(character.characterId) as { ownerJid?: string } | undefined
  return { ok: true as const, character, owner: owner?.ownerJid ?? null, expiresAt }
}
