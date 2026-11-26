// 🔍 GET y RELAY para Ghost Nexora Bot
//
// .get — responde a un mensaje o sticker y el bot devuelve su JSON
//   (el contenido del mensaje: stickerMessage, imageMessage, ...).
// .relay — responde a un mensaje con un JSON válido de mensaje o sticker
//   y el bot lo vuelve a enviar en el chat. También acepta el JSON
//   pegado al comando: .relay {...}
//
// No hace falta ser admin del bot para usarlos. Si el JSON no es válido
// o el archivo ya no se puede descargar (los enlaces de WhatsApp caducan),
// el bot avisa al usuario en vez de fallar en silencio.
//
// El JSON que devuelve .get es el mismo que acepta .relay: se copia,
// se pega como mensaje y se responde con .relay.
//
// Cómo reenvía .relay: SOLO desde el JSON. Descarga el archivo con los
// datos del JSON (url/directPath + mediaKey) y lo vuelve a subir como un
// archivo nuevo, con los metadatos del JSON (mimetype, tamaño, animación,
// Lottie...). Nunca busca el sticker original ni lo reenvía tal cual:
// el sticker que llega es una copia nueva subida por el bot.

import type { proto, WAMessage, WASocket } from 'baileys'
import type { LegacyCompatibleCommandContext } from '../types.js'
import { unwrapMessage, getContextInfo } from '../utils/message.js'

const CLAVES_VALIDAS = [
  'stickerMessage',
  'imageMessage',
  'videoMessage',
  'audioMessage',
  'documentMessage',
  'conversation',
  'extendedTextMessage',
] as const

type ClaveValida = (typeof CLAVES_VALIDAS)[number]

const TIPOS_MEDIA: Record<string, 'sticker' | 'image' | 'video' | 'audio' | 'document'> = {
  stickerMessage: 'sticker',
  imageMessage: 'image',
  videoMessage: 'video',
  audioMessage: 'audio',
  documentMessage: 'document',
}

// Baileys a mano (igual que en sound-sticker.ts)
const _b: Record<string, any> = {}
async function baileys(): Promise<any> {
  if (!_b.ok) {
    Object.assign(_b, await import('baileys'))
    _b.ok = true
  }
  return _b
}
const pick = (b: any, k: string) => b[k] || (b.default && b.default[k])

// Los números de 64 bits llegan como objetos Long {low, high, unsigned}.
// En JSON saldrían así y el otro bot los muestra como texto ("18458").
// Se convierten a su valor decimal en texto.
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

// Los campos binarios de Baileys llegan como Uint8Array: a base64 para
// que el JSON salga limpio y .relay lo pueda leer de vuelta tal cual.
// Los arreglos y objetos vacíos (valores por defecto del proto, como
// mentionedJid: []) se quitan, como hace el otro bot.
function normalizar(valor: unknown): unknown {
  if (valor instanceof Uint8Array) return Buffer.from(valor).toString('base64')
  if (esLong(valor)) return longAString(valor)
  if (Array.isArray(valor)) {
    const arr = valor.map(normalizar).filter((v) => v !== undefined)
    return arr.length ? arr : undefined
  }
  if (valor && typeof valor === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      const n = normalizar(v)
      if (n !== undefined) out[k] = n
    }
    return Object.keys(out).length ? out : undefined
  }
  return valor
}

// El mensaje citado por el comando (o nada si no responde a nada)
export function mensajeCitado(message: WAMessage): proto.IMessage | undefined {
  const citado = getContextInfo(message)?.quotedMessage
  return unwrapMessage(citado)
}

// Texto de un contenido: texto plano, texto extendido o caption
function textoDeContenido(contenido: proto.IMessage | undefined): string {
  if (!contenido) return ''
  return String(
    contenido.conversation ??
      contenido.extendedTextMessage?.text ??
      contenido.imageMessage?.caption ??
      contenido.videoMessage?.caption ??
      '',
  ).trim()
}

