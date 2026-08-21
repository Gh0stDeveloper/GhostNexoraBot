import type { BotCommand, CommandContext } from '../types.js'
import { config } from '../config.js'
import { settings } from '../core/settings.js'
import { economy } from '../services/economy.js'
import { downloadEromeVideo, eromeSessionStatus, exploreErome, getEromeAlbum, searchErome } from '../services/erome.js'
import { sendCarousel, sendInteractiveCard, type InteractiveButton } from '../services/interactive.js'
import { recordSubbotDownload } from '../services/subbot-metrics.js'

function assertAdultAccess(ctx: CommandContext) {
  if (!settings.adultEnabled) throw new Error(`El módulo 18+ está desactivado globalmente. El owner puede habilitarlo con ${ctx.prefix}adultmode on.`)
  if (ctx.isGroup && !economy.getGroupPolicy(ctx.chatId).adultAllowed) throw new Error('Este grupo no está autorizado para el módulo 18+.')
  if (!ctx.isGroup && !config.adultPrivateEnabled) throw new Error('El módulo 18+ está desactivado en chats privados.')
  if (!economy.hasEntitlement(ctx.sender, 'adult_consent')) throw new Error(`Antes debes confirmar que eres mayor de edad con ${ctx.prefix}adult18 accept.`)
}

function safePage(value?: string) {
  const page = Number(value ?? 1)
  return Number.isInteger(page) && page > 0 ? Math.min(500, page) : 1
}

function encodeQuery(value: string) { return Buffer.from(value, 'utf8').toString('base64url') }
function decodeQuery(value: string) {
  try { return Buffer.from(value, 'base64url').toString('utf8') } catch { throw new Error('La búsqueda paginada ya no es válida.') }
}

function albumId(input: string) {
  const raw = input.trim()
  if (/^[A-Za-z0-9_-]{5,30}$/.test(raw)) return raw
  try {
    const url = new URL(raw)
    const match = /^\/a\/([A-Za-z0-9_-]+)\/?$/.exec(url.pathname)
    if (match && (url.hostname === 'erome.com' || url.hostname === 'www.erome.com')) return match[1]!
  } catch { /* handled below */ }
  throw new Error('Indica un ID o enlace de álbum Erome válido.')
}

async function showListing(ctx: CommandContext, mode: 'hot' | 'new' | 'search', page: number, query?: string) {
  const result = mode === 'search'
    ? await searchErome(query ?? '', page, 10)
    : await exploreErome(mode, page, 10)
  const albums = result.albums
  if (!albums.length) throw new Error('Erome no devolvió álbumes en esta página.')

  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: `🔞 EROME · ${mode === 'search' ? 'BÚSQUEDA' : mode.toUpperCase()}`,
    body: mode === 'search'
      ? `Resultados para: ${query}\nPágina: ${page}\nAbre un álbum para ver únicamente sus videos.`
      : `Explorar ${mode === 'hot' ? 'HOT' : 'NEW'} · página ${page}\nLas imágenes internas se omiten: el bot solo lista videos.`,
    footer: 'Solo adultos · Ghost Nexora Bot',
    cards: albums.map((album, index) => ({
      title: `#${index + 1} · ${album.title}`.slice(0, 120),
      body: album.author ? `Autor: ${album.author}` : `Álbum: ${album.id}`,
      imageUrl: album.thumbnail,
      buttons: [
        { type: 'reply', text: '🎬 Ver videos', id: `${ctx.prefix}erome album ${album.id} 1` },
        { type: 'url', text: '🌐 Abrir álbum', url: album.url },
      ],
    })),
  })

  const buttons: InteractiveButton[] = []
  if (page > 1) {
    buttons.push({
      type: 'reply', text: '◀️ Anterior',
      id: mode === 'search' ? `${ctx.prefix}erome search64 ${page - 1} ${encodeQuery(query ?? '')}` : `${ctx.prefix}erome ${mode} ${page - 1}`,
    })
  }
  buttons.push({
    type: 'reply', text: 'Siguiente ▶️',
    id: mode === 'search' ? `${ctx.prefix}erome search64 ${page + 1} ${encodeQuery(query ?? '')}` : `${ctx.prefix}erome ${mode} ${page + 1}`,
  })
  if (mode !== 'search') buttons.push({ type: 'reply', text: mode === 'hot' ? '🆕 NEW' : '🔥 HOT', id: `${ctx.prefix}erome ${mode === 'hot' ? 'new' : 'hot'} 1` })

  await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
    title: '🔞 EROME · NAVEGACIÓN',
    body: `Página actual: *${page}*\nTambién puedes usar *${ctx.prefix}erome search <texto>* para buscar álbumes.`,
    footer: 'Contenido público de Erome · solo videos',
    buttons,
  })
}

