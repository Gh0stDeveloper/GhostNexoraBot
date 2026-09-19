import { createHash } from 'node:crypto'
import type { BotCommand, LegacyCompatibleCommandContext } from '../types.js'
import { sendCarousel, sendInteractiveCard } from '../services/interactive.js'
import { createDownloadProgress } from '../services/progress.js'
import { downloadLempiMedia } from '../services/lempi-api.js'
import {
  downloadLempiTikTokVideo,
  getLempiTikTokProfileV2,
  searchLempiTikTokProfilesV2,
  searchLempiTikTokVideosV2,
  type LempiTikTokVideo,
} from '../services/lempi-media-endpoints.js'
import { recordSubbotDownload } from '../services/subbot-metrics.js'

const TOKEN_TTL_MS = 30 * 60_000
const MAX_RESULTS = 8

type CachedVideo = {
  url: string
  directUrl?: string
  title: string
  username?: string
  thumbnail?: string
  views?: number
  likes?: number
  expiresAt: number
}

const videos = new Map<string, CachedVideo>()

function compact(value?: number) {
  return value === undefined || !Number.isFinite(value)
    ? undefined
    : new Intl.NumberFormat('es-MX', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

function bytes(value: number) {
  return value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(2)} GB` : `${(value / 1024 ** 2).toFixed(1)} MB`
}

function requireText(value: string, usage: string) {
  const text = value.trim()
  if (!text) throw new Error(usage)
  return text.slice(0, 180)
}

function isTikTokUrl(value: string) {
  try {
    const url = new URL(value)
    const host = url.hostname.toLowerCase()
    return ['http:', 'https:'].includes(url.protocol) && (host === 'tiktok.com' || host.endsWith('.tiktok.com'))
  } catch {
    return false
  }
}

function looksLikeUrl(value: string) {
  return /^https?:\/\//i.test(value.trim())
}

function remember(item: LempiTikTokVideo) {
  const token = `tt_${createHash('sha256').update(`${item.url}:${item.downloadUrl}`).digest('hex').slice(0, 16)}`
  videos.set(token, {
    url: item.url,
    directUrl: item.downloadUrl,
    title: item.title || (item.username ? `Video de @${item.username}` : 'Video de TikTok'),
    username: item.username,
    thumbnail: item.thumbnail,
    views: item.views,
    likes: item.likes,
    expiresAt: Date.now() + TOKEN_TTL_MS,
  })
  return token
}

function getVideo(token: string) {
  const row = videos.get(token.trim())
  if (!row || row.expiresAt <= Date.now()) {
    videos.delete(token.trim())
    throw new Error('Ese resultado de TikTok expiró. Repite la búsqueda o abre otra vez el perfil.')
  }
  return row
}

async function downloadTikTok(ctx: LegacyCompatibleCommandContext, source: string, title?: string, directUrl?: string) {
  if (!directUrl && !isTikTokUrl(source)) throw new Error('La URL no pertenece a TikTok.')
  const progress = await createDownloadProgress(ctx, 'TikTok · video')
  await progress.update('downloading', title ? `Descargando: ${title.slice(0, 90)}` : 'Preparando y descargando el video…')
  let result
  try {
    result = directUrl
      ? await downloadLempiMedia(directUrl, { kind: 'video', baseName: 'tiktok-video' })
      : await downloadLempiTikTokVideo(source, 'tiktok-video')
  } catch {
    throw new Error('No se pudo descargar ese video en este momento.')
  }
  try {
    await progress.update('sending', `${bytes(result.size)} · enviando a WhatsApp`)
    await ctx.socket.sendMessage(ctx.chatId, {
      video: { url: result.filePath },
      mimetype: 'video/mp4',
      caption: [
        '🎵 *TIKTOK*',
        title ? `🎬 ${title.slice(0, 180)}` : '',
        `📦 ${bytes(result.size)}`,
        '👻 Ghost Nexora Bot',
      ].filter(Boolean).join('\n'),
    }, { quoted: ctx.message })
    recordSubbotDownload(ctx.instanceId, result.size)
    await progress.update('done', `${bytes(result.size)} enviados.`)
  } finally {
    await result.cleanup()
  }
}

function videoBody(item: LempiTikTokVideo) {
  return [
    item.title?.slice(0, 90) || 'Video de TikTok',
    item.username ? `Usuario: @${item.username}` : '',
    item.views !== undefined ? `Vistas: ${compact(item.views)}` : '',
    item.likes !== undefined ? `Likes: ${compact(item.likes)}` : '',
  ].filter(Boolean).join('\n').slice(0, 135)
}

async function showVideos(ctx: LegacyCompatibleCommandContext, title: string, body: string, rows: LempiTikTokVideo[]) {
  const unique = [...new Map(rows.map((item) => [item.url, item])).values()].slice(0, MAX_RESULTS)
  if (!unique.length) throw new Error('No encontré videos de TikTok para esa consulta.')
  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title,
    body,
    footer: 'Ghost Nexora Bot · TikTok',
    cards: unique.map((item, index) => {
      const token = remember(item)
      return {
        title: `#${index + 1} · ${item.username ? `@${item.username}` : 'TikTok'}`.slice(0, 80),
        body: videoBody(item),
        imageUrl: item.thumbnail,
        buttons: [{ type: 'reply' as const, text: 'Seleccionar', id: `${ctx.prefix}tiktokselect ${token}` }],
      }
    }),
  })
}

