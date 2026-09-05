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

export const BOT_VISUAL_STYLES: BotVisualStyle[] = [
  {
    id: 'default',
    name: 'Ghost Nexora · Default',
    description: 'Estilo original. Usa la foto actual de esta cuenta de WhatsApp.',
    icon: '👻',
  },
  {
    id: 'moon',
    name: 'Waifu Moon',
    description: 'Estilo elegante, nocturno y sobrio.',
    icon: '🌙',
    characterQuery: 'Mai Sakurajima',
  },
  {
    id: 'sakura',
    name: 'Waifu Sakura',
    description: 'Estilo rosado, alegre y moderno.',
    icon: '🌸',
    characterQuery: 'Marin Kitagawa',
  },
  {
    id: 'neon',
    name: 'Waifu Neon',
    description: 'Estética futurista con presencia fuerte.',
    icon: '💠',
    characterQuery: 'Zero Two',
  },
  {
    id: 'ice',
    name: 'Waifu Ice',
    description: 'Diseño azul, limpio y delicado.',
    icon: '❄️',
    characterQuery: 'Rem',
  },
  {
    id: 'shadow',
    name: 'Waifu Shadow',
    description: 'Estilo oscuro, serio y minimalista.',
    icon: '🖤',
    characterQuery: 'Makima',
  },
  {
    id: 'gold',
    name: 'Waifu Gold',
    description: 'Diseño premium, luminoso y elegante.',
    icon: '✨',
    characterQuery: 'Asuna Yuuki',
  },
  {
    id: 'spy',
    name: 'Waifu Spy',
    description: 'Estilo elegante con tonos oscuros y rojos.',
    icon: '🥀',
    characterQuery: 'Yor Forger',
  },
  {
    id: 'magic',
    name: 'Waifu Magic',
    description: 'Estética fantástica, clara y refinada.',
    icon: '🔮',
    characterQuery: 'Emilia',
  },
  {
    id: 'gamer',
    name: 'Waifu Gamer',
    description: 'Estilo gamer, relajado y colorido.',
    icon: '🎮',
    characterQuery: 'Chiaki Nanami',
  },
  {
    id: 'crimson',
    name: 'Waifu Crimson',
    description: 'Diseño rojo, intenso y llamativo.',
    icon: '❤️‍🔥',
    characterQuery: 'Rias Gremory',
  },
  {
    id: 'elf',
    name: 'Waifu Elf',
    description: 'Estilo fantasía, sereno y limpio.',
    icon: '🧝‍♀️',
    characterQuery: 'Frieren',
  },
]

type StoredStyle = {
  styleId: string
  updatedBy?: string
  updatedAt?: number
}

function readStoredStyle(): StoredStyle {
  try {
    const raw = JSON.parse(fs.readFileSync(STYLE_FILE, 'utf8')) as Partial<StoredStyle>
    const styleId = String(raw.styleId ?? 'default').toLowerCase()
    return getBotVisualStyle(styleId)
      ? { styleId, updatedBy: raw.updatedBy, updatedAt: Number(raw.updatedAt ?? 0) }
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
  const clean = styleId.trim().toLowerCase()
  return BOT_VISUAL_STYLES.find((style) => style.id === clean)
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