async function showAlbum(ctx: CommandContext, input: string, page: number) {
  const id = albumId(input)
  const album = await getEromeAlbum(id)
  if (!album.videos.length) throw new Error('Ese álbum no contiene videos descargables; las imágenes se omitieron.')
  const pageSize = 10
  const totalPages = Math.max(1, Math.ceil(album.videos.length / pageSize))
  const safe = Math.max(1, Math.min(totalPages, page))
  const items = album.videos.slice((safe - 1) * pageSize, safe * pageSize)

  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: `🔞 ${album.title}`,
    body: `Videos: ${album.videos.length} · página ${safe}/${totalPages}\nSolo se muestran fuentes MP4; las imágenes del álbum no se incluyen.`,
    footer: album.author ? `Erome · ${album.author}` : 'Erome · Ghost Nexora Bot',
    cards: items.map((video) => ({
      title: `Video #${video.index}`,
      body: video.title,
      imageUrl: video.poster,
      buttons: [
        { type: 'reply', text: '⬇️ Descargar', id: `${ctx.prefix}erome dl ${album.id} ${video.index}` },
        { type: 'url', text: '🌐 Abrir álbum', url: album.url },
      ],
    })),
  })

  if (totalPages > 1) {
    const buttons: InteractiveButton[] = []
    if (safe > 1) buttons.push({ type: 'reply', text: '◀️ Anterior', id: `${ctx.prefix}erome album ${album.id} ${safe - 1}` })
    if (safe < totalPages) buttons.push({ type: 'reply', text: 'Siguiente ▶️', id: `${ctx.prefix}erome album ${album.id} ${safe + 1}` })
    await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
      title: '🎬 MÁS VIDEOS DEL ÁLBUM',
      body: `Página ${safe}/${totalPages}`,
      buttons,
    })
  }
}

export const eromeCommands: BotCommand[] = [
  {
    name: 'erome', aliases: ['er'], category: 'adult',
    description: 'Explora, busca y descarga únicamente videos de álbumes públicos de Erome.',
    usage: 'erome [hot|new|search|album|dl|status] ...',
    async handler(ctx) {
      assertAdultAccess(ctx)
      const action = (ctx.args[0] ?? 'hot').toLowerCase()

      if (action === 'status' || action === 'session') {
        const status = await eromeSessionStatus()
        await ctx.reply([
          '╭━━〔 🔞 *EROME · SESIÓN* 〕━━╮',
          `┃ Modo » *${status.mode === 'cookie-session' ? 'COOKIE PERSISTENTE' : 'ANÓNIMO'}*`,
          `┃ Cookie en .env » *${status.envCookieConfigured ? 'CONFIGURADA' : 'NO'}*`,
          `┃ Cookies persistidas » *${status.storedCookies}*`,
          '╰━━━━━━━━━━━━━━━━╯',
          '',
          'Erome permite explorar contenido público sin cuenta. Si se configura EROME_COOKIE, el bot reutiliza esa sesión y persiste las cookies que Erome vaya renovando.',
        ].join('\n'))
        return
      }

      if (action === 'hot' || action === 'explore') {
        await showListing(ctx, 'hot', safePage(ctx.args[1]))
        return
      }
      if (action === 'new') {
        await showListing(ctx, 'new', safePage(ctx.args[1]))
        return
      }
      if (action === 'search') {
        const query = ctx.args.slice(1).join(' ').trim()
        if (!query) throw new Error(`Uso: ${ctx.prefix}erome search <texto>`)
        await showListing(ctx, 'search', 1, query)
        return
      }
      if (action === 'search64') {
        const page = safePage(ctx.args[1])
        const query = decodeQuery(ctx.args[2] ?? '')
        await showListing(ctx, 'search', page, query)
        return
      }
      if (action === 'album') {
        const id = ctx.args[1]
        if (!id) throw new Error(`Uso: ${ctx.prefix}erome album <id|url> [página]`)
        await showAlbum(ctx, id, safePage(ctx.args[2]))
        return
      }
      if (action === 'dl' || action === 'download') {
        const id = ctx.args[1]
        const index = Number(ctx.args[2])
        if (!id || !Number.isInteger(index)) throw new Error(`Uso: ${ctx.prefix}erome dl <album-id> <video>`)
        const result = await downloadEromeVideo(id, index)
        try {
          await ctx.socket.sendMessage(ctx.chatId, {
            video: { url: result.filePath },
            mimetype: 'video/mp4',
            caption: `🔞 *EROME · VIDEO ${result.video.index}*\n${result.album.title}\n📦 ${(result.size / 1024 / 1024).toFixed(1)} MB`,
          }, { quoted: ctx.message })
          recordSubbotDownload(ctx.instanceId, result.size)
        } finally {
          await result.cleanup()
        }
        return
      }

      if (/^https?:\/\//i.test(ctx.argText.trim())) {
        await showAlbum(ctx, ctx.argText.trim(), 1)
        return
      }

      await showListing(ctx, 'search', 1, ctx.argText.trim())
    },
  },
]
