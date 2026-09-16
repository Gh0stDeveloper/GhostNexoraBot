import type { BotCommand, CommandContext } from '../types.js'
import { sendInteractiveCard } from '../services/interactive.js'
import { downloadLempiMedia, searchLempiPinterest, type LempiDownloadedMedia } from '../services/lempi-api.js'
import { downloadLempiInstagramV2, stalkLempiInstagram } from '../services/lempi-media-endpoints.js'
import { recordSubbotDownload } from '../services/subbot-metrics.js'
import { likeeCommands } from './likee.js'
import { teraboxCommands } from './terabox.js'

function requireUrl(value: string, usage: string) {
  const source = value.trim()
  if (!source || !/^https?:\/\//i.test(source)) throw new Error(usage)
  try {
    const url = new URL(source)
    const host = url.hostname.toLowerCase()
    if (!(host === 'instagram.com' || host.endsWith('.instagram.com'))) throw new Error('La URL indicada no pertenece a Instagram.')
  } catch (error) {
    if (error instanceof Error && /Instagram/.test(error.message)) throw error
    throw new Error(usage)
  }
  return source
}

function requireText(ctx: CommandContext, usage: string) {
  const value = ctx.argText.trim()
  if (value.length < 2) throw new Error(usage)
  return value.slice(0, 500)
}

function formatBytes(value: number) {
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`
  return `${(value / 1024 ** 2).toFixed(1)} MB`
}

function compact(value?: number) {
  return value === undefined || !Number.isFinite(value)
    ? undefined
    : new Intl.NumberFormat('es-MX', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

async function sendDownloadedMedia(ctx: CommandContext, result: LempiDownloadedMedia, label: string, quoted = true) {
  const caption = `📥 *${label}*\n━━━━━━━━━━━━━━\n📦 ${formatBytes(result.size)}\nFuente: LemPi\n👻 Ghost Nexora Bot`

  if (result.kind === 'image') {
    await ctx.socket.sendMessage(ctx.chatId, { image: { url: result.filePath }, caption }, quoted ? { quoted: ctx.message } : undefined)
    return
  }
  if (result.kind === 'video') {
    await ctx.socket.sendMessage(ctx.chatId, { video: { url: result.filePath }, mimetype: 'video/mp4', caption }, quoted ? { quoted: ctx.message } : undefined)
    return
  }
  if (result.kind === 'audio') {
    await ctx.socket.sendMessage(ctx.chatId, { audio: { url: result.filePath }, mimetype: 'audio/mpeg', ptt: false }, quoted ? { quoted: ctx.message } : undefined)
    return
  }

  await ctx.socket.sendMessage(ctx.chatId, {
    document: { url: result.filePath },
    fileName: result.fileName,
    caption,
  }, quoted ? { quoted: ctx.message } : undefined)
}

async function sendPinterestAlbum(ctx: CommandContext, files: LempiDownloadedMedia[], totalFound: number) {
  if (!files.length) throw new Error('No se pudo descargar ninguna imagen de Pinterest.')

  if (files.length === 1) {
    await ctx.socket.sendMessage(ctx.chatId, {
      image: { url: files[0]!.filePath },
      caption: `📥 *PINTEREST*\n━━━━━━━━━━━━━━\n🖼️ Resultados: *${totalFound}*\n📏 Peso: *${formatBytes(files[0]!.size)}*\n👻 Ghost Nexora Bot`,
    }, { quoted: ctx.message })
    return
  }

  const parent = await ctx.socket.sendMessage(ctx.chatId, {
    album: { expectedImageCount: files.length },
  })
  if (!parent?.key) throw new Error('No se pudo crear el álbum de Pinterest.')

  await Promise.all(files.map((file, index) => ctx.socket.sendMessage(ctx.chatId, {
    image: { url: file.filePath },
    caption: index === 0
      ? `📥 *PINTEREST*\n━━━━━━━━━━━━━━\n🖼️ Resultados: *${totalFound}*\n📤 Enviadas: *${files.length}*\n👻 Ghost Nexora Bot`
      : undefined,
    albumParentKey: parent.key,
  }, { quoted: index === 0 ? ctx.message : undefined })))
}

async function runPinterest(ctx: CommandContext) {
  const query = requireText(ctx, `Uso: ${ctx.prefix}pinterest <búsqueda>`)
  const results = await searchLempiPinterest(query, 12)
  const candidates = results
    .map((item, index) => item.download ? { url: item.download, baseName: `pinterest-${index + 1}` } : null)
    .filter((item): item is { url: string; baseName: string } => Boolean(item))
    .slice(0, 12)

  if (!candidates.length) throw new Error('No encontré imágenes para esa búsqueda.')

  await ctx.reply(`📥 *PINTEREST*\n━━━━━━━━━━━━━━\n⬇️ Descargando ${candidates.length} imágenes...`)

  const settled = await Promise.allSettled(candidates.map((item) => downloadLempiMedia(item.url, {
    kind: 'image',
    baseName: item.baseName,
  })))
  const files = settled
    .filter((item): item is PromiseFulfilledResult<LempiDownloadedMedia> => item.status === 'fulfilled')
    .map((item) => item.value)

  try {
    await sendPinterestAlbum(ctx, files, candidates.length)
    recordSubbotDownload(ctx.instanceId, files.reduce((total, file) => total + file.size, 0))
  } finally {
    await Promise.all(files.map((file) => file.cleanup()))
  }
}

async function runInstagramDownload(ctx: CommandContext, source: string, imagesOnly: boolean) {
  const sourceUrl = requireUrl(source, `Uso: ${ctx.prefix}${imagesOnly ? 'igimg' : 'instagram'} <url de Instagram>`)
  const reel = /\/(?:reel|reels)\//i.test(new URL(sourceUrl).pathname)
  const endpoint = !imagesOnly && reel ? '/dl/igreel' : '/dl/instagram'
  await ctx.reply(`📥 *INSTAGRAM*\n━━━━━━━━━━━━━━\nAPI: ${endpoint}\n⬇️ Descargando contenido...`)

  const files = await downloadLempiInstagramV2(sourceUrl, imagesOnly)
  try {
    for (const [index, file] of files.entries()) await sendDownloadedMedia(ctx, file, 'INSTAGRAM', index === 0)
    recordSubbotDownload(ctx.instanceId, files.reduce((total, file) => total + file.size, 0))
  } finally {
    await Promise.all(files.map((file) => file.cleanup()))
  }
}

async function runInstagramProfile(ctx: CommandContext, input: string) {
  const target = input.trim()
  if (!target) throw new Error(`Uso: ${ctx.prefix}instagram profile <usuario>`)
  const profile = await stalkLempiInstagram(target)
  await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
    title: profile.name ? `${profile.name} · @${profile.username}`.slice(0, 80) : `@${profile.username}`,
    body: [
      profile.bio?.slice(0, 220) ?? '',
      profile.followers !== undefined ? `Seguidores: ${compact(profile.followers)}` : '',
      profile.following !== undefined ? `Siguiendo: ${compact(profile.following)}` : '',
      profile.posts !== undefined ? `Publicaciones: ${compact(profile.posts)}` : '',
      profile.verified !== undefined ? `Verificado: ${profile.verified ? 'sí' : 'no'}` : '',
      profile.private !== undefined ? `Privado: ${profile.private ? 'sí' : 'no'}` : '',
      '',
      'Fuente: LemPi /tools/stalkig',
    ].filter((value) => value !== '').join('\n'),
    footer: 'Ghost Nexora Bot · Instagram · LemPi',
    imageUrl: profile.avatar,
  })
}

async function instagram(ctx: CommandContext) {
  const action = (ctx.args[0] ?? '').toLowerCase()
  if (['profile', 'perfil', 'user', 'usuario', 'stalk'].includes(action)) {
    await runInstagramProfile(ctx, ctx.args.slice(1).join(' '))
    return
  }

  const source = ctx.argText.trim()
  await runInstagramDownload(ctx, source, false)
}

export const mediaDownloadFixCommands: BotCommand[] = [
  {
    name: 'instagram',
    aliases: ['ig', 'insta'],
    category: 'downloads',
    description: 'Descarga Reels/publicaciones de Instagram con LemPi o consulta un perfil.',
    usage: 'instagram <url> | instagram profile <usuario>',
    handler: instagram,
  },
  {
    name: 'igimg',
    aliases: ['instagramimg', 'instagramimages', 'igimages'],
    category: 'downloads',
    description: 'Descarga imágenes de una publicación de Instagram mediante LemPi.',
    usage: 'igimg <url>',
    async handler(ctx) {
      await runInstagramDownload(ctx, ctx.argText.trim(), true)
    },
  },
  {
    name: 'igprofile',
    aliases: ['instagramprofile', 'igstalk', 'stalkig'],
    category: 'downloads',
    description: 'Consulta el perfil público de Instagram mediante LemPi.',
    usage: 'igprofile <usuario>',
    async handler(ctx) {
      await runInstagramProfile(ctx, ctx.argText)
    },
  },
  {
    name: 'pinterest',
    aliases: ['pin', 'pinterestimg', 'pinterestimages'],
    category: 'downloads',
    description: 'Busca imágenes de Pinterest y las entrega como álbum.',
    usage: 'pinterest <búsqueda>',
    async handler(ctx) {
      await runPinterest(ctx)
    },
  },
  ...likeeCommands,
  ...teraboxCommands,
]
