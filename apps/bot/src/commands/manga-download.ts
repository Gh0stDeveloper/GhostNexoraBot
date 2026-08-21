import type { BotCommand } from '../types.js'
import { downloadMangaChapter, listMangaChapters } from '../services/manga.js'
import { recordSubbotDownload } from '../services/subbot-metrics.js'

const formatSize = (bytes: number) => bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`

export const mangaDownloadCommands: BotCommand[] = [
  {
    name: 'mangachapters', aliases: ['mchapters', 'capitulosmanga'], category: 'downloads',
    description: 'Lista capítulos disponibles de un manga de MangaDex.', usage: 'mangachapters <id|url> [es|en]',
    async handler(ctx) {
      const input = ctx.args[0]
      if (!input) throw new Error(`Uso: ${ctx.prefix}mangachapters <id|url> [es|en]`)
      const language = (ctx.args[1] ?? 'es').toLowerCase()
      const result = await listMangaChapters(input, language, 25)
      if (!result.chapters.length) throw new Error(`No encontré capítulos en ${language}. Prueba con otro idioma, por ejemplo ${ctx.prefix}mangachapters ${input} en`)

      const lines = result.chapters.map((chapter, index) => {
        const number = chapter.chapter ?? 'S/N'
        const title = chapter.title ? ` · ${chapter.title}` : ''
        return `${index + 1}. *Cap. ${number}*${title}\n${ctx.prefix}mangadl ${result.mangaId} ${chapter.id} ${chapter.language}`
      })
      await ctx.reply(`📚 *CAPÍTULOS · MANGADEX*\nIdioma: *${language}*\n\n${lines.join('\n\n')}`)
    },
  },
  {
    name: 'mangadl', aliases: ['mangadownload', 'downloadmanga'], category: 'downloads',
    description: 'Descarga un capítulo público de MangaDex como CBZ.', usage: 'mangadl <id|url> <capítulo|latest|chapter-id> [es|en]',
    async handler(ctx) {
      const input = ctx.args[0]
      if (!input) throw new Error(`Uso: ${ctx.prefix}mangadl <id|url> <capítulo|latest> [es|en]`)
      const selector = ctx.args[1] ?? 'latest'
      const language = (ctx.args[2] ?? 'es').toLowerCase()
      await ctx.reply(`📚 *MANGADEX*\nPreparando capítulo *${selector}*...`)

      const result = await downloadMangaChapter(input, selector, language)
      try {
        const chapterLabel = result.chapter.chapter ?? result.chapter.id.slice(0, 8)
        await ctx.socket.sendMessage(ctx.chatId, {
          document: { url: result.filePath },
          fileName: result.fileName,
          mimetype: 'application/vnd.comicbook+zip',
          caption: `📚 *${result.title}*\nCapítulo: *${chapterLabel}*\nIdioma: *${result.chapter.language}*\nTamaño: *${formatSize(result.size)}*`,
        }, { quoted: ctx.message })
        recordSubbotDownload(ctx.instanceId, result.size)
      } finally {
        await result.cleanup()
      }
    },
  },
]
