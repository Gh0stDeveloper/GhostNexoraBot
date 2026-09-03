/**
 * Servicios Minecraft (Java Edition)
 * - Portal Nether: matemática exacta
 * - Skin/UUID/cape: APIs oficiales Mojang + Capes.dev
 * - Server: Server List Ping (protocolo real)
 * - Seeds/estructuras: anillos oficiales + PRNG determinista por seed
 *   (aproximación útil; no es cubiomes WASM 1:1)
 */
import net from 'node:net'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'

// ——— PRNG estilo Java Random (LCG) ————————————————
class JavaRandom {
  private seed: bigint
  constructor(seed: bigint | number | string) {
    const s = typeof seed === 'bigint' ? seed : BigInt(typeof seed === 'string' ? this.hashSeed(seed) : seed)
    this.seed = (s ^ 0x5deece66dn) & ((1n << 48n) - 1n)
  }
  private hashSeed(s: string): bigint {
    // String hash compatible con uso de seeds numéricas o texto
    if (/^-?\d+$/.test(s.trim())) return BigInt(s.trim())
    let h = 0n
    for (let i = 0; i < s.length; i++) h = (h * 31n + BigInt(s.charCodeAt(i))) & ((1n << 64n) - 1n)
    return h
  }
  next(bits: number): number {
    this.seed = (this.seed * 0x5deece66dn + 0xbn) & ((1n << 48n) - 1n)
    return Number(this.seed >> (48n - BigInt(bits)))
  }
  nextInt(bound: number): number {
    if (bound <= 0) return 0
    if ((bound & -bound) === bound) return (this.next(31) * bound) >> 31
    let bits: number
    let val: number
    do {
      bits = this.next(31)
      val = bits % bound
    } while (bits - val + (bound - 1) < 0)
    return val
  }
  nextFloat(): number {
    return this.next(24) / 0x1000000
  }
}

export function parseSeed(input: string): bigint {
  const t = input.trim()
  if (/^-?\d+$/.test(t)) return BigInt(t)
  // Igual que Java String.hashCode extendido a 64-bit útil
  let h = 0n
  for (let i = 0; i < t.length; i++) h = (31n * h + BigInt(t.charCodeAt(i))) & 0xffffffffn
  // Sign-extend style
  if (h >= 0x80000000n) h -= 0x100000000n
  return h
}

// Anillos stronghold (wiki Java)
const STRONGHOLD_RINGS = [
  { count: 3, min: 1280, max: 2816 },
  { count: 6, min: 4352, max: 5888 },
  { count: 10, min: 7424, max: 8960 },
  { count: 15, min: 10496, max: 12032 },
  { count: 21, min: 13568, max: 15104 },
  { count: 28, min: 16640, max: 18176 },
  { count: 36, min: 19712, max: 21248 },
  { count: 9, min: 22784, max: 24320 },
]

/** Posiciones candidatas de strongholds (anillo 1 = las 3 cercanas) deterministas por seed */
export function estimateStrongholds(seedInput: string, rings = 1) {
  const seed = parseSeed(seedInput)
  const out: Array<{ ring: number; index: number; x: number; z: number; dist: number }> = []
  let globalIndex = 0
  for (let r = 0; r < Math.min(rings, STRONGHOLD_RINGS.length); r++) {
    const ring = STRONGHOLD_RINGS[r]!
    const rnd = new JavaRandom(seed + BigInt(r * 341873128712) + 10387320n)
    const angle0 = rnd.nextFloat() * Math.PI * 2
    for (let i = 0; i < ring.count; i++) {
      const angle = angle0 + (i * 2 * Math.PI) / ring.count + (rnd.nextFloat() - 0.5) * 0.2
      const radius = ring.min + rnd.nextFloat() * (ring.max - ring.min)
      const x = Math.round(Math.cos(angle) * radius)
      const z = Math.round(Math.sin(angle) * radius)
      out.push({
        ring: r + 1,
        index: ++globalIndex,
        x,
        z,
        dist: Math.round(Math.hypot(x, z)),
      })
    }
  }
  return { seed: seed.toString(), positions: out }
}

/** Estructuras con spacing típico Java (candidatos por región) */
const STRUCTURE_GRID: Record<
  string,
  { salt: number; spacing: number; separation: number; label: string }
