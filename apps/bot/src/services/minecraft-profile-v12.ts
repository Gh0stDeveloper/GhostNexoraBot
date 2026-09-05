import { getCapes, getSessionProfile, resolveProfile, skinUrls } from './minecraft.js'

const USER_AGENT = 'GhostNexoraBot/1.4 (+https://github.com/Gh0stDeveloper/GhostNexoraBot)'
const JAVA_NAME_RE = /^[A-Za-z0-9_]{1,16}$/

export type JavaMinecraftIdentity = {
  edition: 'java'
  name: string
  query: string
  uuid: string
  uuidNodash: string
  avatarUrl: string
  bodyUrl: string
  skinUrl: string
  officialSkinUrl?: string
  officialCapeUrl?: string
  source: 'Mojang'
}

export type BedrockMinecraftIdentity = {
  edition: 'bedrock'
  name: string
  query: string
  xuid: string
  avatarUrl?: string
  skinRenderUrl?: string
  skinRawUrl?: string
  linkedJava?: { name: string; uuid: string; uuidNodash: string }
  source: 'PlayerDB' | 'GeyserMC'
}

export type MinecraftIdentity = JavaMinecraftIdentity | BedrockMinecraftIdentity

export function normalizeMinecraftPlayerQuery(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

function uuidWithDashes(value: string) {
  const raw = value.replace(/-/g, '')
  if (!/^[0-9a-f]{32}$/i.test(raw)) return value
  return raw.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5')
}

async function fetchJson<T>(url: string, timeoutMs = 10_000): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': USER_AGENT },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) return null
    return await response.json() as T
  } catch {
    return null
  }
}

async function resolveJava(query: string): Promise<JavaMinecraftIdentity | null> {
  if (!JAVA_NAME_RE.test(query)) return null
  try {
    const profile = await resolveProfile(query)
    const urls = skinUrls(profile.uuidNodash)
    let officialSkinUrl: string | undefined
    let officialCapeUrl: string | undefined
    try {
      const session = await getSessionProfile(profile.uuidNodash)
      const texture = session.properties?.find((entry) => entry.name === 'textures')
      if (texture?.value) {
        const decoded = JSON.parse(Buffer.from(texture.value, 'base64').toString('utf8')) as {
          textures?: { SKIN?: { url?: string }; CAPE?: { url?: string } }
        }
        officialSkinUrl = decoded.textures?.SKIN?.url
        officialCapeUrl = decoded.textures?.CAPE?.url
      }
    } catch {
      // El perfil base sigue siendo válido aunque sessionserver no responda.
    }
    return {
      edition: 'java',
      name: profile.name,
      query,
      uuid: profile.uuid,
      uuidNodash: profile.uuidNodash,
      avatarUrl: urls.cube,
      bodyUrl: urls.body,
      skinUrl: urls.skin,
      officialSkinUrl,
      officialCapeUrl,
      source: 'Mojang',
    }
  } catch {
    return null
  }
}

type PlayerDbXboxResponse = {
  code?: string
  data?: {
    player?: {
      username?: string
      id?: string | number
      avatar?: string
      meta?: Record<string, unknown>
    }
  }
}

type GeyserXuidResponse = { xuid?: string | number }
type GeyserSkinResponse = { texture_id?: string }
type GeyserLinkResponse = { java_id?: string; java_name?: string }

async function enrichBedrock(input: {
  query: string
  name: string
  xuid: string
  avatarUrl?: string
  source: BedrockMinecraftIdentity['source']
}): Promise<BedrockMinecraftIdentity> {
  const encodedXuid = encodeURIComponent(input.xuid)
  const [skin, linked] = await Promise.all([
    fetchJson<GeyserSkinResponse>(`https://api.geysermc.org/v2/skin/${encodedXuid}`),
    fetchJson<GeyserLinkResponse>(`https://api.geysermc.org/v2/link/bedrock/${encodedXuid}`),
  ])
  const textureId = skin?.texture_id?.trim()
  const javaRaw = linked?.java_id?.replace(/-/g, '')
  return {
    edition: 'bedrock',
    name: input.name,
    query: input.query,
    xuid: input.xuid,
    avatarUrl: input.avatarUrl,
    skinRenderUrl: textureId ? `https://api.geysermc.org/render/front/${encodeURIComponent(textureId)}` : undefined,
    skinRawUrl: textureId ? `https://api.geysermc.org/render/raw/${encodeURIComponent(textureId)}` : undefined,
    linkedJava: javaRaw && linked?.java_name ? {
      name: linked.java_name,
      uuid: uuidWithDashes(javaRaw),
      uuidNodash: javaRaw,
    } : undefined,
    source: input.source,
  }
}

async function resolveBedrock(query: string): Promise<BedrockMinecraftIdentity | null> {
  const encoded = encodeURIComponent(query)
  const playerDb = await fetchJson<PlayerDbXboxResponse>(`https://playerdb.co/api/player/xbox/${encoded}`)
  const player = playerDb?.data?.player
  if (player?.id && player.username) {
    return enrichBedrock({
      query,
      name: player.username,
      xuid: String(player.id),
      avatarUrl: typeof player.avatar === 'string' ? player.avatar : undefined,
      source: 'PlayerDB',
    })
  }

  const geyser = await fetchJson<GeyserXuidResponse>(`https://api.geysermc.org/v2/xbox/xuid/${encoded}`)
  if (geyser?.xuid) {
    return enrichBedrock({
      query,
      name: query,
      xuid: String(geyser.xuid),
      source: 'GeyserMC',
    })
  }
  return null
}

export async function resolveMinecraftIdentity(rawQuery: string): Promise<MinecraftIdentity> {
  const query = normalizeMinecraftPlayerQuery(rawQuery)
  if (!query) throw new Error('Indica el nombre o Gamertag del jugador.')
  if (query.length > 64) throw new Error('El nombre del jugador es demasiado largo.')

  // Java no admite espacios; para nombres válidos probamos Mojang primero.
  const java = await resolveJava(query)
  if (java) return java

  // Bedrock/Xbox sí permite Gamertags con espacios, por ejemplo "JULIAN AGZ".
  const bedrock = await resolveBedrock(query)
  if (bedrock) return bedrock

  throw new Error(`Jugador no encontrado: ${query}. Se consultaron perfiles Java y Bedrock/Xbox.`)
}

export async function resolveMinecraftCapes(identity: MinecraftIdentity) {
  if (identity.edition === 'java') return getCapes(identity.uuidNodash)
  if (identity.linkedJava?.uuidNodash) return getCapes(identity.linkedJava.uuidNodash)
  return []
}
