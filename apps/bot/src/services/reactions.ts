import { execa } from 'execa'

const API = 'https://nekos.best/api/v2'
const USER_AGENT = 'GhostNexoraBot (https://github.com/Gh0stDeveloper/GhostNexoraBot)'

export type ReactionCategory =
  | 'hug' | 'kiss' | 'pat' | 'cuddle' | 'blush' | 'wink' | 'wave'
  | 'dance' | 'poke' | 'bite' | 'slap' | 'punch' | 'kick' | 'cry'
  | 'spin' | 'confused' | 'shoot' | 'happy'

type NekoResponse = { results?: Array<{ url?: string; anime_name?: string }> }

export async function getReactionGif(category: ReactionCategory) {
  const response = await fetch(`${API}/${category}`, {
    headers: { accept: 'application/json', 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) throw new Error(`El proveedor de reacciones respondió HTTP ${response.status}.`)
  const data = await response.json() as NekoResponse
  const item = data.results?.[0]
  if (!item?.url) throw new Error('El proveedor no devolvió una reacción válida.')
  return { url: item.url, animeName: item.anime_name }
}

export async function reactionGifToMp4(url: string) {
  const response = await fetch(url, { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`No pude descargar el GIF de reacción (HTTP ${response.status}).`)
  const input = Buffer.from(await response.arrayBuffer())
  if (input.length > 12 * 1024 * 1024) throw new Error('La reacción recibida es demasiado grande.')

  const { stdout } = await execa('ffmpeg', [
    '-hide_banner', '-loglevel', 'error',
    '-i', 'pipe:0',
    '-vf', "scale='min(480,iw)':-2:flags=lanczos,fps=15",
    '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-movflags', 'frag_keyframe+empty_moov',
    '-f', 'mp4', 'pipe:1',
  ], {
    input,
    encoding: 'buffer',
    timeout: 45_000,
    maxBuffer: 25 * 1024 * 1024,
  })
  return Buffer.from(stdout)
}
