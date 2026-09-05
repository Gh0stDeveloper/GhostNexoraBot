import fs from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'

export type BotVisualStyle = {
  id: string
  name: string
  description: string
  icon: string
  characterQuery?: string
}

export type BotStyleImage = {
  index: number
  fileName: string
  filePath: string
}

export type BotStyleAsset = {
  style: BotVisualStyle
  imageUrl?: string
  characterName?: string
  sourceUrl?: string
  imageIndex?: number
  imageCount?: number
}

const STYLE_FILE = path.join(config.dataDir, 'bot-style.json')
const LOCAL_ASSET_ROOT = path.join(config.workspaceRoot, 'apps', 'bot', 'assets', 'waifus')
const LOCAL_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp'])

/**
 * Catálogo visual del bot.
 *
 * Las waifus usan exclusivamente imágenes locales empaquetadas con el proyecto.
 * El estilo Default continúa usando la foto actual de la cuenta de WhatsApp.
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

/** Alias amigables y compatibilidad con los IDs genéricos usados por V13. */
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
  selectedImages?: Record<string, number>
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

function cleanSelectedImages(value: unknown) {
  if (!value || typeof value !== 'object') return {} as Record<string, number>
  const clean: Record<string, number> = {}
  for (const [rawId, rawIndex] of Object.entries(value as Record<string, unknown>)) {
    const id = canonicalStyleId(rawId)
    const index = Math.floor(Number(rawIndex))
    if (id !== 'default' && Number.isFinite(index) && index > 0) clean[id] = index
  }
  return clean
}

function readStoredStyle(): StoredStyle {
  try {
    const raw = JSON.parse(fs.readFileSync(STYLE_FILE, 'utf8')) as Partial<StoredStyle>
    const requested = String(raw.styleId ?? 'default')
    const style = getBotVisualStyle(requested)
    return {
      styleId: style?.id ?? 'default',
      selectedImages: cleanSelectedImages(raw.selectedImages),
      updatedBy: raw.updatedBy,
      updatedAt: Number(raw.updatedAt ?? 0),
    }
  } catch {
    return { styleId: 'default', selectedImages: {} }
  }
}

function persistStyle(state: StoredStyle) {
  fs.mkdirSync(config.dataDir, { recursive: true })
  const temp = `${STYLE_FILE}.${process.pid}.tmp`
  fs.writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  fs.renameSync(temp, STYLE_FILE)
}

function displayCharacterName(style: BotVisualStyle) {
  return style.characterQuery ?? style.name.split('·')[0]!.trim()
}

export function getBotVisualStyleAssetRoot() {
  return LOCAL_ASSET_ROOT
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

export function listBotVisualStyleImages(styleOrId: BotVisualStyle | string): BotStyleImage[] {
  const style = typeof styleOrId === 'string' ? getBotVisualStyle(styleOrId) : styleOrId
  if (!style || style.id === 'default') return []
  const dir = path.join(LOCAL_ASSET_ROOT, style.id)
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && LOCAL_IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
      .map((fileName, offset) => ({
        index: offset + 1,
        fileName,
        filePath: path.join(dir, fileName),
      }))
  } catch {
    return []
  }
}

export function getBotVisualStyleImageSelection(styleId: string) {
  const style = getBotVisualStyle(styleId)
  if (!style || style.id === 'default') return undefined
  const images = listBotVisualStyleImages(style)
  if (!images.length) return undefined
  const requested = readStoredStyle().selectedImages?.[style.id] ?? 1
  const image = images.find((row) => row.index === requested) ?? images[0]!
  return { style, image, imageCount: images.length }
}

export function setCurrentBotVisualStyle(styleId: string, updatedBy: string) {
  const style = getBotVisualStyle(styleId)
  if (!style) throw new Error(`Estilo desconocido: ${styleId}`)
  const state = readStoredStyle()
  persistStyle({
    ...state,
    styleId: style.id,
    selectedImages: state.selectedImages ?? {},
    updatedBy,
    updatedAt: Date.now(),
  })
  return style
}

export function setBotVisualStyleImage(styleId: string, imageIndex: number, updatedBy: string, activate = true) {
  const style = getBotVisualStyle(styleId)
  if (!style || style.id === 'default') throw new Error('Debes elegir una waifu con imágenes locales.')
  const images = listBotVisualStyleImages(style)
  if (!images.length) throw new Error(`No hay imágenes locales instaladas para ${style.name}. Ejecuta npm run assets:waifus.`)
  const index = Math.floor(Number(imageIndex))
  const image = images.find((row) => row.index === index)
  if (!image) throw new Error(`Imagen inválida. ${style.name} tiene ${images.length} variantes (1-${images.length}).`)

  const state = readStoredStyle()
  persistStyle({
    ...state,
    styleId: activate ? style.id : state.styleId,
    selectedImages: { ...(state.selectedImages ?? {}), [style.id]: image.index },
    updatedBy,
    updatedAt: Date.now(),
  })
  return { style, image, imageCount: images.length }
}

export async function resolveBotVisualStyleAsset(styleOrId: BotVisualStyle | string): Promise<BotStyleAsset> {
  const style = typeof styleOrId === 'string' ? getBotVisualStyle(styleOrId) : styleOrId
  if (!style) throw new Error('Estilo visual no encontrado.')
  if (style.id === 'default') return { style }

  const selection = getBotVisualStyleImageSelection(style.id)
  if (!selection) {
    throw new Error(`No hay imágenes locales instaladas para ${style.name}. Ejecuta npm run assets:waifus.`)
  }
  return {
    style,
    imageUrl: selection.image.filePath,
    characterName: displayCharacterName(style),
    imageIndex: selection.image.index,
    imageCount: selection.imageCount,
  }
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
