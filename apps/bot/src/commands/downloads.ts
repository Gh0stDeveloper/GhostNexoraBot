import type { BotCommand, CommandContext } from '../types.js'
import {
  downloadSocialVideo,
  downloadSoundCloud,
  downloadYouTubeAudio,
  downloadYouTubeSearchAudio,
  downloadYouTubeSearchVideo,
  downloadYouTubeVideo,
  getMediaInfo,
  getYouTubeFormats,
  searchYouTube,
  type DownloadPlatform,
  type MediaInfo,
} from '../services/downloader.js'
import { downloadMediaFire } from '../services/mediafire.js'
import { resolveExternalSocial, type ExternalSocialPlatform } from '../services/social-external.js'
import { sendCarousel } from '../services/interactive.js'
import { recordSubbotDownload } from '../services/subbot-metrics.js'
import { getTikTokProfile, searchTikTokProfiles, searchTikTokVideos } from '../services/tiktok-search.js'

function requireUrl(args: string[]) { const url = args[0]; if (!url) throw new Error('Debes indicar una URL.'); return url }
function requireText(value: string, label = 'Debes indicar una búsqueda.') { const text = value.trim(); if (!text) throw new Error(label); return text }
function formatBytes(bytes: number) { return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : `${(bytes / 1024 / 1024).toFixed(1)} MB` }
function formatDuration(seconds?: number) {
  if (!seconds || !Number.isFinite(seconds)) return 'N/D'
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = Math.floor(seconds % 60)
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}
const compact = (value?: number) => value === undefined ? 'N/D' : new Intl.NumberFormat('es-MX', { notation: 'compact', maximumFractionDigits: 1 }).format(value)

function infoText(info: MediaInfo | undefined, size?: number) {
  if (!info) return size ? `📦 Peso: ${formatBytes(size)}` : ''
  const description = info.description?.replace(/\s+/g, ' ').trim().slice(0, 220)
  return [
    `🎬 *${info.title}*`,
    info.uploader ? `👤 ${info.uploader}` : '',
    info.duration ? `⏱️ ${formatDuration(info.duration)}` : '',
    info.views !== undefined ? `👁️ ${compact(info.views)} vistas` : '',
    info.likes !== undefined ? `❤️ ${compact(info.likes)} likes` : '',
    size ? `📦 ${formatBytes(size)}` : '',
    description ? `\n📝 ${description}${info.description && info.description.length > 220 ? '…' : ''}` : '',
  ].filter(Boolean).join('\n')
}

async function sendDownloadInfo(ctx: CommandContext, info: MediaInfo | undefined, size?: number) {
  if (!info) return
  const caption = infoText(info, size)
  if (info.thumbnail) {
    const sent = await ctx.socket.sendMessage(ctx.chatId, { image: { url: info.thumbnail }, caption }, { quoted: ctx.message }).catch(() => null)
    if (sent) return
  }
  await ctx.reply(caption)
}

async function downloadSocialUrl(
  ctx: CommandContext,
  name: string,
  platform: Exclude<DownloadPlatform, 'youtube'>,
  icon: string,
  url: string,
) {
  await ctx.reply(`${icon} Analizando *${name}*...`)
  const info = await getMediaInfo(url, platform).catch(() => undefined)

  if (['facebook', 'instagram', 'tiktok'].includes(platform)) {
    try {
      const direct = await resolveExternalSocial(url, platform as ExternalSocialPlatform)
      await sendDownloadInfo(ctx, info)
      await ctx.socket.sendMessage(ctx.chatId, {
        video: { url: direct }, mimetype: 'video/mp4',
        caption: `${icon} *${name}* · proveedor web público${platform === 'tiktok' ? ' · se priorizó enlace sin marca/HD' : ''}\n👻 ${ctx.prefix}menu`,
      }, { quoted: ctx.message })
      return
    } catch {
      // El proveedor web es un acelerador/fallback sin cookies; si cambia, continúa yt-dlp.
    }
  }

  const result = await downloadSocialVideo(url, platform)
  try {
    await sendDownloadInfo(ctx, result.info ?? info, result.size)
    await ctx.socket.sendMessage(ctx.chatId, { video: { url: result.filePath }, mimetype: 'video/mp4', caption: `${icon} *${name}* · ${formatBytes(result.size)}\n👻 ${ctx.prefix}menu` }, { quoted: ctx.message })
    recordSubbotDownload(ctx.instanceId, result.size)
  } finally { await result.cleanup() }
}

