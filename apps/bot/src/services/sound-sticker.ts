// 🔊 STICKERS CON SONIDO para Ghost Nexora Bot
//
// Método portado de NaufraBot (NaufraZapp/Naufrabot-base, settings/lib/stickersonido.js):
// WhatsApp lanzó los stickers con sonido el 24/11/2026. El formato oficial es
// Message.audioStickerMessage (campo 134, FutureProofMessage) con el sticker dentro
// (campo 26) y el sonido como stickerMessage.audioMessage (campo 26, OGG Opus).
// Baileys 7.0.0-rc14 todavía no conoce esos campos y los borraría al enviar, así que
// el mensaje se arma aquí en bytes ("en crudo"). Si algo falla, se manda el sticker
// y el audio por separado (respaldo).
//
// Cómo se usa (comando /stickersonido, ver commands/sound-sticker.ts):
//   1) Responde a un VIDEO con sonido: el bot usa el sonido del mismo video y listo.
//   2) Responde a una foto, GIF o sticker: luego manda un audio o nota de voz
//      (máx. 10 s) en 2 minutos y el bot arma el sticker con ese sonido.
// Quien lo recibe toca el ícono 🔊 del sticker para escucharlo.
//
// Notas de la adaptación a Ghost Nexora Bot:
//   - El WebP se genera con el propio mediaToSticker del bot (conserva el pack
//     personalizado del usuario: spack / sauthor). El video se recorta a 6 s en la
//     animación (límite del videoSticker del bot); el audio puede durar hasta 10 s.
//   - No necesita nuevas dependencias ni cambios en .env. ffmpeg/ffprobe ya los
//     instala el instalador del bot en el VPS.

import { randomBytes } from 'node:crypto'
import { execFile } from 'node:child_process'
import { writeFileSync, readFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { proto, WAMessage, WASocket } from 'baileys'
import type { LegacyCompatibleCommandContext } from '../types.js'
import { downloadMessageMedia, unwrapMessage, getContextInfo } from '../utils/message.js'
import { mediaToSticker } from '../services/sticker.js'
import { stickerPreferences } from '../services/sticker-preferences.js'

const MAX_SEG = 10
const ESPERA_MS = 2 * 60 * 1000

type Pendiente = { webp: Buffer; animado: boolean; ts: number }
const pendientes = new Map<string, Pendiente>()

const clave = (chat: string, persona: string) =>
  `${chat}|${String(persona || '').split('@')[0].split(':')[0]}`

// ---------------------------------------------------------------- Baileys en crudo
const _b: Record<string, any> = {}
async function baileys(): Promise<any> {
  if (!_b.ok) {
    Object.assign(_b, await import('baileys'))
    _b.ok = true
  }
  return _b
}
const pick = (b: any, k: string) => b[k] || (b.default && b.default[k])

// protobuf a mano: campo "length-delimited" (tipo 2): tag + largo + bytes
function varint(n: number): Buffer {
  const out: number[] = []
  n = Number(n)
  while (n > 127) {
    out.push((n & 0x7f) | 0x80)
    n = Math.floor(n / 128)
  }
  out.push(n)
  return Buffer.from(out)
}
const campo = (num: number, bytes: Buffer | Uint8Array): Buffer =>
  Buffer.concat([varint(num * 8 + 2), varint(bytes.length), Buffer.from(bytes)])

// Message con audioStickerMessage, en bytes
function armarBytes(protoObj: any, stickerMessage: any, audioMessage: any): Buffer {
  const stickerBytes = protoObj.Message.StickerMessage.encode(stickerMessage).finish()
  const audioBytes = protoObj.Message.AudioMessage.encode(audioMessage).finish()
  const stickerConSonido = Buffer.concat([Buffer.from(stickerBytes), campo(26, audioBytes)]) // StickerMessage.audioMessage = 26
  const mensajeInterno = campo(26, stickerConSonido) // Message.stickerMessage = 26
  const futureProof = campo(1, mensajeInterno) // FutureProofMessage.message = 1
  return campo(134, futureProof) // Message.audioStickerMessage = 134
}

// Baileys codifica con proto.Message.encode(...). Para nuestros mensajes (marcados
// con __crudo) se devuelven los bytes ya armados, también cuando Baileys los
// envuelve para tus otros dispositivos.
let parcheado = false
function parchearEncode(protoObj: any): void {
  if (parcheado) return
  parcheado = true
  const orig = protoObj.Message.encode.bind(protoObj.Message)
  const comoWriter = (bytes: Buffer) => ({ finish: () => new Uint8Array(bytes) })
  protoObj.Message.encode = function (m: any, w: any) {
    if (m && m.__crudo && !w) return comoWriter(m.__crudo)
    const dsm = m && m.deviceSentMessage
    if (!w && dsm && dsm.message && dsm.message.__crudo) {
      const resto = { ...m }
      delete resto.deviceSentMessage
      const base = Buffer.from(orig(resto).finish())
      const partes: Buffer[] = []
      if (dsm.destinationJid) partes.push(campo(1, Buffer.from(String(dsm.destinationJid))))
      partes.push(campo(2, dsm.message.__crudo))
      if (dsm.phash) partes.push(campo(3, Buffer.from(String(dsm.phash))))
      return comoWriter(Buffer.concat([base, campo(31, Buffer.concat(partes))])) // Message.deviceSentMessage = 31
    }
    return orig(m, w)
  }
}

// ---------------------------------------------------------------- audio (ffmpeg)
function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((ok, mal) =>
    execFile('ffmpeg', args, { timeout: 60_000 }, (e) => (e ? mal(e) : ok())),
  )
}