> = {
  village: { salt: 10387312, spacing: 34, separation: 8, label: 'Aldea' },
  mansion: { salt: 10387319, spacing: 80, separation: 20, label: 'Mansión del bosque' },
  monument: { salt: 10387313, spacing: 32, separation: 5, label: 'Monumento oceánico' },
  fortress: { salt: 30084232, spacing: 27, separation: 4, label: 'Fortaleza del Nether' },
  bastion: { salt: 30084232, spacing: 27, separation: 4, label: 'Bastión' },
  ancient_city: { salt: 20083232, spacing: 24, separation: 8, label: 'Ancient City' },
  trial_chamber: { salt: 94251327, spacing: 34, separation: 12, label: 'Trial Chamber' },
  desert_pyramid: { salt: 14357617, spacing: 32, separation: 8, label: 'Pirámide' },
  jungle_pyramid: { salt: 14357619, spacing: 32, separation: 8, label: 'Templo de la jungla' },
  shipwreck: { salt: 165745295, spacing: 24, separation: 4, label: 'Naufragio' },
}

export function findStructureCandidates(
  seedInput: string,
  structureKey: string,
  aroundX = 0,
  aroundZ = 0,
  radiusRegions = 8,
) {
  const key = structureKey.toLowerCase().replace(/\s+/g, '_')
  const conf =
    STRUCTURE_GRID[key] ||
    Object.entries(STRUCTURE_GRID).find(([k, v]) => v.label.toLowerCase().includes(key) || k.includes(key))?.[1]
  if (!conf) {
    return {
      error: `Estructura desconocida. Usa: ${Object.keys(STRUCTURE_GRID).join(', ')}`,
    }
  }
  const seed = parseSeed(seedInput)
  const { spacing, separation, salt, label } = conf
  const regionX = Math.floor(aroundX / 16 / spacing)
  const regionZ = Math.floor(aroundZ / 16 / spacing)
  const hits: Array<{ x: number; z: number; dist: number }> = []

  for (let rx = regionX - radiusRegions; rx <= regionX + radiusRegions; rx++) {
    for (let rz = regionZ - radiusRegions; rz <= regionZ + radiusRegions; rz++) {
      const rnd = new JavaRandom(
        seed + BigInt(rx) * 341873128712n + BigInt(rz) * 132897987541n + BigInt(salt),
      )
      const spread = spacing - separation
      const cx = rx * spacing + separation + rnd.nextInt(Math.max(1, spread))
      const cz = rz * spacing + separation + rnd.nextInt(Math.max(1, spread))
      const x = cx * 16 + 8
      const z = cz * 16 + 8
      const dist = Math.round(Math.hypot(x - aroundX, z - aroundZ))
      hits.push({ x, z, dist })
    }
  }
  hits.sort((a, b) => a.dist - b.dist)
  return { seed: seed.toString(), label, near: hits.slice(0, 12) }
}

const BIOMES = [
  'plains', 'forest', 'desert', 'taiga', 'swamp', 'jungle', 'badlands', 'savanna',
  'snowy_plains', 'ocean', 'deep_ocean', 'river', 'beach', 'mushroom_fields',
  'dark_forest', 'birch_forest', 'windswept_hills', 'cherry_grove', 'mangrove_swamp',
]

/** Bioma aproximado por ruido determinista (no es el generador 1.20 exacto) */
export function estimateBiome(seedInput: string, x: number, z: number) {
  const seed = parseSeed(seedInput)
  const rnd = new JavaRandom(seed + BigInt(Math.floor(x / 32)) * 341873128712n + BigInt(Math.floor(z / 32)) * 132897987541n)
  const idx = rnd.nextInt(BIOMES.length)
  return {
    seed: seed.toString(),
    x,
    z,
    biome: BIOMES[idx],
    note: 'Estimación determinista local (no cubiomes). Para mapa exacto usa Chunkbase o /locate en juego.',
  }
}

export function netherPortalLink(x: number, z: number, from: 'overworld' | 'nether') {
  if (from === 'overworld') {
    return {
      from: 'Overworld',
      to: 'Nether',
      source: { x, z },
      linked: { x: Math.floor(x / 8), z: Math.floor(z / 8) },
      tip: 'Construye el portal en el Nether en esas coords (Y a gusto) para conectar.',
    }
  }
  return {
    from: 'Nether',
    to: 'Overworld',
    source: { x, z },
    linked: { x: x * 8, z: z * 8 },
    tip: 'Portal del Overworld en X/Z × 8.',
  }
}

// ——— Mojang / perfiles ————————————————
export async function resolveProfile(nick: string) {
  const name = nick.trim()
  const res = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`, {
    signal: AbortSignal.timeout(10_000),
  })
  if (res.status === 204 || res.status === 404) throw new Error(`Jugador no encontrado: ${name}`)
  if (!res.ok) throw new Error(`Mojang API HTTP ${res.status}`)
  const data = (await res.json()) as { id: string; name: string }
  const uuid = data.id.replace(/(\w{8})(\w{4})(\w{4})(\w{4})(\w{12})/, '$1-$2-$3-$4-$5')
  return { uuid, uuidNodash: data.id, name: data.name }
}

export async function getSessionProfile(uuidNodash: string) {
  const res = await fetch(
    `https://sessionserver.mojang.com/session/minecraft/profile/${uuidNodash}`,
    { signal: AbortSignal.timeout(10_000) },
  )
  if (!res.ok) throw new Error(`Session server HTTP ${res.status}`)
  return (await res.json()) as {
    id: string
    name: string
    properties: Array<{ name: string; value: string }>
  }
}

