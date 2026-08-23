import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execa } from 'execa'
import sharp from 'sharp'
import { searchAniListCharacters } from './anilist-waifu-v5.js'

export async function createCharacterSprite(query: string) {
  const text = query.trim()
  if (!text) throw new Error('Indica el nombre de un personaje.')
  const character = (await searchAniListCharacters(text, 1))[0]
  if (!character) throw new Error('No encontré ese personaje.')

  const response = await fetch(character.imageUrl, {
    headers: { 'user-agent': 'GhostNexoraBot/2.3', accept: 'image/*' },
    signal: AbortSignal.timeout(25_000),
  })
  if (!response.ok) throw new Error(`No pude descargar la imagen del personaje (HTTP ${response.status}).`)
  const image = Buffer.from(await response.arrayBuffer())
  if (image.byteLength > 12 * 1024 * 1024) throw new Error('La imagen del personaje es demasiado grande.')

  const dir = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-sprite-'))
  const input = path.join(dir, 'character.png')
  const output = path.join(dir, 'sprite.mp4')
  try {
    const normalized = await sharp(image, { animated: false })
      .rotate()
      .resize(512, 512, { fit: 'contain', background: { r: 15, g: 15, b: 18, alpha: 1 } })
      .png()
      .toBuffer()
    await writeFile(input, normalized)
    await execa('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-loop', '1', '-i', input,
      '-t', '3.2', '-r', '24',
      '-vf', "zoompan=z='1+0.045*sin(on/10)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)+8*sin(on/5)':d=1:s=512x512:fps=24,format=yuv420p",
      '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-movflags', '+faststart', '-y', output,
    ], { timeout: 45_000 })
    return {
      character,
      filePath: output,
      cleanup: () => rm(dir, { recursive: true, force: true }),
    }
  } catch (error) {
    await rm(dir, { recursive: true, force: true })
    throw error
  }
}
