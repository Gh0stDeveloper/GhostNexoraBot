import { createHash } from 'node:crypto'
import type { BotCommand, CommandContext } from '../types.js'
import { sendCarousel, type InteractiveButton } from '../services/interactive.js'
import {
  askLempiDeepSeek,
  downloadLempiMedia,
  searchLempiHappyMod,
  searchLempiInstagram,
  searchLempiPinterest,
  searchLempiTikTok,
  type LempiHappyModResult,
  type LempiInstagramResult,
  type LempiPinterestResult,
  type LempiTikTokResult,
} from '../services/lempi-api.js'
import { recordSubbotDownload } from '../services/subbot-metrics.js'

const TOKEN_TTL_MS = 30 * 60_000

type PendingDownload = {
  url: string
  kind: 'image' | 'video' | 'audio' | 'document'
  baseName: string
  expiresAt: number
}

const pendingDownloads = new Map<string, PendingDownload>()

function rememberDownload(item: Omit<PendingDownload, 'expiresAt'>) {
  const token = createHash('sha256')
    .update(`${item.url}:${Date.now()}:${Math.random()}`)
    .digest('hex')
    .slice(0, 12)
  pendingDownloads.set(token, { ...item, expiresAt: Date.now() + TOKEN_TTL_MS })
  return token
}

function takeDownload(token: string) {
  const normalized = token.trim()
  const item = pendingDownloads.get(normalized)
  if (!item) throw new Error('Ese enlace expiró. Vuelve a realizar la búsqueda.')
  pendingDownloads.delete(normalized)
  if (item.expiresAt <= Date.now()) throw new Error('Ese enlace expiró. Vuelve a realizar la búsqueda.')
  return item
}

function requireQuery(ctx: CommandContext, usage: string) {
  const query = ctx.argText.trim()
  if (query.length < 2) throw new Error(usage)
  return query.slice(0, 500)
}

function formatBytes(value: number) {
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`
  return `${(value / 1024 ** 2).toFixed(1)} MB`
}

function compact(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return 'N/D'
  return new Intl.NumberFormat('es-MX', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

function duration(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return 'N/D'
  const seconds = Math.max(0, Math.floor(value))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function inferFenceLanguage(lines: string[]) {
  const sample = lines.slice(0, 10).join('\n')
  if (/^\s*(?:from\s+\S+\s+import|import\s+\S+|def\s+\w+\(|class\s+\w+[:(]|print\s*\()/m.test(sample)) return 'python'
  if (/\b(?:const|let|var|function|interface|type)\s+\w+|=>|console\.log\(/.test(sample)) {
    return /interface\s+\w+|type\s+\w+\s*=|:\s*(?:string|number|boolean)\b/.test(sample) ? 'typescript' : 'javascript'
  }
  if (/^\s*(?:sudo\s+|apt\s+|npm\s+|pnpm\s+|yarn\s+|git\s+|curl\s+|systemctl\s+|journalctl\s+|#!\/bin\/(?:ba)?sh)/m.test(sample)) return 'bash'
  if (/^\s*[\[{]/.test(sample.trim()) && /[}\]]\s*$/.test(sample.trim())) return 'json'
  if (/<(?:html|div|span|script|body|head|section)\b/i.test(sample)) return 'html'
  if (/\bSELECT\b[\s\S]+\bFROM\b|\bCREATE\s+TABLE\b/i.test(sample)) return 'sql'
  if (/^[.#]?[\w-]+\s*\{[^}]*:[^}]*\}/m.test(sample)) return 'css'
  if (/\b(?:package|import)\s+\w+|func\s+\w+\s*\(/.test(sample)) return 'go'
  if (/\b(?:fn|let mut|struct|impl)\s+\w+/.test(sample)) return 'rust'
  if (/^\s*(?:public\s+class|private\s+class|System\.out\.println)\b/m.test(sample)) return 'java'
  return 'text'
}

function normalizeCodeFences(input: string) {
  const lines = input.replace(/\r\n/g, '\n').split('\n')
  let inside = false

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!
    const match = /^```\s*([^\s`]*)\s*$/.exec(line)
    if (!match) continue

    if (inside) {
      inside = false
      lines[index] = '```'
      continue
    }

    inside = true
    if (!match[1]) lines[index] = `\`\`\`${inferFenceLanguage(lines.slice(index + 1, index + 11))}`
  }

  if (inside) lines.push('```')
  return lines.join('\n').trim()
}