// Quita las cercas ```json ... ``` si el JSON viene en bloque de código
function limpiarJson(texto: string): string {
  let t = texto.trim()
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  }
  return t.trim()
}

// Valida el JSON y devuelve el contenido del mensaje.
// Acepta el contenido directo {stickerMessage: {...}} o envuelto {message: {...}}.
export function parsearContenido(texto: string): { contenido: proto.IMessage; clave: ClaveValida } {
  let obj: unknown
  try {
    obj = JSON.parse(limpiarJson(texto))
  } catch {
    throw new Error('JSON_INVALIDO')
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('JSON_INVALIDO')
  const contenido = ((obj as Record<string, unknown>).message ?? obj) as proto.IMessage
  const clave = CLAVES_VALIDAS.find((k) => (contenido as Record<string, unknown>)[k] != null)
  if (!clave) throw new Error('SIN_MENSAJE')
  return { contenido, clave }
}

async function descargarMedia(
  nodo: any,
  tipo: 'sticker' | 'image' | 'video' | 'audio' | 'document',
): Promise<Buffer> {
  if (!nodo?.mediaKey || (!nodo.url && !nodo.directPath)) throw new Error('SIN_MEDIA')
  const b = await baileys()
  const downloadContentFromMessage = pick(b, 'downloadContentFromMessage')
  // Mismo patrón que downloadMessageMedia del bot: nodo directo + tipo
  const stream = await downloadContentFromMessage(nodo, tipo)
  const chunks: Buffer[] = []
  for await (const chunk of stream as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk))
  if (!chunks.length) throw new Error('DESCARGA_VACIA')
  return Buffer.concat(chunks)
}

// Vuelve a subir el archivo descargado como un archivo nuevo, con los
// metadatos del JSON (mimetype, tamaño, animación, Lottie...). El medio
// queda alojado de nuevo en los servidores de WhatsApp, con url y clave
// nuevas: el sticker que llega es una copia nueva, no el original.
// Usa prepareWAMessageMedia de Baileys (lo mismo que usa sendMessage por
// dentro) y luego envía el contenido ya subido.
async function resubirMedio(
  sock: WASocket,
  jid: string,
  clave: ClaveValida,
  nodo: any,
  buffer: Buffer,
  quoted?: WAMessage,
): Promise<void> {
  const b = await baileys()
  const prepareWAMessageMedia = pick(b, 'prepareWAMessageMedia')
  const generateWAMessageFromContent = pick(b, 'generateWAMessageFromContent')
  const mensaje: Record<string, unknown> = {}
  switch (clave) {
    case 'stickerMessage':
      mensaje.sticker = buffer
      if (nodo.mimetype) mensaje.mimetype = nodo.mimetype
      if (nodo.isLottie) mensaje.isLottie = true
      if (nodo.isAnimated) mensaje.isAnimated = true
      if (nodo.premium != null) mensaje.premium = nodo.premium
      if (nodo.firstFrameLength) mensaje.firstFrameLength = nodo.firstFrameLength
      if (nodo.firstFrameSidecar) mensaje.firstFrameSidecar = nodo.firstFrameSidecar
      if (nodo.height) mensaje.height = nodo.height
      if (nodo.width) mensaje.width = nodo.width
      break
    case 'imageMessage':
      mensaje.image = buffer
      if (nodo.caption) mensaje.caption = nodo.caption
      if (nodo.mimetype) mensaje.mimetype = nodo.mimetype
      if (nodo.height) mensaje.height = nodo.height
      if (nodo.width) mensaje.width = nodo.width
      break
    case 'videoMessage':
      mensaje.video = buffer
      if (nodo.caption) mensaje.caption = nodo.caption
      if (nodo.mimetype) mensaje.mimetype = nodo.mimetype
      if (nodo.gifPlayback) mensaje.gifPlayback = true
      if (nodo.seconds) mensaje.seconds = nodo.seconds
      if (nodo.height) mensaje.height = nodo.height
      if (nodo.width) mensaje.width = nodo.width
      break
    case 'audioMessage':
      mensaje.audio = buffer
      mensaje.mimetype = 'audio/ogg; codecs=opus'
      if (nodo.ptt) mensaje.ptt = true
      if (nodo.seconds) mensaje.seconds = nodo.seconds
      break
    case 'documentMessage':
      mensaje.document = buffer
      if (nodo.mimetype) mensaje.mimetype = nodo.mimetype
      if (nodo.fileName) mensaje.fileName = nodo.fileName
      break
    default:
      throw new Error('SIN_MENSAJE')
  }
  const contenido = await prepareWAMessageMedia(mensaje, {
    upload: (sock as any).waUploadToServer,
  })
  const wa = generateWAMessageFromContent(jid, contenido, quoted ? { quoted } : {})
  await sock.relayMessage(jid, wa.message!, { messageId: wa.key.id! })
}

