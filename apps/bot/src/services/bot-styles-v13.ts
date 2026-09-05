import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'
import { searchAniListCharacters } from './anilist-waifu-v5.js'

export type BotVisualStyle = {
  id: string
  name: string
  description: string
  icon: string
  characterQuery?: string
}

export type BotStyleAsset = {
  style: BotVisualStyle
  imageUrl?: string
  characterName?: string
  sourceUrl?: string
}

const STYLE_FILE = path.join(config.dataDir, 'bot-style.json')
const CACHE_TTL = 30 * 60_000
const imageCache = new Map<string, { expiresAt: number; asset: BotStyleAsset }>()

/**
 * Catálogo visual del bot.
 *
 * Las imágenes NO se almacenan en el repositorio: cada personaje se resuelve
 * dinámicamente desde AniList usando el mismo servicio que el sistema .waifu.
 * Se mantienen 24 estilos exactos para que .styles muestre 4 chunks de 6.
 */
export const BOT_VISUAL_STYLES: BotVisualStyle[] = [
  {
    id: 'default',
    name: 'Ghost Nexora · Default',
    description: 'Estilo original. Usa la foto actual de esta cuenta de WhatsApp.',
    icon: '👻',
  },
  {
    id: 'megumin',
    name: 'Megumin · KONOSUBA',
    description: 'Archimaga explosiva de KONOSUBA.',
    icon: '💥',
    characterQuery: 'Megumin',
  },
  {
    id: 'rem',
    name: 'Rem · Re:Zero',
    description: 'Una de las waifus más reconocidas de Re:Zero.',
    icon: '💙',
    characterQuery: 'Rem',
  },
  {
    id: 'tsukasa',
    name: 'Tsukasa Yuzaki · TONIKAWA',
    description: 'Protagonista femenina de Tonikaku Kawaii.',
    icon: '🌙',
    characterQuery: 'Tsukasa Yuzaki',
  },
  {
    id: 'marin',
    name: 'Marin Kitagawa · My Dress-Up Darling',
    description: 'Cosplayer alegre y una de las waifus modernas más populares.',
    icon: '🌸',
    characterQuery: 'Marin Kitagawa',
  },
  {
    id: 'yor',
    name: 'Yor Forger · SPY x FAMILY',
    description: 'Elegante, carismática y reconocible.',
    icon: '🥀',
    characterQuery: 'Yor Forger',
  },
  {
    id: 'asuna',
    name: 'Asuna Yuuki · Sword Art Online',
    description: 'Waifu clásica e icónica de Sword Art Online.',
    icon: '✨',
    characterQuery: 'Asuna Yuuki',
  },
  {
    id: 'emilia',
    name: 'Emilia · Re:Zero',
    description: 'Estilo refinado y fantástico de Re:Zero.',
    icon: '🔮',
    characterQuery: 'Emilia',
  },
  {
    id: 'zerotwo',
    name: 'Zero Two · DARLING in the FRANXX',
    description: 'Waifu futurista de estética intensa y muy reconocible.',
    icon: '💠',
    characterQuery: 'Zero Two',
  },
  {
    id: 'makima',
    name: 'Makima · Chainsaw Man',
    description: 'Estilo oscuro y sofisticado de Chainsaw Man.',
    icon: '🖤',
    characterQuery: 'Makima',
  },
  {
    id: 'frieren',
    name: 'Frieren · Sousou no Frieren',
    description: 'Elfa serena y una de las protagonistas femeninas más populares recientes.',
    icon: '🧝‍♀️',
    characterQuery: 'Frieren',
  },
  {
    id: 'nezuko',
    name: 'Nezuko Kamado · Kimetsu no Yaiba',
    description: 'Personaje femenino icónico de Demon Slayer.',
    icon: '🎋',
    characterQuery: 'Nezuko Kamado',
  },
  {
    id: 'kurumi',
    name: 'Kurumi Tokisaki · Date A Live',
    description: 'Waifu de estilo oscuro y muy popular.',
    icon: '⏳',
    characterQuery: 'Kurumi Tokisaki',
  },
  {
    id: 'rias',
    name: 'Rias Gremory · High School DxD',
    description: 'Estilo rojo y llamativo de una waifu clásica.',
    icon: '❤️‍🔥',
    characterQuery: 'Rias Gremory',
  },
  {
    id: 'mikasa',
    name: 'Mikasa Ackerman · Attack on Titan',
    description: 'Estilo serio y fuerte de Attack on Titan.',
    icon: '🧣',
    characterQuery: 'Mikasa Ackerman',
  },
  {
    id: 'hinata',
    name: 'Hinata Hyuga · Naruto',
    description: 'Waifu clásica y muy querida de Naruto.',
    icon: '💜',
    characterQuery: 'Hinata Hyuga',
  },
  {
    id: 'robin',
    name: 'Nico Robin · One Piece',
    description: 'Estilo elegante de una de las mujeres más populares de One Piece.',
    icon: '🌺',
    characterQuery: 'Nico Robin',
  },
  {
    id: 'chiaki',
    name: 'Chiaki Nanami · Danganronpa',
    description: 'Waifu gamer de estética relajada y colorida.',
    icon: '🎮',
    characterQuery: 'Chiaki Nanami',
  },
  {
    id: 'mai',
    name: 'Mai Sakurajima · Bunny Girl Senpai',
    description: 'Waifu elegante y popular de Seishun Buta Yarou.',
    icon: '🌙',
    characterQuery: 'Mai Sakurajima',
  },
  {
    id: 'power',
    name: 'Power · Chainsaw Man',
    description: 'Estilo enérgico y caótico de Chainsaw Man.',
    icon: '🩸',
    characterQuery: 'Power',
  },
  {
    id: 'nami',
    name: 'Nami · One Piece',
    description: 'Una de las protagonistas femeninas más reconocidas de One Piece.',
    icon: '🍊',
    characterQuery: 'Nami',
  },
  {
    id: 'miku',
    name: 'Miku Nakano · The Quintessential Quintuplets',
    description: 'Waifu tranquila y extremadamente popular de Gotoubun no Hanayome.',
    icon: '🎧',
    characterQuery: 'Miku Nakano',
  },
  {
    id: 'kaguya',
    name: 'Kaguya Shinomiya · Kaguya-sama',
    description: 'Elegante protagonista femenina de Kaguya-sama: Love is War.',
    icon: '🎀',
    characterQuery: 'Kaguya Shinomiya',
  },
  {
    id: 'violet',
    name: 'Violet Evergarden',
    description: 'Estilo refinado y emotivo inspirado en Violet Evergarden.',
    icon: '💌',
    characterQuery: 'Violet Evergarden',
  },
]

