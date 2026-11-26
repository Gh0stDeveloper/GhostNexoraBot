// 🎧 Audio de stickers con sonido (PR #120)
//
// El audio de un sticker con sonido NO está en la cita al responder:
// WhatsApp solo pone lo visual (el stickerMessage sin audioMessage) en
// el mensaje citado. El audio vive solo en el mensaje ORIGINAL, dentro
// de audioStickerMessage (campo 134 de Message, que Baileys no decodifica
// sin el parche de scripts/patch-baileys-premium.mjs).
//
// Por eso, cuando un sticker con sonido llega (el bot lo recibe directo
// en el grupo o en privado), se guarda AQUÍ solo la referencia del audio
// (url, mediaKey, directPath...), no el archivo. Con esa referencia el
// bot puede descargar el audio después, cuando alguien responda al
// sticker con .get, .relay o .stickerpremium.
//
// Qué se guarda y qué NO (regla de Pedro, 2026-11-26):
// - SOLO la referencia del audio (unas líneas de texto en JSON).
// - SOLO de stickers que traen sonido. Los stickers normales se ignoran.
// - En DISCO (config.dataDir/audio-stickers.json), no en RAM, para que
//   sobreviva a un reinicio del bot.
// - Cada entrada se borra sola a los 20 minutos (TTL), y hay un tope de
//   50 entradas (se borran las más viejas). Así el archivo nunca crece
//   y el almacenamiento no se llena.
// - NUNCA se descarga ni se guarda el archivo de audio o del sticker
//   al llegar: eso solo pasa cuando el usuario corre .relay o
//   .stickerpremium sobre ese sticker (como ya hacía antes).
//
// Si el archivo se corrompe o no se puede leer, se empieza de cero sin
// romper el bot: el audio simplemente no estará disponible y el comando
// avisará como antes.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { proto } from 'baileys'
import { config } from '../config.js'
import { unwrapMessage } from '../utils/message.js'

// 20 minutos: después de eso la entrada se borra sola.
export const TTL_AUDIO_STICKER_MS = 20 * 60 * 1000
// Tope de seguridad: nunca más de 50 audios guardados.
const MAX_ENTRADAS = 50

const ARCHIVO = path.join(config.dataDir, 'audio-stickers.json')

interface EntradaAudio {
  audio: Record<string, unknown>
  savedAt: number
}

type MapaAudio = Record<string, EntradaAudio>

// Las operaciones de archivo van en cadena para que dos escrituras no
// se pisen (un sticker que llega y un comando que lee a la vez).
let cadena: Promise<unknown> = Promise.resolve()
function encolar<T>(fn: () => Promise<T>): Promise<T> {
  const p = cadena.then(fn, fn) as Promise<T>
  cadena = p.then(
    () => undefined,
    () => undefined,
  )
  return p
}

// Normaliza un nodo del proto a JSON plano (igual que normalizar en
// message-inspect.ts): Uint8Array a base64, Long a decimal en texto,
// se quitan vacíos. Así el audio guardado tiene la misma forma que el
// que vendría en un JSON de .get, y descargarMedia lo acepta tal cual.
function esLong(v: unknown): v is { low: number; high: number; unsigned?: boolean } {
  return (
    !!v &&
    typeof v === 'object' &&
    typeof (v as { low?: unknown }).low === 'number' &&
    typeof (v as { high?: unknown }).high === 'number'
  )
}

function longAString(v: { low: number; high: number; unsigned?: boolean }): string {
  const low = BigInt(v.low >>> 0)
  const high = BigInt(v.high >>> 0)
  const u = (high << 32n) | low
  if (v.unsigned) return u.toString()
  return BigInt.asIntN(64, u).toString()
}

function normalizarAudio(valor: unknown): unknown {
  if (valor instanceof Uint8Array) return Buffer.from(valor).toString('base64')
  if (esLong(valor)) return longAString(valor)
  if (Array.isArray(valor)) {
    const arr = valor.map(normalizarAudio).filter((v) => v !== undefined)
    return arr.length ? arr : undefined
  }
  if (valor && typeof valor === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      const n = normalizarAudio(v)
      if (n !== undefined) out[k] = n
    }
    return Object.keys(out).length ? out : undefined
  }
  return valor
}

