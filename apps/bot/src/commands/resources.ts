import type { BotCommand } from '../types.js'
import { sendCarousel } from '../services/interactive.js'
import { downloadFdroidApk, downloadGitHubRepo, downloadGoogleDrive, searchAnime, searchFdroid, searchManga } from '../services/resources.js'
import { recordSubbotDownload } from '../services/subbot-metrics.js'

const size = (bytes: number) => bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`

export const resourceCommands: BotCommand[] = [
  {
    name: 'gitclone', aliases: ['githubdl', 'repozip'], category: 'downloads', description: 'Descarga un repositorio público de GitHub como ZIP.', usage: 'gitclone <url>',
    async handler(ctx) {
      const url = ctx.args[0]; if (!url) throw new Error('Indica la URL del repositorio.')
      const file = await downloadGitHubRepo(url)
      try {
        await ctx.socket.sendMessage(ctx.chatId, { document: { url: file.filePath }, fileName: file.fileName, mimetype: 'application/zip', caption: `🐙 GitHub · ${size(file.size)}` }, { quoted: ctx.message })
        recordSubbotDownload(ctx.instanceId, file.size)
      } finally { await file.cleanup() }
    },
  },
  {
    name: 'gdrive', aliases: ['googledrive', 'drivedl'], category: 'downloads', description: 'Descarga un archivo público de Google Drive.', usage: 'gdrive <url>',
    async handler(ctx) {
      const url = ctx.args[0]; if (!url) throw new Error('Indica un enlace público de Google Drive.')
      const file = await downloadGoogleDrive(url)
      try {
        await ctx.socket.sendMessage(ctx.chatId, { document: { url: file.filePath }, fileName: file.fileName, mimetype: file.contentType, caption: `☁️ Google Drive · ${size(file.size)}` }, { quoted: ctx.message })
        recordSubbotDownload(ctx.instanceId, file.size)
      } finally { await file.cleanup() }
    },
  },
  {
    name: 'apk', aliases: ['app', 'fdroid'], category: 'downloads', description: 'Busca aplicaciones libres/legítimas en F-Droid.', usage: 'apk <búsqueda>',
    async handler(ctx) {
      const query = ctx.argText.trim(); if (!query) throw new Error('Indica una aplicación para buscar.')
      const results = await searchFdroid(query, 8)
      if (!results.length) throw new Error('No encontré paquetes en F-Droid.')
      await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
        title: '📦 APK · F-DROID', body: `Resultados para: ${query}`, footer: 'Fuente oficial F-Droid',
        cards: results.map((item, index) => ({ title: `APP #${index + 1}`, body: `${item.title}\n${item.description || 'Aplicación disponible en F-Droid.'}`, buttons: [
          { type: 'reply', text: '📥 APK', id: `${ctx.prefix}apkdl ${item.url}` },
          { type: 'url', text: '🌐 Ver ficha', url: item.url },
        ] })),
      })
    },
  },
  {
    name: 'apkdl', aliases: ['appdl'], category: 'downloads', description: 'Descarga una APK desde una ficha oficial de F-Droid.', usage: 'apkdl <url-fdroid>',
    async handler(ctx) {
      const url = ctx.args[0]; if (!url) throw new Error('Indica la ficha de F-Droid.')
      const file = await downloadFdroidApk(url)
      try {
        await ctx.socket.sendMessage(ctx.chatId, { document: { url: file.filePath }, fileName: file.fileName.endsWith('.apk') ? file.fileName : `${file.fileName}.apk`, mimetype: 'application/vnd.android.package-archive', caption: `📦 APK de F-Droid · ${size(file.size)}\nVerifica permisos y firma antes de instalar.` }, { quoted: ctx.message })
        recordSubbotDownload(ctx.instanceId, file.size)
      } finally { await file.cleanup() }
    },
  },
  {
    name: 'anime', aliases: ['animesearch'], category: 'general', description: 'Busca información de anime mediante Jikan/MyAnimeList.', usage: 'anime <título>',
    async handler(ctx) {
      const query = ctx.argText.trim(); if (!query) throw new Error('Indica el anime a buscar.')
      const results = await searchAnime(query)
      if (!results.length) throw new Error('No encontré anime.')
      await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
        title: '🎌 ANIME SEARCH', body: `Resultados para: ${query}`, footer: 'Datos: Jikan / MyAnimeList',
        cards: results.map((item, index) => ({
          title: `ANIME #${index + 1}`, imageUrl: item.images?.jpg?.large_image_url,
          body: [`🎬 ${item.title_english ?? item.title ?? 'Sin título'}`, `⭐ ${item.score ?? 'N/D'} · 📺 ${item.episodes ?? '?'} episodios`, item.synopsis?.replace(/\s+/g, ' ').slice(0, 260) ?? ''].filter(Boolean).join('\n'),
          buttons: item.url ? [{ type: 'url' as const, text: 'Ver ficha', url: item.url }] : [],
        })),
      })
    },
  },
  {
    name: 'manga', aliases: ['mangasearch'], category: 'general', description: 'Busca manga en MangaDex.', usage: 'manga <título>',
    async handler(ctx) {
      const query = ctx.argText.trim(); if (!query) throw new Error('Indica el manga a buscar.')
      const results = await searchManga(query)
      if (!results.length) throw new Error('No encontré manga.')
      const lines = results.map((item, index) => {
        const title = item.attributes?.title?.en ?? item.attributes?.title?.es ?? Object.values(item.attributes?.title ?? {})[0] ?? 'Sin título'
        const desc = item.attributes?.description?.es ?? item.attributes?.description?.en ?? ''
        return `${index + 1}. *${title}* · ${item.attributes?.status ?? 'N/D'}\n${desc.replace(/\s+/g, ' ').slice(0, 180)}\nhttps://mangadex.org/title/${item.id}`
      })
      await ctx.reply(`📚 *MANGADEX*\n\n${lines.join('\n\n')}\n\nGhost Nexora Bot muestra enlaces del catálogo; respeta la disponibilidad/licencia indicada por cada obra.`)
    },
  },
]