function splitForWhatsApp(input: string, limit = 3500) {
  const text = normalizeCodeFences(input)
  const lines = text.split('\n')
  const chunks: string[] = []
  let current = ''
  let activeFence: string | null = null

  const flush = () => {
    const trimmed = current.trimEnd()
    if (!trimmed) return
    chunks.push(activeFence ? `${trimmed}\n\`\`\`` : trimmed)
    current = activeFence ? `${activeFence}\n` : ''
  }

  for (const line of lines) {
    const fence = /^```[^\s`]*\s*$/.exec(line)
    const addition = `${current ? '\n' : ''}${line}`
    if (current.length + addition.length > limit && current) flush()
    current += `${current ? '\n' : ''}${line}`
    if (fence) activeFence = activeFence ? null : line
  }

  if (current.trim()) chunks.push(current.trimEnd())
  return chunks
}

async function sendFormattedText(ctx: CommandContext, text: string) {
  for (const chunk of splitForWhatsApp(text)) await ctx.reply(chunk)
}

function tiktokBody(item: LempiTikTokResult) {
  return [
    item.title.slice(0, 480),
    item.author?.username ? `Usuario: @${item.author.username}` : '',
    item.author?.name ? `Creador: ${item.author.name}` : '',
    item.duration !== undefined ? `Duración: ${duration(item.duration)}` : '',
    item.quality ? `Calidad: ${item.quality}` : '',
    item.stats?.views !== undefined ? `Vistas: ${compact(item.stats.views)}` : '',
    item.stats?.likes !== undefined ? `Likes: ${compact(item.stats.likes)}` : '',
    item.music?.title ? `Audio: ${item.music.title}` : '',
  ].filter(Boolean).join('\n')
}

async function showTikTok(ctx: CommandContext, query: string) {
  const results = await searchLempiTikTok(query)
  if (!results.length) throw new Error('API Lempi no devolvió videos de TikTok para esa búsqueda.')

  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: '🎵 TIKTOK · RESULTADOS',
    body: `Resultados para: ${query}`,
    footer: 'API Lempi · Ghost Nexora Bot',
    cards: results.slice(0, 10).map((item, index) => {
      const token = rememberDownload({ url: item.video!, kind: 'video', baseName: `tiktok-${index + 1}` })
      return {
        title: `#${index + 1} · ${(item.author?.username ? `@${item.author.username}` : 'TikTok')}`,
        body: tiktokBody(item),
        imageUrl: item.author?.avatar,
        footer: `Lemppi · ${item.quality ?? 'Media'}`,
        buttons: [
          { type: 'reply', text: '⬇️ Descargar', id: `${ctx.prefix}tiktokdl ${token}` },
          { type: 'url', text: '🌐 Abrir', url: item.url },
        ],
      }
    }),
  })
}

function pinterestBody(item: LempiPinterestResult) {
  return [
    item.title ? item.title.slice(0, 480) : 'Imagen de Pinterest',
    item.author ? `Autor: ${item.author}` : '',
    item.likes ? `Likes: ${item.likes}` : '',
    item.type ? `Tipo: ${item.type}` : 'Tipo: imagen',
  ].filter(Boolean).join('\n')
}

async function showPinterest(ctx: CommandContext, query: string) {
  const results = await searchLempiPinterest(query, 20)
  if (!results.length) throw new Error('API Lempi no devolvió resultados de Pinterest para esa búsqueda.')

  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: '📌 PINTEREST · RESULTADOS',
    body: `Resultados para: ${query}`,
    footer: 'API Lempi · Ghost Nexora Bot',
    cards: results.map((item, index) => {
      const token = rememberDownload({ url: item.download!, kind: 'image', baseName: `pinterest-${index + 1}` })
      const buttons: InteractiveButton[] = [
        { type: 'reply', text: '⬇️ Descargar', id: `${ctx.prefix}pindl ${token}` },
      ]
      if (item.url) buttons.push({ type: 'url', text: '🌐 Abrir', url: item.url })
      return {
        title: `#${index + 1} · ${item.title?.slice(0, 90) || 'Pinterest'}`,
        body: pinterestBody(item),
        imageUrl: item.download,
        footer: 'API Lempi',
        buttons,
      }
    }),
  })
}

function instagramBody(item: LempiInstagramResult) {
  return [
    item.title ? item.title.slice(0, 480) : 'Instagram',
    item.author ? `Autor: ${item.author}` : '',
    item.type ? `Tipo: ${item.type}` : '',
    item.duration !== undefined ? `Duración: ${duration(item.duration)}` : '',
  ].filter(Boolean).join('\n')
}

function instagramMedia(item: LempiInstagramResult) {
  if (item.video) return { url: item.video, kind: 'video' as const }
  const image = item.image ?? item.download
  if (image) return { url: image, kind: 'image' as const }
  return null
}