// Reenvía el contenido en el chat. Devuelve el tipo reenviado.
// Siempre descarga del JSON y vuelve a subir: nunca reenvía el original.
export async function reenviarContenido(
  sock: WASocket,
  jid: string,
  contenido: proto.IMessage,
  clave: ClaveValida,
  quoted?: WAMessage,
): Promise<string> {
  const opts = quoted ? { quoted } : undefined
  if (clave === 'conversation') {
    await sock.sendMessage(jid, { text: String((contenido as any).conversation) }, opts)
    return 'texto'
  }
  if (clave === 'extendedTextMessage') {
    await sock.sendMessage(jid, { text: String((contenido as any).extendedTextMessage.text ?? '') }, opts)
    return 'texto'
  }
  const nodo = (contenido as any)[clave]
  const tipo = TIPOS_MEDIA[clave]
  const nombreTipo =
    clave === 'stickerMessage'
      ? 'sticker'
      : clave === 'imageMessage'
        ? 'imagen'
        : clave === 'videoMessage'
          ? 'video'
          : clave === 'audioMessage'
            ? 'audio'
            : 'documento'
  // 1) Descargar del JSON y volver a subir como archivo nuevo
  const buffer = await descargarMedia(nodo, tipo)
  try {
    await resubirMedio(sock, jid, clave, nodo, buffer, quoted)
    return nombreTipo
  } catch (e) {
    console.log('[relay] resubida con metadatos falló, intento envío simple:', e instanceof Error ? e.message : e)
  }
  // 2) Respaldo: envío simple del archivo descargado. Un sticker Lottie
  // por esta ruta saldría corrupto (sus bytes son JSON, no WebP y el
  // envío simple lo marca como image/webp), así que no se intenta.
  if (nodo?.isLottie) throw new Error('LOTTIE_SIN_RELAY')
  // El envío simple no puede llevar la marca premium: si el sticker es
  // premium y la resubida con metadatos falló, mejor avisar que mandar
  // un sticker sin premium.
  if (clave === 'stickerMessage' && nodo?.premium != null) throw new Error('PREMIUM_SIN_REENVIO')
  switch (clave) {
    case 'stickerMessage':
      await sock.sendMessage(jid, { sticker: buffer }, opts)
      return 'sticker'
    case 'imageMessage':
      await sock.sendMessage(
        jid,
        { image: buffer, caption: nodo.caption ?? undefined, mimetype: nodo.mimetype ?? undefined },
        opts,
      )
      return 'imagen'
    case 'videoMessage':
      await sock.sendMessage(
        jid,
        {
          video: buffer,
          caption: nodo.caption ?? undefined,
          mimetype: nodo.mimetype ?? undefined,
          gifPlayback: !!nodo.gifPlayback,
        },
        opts,
      )
      return 'video'
    case 'audioMessage':
      await sock.sendMessage(
        jid,
        { audio: buffer, mimetype: 'audio/ogg; codecs=opus', ptt: !!nodo.ptt },
        opts,
      )
      return 'audio'
    case 'documentMessage':
      await sock.sendMessage(
        jid,
        { document: buffer, mimetype: nodo.mimetype ?? undefined, fileName: nodo.fileName ?? undefined },
        opts,
      )
      return 'documento'
    default:
      throw new Error('SIN_MENSAJE')
  }
}