async function searchVideos(ctx: LegacyCompatibleCommandContext, query: string) {
  let rows: LempiTikTokVideo[]
  try {
    rows = await searchLempiTikTokVideosV2(query, MAX_RESULTS)
  } catch {
    throw new Error('No se pudo completar la búsqueda de TikTok en este momento.')
  }
  await showVideos(ctx, '🎵 TIKTOK · BÚSQUEDA', `Resultados para: ${query}`, rows)
}

async function searchProfiles(ctx: LegacyCompatibleCommandContext, query: string) {
  let profiles
  try {
    profiles = await searchLempiTikTokProfilesV2(query, MAX_RESULTS)
  } catch {
    throw new Error('No se pudo completar la búsqueda de perfiles en este momento.')
  }
  if (!profiles.length) throw new Error('No encontré perfiles de TikTok para esa búsqueda.')
  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: '👤 TIKTOK · PERFILES',
    body: `Perfiles relacionados con: ${query}`,
    footer: 'Ghost Nexora Bot · TikTok',
    cards: profiles.slice(0, MAX_RESULTS).map((profile, index) => ({
      title: `#${index + 1} · @${profile.username}`.slice(0, 80),
      body: [
        profile.nickname?.slice(0, 70) ?? '',
        profile.followers !== undefined ? `Seguidores: ${compact(profile.followers)}` : '',
        profile.videos !== undefined ? `Videos: ${compact(profile.videos)}` : '',
      ].filter(Boolean).join('\n').slice(0, 130) || 'Perfil público de TikTok',
      imageUrl: profile.avatar,
      buttons: [{ type: 'reply' as const, text: 'Ver perfil', id: `${ctx.prefix}tiktok profile @${profile.username}` }],
    })),
  })
}

async function showProfile(ctx: LegacyCompatibleCommandContext, target: string) {
  let profile
  try {
    profile = await getLempiTikTokProfileV2(target)
  } catch {
    throw new Error('No se pudo obtener ese perfil de TikTok en este momento.')
  }
  await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
    title: profile.nickname ? `${profile.nickname} · @${profile.username}`.slice(0, 80) : `@${profile.username}`,
    body: [
      profile.bio?.slice(0, 180) ?? '',
      profile.followers !== undefined ? `Seguidores: ${compact(profile.followers)}` : '',
      profile.following !== undefined ? `Siguiendo: ${compact(profile.following)}` : '',
      profile.likes !== undefined ? `Likes: ${compact(profile.likes)}` : '',
      profile.videos !== undefined ? `Videos: ${compact(profile.videos)}` : '',
      profile.verified !== undefined ? `Verificado: ${profile.verified ? 'sí' : 'no'}` : '',
    ].filter((value) => value !== '').join('\n'),
    footer: 'Ghost Nexora Bot · TikTok',
    imageUrl: profile.avatar,
  })

  let feed: LempiTikTokVideo[] = []
  try {
    feed = (await searchLempiTikTokVideosV2(`@${profile.username}`, MAX_RESULTS * 2))
      .filter((item) => !item.username || item.username.toLowerCase() === profile.username.toLowerCase())
      .slice(0, MAX_RESULTS)
  } catch {
    return
  }
  if (!feed.length) return
  await showVideos(
    ctx,
    `🎬 @${profile.username} · VIDEOS`,
    `Resultados públicos relacionados con @${profile.username}`,
    feed,
  )
}

