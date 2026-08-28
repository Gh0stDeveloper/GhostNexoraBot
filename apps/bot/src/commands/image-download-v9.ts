import type { BotCommand, CommandContext } from '../types.js'
import { downloadInstagramImagesFromPost } from '../services/instagram-image-download-v10.js'
import { downloadPinterestImages, searchPinterestImages } from '../services/image-download-v9.js'
import { createDownloadProgress } from '../services/progress.js'
import { recordSubbotDownload } from '../services/subbot-metrics.js'

const bytes = (value: number) => value >= 1024 ** 2 ? `${(value / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(value / 1024))} KB`

async function sendImages(ctx: CommandContext, source: 'Instagram' | 'Pinterest', input: string) {
  const progress = await createDownloadProgress(ctx, `${source} · imágenes`)
  await progress.update('downloading', 'Obteniendo imágenes de la publicación')
  const result = source === 'Instagram' ? await downloadInstagramImagesFromPost(input) : await downloadPinterestImages(input)
  try {
    await progress.update('sending', `${result.images.length} imágenes · enviando directamente`)
    let total = 0
    for (let i = 0; i < result.images.length; i += 1) {
      const image = result.images[i]!
      total += image.size
      await ctx.socket.sendMessage(ctx.chatId, {
        image: { url: image.filePath },
        caption: i === 0
          ? `🖼️ *${source} · imágenes*\n━━━━━━━━━━━━━━\n📷 Imágenes enviadas: *${result.images.length}*\n📦 Peso total: *${bytes(result.images.reduce((sum, item) => sum + item.size, 0))}*\n👻 Ghost Nexora Bot`
          : `${source} · imagen ${i + 1}/${result.images.length}`,
      }, { quoted: i === 0 ? ctx.message : undefined })
    }
    recordSubbotDownload(ctx.instanceId, total)
    await progress.update('done', `${result.images.length} imágenes enviadas.`)
  } finally {
    await result.cleanup()
  }
}

async function instagram(ctx: CommandContext) {
  const url = ctx.args[0]
  if (!url) throw new Error(`Uso: ${ctx.prefix}igimg <url>`)
  if (!/^https?:\/\//i.test(url)) throw new Error(`Uso: ${ctx.prefix}igimg <url>`)
  await sendImages(ctx, 'Instagram', url)
}

async function pinterest(ctx: CommandContext) {
  const input = ctx.argText.trim()
  if (!input) throw new Error(`Uso: ${ctx.prefix}pinterest <url|búsqueda>`)
  if (/^https?:\/\//i.test(input)) {
    await sendImages(ctx, 'Pinterest', input)
    return
  }
  const progress = await createDownloadProgress(ctx, 'Pinterest · imágenes')
  await progress.update('downloading', 'Buscando imágenes')
  const urls = await searchPinterestImages(input)
  if (!urls.length) throw new Error('Pinterest no devolvió imágenes públicas para esa búsqueda.')
  try {
    await progress.update('sending', `${urls.length} resultados · enviando directamente`)
    let sent = 0
    for (const url of urls.slice(0, 10)) {
      await ctx.socket.sendMessage(ctx.chatId, { image: { url }, caption: sent === 0 ? `📌 *Pinterest · ${input}*\n━━━━━━━━━━━━━━\n🖼️ Hasta 10 resultados enviados directamente.` : undefined }, { quoted: sent === 0 ? ctx.message : undefined })
      sent += 1
    }
    await progress.update('done', `${sent} imágenes enviadas.`)
  } finally {
    await progress.update('done').catch(() => undefined)
  }
}

export const imageDownloadV9Commands: BotCommand[] = [
  { name: 'igimg', aliases: ['instagramimg', 'instagramimages', 'igimages'], category: 'downloads', description: 'Descarga y envía directamente hasta 10 imágenes de una publicación pública de Instagram.', usage: 'igimg <url>', handler: instagram },
  { name: 'pinterest', aliases: ['pin', 'pinterestimg', 'pinterestimages'], category: 'downloads', description: 'Descarga y envía hasta 10 imágenes públicas de Pinterest.', usage: 'pinterest <url|búsqueda>', handler: pinterest },
]