const socialCommand = (name: string, aliases: string[], platform: Exclude<DownloadPlatform, 'youtube'>, icon: string): BotCommand => ({
  name, aliases, category: 'downloads', description: `Descarga contenido público de ${name}.`, usage: `${name} <url>`,
  async handler(ctx) {
    await downloadSocialUrl(ctx, name, platform, icon, requireUrl(ctx.args))
  },
})

async function showTikTokVideos(ctx: CommandContext, query: string) {
  const results = await searchTikTokVideos(query, 10)
  if (!results.length) throw new Error('TikTok no devolvió videos públicos para esa búsqueda.')
  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: '🎵 TIKTOK · VIDEOS',
    body: `Resultados para: ${query}`,
    footer: 'Ghost Nexora Bot',
    cards: results.map((item, index) => ({
      title: `#${index + 1} · ${item.username ? `@${item.username}` : 'TikTok'}`,
      body: [
        item.title,
        item.nickname ? `Creador: ${item.nickname}` : '',
        item.views !== undefined ? `Vistas: ${compact(item.views)}` : '',
        item.likes !== undefined ? `Likes: ${compact(item.likes)}` : '',
      ].filter(Boolean).join('\n'),
      imageUrl: item.thumbnail,
      buttons: [
        { type: 'reply', text: '⬇️ Descargar', id: `${ctx.prefix}tiktok ${item.url}` },
        ...(item.username ? [{ type: 'reply' as const, text: '👤 Perfil', id: `${ctx.prefix}tiktok profile @${item.username}` }] : []),
        { type: 'url', text: '🌐 Abrir', url: item.url },
      ],
    })),
  })
}

async function showTikTokProfiles(ctx: CommandContext, query: string) {
  const profiles = await searchTikTokProfiles(query, 8)
  if (!profiles.length) throw new Error('TikTok no devolvió perfiles públicos para esa búsqueda.')
  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: '🎵 TIKTOK · PERFILES',
    body: `Perfiles para: ${query}`,
    footer: 'Ghost Nexora Bot',
    cards: profiles.map((profile, index) => ({
      title: `#${index + 1} · @${profile.username}`,
      body: [
        profile.nickname ?? '',
        profile.followers !== undefined ? `Seguidores: ${compact(profile.followers)}` : '',
        profile.likes !== undefined ? `Likes: ${compact(profile.likes)}` : '',
        profile.videos !== undefined ? `Videos: ${compact(profile.videos)}` : '',
        profile.bio ?? '',
      ].filter(Boolean).join('\n'),
      imageUrl: profile.avatar,
      buttons: [
        { type: 'reply', text: '👤 Ver perfil', id: `${ctx.prefix}tiktok profile @${profile.username}` },
        { type: 'reply', text: '🎬 Buscar videos', id: `${ctx.prefix}tiktok search ${profile.username}` },
        { type: 'url', text: '🌐 Abrir', url: profile.url },
      ],
    })),
  })
}

async function showTikTokProfile(ctx: CommandContext, input: string) {
  const profile = await getTikTokProfile(input)
  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: '🎵 TIKTOK · PERFIL',
    body: `@${profile.username}`,
    footer: 'Ghost Nexora Bot',
    cards: [{
      title: profile.nickname ? `${profile.nickname} · @${profile.username}` : `@${profile.username}`,
      body: [
        profile.bio ?? '',
        profile.followers !== undefined ? `Seguidores: ${compact(profile.followers)}` : '',
        profile.likes !== undefined ? `Likes: ${compact(profile.likes)}` : '',
        profile.videos !== undefined ? `Videos: ${compact(profile.videos)}` : '',
      ].filter(Boolean).join('\n') || `Perfil público @${profile.username}`,
      imageUrl: profile.avatar,
      buttons: [
        { type: 'reply', text: '🎬 Buscar videos', id: `${ctx.prefix}tiktok search ${profile.username}` },
        { type: 'url', text: '🌐 Abrir perfil', url: profile.url },
      ],
    }],
  })
}