function duracion(archivo: string): Promise<number> {
  return new Promise((ok) =>
    execFile(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', archivo],
      (e, out) => ok(e ? 0 : Math.ceil(Number(out) || 0)),
    ),
  )
}

// ¿El video trae sonido de verdad? (pista de audio y que no sea puro silencio)
async function tieneSonido(buffer: Buffer): Promise<boolean> {
  const archivo = join(tmpdir(), `${randomBytes(6).toString('hex')}.mp4`)
  writeFileSync(archivo, buffer)
  try {
    const pistas = await new Promise<string>((ok) =>
      execFile(
        'ffprobe',
        ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', archivo],
        (e, out) => ok(e ? '' : String(out).trim()),
      ),
    )
    if (!pistas) return false
    const max = await new Promise<number>((ok) =>
      execFile(
        'ffmpeg',
        ['-i', archivo, '-t', String(MAX_SEG), '-vn', '-af', 'volumedetect', '-f', 'null', '-'],
        { timeout: 60_000 },
        (_e, _so, se) => {
          const m = /max_volume:\s*(-?[\d.]+|-inf) dB/.exec(String(se || ''))
          ok(m ? (m[1] === '-inf' ? -999 : Number(m[1])) : -999)
        },
      ),
    )
    return max > -50
  } catch {
    return false
  } finally {
    try {
      unlinkSync(archivo)
    } catch {}
  }
}

async function aOpus(buffer: Buffer): Promise<{ ogg: Buffer; seg: number }> {
  const id = randomBytes(6).toString('hex')
  const entrada = join(tmpdir(), `${id}.in`)
  const salida = join(tmpdir(), `${id}.ogg`)
  writeFileSync(entrada, buffer)
  try {
    // máx. 10 s, mono, Opus 48 kbps → muy por debajo del límite de 1 MB
    await runFfmpeg([
      '-y', '-i', entrada, '-vn', '-t', String(MAX_SEG),
      '-c:a', 'libopus', '-b:a', '48k', '-ac', '1', '-ar', '48000',
      '-application', 'voip', salida,
    ])
    const seg = Math.max(1, Math.min(MAX_SEG, await duracion(salida)))
    return { ogg: readFileSync(salida), seg }
  } finally {
    try {
      unlinkSync(entrada)
    } catch {}
    try {
      unlinkSync(salida)
    } catch {}
  }
}

// ---------------------------------------------------------------- media del mensaje
type NodoMedia = {
  node: any
  kind: 'image' | 'video' | 'sticker'
  seconds?: number
  gifPlayback?: boolean
  isAnimated?: boolean
}

