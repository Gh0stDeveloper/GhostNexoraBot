import type { BotCommand, CommandContext } from '../types.js'
import { sendCarousel, type InteractiveButton } from '../services/interactive.js'
import {
  downloadHappyModDirect,
  downloadInstagramDirect,
  getHappyModDirect,
  searchHappyModDirect,
  searchPinterestDirect,
} from '../services/media-download-fixes-v2.js'
import { downloadLempiMedia } from '../services/lempi-api.js'
import { recordSubbotDownload } from '../services/subbot-metrics.js'
import type { LempiDownloadedMedia } from '../services/lempi-api.js'

function requireUrl(ctx: CommandContext, usage: string) {
  const value = ctx.args[0]?.trim()
  if (!value || !/^https?:\/\//i.test(value)) throw new Error(usage)
  return value
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

async function sendDownloadedMedia(ctx: CommandContext, result: LempiDownloadedMedia, label: string) {
  const caption = `📥 *${label}*\n━━━━━━━━━━━━━━\n📦 ${formatBytes(result.size)}\n👻 Ghost Nexora Bot`

  if (result.kind === 'image') {
    await ctx.socket.sendMessage(ctx.chatId, {
      image: { url: result.filePath },
      caption,
    }, { quoted: ctx.message })
    return
  }

  if (result.kind === 'video') {
    await ctx.socket.sendMessage(ctx.chatId, {
      video: { url: result.filePath },
      mimetype: 'video/mp4',
      caption,
    }, { quoted: ctx.message })
    return
  }

  if (result.kind === 'audio') {
    await ctx.socket.sendMessage(ctx.chatId, {
      audio: { url: result.filePath },
      mimetype: 'audio/mpeg',
      ptt: false,
    }, { quoted: ctx.message })
    return
  }

  await ctx.socket.sendMessage(ctx.chatId, {
    document: { url: result.filePath },
    mimetype: 'application/vnd.android.package-archive',
    fileName: result.fileName.endsWith('.apk') ? result.fileName : `${result.fileName}.apk`,
    caption: `${caption}\n⚠️ Verifica permisos antes de instalar.`,
  }, { quoted: ctx.message })
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
  const results = await searchPinterestDirect(query, 12)
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

async function runInstagram(ctx: CommandContext, imagesOnly: boolean) {
  const sourceUrl = requireUrl(ctx, `Uso: ${ctx.prefix}${imagesOnly ? 'igimg' : 'ig'} <url de Instagram>`)
  await ctx.reply(`📥 *INSTAGRAM*\n━━━━━━━━━━━━━━\n⬇️ Descargando ${imagesOnly ? 'imágenes' : 'video'}...`)

  const files = await downloadInstagramDirect(sourceUrl, imagesOnly)
  try {
    for (const file of files) await sendDownloadedMedia(ctx, file, 'INSTAGRAM')
    recordSubbotDownload(ctx.instanceId, files.reduce((total, file) => total + file.size, 0))
  } finally {
    await Promise.all(files.map((file) => file.cleanup()))
  }
}

function happyModBody(item: Awaited<ReturnType<typeof searchHappyModDirect>>[number]) {
  return [
    item.version ? `Versión: ${item.version}` : '',
    'APK modificada: revisa permisos antes de instalar.',
  ].filter(Boolean).join('\n')
}

async function runHappyModSearch(ctx: CommandContext) {
  const query = requireText(ctx, `Uso: ${ctx.prefix}happymod <nombre de aplicación>`)
  const results = await searchHappyModDirect(query, 20)
  if (!results.length) throw new Error('No encontré APKs para esa búsqueda.')

  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: '🧩 HAPPYMOD · RESULTADOS',
    body: `Resultados para: ${query}`,
    footer: 'Ghost Nexora Bot',
    cards: results.map((item, index) => {
      const buttons: InteractiveButton[] = [
        { type: 'reply', text: '⬇️ Descargar APK', id: `${ctx.prefix}happymoddl ${item.tokenKey}` },
      ]
      if (item.url) buttons.push({ type: 'url', text: '🌐 Abrir', url: item.url })
      return {
        title: `#${item.numero ?? index + 1} · ${item.nombre}`.slice(0, 120),
        body: happyModBody(item),
        imageUrl: item.imagen,
        footer: 'Ghost Nexora Bot',
        buttons,
      }
    }),
  })
}

async function runHappyModDownload(ctx: CommandContext) {
  const token = ctx.args[0]?.trim()
  if (!token) throw new Error(`Uso: ${ctx.prefix}happymoddl <token>`)

  const item = getHappyModDirect(token)
  await ctx.reply(`📥 *HAPPYMOD*\n━━━━━━━━━━━━━━\n📱 ${item.nombre}\n${item.version ? `🔄 Versión: ${item.version}\n` : ''}⬇️ Descargando y validando la APK...`)

  const result = await downloadHappyModDirect(item)
  try {
    await sendDownloadedMedia(ctx, result, 'HAPPYMOD')
    recordSubbotDownload(ctx.instanceId, result.size)
  } finally {
    await result.cleanup()
  }
}

export const mediaDownloadFixCommands: BotCommand[] = [
  {
    name: 'ig',
    aliases: [],
    category: 'downloads',
    description: 'Descarga contenido de Instagram desde una URL.',
    usage: 'ig <url>',
    async handler(ctx) {
      await runInstagram(ctx, false)
    },
  },
  {
    name: 'igimg',
    aliases: ['instagramimg', 'instagramimages', 'igimages'],
    category: 'downloads',
    description: 'Descarga imágenes de una publicación de Instagram.',
    usage: 'igimg <url>',
    async handler(ctx) {
      await runInstagram(ctx, true)
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
  {
    name: 'happymod',
    aliases: ['hm', 'hmod', 'happymods', 'happynod'],
    category: 'downloads',
    description: 'Busca APKs modificadas.',
    usage: 'happymod <aplicación>',
    async handler(ctx) {
      await runHappyModSearch(ctx)
    },
  },
  {
    name: 'happymoddl',
    aliases: ['hmdl', 'hmoddl'],
    category: 'downloads',
    description: 'Descarga una APK seleccionada.',
    usage: 'happymoddl <token>',
    async handler(ctx) {
      await runHappyModDownload(ctx)
    },
  },
]