const tiktokCommand: BotCommand = {
  name: 'tiktok', aliases: ['tt'], category: 'downloads',
  description: 'Busca videos/perfiles públicos de TikTok o descarga un video por URL.',
  usage: 'tiktok <url|búsqueda> | tiktok search <texto> | tiktok profiles <texto> | tiktok profile <usuario|url>',
  async handler(ctx) {
    const input = requireText(ctx.argText, 'Indica una URL, búsqueda o perfil de TikTok.')
    if (/^https?:\/\//i.test(input)) {
      await downloadSocialUrl(ctx, 'tiktok', 'tiktok', '🎵', input)
      return
    }

    const action = (ctx.args[0] ?? '').toLowerCase()
    if (['profiles', 'users', 'perfiles', 'usuarios'].includes(action)) {
      const query = requireText(ctx.args.slice(1).join(' '), `Uso: ${ctx.prefix}tiktok profiles <usuario>`)
      await showTikTokProfiles(ctx, query)
      return
    }
    if (['profile', 'user', 'perfil', 'usuario'].includes(action)) {
      const target = requireText(ctx.args.slice(1).join(' '), `Uso: ${ctx.prefix}tiktok profile <usuario|url>`)
      await showTikTokProfile(ctx, target)
      return
    }
    if (['search', 'videos', 'buscar'].includes(action)) {
      const query = requireText(ctx.args.slice(1).join(' '), `Uso: ${ctx.prefix}tiktok search <texto>`)
      await showTikTokVideos(ctx, query)
      return
    }

    await showTikTokVideos(ctx, input)
  },
}