// Errores claros para el usuario (si algo falla, se le avisa)
export function mensajeErrorRelay(error: unknown): string {
  const codigo = error instanceof Error ? error.message : String(error)
  switch (codigo) {
    case 'JSON_INVALIDO':
      return '❌ Ese texto no es un JSON válido. Responde a un mensaje que tenga el JSON completo del mensaje o sticker.'
    case 'SIN_MENSAJE':
      return '❌ Ese JSON no trae un mensaje o sticker válido. Tiene que tener stickerMessage, imageMessage, videoMessage, audioMessage, documentMessage o texto.'
    case 'SIN_MEDIA':
      return '❌ Ese JSON no trae los datos del archivo (falta mediaKey o el enlace). Pídele al bot el JSON de nuevo con .get.'
    case 'DESCARGA_VACIA':
      return '❌ No pude descargar ese archivo, llegó vacío. Intenta de nuevo o pide que te lo reenvíen.'
    case 'LOTTIE_SIN_RELAY':
      return '❌ Ese sticker es animado (Lottie) y no lo pude reenviar con sus datos originales. Pide que te lo reenvíen de nuevo y saca el JSON otra vez con .get.'
    case 'PREMIUM_SIN_REENVIO':
      return '❌ Ese sticker es premium y no lo pude reenviar con su marca premium. Intenta de nuevo.'
    default:
      return '❌ No pude reenviarlo. Puede que el enlace del archivo ya haya caducado (los enlaces de WhatsApp vencen); pídele a quien lo mandó que lo reenvíe y saca el JSON de nuevo con .get.'
  }
}

// ---------------------------------------------------------------- comandos

export async function ejecutarGet(ctx: LegacyCompatibleCommandContext): Promise<void> {
  const message = (ctx as unknown as { message: WAMessage }).message
  const prefix = (ctx as unknown as { prefix: string }).prefix
  const reply = (ctx as unknown as { reply: (text: string) => Promise<unknown> }).reply
  const citado = mensajeCitado(message)
  if (!citado) {
    await reply(`🔍 *GET*\n\nResponde a un mensaje o sticker con *${prefix}get* y te devuelvo su JSON.`)
    return
  }
  await reply(JSON.stringify(normalizar(citado), null, 2))
}

export async function ejecutarRelay(ctx: LegacyCompatibleCommandContext): Promise<void> {
  const message = (ctx as unknown as { message: WAMessage }).message
  const prefix = (ctx as unknown as { prefix: string }).prefix
  const sock = (ctx as unknown as { socket: WASocket }).socket
  const chatId = (ctx as unknown as { chatId: string }).chatId
  const reply = (ctx as unknown as { reply: (text: string) => Promise<unknown> }).reply
  const argText = ((ctx as unknown as { argText?: string }).argText ?? '').trim()

  // El JSON puede venir pegado al comando (.relay {...}) o en el mensaje citado
  let texto = argText
  if (!texto) texto = textoDeContenido(mensajeCitado(message))
  if (!texto) {
    await reply(
      `🔁 *RELAY*\n\nResponde a un mensaje con el JSON de un mensaje o sticker con *${prefix}relay* y lo vuelvo a enviar aquí. También puedes pegar el JSON junto al comando.`,
    )
    return
  }
  try {
    const { contenido, clave } = parsearContenido(texto)
    await reenviarContenido(sock, chatId, contenido, clave, message)
  } catch (e) {
    console.log('[relay]', e instanceof Error ? e.message : e)
    await reply(mensajeErrorRelay(e))
  }
}