async function selectVideo(ctx: LegacyCompatibleCommandContext) {
  const token = ctx.args[0] ?? ''
  if (!token) throw new Error(`Usa primero ${ctx.prefix}tiktok <búsqueda> o ${ctx.prefix}tiktok profile <usuario>.`)
  const item = getVideo(token)
  await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
    title: item.username ? `🎵 @${item.username}` : '🎵 TikTok',
    body: [
      item.title.slice(0, 220),
      item.views !== undefined ? `Vistas: ${compact(item.views)}` : '',
      item.likes !== undefined ? `Likes: ${compact(item.likes)}` : '',
    ].filter(Boolean).join('\n'),
    footer: 'Ghost Nexora Bot · TikTok',
    imageUrl: item.thumbnail,
    buttons: [{ type: 'reply', text: '⬇️ Descargar', id: `${ctx.prefix}tiktokdl ${token}` }],
  })
}

async function downloadSelected(ctx: LegacyCompatibleCommandContext) {
  const tokenOrUrl = ctx.args[0] ?? ''
  if (!tokenOrUrl) throw new Error(`Uso: ${ctx.prefix}tiktokdl <resultado>`)
  if (isTikTokUrl(tokenOrUrl)) {
    await downloadTikTok(ctx, tokenOrUrl)
    return
  }
  const item = getVideo(tokenOrUrl)
  await downloadTikTok(ctx, item.url, item.title, item.directUrl)
}

async function tiktok(ctx: LegacyCompatibleCommandContext) {
  const input = requireText(ctx.argText, `Uso: ${ctx.prefix}tiktok <url|búsqueda> | ${ctx.prefix}tiktok profile <usuario>`)

  if (looksLikeUrl(input)) {
    if (!isTikTokUrl(input)) throw new Error('La URL indicada no pertenece a TikTok.')
    await downloadTikTok(ctx, input)
    return
  }

  const action = (ctx.args[0] ?? '').toLowerCase()
  if (['profile', 'perfil', 'user', 'usuario'].includes(action)) {
    const target = requireText(ctx.args.slice(1).join(' '), `Uso: ${ctx.prefix}tiktok profile <@usuario|url>`)
    await showProfile(ctx, target)
    return
  }
  if (['profiles', 'perfiles', 'users', 'usuarios'].includes(action)) {
    const query = requireText(ctx.args.slice(1).join(' '), `Uso: ${ctx.prefix}tiktok profiles <nombre|usuario>`)
    await searchProfiles(ctx, query)
    return
  }
  if (['search', 'buscar', 'videos'].includes(action)) {
    const query = requireText(ctx.args.slice(1).join(' '), `Uso: ${ctx.prefix}tiktok search <texto>`)
    await searchVideos(ctx, query)
    return
  }

  await searchVideos(ctx, input)
}

export const tiktokV15Commands: BotCommand[] = [
  {
    name: 'tiktok',
    aliases: ['tt'],
    category: 'downloads',
    description: 'Descarga enlaces, busca videos/perfiles y muestra el feed público exacto de un perfil TikTok.',
    usage: 'tiktok <url|búsqueda> | tiktok profile <usuario> | tiktok profiles <búsqueda>',
    handler: tiktok,
  },
  {
    name: 'tiktokselect',
    aliases: ['ttselect'],
    category: 'downloads',
    description: 'Abre un resultado de TikTok antes de descargarlo.',
    handler: selectVideo,
  },
  {
    name: 'tiktokdl',
    aliases: ['ttdl'],
    category: 'downloads',
    description: 'Descarga un resultado de TikTok seleccionado.',
    usage: 'tiktokdl <resultado>',
    handler: downloadSelected,
  },
]