// La huella del sticker como clave: fileSha256 en base64, venga como
// Uint8Array (del proto) o como texto (de un JSON).
export function claveHuella(fileSha256: unknown): string | undefined {
  if (fileSha256 instanceof Uint8Array) return Buffer.from(fileSha256).toString('base64')
  if (typeof fileSha256 === 'string' && fileSha256) return fileSha256
  return undefined
}

async function cargar(): Promise<MapaAudio> {
  try {
    const texto = await readFile(ARCHIVO, 'utf8')
    const obj = JSON.parse(texto) as unknown
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {}
    return obj as MapaAudio
  } catch {
    return {}
  }
}

async function guardar(mapa: MapaAudio): Promise<void> {
  await mkdir(path.dirname(ARCHIVO), { recursive: true })
  const tmp = `${ARCHIVO}.tmp`
  await writeFile(tmp, JSON.stringify(mapa), 'utf8')
  await rename(tmp, ARCHIVO)
}

// Quita las entradas vencidas (> TTL) y, si aún hay demasiadas, las más
// viejas. Devuelve true si quitó algo (para reescribir el archivo).
function podar(mapa: MapaAudio, ahora: number): boolean {
  let cambio = false
  for (const [k, v] of Object.entries(mapa)) {
    if (!v || typeof v.savedAt !== 'number' || ahora - v.savedAt > TTL_AUDIO_STICKER_MS) {
      delete mapa[k]
      cambio = true
    }
  }
  const claves = Object.keys(mapa)
  if (claves.length > MAX_ENTRADAS) {
    claves
      .sort((a, b) => (mapa[a]?.savedAt ?? 0) - (mapa[b]?.savedAt ?? 0))
      .slice(0, claves.length - MAX_ENTRADAS)
      .forEach((k) => {
        delete mapa[k]
        cambio = true
      })
  }
  return cambio
}

// Guarda la referencia del audio de un sticker con sonido.
// `audio` es el nodo audioMessage del proto (se normaliza a JSON).
export async function guardarAudioSticker(clave: string, audio: unknown): Promise<void> {
  const norm = normalizarAudio(audio)
  if (!norm || typeof norm !== 'object') return
  await encolar(async () => {
    const mapa = await cargar()
    const ahora = Date.now()
    mapa[clave] = { audio: norm as Record<string, unknown>, savedAt: ahora }
    // Podar DESPUÉS de agregar: así el tope (50) se cumple con la
    // entrada nueva ya dentro, y se borran las más viejas.
    podar(mapa, ahora)
    await guardar(mapa)
  })
}

// Busca el audio guardado de un sticker por su huella (fileSha256 en
// base64). Devuelve el audioMessage normalizado (como en un JSON de
// .get) o undefined si no está o ya venció (20 min).
export async function obtenerAudioSticker(clave: string): Promise<Record<string, unknown> | undefined> {
  return encolar(async () => {
    const mapa = await cargar()
    const ahora = Date.now()
    if (podar(mapa, ahora)) await guardar(mapa)
    const entrada = mapa[clave]
    if (!entrada || !entrada.audio) return undefined
    return entrada.audio
  })
}

// Revisa un mensaje que llega: si es un sticker con sonido (envuelto en
// audioStickerMessage o con audioMessage directo), guarda la referencia
// del audio con la huella del sticker. Devuelve true si guardó algo.
// No lanza: si algo falla, solo se registra y el mensaje sigue su ruta.
export async function registrarAudioStickerDeMensaje(message: proto.IMessage | null | undefined): Promise<boolean> {
  try {
    const contenido = unwrapMessage(message)
    const sticker = (contenido as unknown as { stickerMessage?: Record<string, unknown> } | undefined)?.stickerMessage
    if (!sticker || !sticker.audioMessage) return false
    const clave = claveHuella(sticker.fileSha256)
    if (!clave) return false
    await guardarAudioSticker(clave, sticker.audioMessage)
    console.log('[audio-store] audio guardado, huella', clave.slice(0, 12) + '...')
    return true
  } catch (e) {
    console.log('[audio-store] no se pudo guardar el audio:', e instanceof Error ? e.message : e)
    return false
  }
}
