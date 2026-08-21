import { mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { config } from '../config.js'
import type { DownloadedMedia } from '../utils/message.js'

export type BrandingSlot = 'menu' | 'welcome' | 'goodbye'
export type BrandingAsset = { path: string; kind: 'image' | 'video'; size: number }

const root = path.join(config.dataDir, 'branding')

function imagePath(slot: BrandingSlot) { return path.join(root, `${slot}.jpg`) }
function videoPath(slot: BrandingSlot) { return path.join(root, `${slot}.mp4`) }

async function removeSlot(slot: BrandingSlot) {
  await Promise.all([
    rm(imagePath(slot), { force: true }).catch(() => undefined),
    rm(videoPath(slot), { force: true }).catch(() => undefined),
  ])
}

export async function getBrandingAsset(slot: BrandingSlot): Promise<BrandingAsset | null> {
  const image = imagePath(slot)
  if (existsSync(image)) {
    const info = await stat(image).catch(() => null)
    if (info?.isFile()) return { path: image, kind: 'image', size: info.size }
  }
  const video = videoPath(slot)
  if (existsSync(video)) {
    const info = await stat(video).catch(() => null)
    if (info?.isFile()) return { path: video, kind: 'video', size: info.size }
  }
  return null
}

export async function saveBrandingAsset(slot: BrandingSlot, media: DownloadedMedia) {
  if (!['image', 'video'].includes(media.kind)) throw new Error('El banner debe ser una imagen o un GIF/video corto.')
  const maxBytes = slot === 'menu' ? 8 * 1024 * 1024 : 15 * 1024 * 1024
  if (media.buffer.byteLength > maxBytes) throw new Error(`El archivo supera el límite de ${Math.floor(maxBytes / 1024 / 1024)} MB.`)
  if (slot === 'menu' && media.kind !== 'image') throw new Error('El banner del menú debe ser una imagen. Los GIF/video se permiten en bienvenida y despedida.')

  await mkdir(root, { recursive: true })
  await removeSlot(slot)
  if (media.kind === 'image') {
    const target = imagePath(slot)
    await sharp(media.buffer, { animated: false })
      .rotate()
      .resize(1280, 720, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 88, mozjpeg: true })
      .toFile(target)
    return (await getBrandingAsset(slot))!
  }

  const target = videoPath(slot)
  await writeFile(target, media.buffer, { mode: 0o600 })
  return (await getBrandingAsset(slot))!
}

export async function deleteBrandingAsset(slot: BrandingSlot) {
  const existed = Boolean(await getBrandingAsset(slot))
  await removeSlot(slot)
  return existed
}
