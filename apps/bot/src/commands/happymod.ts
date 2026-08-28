import type { BotCommand, CommandContext } from '../types.js'
import { sendCarousel, type InteractiveButton } from '../services/interactive.js'
import {
  downloadHappyModApk,
  getHappyModItem,
  searchHappyMod,
  type HappyModItem,
} from '../services/happymod.js'
import { recordSubbotDownload } from '../services/subbot-metrics.js'

function requireQuery(ctx: CommandContext) {
  const query = ctx.argText.trim()
  if (query.length < 2) throw new Error(`Uso: ${ctx.prefix}happymod <nombre de aplicación>`)
  return query
}

function bytes(value?: number) {
  if (!value || value <= 0) return undefined
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`
  return `${(value / 1024 ** 2).toFixed(1)} MB`
}

function itemBody(item: HappyModItem) {
  return [
    '🧩 Fuente » HappyMod',
    item.version ? `🔄 Versión » ${item.version}` : '',
    item.sizeLabel ? `📏 Peso » ${item.sizeLabel}` : '',
    item.category ? `📁 Categoría » ${item.category}` : '',
    '⚠️ APK modificada · instala solo si confías en la fuente',
    item.summary ? `\n${item.summary.slice(0, 220)}${item.summary.length > 220 ? '…' : ''}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function resultButtons(ctx: CommandContext, item: HappyModItem): InteractiveButton[] {
  const buttons: InteractiveButton[] = [
    { type: 'reply', text: '⬇️ Descargar APK', id: `${ctx.prefix}happymoddl ${item.token}` },
    { type: 'reply', text: 'ℹ️ Detalles', id: `${ctx.prefix}happymodinfo ${item.token}` },
  ]
  if (item.url) buttons.push({ type: 'url', text: '🌐 Abrir', url: item.url })
  return buttons
}

async function showResults(ctx: CommandContext, query: string) {
  await ctx.reply(
    [
      '🧩 *HAPPYMOD · BUSCANDO*',
      '━━━━━━━━━━━━━━',
      `🔎 ${query}`,
      '⏳ Consultando la web de HappyMod...',
    ].join('\n'),
  )

  const results = await searchHappyMod(query, 10)
  if (!results.length) {
    throw new Error('No encontré resultados públicos en HappyMod para esa búsqueda.')
  }

  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: '🧩 HAPPYMOD · RESULTADOS',
    body: `Resultados para: ${query}\nAPKs modificadas · verifica antes de instalar.`,
    footer: 'HappyMod · Ghost Nexora Bot',
    cards: results.map((item, index) => ({
      title: `#${index + 1} · ${item.name}`.slice(0, 120),
      body: itemBody(item),
      imageUrl: item.icon,
      footer: 'Ghost Nexora Bot · HappyMod',
      buttons: resultButtons(ctx, item),
    })),
  })
}

export const happyModCommands: BotCommand[] = [
  {
    name: 'happymod',
    aliases: ['hm', 'hmod', 'happymods', 'happynod'],
    category: 'downloads',
    description: 'Busca APKs/mods en HappyMod y muestra resultados en carrusel.',
    usage: 'happymod <aplicación>',
    async handler(ctx) {
      await showResults(ctx, requireQuery(ctx))
    },
  },
  {
    name: 'happymodinfo',
    aliases: ['hminfo', 'hmodinfo'],
    category: 'downloads',
    description: 'Muestra detalles de un resultado de HappyMod.',
    usage: 'happymodinfo <token>',
    async handler(ctx) {
      const token = ctx.args[0]
      if (!token) throw new Error(`Usa primero ${ctx.prefix}happymod <aplicación>.`)

      const item = getHappyModItem(token)
      const buttons: InteractiveButton[] = [
        { type: 'reply', text: '⬇️ Descargar APK', id: `${ctx.prefix}happymoddl ${item.token}` },
      ]
      if (item.url) buttons.push({ type: 'url', text: '🌐 Abrir fuente', url: item.url })

      await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
        title: '🧩 HAPPYMOD · DETALLES',
        body: item.name,
        footer: 'Ghost Nexora Bot',
        cards: [
          {
            title: item.name,
            body: itemBody(item),
            imageUrl: item.icon,
            buttons,
          },
        ],
      })
    },
  },
  {
    name: 'happymoddl',
    aliases: ['hmdl', 'hmoddl'],
    category: 'downloads',
    description: 'Descarga una APK seleccionada desde HappyMod.',
    usage: 'happymoddl <token>',
    async handler(ctx) {
      const token = ctx.args[0]
      if (!token) throw new Error(`Usa primero ${ctx.prefix}happymod <aplicación>.`)

      const selected = getHappyModItem(token)
      await ctx.reply(
        [
          '🧩 *HAPPYMOD · DESCARGA INICIADA*',
          '━━━━━━━━━━━━━━',
          `📱 ${selected.name}`,
          selected.version ? `🔄 Versión » ${selected.version}` : '',
          '⏳ Resolviendo enlace y validando el archivo APK...',
          '',
          '⚠️ Las APKs de HappyMod son modificadas. Instálalas solo si confías en el origen.',
        ]
          .filter(Boolean)
          .join('\n'),
      )

      const result = await downloadHappyModApk(token)
      try {
        await ctx.socket.sendMessage(
          ctx.chatId,
          {
            document: { url: result.filePath },
            mimetype: 'application/vnd.android.package-archive',
            fileName: result.fileName,
            caption: [
              `🧩 *${result.name}*`,
              '🌐 Fuente » HappyMod',
              result.version ? `🔄 Versión » ${result.version}` : '',
              `📏 Peso » ${bytes(result.size)}`,
              '',
              '⚠️ APK modificada · revisa permisos antes de instalar.',
              '',
              '👻 Ghost Nexora Bot',
            ]
              .filter(Boolean)
              .join('\n'),
          },
          { quoted: ctx.message },
        )
        recordSubbotDownload(ctx.instanceId, result.size)
      } finally {
        await result.cleanup()
      }
    },
  },
]