async function showInstagram(ctx: CommandContext, query: string) {
  const results = await searchLempiInstagram(query, 10)
  const usable = results
    .map((item) => ({ item, media: instagramMedia(item) }))
    .filter((value): value is { item: LempiInstagramResult; media: { url: string; kind: 'image' | 'video' } } => Boolean(value.media))

  if (!usable.length) throw new Error('API Lempi no devolvió media de Instagram para esa búsqueda.')

  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: '📸 INSTAGRAM · RESULTADOS',
    body: `Resultados para: ${query}`,
    footer: 'API Lempi · Ghost Nexora Bot',
    cards: usable.slice(0, 10).map(({ item, media }, index) => {
      const token = rememberDownload({ url: media.url, kind: media.kind, baseName: `instagram-${index + 1}` })
      const buttons: InteractiveButton[] = [
        { type: 'reply', text: '⬇️ Descargar', id: `${ctx.prefix}igdl ${token}` },
      ]
      if (item.url) buttons.push({ type: 'url', text: '🌐 Abrir', url: item.url })
      return {
        title: `#${index + 1} · ${item.author ? `@${item.author}` : 'Instagram'}`,
        body: instagramBody(item),
        imageUrl: item.thumbnail ?? (media.kind === 'image' ? media.url : undefined),
        footer: 'API Lempi',
        buttons,
      }
    }),
  })
}

function happyModBody(item: LempiHappyModResult) {
  return [
    item.version ? `Versión: ${item.version}` : '',
    'Fuente: HappyMod vía API Lempi',
    'APK modificada: revisa permisos antes de instalar.',
  ].filter(Boolean).join('\n')
}

async function showHappyMod(ctx: CommandContext, query: string) {
  const results = await searchLempiHappyMod(query, 20)
  if (!results.length) throw new Error('API Lempi no encontró APKs de HappyMod para esa búsqueda.')

  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: '🧩 HAPPYMOD · APK',
    body: `Resultados para: ${query}`,
    footer: 'API Lempi · Ghost Nexora Bot',
    cards: results.map((item, index) => {
      const token = rememberDownload({ url: item.url, kind: 'document', baseName: `happymod-${index + 1}` })
      const buttons: InteractiveButton[] = [
        { type: 'reply', text: '⬇️ Descargar APK', id: `${ctx.prefix}happymoddl ${token}` },
      ]
      if (item.url) buttons.push({ type: 'url', text: '🌐 Fuente', url: item.url })
      return {
        title: `#${item.numero ?? index + 1} · ${item.nombre}`,
        body: happyModBody(item),
        imageUrl: item.imagen,
        footer: 'HappyMod · API Lempi',
        buttons,
      }
    }),
  })
}

async function sendPendingDownload(ctx: CommandContext, token: string, label: string) {
  const item = takeDownload(token)
  const result = await downloadLempiMedia(item.url, { kind: item.kind, baseName: item.baseName })

  try {
    if (result.kind === 'image') {
      await ctx.socket.sendMessage(ctx.chatId, {
        image: { url: result.filePath },
        caption: `📥 *${label}*\n━━━━━━━━━━━━━━\n📦 ${formatBytes(result.size)}\n👻 Ghost Nexora Bot`,
      }, { quoted: ctx.message })
    } else if (result.kind === 'video') {
      await ctx.socket.sendMessage(ctx.chatId, {
        video: { url: result.filePath },
        mimetype: 'video/mp4',
        caption: `📥 *${label}*\n━━━━━━━━━━━━━━\n📦 ${formatBytes(result.size)}\n👻 Ghost Nexora Bot`,
      }, { quoted: ctx.message })
    } else if (result.kind === 'audio') {
      await ctx.socket.sendMessage(ctx.chatId, {
        audio: { url: result.filePath },
        mimetype: 'audio/mpeg',
        ptt: false,
      }, { quoted: ctx.message })
      await ctx.reply(`📥 *${label}* · ${formatBytes(result.size)}`)
    } else {
      await ctx.socket.sendMessage(ctx.chatId, {
        document: { url: result.filePath },
        mimetype: 'application/vnd.android.package-archive',
        fileName: result.fileName.endsWith('.apk') ? result.fileName : `${result.fileName.replace(/\.[^.]+$/, '')}.apk`,
        caption: `🧩 *${label}*\n━━━━━━━━━━━━━━\n📦 ${formatBytes(result.size)}\n⚠️ APK modificada · verifica permisos antes de instalar.`,
      }, { quoted: ctx.message })
    }
    recordSubbotDownload(ctx.instanceId, result.size)
  } finally {
    await result.cleanup()
  }
}