/**
 * Alias amigables y compatibilidad con los IDs genéricos usados por V13
 * antes de migrar el catálogo a personajes específicos.
 */
const STYLE_ALIASES: Record<string, string> = {
  megumi: 'megumin',
  'megumi konosuba': 'megumin',
  'megumin konosuba': 'megumin',
  'tsukasa yuzaki': 'tsukasa',
  'tsukasa yusaki': 'tsukasa',
  'tsukasa tonikaku kawaii': 'tsukasa',
  'tsukasa tonikawa': 'tsukasa',
  'zero two': 'zerotwo',
  'zero 2': 'zerotwo',
  zero2: 'zerotwo',
  'marin kitagawa': 'marin',
  'yor forger': 'yor',
  'asuna yuuki': 'asuna',
  'asuna yuki': 'asuna',
  'kurumi tokisaki': 'kurumi',
  'rias gremory': 'rias',
  'mikasa ackerman': 'mikasa',
  'hinata hyuga': 'hinata',
  'nico robin': 'robin',
  'chiaki nanami': 'chiaki',
  'mai sakurajima': 'mai',
  'miku nakano': 'miku',
  'kaguya shinomiya': 'kaguya',
  'violet evergarden': 'violet',
  'nezuko kamado': 'nezuko',

  // IDs de estilos V13 anteriores.
  moon: 'mai',
  sakura: 'marin',
  neon: 'zerotwo',
  ice: 'rem',
  shadow: 'makima',
  gold: 'asuna',
  spy: 'yor',
  magic: 'emilia',
  gamer: 'chiaki',
  crimson: 'rias',
  elf: 'frieren',
}

