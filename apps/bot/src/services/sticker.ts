import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { execa } from 'execa'
import type { DownloadedMedia } from '../utils/message.js'

export type StickerEffect = 'normal' | 'fliph' | 'flipv' | 'rotate90' | 'rotate180' | 'rotate270' | 'zoomin' | 'zoomout' | 'circle' | 'square' | 'grayscale'
export type StickerMetadata = { packName: string; publisher: string }

const MAX_STATIC_BYTES = 700 * 1024
const MAX_ANIMATED_BYTES = 950 * 1024

async function assertValidWebp(buffer: Buffer, label = 'sticker') {
  if (buffer.length < 16 || buffer.subarray(0, 4).toString('ascii') !== 'RIFF' || buffer.subarray(8, 12).toString('ascii') !== 'WEBP') {
    throw new Error(`El ${label} generado no es un WebP válido.`)
  }
  try {
    const metadata = await sharp(buffer, { animated: true }).metadata()
    if (metadata.format !== 'webp' || !metadata.width || !metadata.height) throw new Error('metadata inválida')
  } catch {
    throw new Error(`El ${label} WebP está corrupto o no se puede decodificar.`)
  }
}

async function applyImageEffect(buffer: Buffer, effect: StickerEffect) {
  let image = sharp(buffer, { animated: false }).rotate()
  switch (effect) {
    case 'fliph': return image.flop().png().toBuffer()
    case 'flipv': return image.flip().png().toBuffer()
    case 'rotate90': return image.rotate(90).png().toBuffer()
    case 'rotate180': return image.rotate(180).png().toBuffer()
    case 'rotate270': return image.rotate(270).png().toBuffer()
    case 'grayscale': return image.grayscale().png().toBuffer()
    case 'zoomin': return image.resize(620, 620, { fit: 'cover' }).extract({ left: 54, top: 54, width: 512, height: 512 }).png().toBuffer()
    case 'zoomout': return image.resize(380, 380, { fit: 'contain' }).extend({ top: 66, bottom: 66, left: 66, right: 66, background: '#00000000' }).png().toBuffer()
    case 'square': return image.resize(512, 512, { fit: 'contain', background: '#00000000' }).png().toBuffer()
    case 'circle': {
      const base = await image.resize(512, 512, { fit: 'cover' }).png().toBuffer()
      const mask = Buffer.from('<svg width="512" height="512"><circle cx="256" cy="256" r="256" fill="white"/></svg>')
      return sharp(base).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer()
    }
    default: return buffer
  }
}

async function imageSticker(buffer: Buffer, effect: StickerEffect) {
  const source = await applyImageEffect(buffer, effect)
  let smallest: Buffer | null = null
  for (const quality of [82, 74, 66, 58, 50]) {
    const candidate = await sharp(source, { animated: false })
      .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, withoutEnlargement: true })
      .webp({ quality, effort: 6, smartSubsample: true })
      .toBuffer()
    await assertValidWebp(candidate, 'sticker estático')
    if (!smallest || candidate.length < smallest.length) smallest = candidate
    if (candidate.length <= MAX_STATIC_BYTES) return candidate
  }
  if (!smallest) throw new Error('No pude generar el sticker estático.')
  if (smallest.length > MAX_STATIC_BYTES) throw new Error('La imagen es demasiado compleja para convertirla en un sticker estable. Intenta recortarla o reducirla.')
  return smallest
}

type AnimatedProfile = { size: number; fps: number; quality: number }
const animatedProfiles: AnimatedProfile[] = [
  { size: 512, fps: 15, quality: 58 },
  { size: 512, fps: 12, quality: 50 },
  { size: 480, fps: 10, quality: 46 },
  { size: 420, fps: 9, quality: 42 },
  { size: 384, fps: 8, quality: 38 },
]

async function videoSticker(buffer: Buffer) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-sticker-video-'))
  const input = path.join(dir, 'source.bin')
  await writeFile(input, buffer)
  let smallest: Buffer | null = null
  try {
    for (let index = 0; index < animatedProfiles.length; index += 1) {
      const profile = animatedProfiles[index]!
      const output = path.join(dir, `animated-${index}.webp`)
      await execa('ffmpeg', [
        '-y', '-hide_banner', '-loglevel', 'error',
        '-i', input,
        '-t', '6',
        '-vf', `fps=${profile.fps},scale=${profile.size}:${profile.size}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${profile.size}:${profile.size}:(ow-iw)/2:(oh-ih)/2:color=0x00000000,format=rgba`,
        '-an', '-c:v', 'libwebp', '-lossless', '0', '-compression_level', '6', '-q:v', String(profile.quality),
        '-loop', '0', '-preset', 'picture', output,
      ], { timeout: 90_000, maxBuffer: 10 * 1024 * 1024 })
      const candidate = await readFile(output)
      await assertValidWebp(candidate, 'sticker animado')
      if (!smallest || candidate.length < smallest.length) smallest = candidate
      if (candidate.length <= MAX_ANIMATED_BYTES) return candidate
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
  if (!smallest) throw new Error('FFmpeg no pudo generar un sticker animado válido.')
  throw new Error('El GIF/video genera un sticker demasiado pesado. Usa un clip de hasta 6 segundos con menos movimiento o menor resolución.')
}

function stickerExif(metadata: StickerMetadata) {
  const json = Buffer.from(JSON.stringify({
    'sticker-pack-id': `com.ghostnexora.${metadata.packName.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 48) || 'default'}`,
    'sticker-pack-name': metadata.packName,
    'sticker-pack-publisher': metadata.publisher,
    emojis: ['👻', '✨'],
  }), 'utf8')
  const header = Buffer.from([
    0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00,
    0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
  ])
  header.writeUInt32LE(json.length, 14)
  return Buffer.concat([header, json])
}

async function embedStickerMetadata(webp: Buffer, metadata?: StickerMetadata) {
  await assertValidWebp(webp)
  if (!metadata) return webp
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-sticker-meta-'))
  const input = path.join(dir, 'input.webp')
  const exif = path.join(dir, 'metadata.exif')
  const output = path.join(dir, 'output.webp')
  try {
    await writeFile(input, webp)
    await writeFile(exif, stickerExif(metadata))
    await execa('webpmux', ['-set', 'exif', exif, input, '-o', output], { timeout: 20_000 })
    const result = await readFile(output)
    await assertValidWebp(result, 'sticker con metadata')
    return result
  } catch {
    // Si webpmux no está disponible, el sticker sigue siendo válido aunque no lleve metadata.
    return webp
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

export async function mediaToSticker(media: DownloadedMedia, effect: StickerEffect = 'normal', metadata?: StickerMetadata): Promise<Buffer> {
  let webp: Buffer
  if (media.kind === 'video') {
    if (media.buffer.byteLength > 25 * 1024 * 1024) throw new Error('El video/GIF es demasiado grande para convertirlo en sticker. Usa un clip corto.')
    if (effect !== 'normal') throw new Error('Los efectos se aplican a imágenes; para GIF/video usa sticker normal.')
    webp = await videoSticker(media.buffer)
  } else {
    if (media.kind !== 'image') throw new Error('Envía o responde a una imagen, GIF o video corto.')
    webp = await imageSticker(media.buffer, effect)
  }
  const result = await embedStickerMetadata(webp, metadata)
  await assertValidWebp(result)
  return result
}

export async function stickerToPng(media: DownloadedMedia): Promise<Buffer> {
  if (media.kind !== 'sticker') throw new Error('Responde a un sticker con este comando.')
  return sharp(media.buffer, { animated: false }).png().toBuffer()
}