export const downloadCommands: BotCommand[] = [
  {
    name: 'yts', aliases: ['ytsearch', 'buscarvideo', 'ytm'], category: 'downloads', description: 'Busca videos en YouTube como carrusel con descarga de audio o video.', usage: 'yts <búsqueda>',
    async handler(ctx) {
      const query = requireText(ctx.argText)
      const results = await searchYouTube(query, 10)
      if (!results.length) throw new Error('No encontré resultados para esa búsqueda.')
      await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
        title: '▶️ YOUTUBE · RESULTADOS',
        body: `✦ GHOST NEXORA · INTERACTIVO ✦\n\n🔎 ${query}\n\n↔️ Desliza y elige si quieres audio o video.`,
        footer: 'Audio · Video · Letra',
        cards: results.map((item, index) => ({
          title: `▶️ VIDEO #${index + 1}`,
          body: [`🎵 ${item.title}`, `◇ Canal » ${item.channel}`, `◇ Duración » ${formatDuration(item.duration)}`, `◇ Vistas » ${compact(item.views)}`, item.likes !== undefined ? `◇ Likes » ${compact(item.likes)}` : ''].filter(Boolean).join('\n'),
          imageUrl: item.thumbnail,
          footer: 'Ghost Nexora Bot',
          buttons: [
            { type: 'reply', text: '🎧 Audio', id: `${ctx.prefix}ytmp3 ${item.url}` },
            { type: 'reply', text: '🎬 Video 720p', id: `${ctx.prefix}ytmp4 ${item.url} 720` },
            { type: 'reply', text: '📝 Letra', id: `${ctx.prefix}lyrics ${item.title} ${item.channel}` },
          ],
        })),
      })
    },
  },
  {
    name: 'play', aliases: ['playaudio'], category: 'downloads', description: 'Busca en YouTube y descarga el primer resultado como MP3.', usage: 'play <búsqueda>',
    async handler(ctx) {
      const query = requireText(ctx.argText)
      await ctx.reply(`🔎 Buscando *${query}*...`)
      const result = await downloadYouTubeSearchAudio(query)
      try {
        await sendDownloadInfo(ctx, result.info, result.size)
        await ctx.socket.sendMessage(ctx.chatId, { audio: { url: result.filePath }, mimetype: 'audio/mpeg', ptt: false }, { quoted: ctx.message })
        recordSubbotDownload(ctx.instanceId, result.size)
      } finally { await result.cleanup() }
    },
  },
  {
    name: 'playvideo', aliases: ['playvid'], category: 'downloads', description: 'Busca en YouTube y descarga el primer resultado como video.', usage: 'playvideo <búsqueda>',
    async handler(ctx) {
      const query = requireText(ctx.argText)
      const result = await downloadYouTubeSearchVideo(query, 720)
      try {
        await sendDownloadInfo(ctx, result.info, result.size)
        await ctx.socket.sendMessage(ctx.chatId, { video: { url: result.filePath }, mimetype: 'video/mp4', caption: `🎬 YouTube · hasta 720p · ${formatBytes(result.size)}` }, { quoted: ctx.message })
        recordSubbotDownload(ctx.instanceId, result.size)
      } finally { await result.cleanup() }
    },
  },
  {
    name: 'ytformats', aliases: ['ytquality', 'ytcalidad'], category: 'downloads', description: 'Muestra calidades disponibles de YouTube.', usage: 'ytformats <url>',
    async handler(ctx) {
      const data = await getYouTubeFormats(requireUrl(ctx.args))
      const video = data.videoHeights.length ? data.videoHeights.map((height) => `${height}p`).join(', ') : 'No detectadas'
      const audio = data.audioBitrates.length ? data.audioBitrates.map((bitrate) => `${bitrate} kbps`).join(', ') : 'Automática'
      await sendDownloadInfo(ctx, data)
      await ctx.reply(`🎚️ *FORMATOS DISPONIBLES*\n📺 ${video}\n🎵 ${audio}\n\nEjemplo: *${ctx.prefix}ytmp4 <url> 1080*`)
    },
  },
  {
    name: 'ytmp3', aliases: ['yta', 'ytaudio'], category: 'downloads', description: 'Descarga audio de YouTube en MP3.', usage: 'ytmp3 <url>',
    async handler(ctx) {
      const result = await downloadYouTubeAudio(requireUrl(ctx.args))
      try {
        await sendDownloadInfo(ctx, result.info, result.size)
        await ctx.socket.sendMessage(ctx.chatId, { audio: { url: result.filePath }, mimetype: 'audio/mpeg', ptt: false }, { quoted: ctx.message })
        recordSubbotDownload(ctx.instanceId, result.size)
      } finally { await result.cleanup() }
    },
  },
  {
    name: 'ytmp4', aliases: ['ytv', 'ytvideo'], category: 'downloads', description: 'Descarga video de YouTube con calidad seleccionable.', usage: 'ytmp4 <url> [144|240|360|480|720|1080|1440|2160]',
    async handler(ctx) {
      const url = requireUrl(ctx.args)
      const requested = Number.parseInt(ctx.args[1] ?? '720', 10)
      const allowed = [144, 240, 360, 480, 720, 1080, 1440, 2160]
      const quality = allowed.includes(requested) ? requested : 720
      const result = await downloadYouTubeVideo(url, quality)
      try {
        await sendDownloadInfo(ctx, result.info, result.size)
        await ctx.socket.sendMessage(ctx.chatId, { video: { url: result.filePath }, mimetype: 'video/mp4', caption: `🎬 YouTube · hasta ${quality}p · ${formatBytes(result.size)}` }, { quoted: ctx.message })
        recordSubbotDownload(ctx.instanceId, result.size)
      } finally { await result.cleanup() }
    },
  },
  {
    name: 'soundcloud', aliases: ['sc', 'scdl'], category: 'downloads', description: 'Descarga audio público de SoundCloud por URL o búsqueda.', usage: 'soundcloud <url|búsqueda>',
    async handler(ctx) {
      const result = await downloadSoundCloud(requireText(ctx.argText, 'Debes indicar una URL o búsqueda de SoundCloud.'))
      try {
        await sendDownloadInfo(ctx, result.info, result.size)
        await ctx.socket.sendMessage(ctx.chatId, { audio: { url: result.filePath }, mimetype: 'audio/mpeg', ptt: false }, { quoted: ctx.message })
        recordSubbotDownload(ctx.instanceId, result.size)
      } finally { await result.cleanup() }
    },
  },
  tiktokCommand,
  socialCommand('instagram', ['ig', 'insta'], 'instagram', '📸'),
  socialCommand('facebook', ['fb'], 'facebook', '📘'),
  socialCommand('twitter', ['x', 'tweet'], 'twitter', '🐦'),
  {
    name: 'mediafire', aliases: ['mf'], category: 'downloads', description: 'Descarga un archivo desde MediaFire.', usage: 'mediafire <url>',
    async handler(ctx) {
      const result = await downloadMediaFire(requireUrl(ctx.args))
      try {
        await ctx.socket.sendMessage(ctx.chatId, { document: { url: result.filePath }, mimetype: result.contentType, fileName: result.fileName, caption: `☁️ *MediaFire*\n📦 ${result.fileName}\n📏 ${formatBytes(result.size)}` }, { quoted: ctx.message })
        recordSubbotDownload(ctx.instanceId, result.size)
      } finally { await result.cleanup() }
    },
  },
]