export function skinUrls(uuidNodash: string) {
  return {
    skin: `https://mc-heads.net/skin/${uuidNodash}`,
    avatar: `https://mc-heads.net/avatar/${uuidNodash}/128`,
    body: `https://mc-heads.net/body/${uuidNodash}/128`,
    head: `https://mc-heads.net/head/${uuidNodash}/128`,
    cube: `https://mc-heads.net/player/${uuidNodash}/128`,
  }
}

export async function getCapes(uuidNodash: string) {
  // Capes.dev agrega capas oficiales / optifine / etc.
  try {
    const res = await fetch(`https://api.capes.dev/load/${uuidNodash}`, {
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return []
    const data = (await res.json()) as Record<string, { exists?: boolean; imageUrl?: string; type?: string }>
    return Object.entries(data)
      .filter(([, v]) => v && (v.exists || v.imageUrl))
      .map(([k, v]) => ({ provider: k, url: v.imageUrl, type: v.type || k }))
  } catch {
    return []
  }
}

// ——— Server List Ping ————————————————
function writeVarInt(value: number) {
  const parts: number[] = []
  let v = value >>> 0
  do {
    let temp = v & 0x7f
    v >>>= 7
    if (v !== 0) temp |= 0x80
    parts.push(temp)
  } while (v !== 0)
  return Buffer.from(parts)
}

function readVarInt(buf: Buffer, offset: number): [number, number] {
  let numRead = 0
  let result = 0
  let read: number
  do {
    read = buf[offset + numRead]!
    result |= (read & 0x7f) << (7 * numRead)
    numRead++
    if (numRead > 5) throw new Error('VarInt too big')
  } while ((read & 0x80) !== 0)
  return [result, offset + numRead]
}

export async function pingMinecraftServer(host: string, port = 25565, timeoutMs = 8000) {
  const start = Date.now()
  return new Promise<{
    latencyMs: number
    version: string
    protocol: number
    playersOnline: number
    playersMax: number
    description: string
    sample: string[]
  }>((resolve, reject) => {
    const socket = net.createConnection({ host, port }, () => {
      const hostBuf = Buffer.from(host, 'utf8')
      const handshakeData = Buffer.concat([
        writeVarInt(0x00),
        writeVarInt(760),
        writeVarInt(hostBuf.length),
        hostBuf,
        (() => {
          const b = Buffer.alloc(2)
          b.writeUInt16BE(port, 0)
          return b
        })(),
        writeVarInt(1),
      ])
      const handshake = Buffer.concat([writeVarInt(handshakeData.length), handshakeData])
      const statusReq = Buffer.concat([writeVarInt(1), writeVarInt(0x00)])
      socket.write(Buffer.concat([handshake, statusReq]))
    })

    let buf = Buffer.alloc(0)
    socket.setTimeout(timeoutMs)
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk])
      try {
        const [packetLen, o1] = readVarInt(buf, 0)
        if (buf.length < o1 + packetLen) return
        let off = o1
        const [, o2] = readVarInt(buf, off)
        off = o2
        const [strLen, o3] = readVarInt(buf, off)
        off = o3
        const jsonStr = buf.subarray(off, off + strLen).toString('utf8')
        const json = JSON.parse(jsonStr) as {
          version?: { name?: string; protocol?: number }
          players?: { online?: number; max?: number; sample?: Array<{ name: string }> }
          description?: string | { text?: string; extra?: unknown[] }
        }
        const desc =
          typeof json.description === 'string'
            ? json.description
            : json.description?.text || JSON.stringify(json.description || '').slice(0, 120)
        socket.destroy()
        resolve({
          latencyMs: Date.now() - start,
          version: json.version?.name || '?',
          protocol: json.version?.protocol || 0,
          playersOnline: json.players?.online ?? 0,
          playersMax: json.players?.max ?? 0,
          description: String(desc).replace(/§./g, '').slice(0, 200),
          sample: (json.players?.sample || []).map((p) => p.name).slice(0, 12),
        })
      } catch {
        // wait more data
      }
    })
    socket.on('timeout', () => {
      socket.destroy()
      reject(new Error('Timeout al conectar'))
    })
    socket.on('error', (e) => reject(e))
  })
}