export const lempiApiCommands: BotCommand[] = [
  {
    name: 'tiktok',
    aliases: ['tt'],
    category: 'downloads',
    description: 'Busca videos públicos de TikTok con API Lempi y permite descargarlos.',
    usage: 'tiktok <búsqueda>',
    async handler(ctx) {
      await showTikTok(ctx, requireQuery(ctx, `Uso: ${ctx.prefix}tiktok <búsqueda>`))
    },
  },
  {
    name: 'tiktokdl',
    aliases: ['ttdl'],
    category: 'downloads',
    description: 'Descarga un video de TikTok seleccionado desde los resultados de Lempi.',
    usage: 'tiktokdl <token>',
    async handler(ctx) {
      const token = ctx.args[0]
      if (!token) throw new Error(`Uso: ${ctx.prefix}tiktokdl <token>`)
      await sendPendingDownload(ctx, token, 'TIKTOK')
    },
  },
  {
    name: 'instagram',
    aliases: ['ig', 'insta'],
    category: 'downloads',
    description: 'Busca media pública de Instagram con API Lempi y permite descargarla.',
    usage: 'instagram <búsqueda>',
    async handler(ctx) {
      await showInstagram(ctx, requireQuery(ctx, `Uso: ${ctx.prefix}instagram <búsqueda>`))
    },
  },
  {
    name: 'igimg',
    aliases: ['instagramimg', 'instagramimages', 'igimages'],
    category: 'downloads',
    description: 'Busca imágenes públicas de Instagram mediante API Lempi.',
    usage: 'igimg <búsqueda>',
    async handler(ctx) {
      await showInstagram(ctx, requireQuery(ctx, `Uso: ${ctx.prefix}igimg <búsqueda>`))
    },
  },
  {
    name: 'igdl',
    aliases: ['instadl', 'instagramdl'],
    category: 'downloads',
    description: 'Descarga una imagen o video de Instagram seleccionado desde Lempi.',
    usage: 'igdl <token>',
    async handler(ctx) {
      const token = ctx.args[0]
      if (!token) throw new Error(`Uso: ${ctx.prefix}igdl <token>`)
      await sendPendingDownload(ctx, token, 'INSTAGRAM')
    },
  },
  {
    name: 'pinterest',
    aliases: ['pin', 'pinterestimg', 'pinterestimages'],
    category: 'downloads',
    description: 'Busca imágenes públicas de Pinterest con API Lempi y permite descargarlas.',
    usage: 'pinterest <búsqueda>',
    async handler(ctx) {
      await showPinterest(ctx, requireQuery(ctx, `Uso: ${ctx.prefix}pinterest <búsqueda>`))
    },
  },
  {
    name: 'pindl',
    aliases: ['pinterestdl'],
    category: 'downloads',
    description: 'Descarga una imagen de Pinterest seleccionada desde Lempi.',
    usage: 'pindl <token>',
    async handler(ctx) {
      const token = ctx.args[0]
      if (!token) throw new Error(`Uso: ${ctx.prefix}pindl <token>`)
      await sendPendingDownload(ctx, token, 'PINTEREST')
    },
  },
  {
    name: 'happymod',
    aliases: ['hm', 'hmod', 'happymods', 'happynod'],
    category: 'downloads',
    description: 'Busca APKs de HappyMod mediante API Lempi y muestra solo los resultados relevantes.',
    usage: 'happymod <aplicación>',
    async handler(ctx) {
      await showHappyMod(ctx, requireQuery(ctx, `Uso: ${ctx.prefix}happymod <nombre de aplicación>`))
    },
  },
  {
    name: 'happymoddl',
    aliases: ['hmdl', 'hmoddl'],
    category: 'downloads',
    description: 'Descarga la APK de HappyMod seleccionada desde los resultados de Lempi.',
    usage: 'happymoddl <token>',
    async handler(ctx) {
      const token = ctx.args[0]
      if (!token) throw new Error(`Uso: ${ctx.prefix}happymoddl <token>`)
      await sendPendingDownload(ctx, token, 'HAPPYMOD')
    },
  },
  {
    name: 'deepseek',
    aliases: ['ds', 'deepseekai'],
    category: 'general',
    description: 'Consulta DeepSeek mediante API Lempi y conserva los bloques de código para WhatsApp.',
    usage: 'deepseek <pregunta>',
    async handler(ctx) {
      const prompt = requireQuery(ctx, `Uso: ${ctx.prefix}deepseek <pregunta>`)
      await ctx.socket.sendPresenceUpdate('composing', ctx.chatId).catch(() => undefined)
      const response = await askLempiDeepSeek(prompt)
      await sendFormattedText(ctx, response)
    },
  },
]