function selectNodo(content: proto.IMessage | undefined): NodoMedia | null {
  if (!content) return null
  if (content.imageMessage) return { node: content.imageMessage, kind: 'image' }
  if (content.videoMessage) {
    return {
      node: content.videoMessage,
      kind: 'video',
      seconds: Number(content.videoMessage.seconds || 0),
      gifPlayback: !!content.videoMessage.gifPlayback,
    }
  }
  if (content.stickerMessage) {
    return {
      node: content.stickerMessage,
      kind: 'sticker',
      isAnimated: !!content.stickerMessage.isAnimated,
    }
  }
  return null
}

function nodoMedia(message: WAMessage): NodoMedia | null {
  const propio = selectNodo(unwrapMessage(message.message))
  if (propio) return propio
  const citado = getContextInfo(message)?.quotedMessage
  return selectNodo(unwrapMessage(citado))
}

async function descargarAudio(message: WAMessage): Promise<Buffer | null> {
  const b = await baileys()
  const downloadContentFromMessage = pick(b, 'downloadContentFromMessage')
  const propio = unwrapMessage(message.message)?.audioMessage
  const citado = getContextInfo(message)?.quotedMessage
  const node = propio ?? unwrapMessage(citado)?.audioMessage
  if (!node) return null
  const stream = await downloadContentFromMessage(node, 'audio')
  const chunks: Buffer[] = []
  for await (const chunk of stream as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk))
  if (!chunks.length) return null
  return Buffer.concat(chunks)
}

// ---------------------------------------------------------------- envío
async function enviarSoundSticker(
  sock: WASocket,
  jid: string,
  webp: Buffer,
  animado: boolean,
  audioBuffer: Buffer,
  quoted?: WAMessage,
): Promise<{ ok: boolean; error?: string }> {
  const b = await baileys()
  const protoObj = pick(b, 'proto')
  const prepare = pick(b, 'prepareWAMessageMedia')
  const { ogg, seg } = await aOpus(audioBuffer)

  try {
    parchearEncode(protoObj)
    const opts = { upload: (sock as any).waUploadToServer }
    const s = await prepare({ sticker: webp }, opts)
    const a = await prepare({ audio: ogg, mimetype: 'audio/ogg; codecs=opus', ptt: false, seconds: seg }, opts)
    const stickerMessage = s.stickerMessage
    const audioMessage = a.audioMessage
    stickerMessage.isAnimated = !!animado
    stickerMessage.width = stickerMessage.width || 512
    stickerMessage.height = stickerMessage.height || 512
    audioMessage.seconds = seg
    if (quoted && quoted.key) {
      stickerMessage.contextInfo = {
        stanzaId: quoted.key.id,
        participant: quoted.key.participant || quoted.key.remoteJid,
        quotedMessage: quoted.message,
      }
    }
    const bytes = armarBytes(protoObj, stickerMessage, audioMessage)
    const genId = pick(b, 'generateMessageIDV2') || pick(b, 'generateMessageID')
    const messageId = genId.length ? genId((sock as any).user && (sock as any).user.id) : genId()
    await (sock as any).relayMessage(jid, { __crudo: bytes, audioStickerMessage: {} }, { messageId })
    return { ok: true }
  } catch (e) {
    console.log('[stickersonido] envío como sticker con sonido falló, mando por separado:', (e as Error).message)
    // Respaldo: sticker + nota de voz
    await sock.sendMessage(jid, { sticker: webp }, quoted ? { quoted } : undefined)
    await sock.sendMessage(jid, { audio: ogg, mimetype: 'audio/ogg; codecs=opus', ptt: true }, quoted ? { quoted } : undefined)
    return { ok: false, error: (e as Error).message }
  }
}

