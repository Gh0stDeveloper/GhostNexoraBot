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
// Cómo reenvía .relay: como un reenvío del contenido original
// (generateWAMessageFromContent + relayMessage), sin volver a subir el
// archivo. Así el sticker llega tal cual: con su premium, su tamaño,
// su animación y, si es Lottie, como Lottie. Si eso falla, intenta la
// ruta vieja (descargar y volver a subir) y si también falla, avisa.

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

// Reenvía el contenido original tal cual (como un reenvío): el archivo
// no se vuelve a subir, así que conserva premium, tamaño, animación y,
// si es Lottie, sigue siendo Lottie. El medio ya está alojado en los
// servidores de WhatsApp (url/directPath del JSON).
async function reenviarPorContenido(
  sock: WASocket,
  jid: string,
  contenido: proto.IMessage,
  quoted?: WAMessage,
): Promise<void> {
  const b = await baileys()
  const generateWAMessageFromContent = pick(b, 'generateWAMessageFromContent')
  const wa = generateWAMessageFromContent(jid, contenido, quoted ? { quoted } : {})
  await sock.relayMessage(jid, wa.message!, { messageId: wa.key.id! })
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

// Reenvía el contenido en el chat. Devuelve el tipo reenviado.
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
  // 1) Reenvío del contenido original (conserva todo, no corrompe Lottie)
  try {
    await reenviarPorContenido(sock, jid, contenido, quoted)
    return clave === 'stickerMessage'
      ? 'sticker'
      : clave === 'imageMessage'
        ? 'imagen'
        : clave === 'videoMessage'
          ? 'video'
          : clave === 'audioMessage'
            ? 'audio'
            : 'documento'
  } catch (e) {
    console.log('[relay] reenvío por contenido falló, intento descarga:', e instanceof Error ? e.message : e)
  }
  // 2) Respaldo: descargar y volver a subir. Un sticker Lottie por esta
  // ruta saldría corrupto (sus bytes son JSON, no WebP), así que no se intenta.
  if (nodo?.isLottie) throw new Error('LOTTIE_SIN_RELAY')
  const tipo = TIPOS_MEDIA[clave]
  const buffer = await descargarMedia(nodo, tipo)
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
