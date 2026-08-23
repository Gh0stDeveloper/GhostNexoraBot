import { economy } from './economy.js'
import type { WaifuRarity } from './waifu.js'

const ENDPOINT = 'https://graphql.anilist.co'
const ID_OFFSET = 1_000_000_000
const CACHE_TTL = 15 * 60_000
const cache = new Map<string, { at: number; value: unknown }>()

export type AniListWaifuCharacter = {
  characterId: number
  aniListId: number
  name: string
  nameKanji?: string
  imageUrl: string
  sourceUrl: string
  favorites: number
  rarity: WaifuRarity
  value: number
  claimPrice: number
}

type RawCharacter = {
  id?: number
  name?: { full?: string | null; native?: string | null; userPreferred?: string | null }
  image?: { large?: string | null; medium?: string | null }
  siteUrl?: string | null
  favourites?: number | null
}

const rarityConfig: Record<WaifuRarity, { value: number; claimPrice: number }> = {
  Common: { value: 120, claimPrice: 60 },
  Uncommon: { value: 260, claimPrice: 100 },
  Rare: { value: 650, claimPrice: 180 },
  Epic: { value: 1500, claimPrice: 350 },
  Legendary: { value: 3400, claimPrice: 750 },
  Mythic: { value: 7500, claimPrice: 1500 },
}

function rarity(favorites: number): WaifuRarity {
  if (favorites >= 40_000) return 'Mythic'
  if (favorites >= 15_000) return 'Legendary'
  if (favorites >= 5_000) return 'Epic'
  if (favorites >= 1_000) return 'Rare'
  if (favorites >= 200) return 'Uncommon'
  return 'Common'
}

function encodeId(id: number) { return ID_OFFSET + id }
function decodeId(id: number) { return id >= ID_OFFSET ? id - ID_OFFSET : id }

function mapCharacter(raw: RawCharacter): AniListWaifuCharacter {
  const aniListId = Number(raw.id ?? 0)
  const name = raw.name?.userPreferred?.trim() || raw.name?.full?.trim() || ''
  const imageUrl = raw.image?.large || raw.image?.medium || ''
  const favorites = Math.max(0, Number(raw.favourites ?? 0))
  if (!aniListId || !name || !imageUrl) throw new Error('AniList devolvió un personaje incompleto.')
  const rank = rarity(favorites)
  return {
    characterId: encodeId(aniListId),
    aniListId,
    name,
    nameKanji: raw.name?.native?.trim() || undefined,
    imageUrl,
    sourceUrl: raw.siteUrl || `https://anilist.co/character/${aniListId}`,
    favorites,
    rarity: rank,
    ...rarityConfig[rank],
  }
}

async function graphQL<T>(query: string, variables: Record<string, unknown>, cacheKey?: string): Promise<T> {
  if (cacheKey) {
    const hit = cache.get(cacheKey)
    if (hit && Date.now() - hit.at < CACHE_TTL) return hit.value as T
  }
  let lastError: unknown
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json', 'user-agent': 'GhostNexoraBot/2.3' },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(20_000),
      })
      const payload = await response.json().catch(() => ({})) as { data?: T; errors?: Array<{ message?: string }> }
      if (response.ok && payload.data) {
        if (cacheKey) cache.set(cacheKey, { at: Date.now(), value: payload.data })
        return payload.data
      }
      const detail = payload.errors?.[0]?.message || `HTTP ${response.status}`
      lastError = new Error(`No se pudo consultar el catálogo de personajes: ${detail}`)
      if (response.status !== 429 && response.status < 500) break
    } catch (error) { lastError = error }
    await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)))
  }
  throw lastError instanceof Error ? lastError : new Error('El catálogo de personajes no respondió.')
}

const fields = `id name { full native userPreferred } image { large medium } siteUrl favourites`

export async function searchAniListCharacters(queryText: string, limit = 8) {
  const search = queryText.trim()
  if (!search) throw new Error('Indica el nombre de un personaje.')
  const query = `query($search:String,$perPage:Int){Page(page:1,perPage:$perPage){characters(search:$search,sort:FAVOURITES_DESC){${fields}}}}`
  const data = await graphQL<{ Page?: { characters?: RawCharacter[] } }>(query, { search, perPage: Math.max(1, Math.min(15, limit)) }, `search:${search.toLowerCase()}:${limit}`)
  return (data.Page?.characters ?? []).flatMap((raw) => { try { return [mapCharacter(raw)] } catch { return [] } })
}

export async function aniListCharacter(id: number) {
  const aniListId = decodeId(Math.floor(id))
  if (!Number.isInteger(aniListId) || aniListId <= 0) throw new Error('ID de personaje inválido.')
  const query = `query($id:Int){Character(id:$id){${fields}}}`
  const data = await graphQL<{ Character?: RawCharacter }>(query, { id: aniListId }, `character:${aniListId}`)
  if (!data.Character) throw new Error('No encontré ese personaje.')
  return mapCharacter(data.Character)
}

export async function randomAniListCharacter() {
  // Una página aleatoria entre personajes populares ofrece variedad sin depender de un endpoint random inestable.
  const page = 1 + Math.floor(Math.random() * 80)
  const query = `query($page:Int){Page(page:$page,perPage:25){characters(sort:FAVOURITES_DESC){${fields}}}}`
  const data = await graphQL<{ Page?: { characters?: RawCharacter[] } }>(query, { page })
  const rows = (data.Page?.characters ?? []).flatMap((raw) => { try { return [mapCharacter(raw)] } catch { return [] } })
  if (!rows.length) throw new Error('El catálogo no devolvió personajes utilizables.')
  return rows[Math.floor(Math.random() * rows.length)]!
}

export async function createAniListWaifuRoll(userJid: string) {
  const db = economy.db
  const meta = db.prepare('SELECT last_roll as lastRoll FROM waifu_roll_meta WHERE user_jid = ?').get(userJid) as { lastRoll?: number } | undefined
  const remaining = Math.max(0, Number(meta?.lastRoll ?? 0) + 60_000 - Date.now())
  if (remaining) return { ok: false as const, remaining }

  const character = await randomAniListCharacter()
  const rolledAt = Date.now()
  const expiresAt = rolledAt + 5 * 60_000
  db.prepare(`INSERT INTO waifu_roll_meta(user_jid, last_roll) VALUES(?, ?)
    ON CONFLICT(user_jid) DO UPDATE SET last_roll = excluded.last_roll`).run(userJid, rolledAt)
  db.prepare(`INSERT INTO waifu_rolls(user_jid, character_id, name, name_kanji, image_url, source_url, favorites, rarity, value, claim_price, rolled_at, expires_at)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_jid) DO UPDATE SET character_id = excluded.character_id, name = excluded.name, name_kanji = excluded.name_kanji,
    image_url = excluded.image_url, source_url = excluded.source_url, favorites = excluded.favorites, rarity = excluded.rarity, value = excluded.value,
    claim_price = excluded.claim_price, rolled_at = excluded.rolled_at, expires_at = excluded.expires_at`)
    .run(userJid, character.characterId, character.name, character.nameKanji ?? null, character.imageUrl, character.sourceUrl,
      character.favorites, character.rarity, character.value, character.claimPrice, rolledAt, expiresAt)
  const owner = db.prepare('SELECT owner_jid as ownerJid FROM waifu_claims WHERE character_id = ?').get(character.characterId) as { ownerJid?: string } | undefined
  return { ok: true as const, character, owner: owner?.ownerJid ?? null, expiresAt }
}

export function aniListDisplayId(character: Pick<AniListWaifuCharacter, 'aniListId'>) {
  return `AL-${character.aniListId}`
}