type StoredStyle = {
  styleId: string
  updatedBy?: string
  updatedAt?: number
}

function normalizeStyleKey(value: string) {
  return value.trim().toLocaleLowerCase('es-MX').replace(/\s+/g, ' ')
}

function canonicalStyleId(value: string) {
  const clean = normalizeStyleKey(value)
  return STYLE_ALIASES[clean] ?? clean
}

function readStoredStyle(): StoredStyle {
  try {
    const raw = JSON.parse(fs.readFileSync(STYLE_FILE, 'utf8')) as Partial<StoredStyle>
    const requested = String(raw.styleId ?? 'default')
    const style = getBotVisualStyle(requested)
    return style
      ? { styleId: style.id, updatedBy: raw.updatedBy, updatedAt: Number(raw.updatedAt ?? 0) }
      : { styleId: 'default' }
  } catch {
    return { styleId: 'default' }
  }
}

function persistStyle(state: StoredStyle) {
  fs.mkdirSync(config.dataDir, { recursive: true })
  const temp = `${STYLE_FILE}.${process.pid}.tmp`
  fs.writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  fs.renameSync(temp, STYLE_FILE)
}

export function listBotVisualStyles() {
  return BOT_VISUAL_STYLES.slice()
}

export function getBotVisualStyle(styleId: string) {
  const canonical = canonicalStyleId(styleId)
  return BOT_VISUAL_STYLES.find((style) => style.id === canonical)
}

export function getCurrentBotVisualStyle() {
  return getBotVisualStyle(readStoredStyle().styleId) ?? BOT_VISUAL_STYLES[0]!
}

export function setCurrentBotVisualStyle(styleId: string, updatedBy: string) {
  const style = getBotVisualStyle(styleId)
  if (!style) throw new Error(`Estilo desconocido: ${styleId}`)
  persistStyle({ styleId: style.id, updatedBy, updatedAt: Date.now() })
  return style
}

function normalizeName(value: string) {
  return value.trim().toLocaleLowerCase('en').replace(/\s+/g, ' ')
}

export async function resolveBotVisualStyleAsset(styleOrId: BotVisualStyle | string): Promise<BotStyleAsset> {
  const style = typeof styleOrId === 'string' ? getBotVisualStyle(styleOrId) : styleOrId
  if (!style) throw new Error('Estilo visual no encontrado.')
  if (!style.characterQuery) return { style }

  const cached = imageCache.get(style.id)
  if (cached && cached.expiresAt > Date.now()) return cached.asset

  const rows = await searchAniListCharacters(style.characterQuery, 6)
  if (!rows.length) throw new Error(`AniList no devolvió imágenes para ${style.name}.`)
  const expected = normalizeName(style.characterQuery)
  const character = rows.find((row) => normalizeName(row.name) === expected)
    ?? rows.find((row) => normalizeName(row.name).includes(expected) || expected.includes(normalizeName(row.name)))
    ?? rows[0]!

  const asset: BotStyleAsset = {
    style,
    imageUrl: character.imageUrl,
    characterName: character.name,
    sourceUrl: character.sourceUrl,
  }
  imageCache.set(style.id, { expiresAt: Date.now() + CACHE_TTL, asset })
  return asset
}

export async function resolveCurrentBotVisualImage(fallbackUrl?: string) {
  const style = getCurrentBotVisualStyle()
  if (style.id === 'default') return fallbackUrl
  try {
    const asset = await resolveBotVisualStyleAsset(style)
    return asset.imageUrl || fallbackUrl
  } catch {
    return fallbackUrl
  }
}
