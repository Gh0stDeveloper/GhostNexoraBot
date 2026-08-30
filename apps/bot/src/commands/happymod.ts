import type { BotCommand, CommandContext } from '../types.js'
import { sendCarousel, type InteractiveButton } from '../services/interactive.js'
import {
  downloadHappyModApk,
  getHappyModItem,
  searchHappyMod,
  type HappyModItem,
} from '../services/happymod.js'
import { recordSubbotDownload } from '../services/subbot-metrics.js'

const MAX_CARDS = 8

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

/** Short body · max 2 buttons (Erome style). */
function resultButtons(ctx: CommandContext, item: HappyModItem): InteractiveButton[] {
  const buttons: InteractiveButton[] = [
    { type: 'reply', text: '⬇️ Descargar', id: `${ctx.prefix}happymoddl ${item.token}` },
  ]
  if (item.url) buttons.push({ type: 'url', text: '🌐 Sitio', url: item.url })
  return buttons.slice(0, 2)
}

function cardBody(item: HappyModItem) {
  return [item.version ? `v${item.version}` : undefined, item.sizeLabel]
    .filter(Boolean)
    .join(' · ')
    .slice(0, 80) || 'HappyMod'
}

async function showResults(ctx: CommandContext, query: string) {
  await ctx.reply(`🧩 HappyMod · buscando ${query}…`)

  const results = (await searchHappyMod(query, MAX_CARDS)).slice(0, MAX_CARDS)
  if (!results.length) {
    throw new Error('No encontré resultados públicos en HappyMod para esa búsqueda.')
  }

  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: '🧩 HappyMod',
    body: query.slice(0, 80),
    footer: 'HappyMod',
    cards: results.map((item, index) => ({
      title: `#${index + 1} · ${item.name}`.slice(0, 60),
      body: cardBody(item),
      imageUrl: item.icon,
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
      await ctx.reply(
        [
          `🧩 *${item.name}*`,
          item.version ? `Versión: ${item.version}` : '',
          item.sizeLabel ? `Peso: ${item.sizeLabel}` : '',
          item.url || '',
          `Descargar: ${ctx.prefix}happymoddl ${item.token}`,
        ]
          .filter(Boolean)
          .join('\n'),
      )
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
      await ctx.reply(`🧩 Descargando ${selected.name}…`)

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
              'HappyMod',
              result.version ? `v${result.version}` : '',
              bytes(result.size) || '',
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