// ---------------------------------------------------------------- comando
export async function iniciarSoundSticker(ctx: LegacyCompatibleCommandContext): Promise<void> {
  const { message, chatId, sender, prefix } = ctx as unknown as {
    message: WAMessage
    chatId: string
    sender: string
    prefix: string
  }
  const sock = (ctx as unknown as { socket: WASocket }).socket
  const reply = (ctx as unknown as { reply: (text: string) => Promise<unknown> }).reply

  const media = await downloadMessageMedia(message).catch(() => null)
  const nodo = nodoMedia(message)
  if (!media || !nodo || !['image', 'video', 'sticker'].includes(media.kind)) {
    await reply(
      `🔊 *STICKER CON SONIDO*\n\n` +
        `1️⃣ Responde a una *foto, video, GIF o sticker* con *${prefix}stickersonido*\n` +
        `2️⃣ Si es un *video con sonido*, el bot usa ese mismo sonido 🎬 (si dura más de 10 s, lo recorta solo a 10 s)\n` +
        `3️⃣ Si es foto, GIF o sticker, luego envía un *audio o nota de voz* (máx. ${MAX_SEG} s)\n\n` +
        `Y listo: un sticker que suena al tocarlo 🎶`,
    )
    return
  }

  // Si el video dura más de 10 s, el bot lo recorta solo a 10 s:
  // el audio se corta con -t 10 en aOpus y la animación a 6 s en mediaToSticker.
  let webp: Buffer
  let animado = false
  try {
    if (media.kind === 'sticker') {
      webp = media.buffer
      animado = !!nodo.isAnimated
    } else {
      const metadata = stickerPreferences.get(sender)
      webp = await mediaToSticker(media, 'normal', metadata)
      animado = media.kind === 'video'
    }
  } catch (e) {
    console.log('[stickersonido] imagen:', (e as Error).message)
    await reply('❌ No pude preparar la imagen. Si es antigua, reenvíala e inténtalo de nuevo.')
    return
  }

  // 🎬 Video con sonido (no GIF): se usa el sonido del mismo video, sin pedir audio
  const esGif = nodo.kind === 'video' && !!nodo.gifPlayback
  if (nodo.kind === 'video' && !esGif && (await tieneSonido(media.buffer))) {
    try {
      const r = await enviarSoundSticker(sock, chatId, webp, animado, media.buffer, message)
      if (!r.ok) await reply('⚠️ No pude unir el sonido al sticker, así que te los mandé por separado.')
    } catch (e) {
      console.log('[stickersonido] video:', (e as Error).message)
      await reply('❌ No pude crear el sticker con sonido. Intenta con otro video.')
    }
    return
  }

  pendientes.set(clave(chatId, sender), { webp, animado, ts: Date.now() })
  if (nodo.kind === 'video' && !esGif) {
    await reply(`🔇 Ese video no tiene sonido. Envía un *audio o nota de voz* (máx. ${MAX_SEG} s).\n⏳ Tienes 2 minutos.`)
    return
  }
  await reply(`🎙️ ¡Imagen lista! Ahora envía un *audio o nota de voz* (máx. ${MAX_SEG} s).\n⏳ Tienes 2 minutos.`)
}

export function hayPendienteSoundSticker(chat: string, persona: string): boolean {
  const p = pendientes.get(clave(chat, persona))
  if (!p) return false
  if (Date.now() - p.ts > ESPERA_MS) {
    pendientes.delete(clave(chat, persona))
    return false
  }
  return true
}

// Se llama con cada mensaje antes del router (ver index.ts): si es el audio que
// esperábamos, arma el sticker. Devuelve true cuando el mensaje queda consumido.
export async function handleSoundStickerAudio(
  socket: WASocket,
  message: WAMessage,
): Promise<boolean> {
  const chatId = message.key.remoteJid ?? ''
  const persona = message.key.participant ?? chatId
  if (!hayPendienteSoundSticker(chatId, persona)) return false
  const audio = await descargarAudio(message).catch(() => null)
  if (!audio) return false
  const p = pendientes.get(clave(chatId, persona))
  pendientes.delete(clave(chatId, persona))
  if (!p) return false
  try {
    const r = await enviarSoundSticker(socket, chatId, p.webp, p.animado, audio, message)
    if (!r.ok) {
      await socket
        .sendMessage(chatId, { text: '⚠️ No pude unir el sonido al sticker, así que te los mandé por separado.' }, { quoted: message })
        .catch(() => undefined)
    }
  } catch (e) {
    console.log('[stickersonido]', (e as Error).message)
    await socket
      .sendMessage(chatId, { text: '❌ No pude crear el sticker con sonido. Intenta con otro audio.' }, { quoted: message })
      .catch(() => undefined)
  }
  return true
}
