import type { BotCommand, CommandContext } from '../types.js'
import { createDownloadProgress } from '../services/progress.js'
import { recordSubbotDownload } from '../services/subbot-metrics.js'
import {
  downloadInstagramMedia,
  downloadPinterestMedia,
  type SocialDownloadedFile,
} from '../services/social-media-download.js'
import { searchPinterestImages } from '../services/image-download-v9.js'

const bytes = (value: number) => (value >= 1024 ** 2
  ? `${(value / 1024 / 1024).toFixed(1)} MB`
  : `${Math.max(1, Math.round(value / 1024))} KB`)

async function sendDownloadedFiles(
  ctx: CommandContext,
  source: 'Instagram' | 'Pinterest',
  files: SocialDownloadedFile[],
  provider: string,
) {
  let total = 0
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i]!
    total += file.size
    const caption = i === 0
      ? `📥 *${source}*\n━━━━━━━━━━━━━━\n📦 Archivos: *${files.length}*\n📏 Peso: *${bytes(files.reduce((sum, item) => sum + item.size, 0))}*\n⚙️ Proveedor: *${provider}*\n👻 Ghost Nexora Bot`
      : `${source} · ${i + 1}/${files.length}`

    if (file.kind === 'image' || file.kind === 'gif') {
      await ctx.socket.sendMessage(ctx.chatId, {
        image: { url: file.filePath },
        caption,
      }, { quoted: i === 0 ? ctx.message : undefined })
    } else if (file.kind === 'audio') {
      await ctx.socket.sendMessage(ctx.chatId, {
        audio: { url: file.filePath },
        mimetype: 'audio/mpeg',
        ptt: false,
      }, { quoted: i === 0 ? ctx.message : undefined })
      if (i === 0) await ctx.reply(caption)
    } else {
      await ctx.socket.sendMessage(ctx.chatId, {
        video: { url: file.filePath },
        mimetype: 'video/mp4',
        caption,
      }, { quoted: i === 0 ? ctx.message : undefined })
    }
  }
  recordSubbotDownload(ctx.instanceId, total)
}

async function runInstagram(ctx: CommandContext, preferImages: boolean) {
  const url = ctx.args[0]
  if (!url || !/^https?:\/\//i.test(url)) {
    throw new Error(`Uso: ${ctx.prefix}${preferImages ? 'igimg' : 'ig'} <url de Instagram>`)
  }

  const progress = await createDownloadProgress(ctx, preferImages ? 'Instagram · imágenes' : 'Instagram · media')
  await progress.update('downloading', 'Cobalt → yt-dlp → web…')
  const result = await downloadInstagramMedia(url, preferImages)
  try {
    await progress.update('sending', `${result.files.length} archivo(s) · ${result.provider}`)
    await sendDownloadedFiles(ctx, 'Instagram', result.files, result.provider)
    await progress.update('done', `${result.files.length} archivo(s) enviados.`)
  } finally {
    await result.cleanup()
  }
}

async function runPinterest(ctx: CommandContext) {
  const input = ctx.argText.trim()
  if (!input) throw new Error(`Uso: ${ctx.prefix}pinterest <url|búsqueda>`)

  if (/^https?:\/\//i.test(input)) {
    const progress = await createDownloadProgress(ctx, 'Pinterest · media')
    await progress.update('downloading', 'Cobalt → pin/originals…')
    const result = await downloadPinterestMedia(input)
    try {
      await progress.update('sending', `${result.files.length} archivo(s) · ${result.provider}`)
      await sendDownloadedFiles(ctx, 'Pinterest', result.files, result.provider)
      await progress.update('done', `${result.files.length} archivo(s) enviados.`)
    } finally {
      await result.cleanup()
    }
    return
  }

  const progress = await createDownloadProgress(ctx, 'Pinterest · búsqueda')
  await progress.update('downloading', 'Buscando pins públicos…')
  const urls = await searchPinterestImages(input)
  if (!urls.length) throw new Error('Pinterest no devolvió imágenes públicas para esa búsqueda.')

  // Descarga a disco (no URL remota a WhatsApp)
  const { downloadPinterestMedia: _unused, pinterestOriginalUrl } = await import('../services/social-media-download.js')
  const { mkdtemp, rm } = await import('node:fs/promises')
  const { createWriteStream } = await import('node:fs')
  const { pipeline } = await import('node:stream/promises')
  const { Transform } = await import('node:stream')
  const os = await import('node:os')
  const path = await import('node:path')
  const { config } = await import('../config.js')

  const dir = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-pin-search-'))
  try {
    await progress.update('sending', `Descargando hasta ${Math.min(10, urls.length)} imágenes…`)
    let sent = 0
    let total = 0
    for (const rawUrl of urls.slice(0, 10)) {
      const mediaUrl = pinterestOriginalUrl(rawUrl)
      try {
        const response = await fetch(mediaUrl, {
          redirect: 'follow',
          headers: {
            'user-agent': 'Mozilla/5.0 GhostNexoraBot/1.1',
            referer: 'https://www.pinterest.com/',
          },
          signal: AbortSignal.timeout(60_000),
        })
        if (!response.ok || !response.body) continue
        const contentType = response.headers.get('content-type') ?? 'image/jpeg'
        if (!/^image\//i.test(contentType)) continue
        const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
        const filePath = path.join(dir, `pin-${String(sent + 1).padStart(2, '0')}.${ext}`)
        let size = 0
        const limiter = new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            size += chunk.length
            callback(size > config.maxDownloadBytes ? new Error('límite') : null, chunk)
          },
        })
        await pipeline(response.body as any, limiter, createWriteStream(filePath))
        if (size <= 0) continue
        total += size
        await ctx.socket.sendMessage(ctx.chatId, {
          image: { url: filePath },
          caption: sent === 0
            ? `📌 *Pinterest · ${input}*\n━━━━━━━━━━━━━━\n🖼️ Resultados descargados a disco (no URL remota).`
            : undefined,
        }, { quoted: sent === 0 ? ctx.message : undefined })
        sent += 1
      } catch {
        // siguiente candidato
      }
    }
    if (!sent) throw new Error('No se pudo descargar ninguna imagen de la búsqueda.')
    recordSubbotDownload(ctx.instanceId, total)
    await progress.update('done', `${sent} imágenes enviadas.`)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

export const imageDownloadV9Commands: BotCommand[] = [
  {
    name: 'ig',
    aliases: ['instagram', 'igdl', 'instadl'],
    category: 'downloads',
    description: 'Descarga fotos, reels o carruseles públicos de Instagram (Cobalt → yt-dlp → web).',
    usage: 'ig <url>',
    handler: (ctx) => runInstagram(ctx, false),
  },
  {
    name: 'igimg',
    aliases: ['instagramimg', 'instagramimages', 'igimages'],
    category: 'downloads',
    description: 'Prioriza imágenes de una publicación pública de Instagram.',
    usage: 'igimg <url>',
    handler: (ctx) => runInstagram(ctx, true),
  },
  {
    name: 'pinterest',
    aliases: ['pin', 'pinterestimg', 'pinterestimages'],
    category: 'downloads',
    description: 'Descarga media de un pin o busca imágenes (siempre a disco).',
    usage: 'pinterest <url|búsqueda>',
    handler: runPinterest,
  },
]