export function parseHostPort(input: string): { host: string; port: number } {
  const t = input.trim()
  if (t.includes(':')) {
    const [h, p] = t.split(':')
    return { host: h!, port: Number(p) || 25565 }
  }
  return { host: t, port: 25565 }
}

// ——— Crafting (recetas comunes + wiki) ————————————————
const RECIPES: Record<string, { shape: string[]; result: string; wiki: string }> = {
  crafting_table: {
    shape: ['##', '##'],
    result: 'Mesa de crafteo (4 tablas)',
    wiki: 'https://minecraft.wiki/w/Crafting_Table',
  },
  stick: {
    shape: ['#', '#'],
    result: '4 palos (2 tablas verticales)',
    wiki: 'https://minecraft.wiki/w/Stick',
  },
  torch: {
    shape: ['C', 'S'],
    result: '4 antorchas (carbón + palo)',
    wiki: 'https://minecraft.wiki/w/Torch',
  },
  furnace: {
    shape: ['###', '# #', '###'],
    result: 'Horno (8 cobblestone)',
    wiki: 'https://minecraft.wiki/w/Furnace',
  },
  chest: {
    shape: ['###', '# #', '###'],
    result: 'Cofre (8 tablas)',
    wiki: 'https://minecraft.wiki/w/Chest',
  },
  bed: {
    shape: ['WWW', 'PPP'],
    result: 'Cama (3 lana + 3 tablas)',
    wiki: 'https://minecraft.wiki/w/Bed',
  },
  ender_eye: {
    shape: ['mezcla'],
    result: 'Ojo de ender (perla de ender + polvo de blaze)',
    wiki: 'https://minecraft.wiki/w/Eye_of_Ender',
  },
  diamond_pickaxe: {
    shape: ['DDD', ' S ', ' S '],
    result: 'Pico de diamante',
    wiki: 'https://minecraft.wiki/w/Pickaxe',
  },
  netherite_ingot: {
    shape: ['NNNN', 'NGNG', 'NNNN'],
    result: 'Lingote de netherita (4 scraps + 4 oro)',
    wiki: 'https://minecraft.wiki/w/Netherite_Ingot',
  },
}

export function getCraft(item: string) {
  const key = item.trim().toLowerCase().replace(/\s+/g, '_')
  const hit =
    RECIPES[key] ||
    Object.entries(RECIPES).find(([k, v]) => k.includes(key) || v.result.toLowerCase().includes(key))?.[1]
  if (!hit) {
    return {
      found: false as const,
      wiki: `https://minecraft.wiki/w/Special:Search?search=${encodeURIComponent(item)}`,
      tip: 'Item no está en la tabla local; usa el enlace de la wiki (datos oficiales).',
    }
  }
  return { found: true as const, ...hit }
}

// ——— Alertas locales de precio ————————————————
type PriceAlert = {
  id: string
  chatId: string
  sender: string
  item: string
  maxPrice: number
  currency: string
  createdAt: number
}

const ALERT_FILE = path.resolve(config.dataDir, 'minecraft', 'price-alerts.json')

function loadAlerts(): PriceAlert[] {
  try {
    return JSON.parse(fs.readFileSync(ALERT_FILE, 'utf8')) as PriceAlert[]
  } catch {
    return []
  }
}

function saveAlerts(list: PriceAlert[]) {
  fs.mkdirSync(path.dirname(ALERT_FILE), { recursive: true })
  fs.writeFileSync(ALERT_FILE, JSON.stringify(list, null, 2))
}

export function addPriceAlert(opts: {
  chatId: string
  sender: string
  item: string
  maxPrice: number
  currency?: string
}) {
  const list = loadAlerts()
  const row: PriceAlert = {
    id: createHash('sha1').update(`${opts.sender}:${opts.item}:${Date.now()}`).digest('hex').slice(0, 10),
    chatId: opts.chatId,
    sender: opts.sender,
    item: opts.item.trim().toLowerCase(),
    maxPrice: opts.maxPrice,
    currency: opts.currency || 'coins',
    createdAt: Date.now(),
  }
  list.push(row)
  saveAlerts(list)
  return row
}

export function listPriceAlerts(sender: string) {
  return loadAlerts().filter((a) => a.sender === sender)
}

export function removePriceAlert(sender: string, idOrItem: string) {
  const list = loadAlerts()
  const next = list.filter(
    (a) =>
      !(a.sender === sender && (a.id === idOrItem || a.item === idOrItem.toLowerCase())),
  )
  saveAlerts(next)
  return list.length - next.length
}

export function reportPrice(item: string, price: number) {
  const list = loadAlerts()
  const key = item.trim().toLowerCase()
  return list.filter((a) => a.item === key && price <= a.maxPrice)
}
