import type { BotCommand } from '../types.js'

interface LyricsResult {
  trackName?: string
  artistName?: string
  albumName?: string
  duration?: number
  plainLyrics?: string | null
  syncedLyrics?: string | null
}

async function findLyrics(query: string): Promise<LyricsResult> {
  const response = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`, {
    headers: { 'user-agent': 'GhostNexoraBot/1.1 (+https://github.com/Gh0stDeveloper/GhostNexoraBot)' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`El proveedor de letras respondió HTTP ${response.status}.`)
  const data = await response.json() as LyricsResult[]
  const result = data.find((item) => item.plainLyrics?.trim())
  if (!result?.plainLyrics) throw new Error('No encontré una letra disponible para esa canción.')
  return result
}

export const lyricsCommands: BotCommand[] = [
  {
    name: 'lyrics', aliases: ['letra', 'lyric'], category: 'downloads',
    description: 'Busca la letra de una canción sin API de pago.', usage: 'lyrics <canción y artista>',
    async handler(ctx) {
      const query = ctx.argText.trim()
      if (!query) throw new Error(`Uso: ${ctx.prefix}lyrics <canción y artista>`)
      const result = await findLyrics(query)
      const lyrics = result.plainLyrics!.trim()
      const max = 3500
      const clipped = lyrics.length > max ? `${lyrics.slice(0, max)}\n\n… letra recortada por longitud.` : lyrics
      await ctx.reply(`📝 *LETRA*\n\n🎵 *${result.trackName ?? query}*\n👤 ${result.artistName ?? 'Artista no identificado'}${result.albumName ? `\n💿 ${result.albumName}` : ''}\n\n${clipped}\n\nFuente de letras: LRCLIB`)
    },
  },
]
