import type { BotCommand, CommandContext } from '../types.js'
import { COIN_SYMBOL, economy } from '../services/economy.js'
import { sendCarousel } from '../services/interactive.js'
import {
  MINER_HOURLY_YIELD,
  MINER_MAX_COUNT,
  MINER_SUBSCRIPTION_PLANS,
  mining,
} from '../services/mining.js'
import { getCurrentBotVisualStyle, resolveCurrentBotVisualImage } from '../services/bot-styles-v13.js'
import { minershopV11Commands } from './minershop-v11.js'

const fmt = (value: number) => `${Math.floor(value).toLocaleString('es-MX')} ${COIN_SYMBOL}`
const legacyMiner = minershopV11Commands.find((command) => command.name === 'miner')

async function currentBotAvatar(ctx: CommandContext) {
  const jid = ctx.socket.user?.id
  if (!jid) return undefined
  return ctx.socket.profilePictureUrl(jid, 'image').catch(() => undefined)
}

async function minerShopCommand(ctx: CommandContext) {
  const summary = mining.summary(ctx.sender)
  const balance = economy.balance(ctx.sender)
  const avatar = await currentBotAvatar(ctx)
  const imageUrl = await resolveCurrentBotVisualImage(avatar)
  const style = getCurrentBotVisualStyle()

  const cards = Object.entries(MINER_SUBSCRIPTION_PLANS).map(([id, plan]) => {
    const estimated = Math.floor((plan.durationMs / 3_600_000) * MINER_HOURLY_YIELD)
    return {
      title: `⛏️ Minero · ${plan.label}`,
      body: [
        `💰 Precio: ${fmt(plan.price)}`,
        `⚡ Produce: ${fmt(MINER_HOURLY_YIELD)}/h`,
        `📈 Plan completo: ${fmt(estimated)}`,
        `📦 Espacios libres: ${summary.availableSlots}/${MINER_MAX_COUNT}`,
      ].join('\n'),
      imageUrl,
      footer: `${style.icon} ${style.name} · Nexora Mining`,
      buttons: [
        { type: 'reply' as const, text: '🛒 Comprar', id: `${ctx.prefix}minerbuy ${id} 1` },
        { type: 'reply' as const, text: '🪙 Mi saldo', id: `${ctx.prefix}balance` },
        { type: 'reply' as const, text: '⛏️ Mis mineros', id: `${ctx.prefix}miner` },
      ],
    }
  })

  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: '⛏️ NEXORA MINER SHOP',
    body: [
      `Saldo global: ${fmt(balance.total)}`,
      `Mineros activos: ${summary.count}/${MINER_MAX_COUNT} · ${fmt(summary.hourly)}/h`,
      `Estilo visual: ${style.icon} ${style.name}`,
      'Desliza para elegir un plan y comprar directamente.',
    ].join('\n'),
    footer: 'Nexora Economy · Ghost Nexora Bot',
    cards,
  })
}

async function minerCommand(ctx: CommandContext) {
  const action = (ctx.args[0] ?? 'status').toLowerCase()
  if (['shop', 'tienda', 'store'].includes(action)) {
    await minerShopCommand(ctx)
    return
  }
  if (!legacyMiner) throw new Error('El centro de minería no está disponible temporalmente.')
  await legacyMiner.handler(ctx)
}

export const minershopStyleV13Commands: BotCommand[] = [
  {
    name: 'minershop',
    aliases: ['minertienda', 'miningstore'],
    category: 'economy',
    description: 'Tienda de mineros en carrusel con el estilo visual activo de la instancia.',
    handler: minerShopCommand,
  },
  {
    name: 'miner',
    aliases: ['minero', 'mining'],
    category: 'economy',
    description: 'Centro de minería; la tienda usa el estilo visual activo.',
    usage: 'miner [status|collect|shop|buy <plan> [cantidad]]',
    handler: minerCommand,
  },
]
