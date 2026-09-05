import { mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { config } from '../config.js'
import type { DownloadedMedia } from '../utils/message.js'

export type BrandingSlot = 'menu' | 'welcome' | 'goodbye'
export type BrandingAsset = { path: string; kind: 'image' | 'video'; size: number }

function brandingRoot(instanceId?: number) {
  return instanceId
    ? path.join(config.dataDir, 'subbots', String(instanceId), 'branding')
    : path.join(config.dataDir, 'branding')
}

function imagePath(slot: BrandingSlot, instanceId?: number) { return path.join(brandingRoot(instanceId), `${slot}.jpg`) }
function videoPath(slot: BrandingSlot, instanceId?: number) { return path.join(brandingRoot(instanceId), `${slot}.mp4`) }

async function removeSlot(slot: BrandingSlot, instanceId?: number) {
  await Promise.all([
    rm(imagePath(slot, instanceId), { force: true }).catch(() => undefined),
    rm(videoPath(slot, instanceId), { force: true }).catch(() => undefined),
  ])
}

async function loadSharp() {
  try {
    const module = await import('sharp')
    return module.default
  } catch (error) {
    if (config.isTermuxLite) {
      throw new Error('El procesamiento avanzado de imágenes no está disponible en Ghost Nexora Lite para Termux.')
    }
    throw error
  }
}

export async function getBrandingAsset(slot: BrandingSlot, instanceId?: number): Promise<BrandingAsset | null> {
  const image = imagePath(slot, instanceId)
  if (existsSync(image)) {
    const info = await stat(image).catch(() => null)
    if (info?.isFile()) return { path: image, kind: 'image', size: info.size }
  }
  const video = videoPath(slot, instanceId)
  if (existsSync(video)) {
    const info = await stat(video).catch(() => null)
    if (info?.isFile()) return { path: video, kind: 'video', size: info.size }
  }
  return null
}

export async function saveBrandingAsset(slot: BrandingSlot, media: DownloadedMedia, instanceId?: number) {
  if (!['image', 'video'].includes(media.kind)) throw new Error('El banner debe ser una imagen o un GIF/video corto.')
  const maxBytes = slot === 'menu' ? 8 * 1024 * 1024 : 15 * 1024 * 1024
  if (media.buffer.byteLength > maxBytes) throw new Error(`El archivo supera el límite de ${Math.floor(maxBytes / 1024 / 1024)} MB.`)
  if (slot === 'menu' && media.kind !== 'image') throw new Error('El banner del menú debe ser una imagen. Los GIF/video se permiten en bienvenida y despedida.')

  await mkdir(brandingRoot(instanceId), { recursive: true })
  await removeSlot(slot, instanceId)
  if (media.kind === 'image') {
    const target = imagePath(slot, instanceId)
    const sharp = await loadSharp()
    await sharp(media.buffer, { animated: false })
      .rotate()
      .resize(1280, 720, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 88, mozjpeg: true })
      .toFile(target)
    return (await getBrandingAsset(slot, instanceId))!
  }

  const target = videoPath(slot, instanceId)
  await writeFile(target, media.buffer, { mode: 0o600 })
  return (await getBrandingAsset(slot, instanceId))!
}

export async function deleteBrandingAsset(slot: BrandingSlot, instanceId?: number) {
  const existed = Boolean(await getBrandingAsset(slot, instanceId))
  await removeSlot(slot, instanceId)
  return existed
}
