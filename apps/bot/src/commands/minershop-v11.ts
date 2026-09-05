import type { BotCommand, CommandContext } from '../types.js'
import { COIN_SYMBOL, economy } from '../services/economy.js'
import { sendCarousel } from '../services/interactive.js'
import {
  MINER_HOURLY_YIELD,
  MINER_MAX_COUNT,
  MINER_SUBSCRIPTION_PLANS,
  mining,
  type MinerSubscriptionPlanId,
} from '../services/mining.js'

const fmt = (value: number) => `${Math.floor(value).toLocaleString('es-MX')} ${COIN_SYMBOL}`
const DAY = 86_400_000

function formatDuration(ms: number) {
  const safe = Math.max(0, ms)
  const days = Math.floor(safe / DAY)
  const hours = Math.floor((safe % DAY) / 3_600_000)
  const minutes = Math.ceil((safe % 3_600_000) / 60_000)
  return [days ? `${days}d` : '', hours ? `${hours}h` : '', !days && minutes ? `${minutes}m` : ''].filter(Boolean).join(' ') || '<1m'
}

function parsePlan(value?: string): MinerSubscriptionPlanId | null {
  const clean = (value ?? '').trim().toLowerCase()
  if (['30d', '30dias', 'mes', 'month'].includes(clean)) return '1m'
  if (clean === '15dias') return '15d'
  if (clean === '7dias') return '7d'
  if (clean === '1dia') return '1d'
  return clean in MINER_SUBSCRIPTION_PLANS ? clean as MinerSubscriptionPlanId : null
}

async function botAvatar(ctx: CommandContext) {
  const jid = ctx.socket.user?.id
  if (!jid) return undefined
  return ctx.socket.profilePictureUrl(jid, 'image').catch(() => undefined)
}

async function minerShopCommand(ctx: CommandContext) {
  const summary = mining.summary(ctx.sender)
  const balance = economy.balance(ctx.sender)
  const avatar = await botAvatar(ctx)

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
      imageUrl: avatar,
      footer: 'Nexora Mining · Ghost Nexora Bot',
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
      'Desliza para elegir un plan y comprar directamente.',
    ].join('\n'),
    footer: 'Nexora Economy · Ghost Nexora Bot',
    cards,
  })
}

async function minerBuyCommand(ctx: CommandContext, shifted = false) {
  const plan = parsePlan(ctx.args[shifted ? 1 : 0])
  if (!plan) throw new Error(`Plan inválido. Usa ${ctx.prefix}minershop para consultar 1d, 7d, 15d y 1m.`)
  const quantity = Number(ctx.args[shifted ? 2 : 1] ?? '1')
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MINER_MAX_COUNT) {
    throw new Error(`La cantidad debe estar entre 1 y ${MINER_MAX_COUNT}.`)
  }
  const result = mining.purchaseSubscription(ctx.sender, plan, quantity)
  await ctx.reply([
    '✅ *SUSCRIPCIÓN MINERA ACTIVADA*',
    '━━━━━━━━━━━━━━',
    `Mineros añadidos: *${result.quantity}*`,
    `Plan: *${result.plan.label}*`,
    `Total pagado: *${fmt(result.totalPrice)}*`,
    `Producción actual: *${fmt(result.hourly)}/h*`,
    `Mineros activos: *${result.count}/${MINER_MAX_COUNT}*`,
    `Vencimiento: *${new Date(result.expiresAt).toLocaleString('es-MX')}*`,
    `Saldo global: *${fmt(result.balance.total)}*`,
    result.collectedBeforePurchase > 0 ? `Antes de comprar se cobraron automáticamente *${fmt(result.collectedBeforePurchase)}* pendientes.` : '',
  ].filter(Boolean).join('\n'))
}

async function minerCommand(ctx: CommandContext) {
  const action = (ctx.args[0] ?? 'status').toLowerCase()
  if (['shop', 'tienda', 'store'].includes(action)) {
    await minerShopCommand(ctx)
    return
  }
  if (['buy', 'comprar', 'subscribe', 'suscribir'].includes(action)) {
    await minerBuyCommand(ctx, true)
    return
  }
  if (['collect', 'claim', 'cobrar', 'reclamar'].includes(action)) {
    const result = mining.collect(ctx.sender)
    await ctx.reply([
      '⛏️ *COBRO MINERO*',
      '━━━━━━━━━━━━━━',
      `Cobrado: *${fmt(result.amount)}*`,
      `Cartera global: *${fmt(result.balance.wallet)}*`,
      `Producción actual: *${fmt(result.hourly)}/h*`,
      `Mineros activos: *${result.count}/${MINER_MAX_COUNT}*`,
    ].join('\n'))
    return
  }

  const summary = mining.summary(ctx.sender)
  const subscriptions = summary.subscriptions.slice(0, 5).map((sub, index) =>
    `${index + 1}. *${sub.planId.toUpperCase()}* · vence ${new Date(sub.expiresAt).toLocaleString('es-MX')} · ${formatDuration(sub.expiresAt - Date.now())}`,
  )
  await ctx.reply([
    '╭━━〔 ⛏️ *CENTRO DE MINERÍA NXC* 〕━━╮',
    `┃ Mineros activos: *${summary.count}/${MINER_MAX_COUNT}*`,
    `┃ Permanentes legacy: *${summary.legacyCount}*`,
    `┃ Suscripciones: *${summary.subscriptionCount}*`,
    `┃ Producción: *${fmt(summary.hourly)}/h*`,
    `┃ Pendiente: *${fmt(summary.pending)}*`,
    `┃ Total minado: *${fmt(summary.totalMined)}*`,
    summary.nextExpiry ? `┃ Próximo vencimiento: *${formatDuration(summary.nextExpiry - Date.now())}*` : '┃ Próximo vencimiento: *N/A*',
    '╰━━━━━━━━━━━━━━━━╯',
    subscriptions.length ? `\n*SUSCRIPCIONES ACTIVAS*\n${subscriptions.join('\n')}` : '',
    '',
    `Tienda: *${ctx.prefix}minershop*`,
    `Cobrar: *${ctx.prefix}miner collect*`,
    `Comprar: *${ctx.prefix}minerbuy <1d|7d|15d|1m> [cantidad]*`,
  ].filter(Boolean).join('\n'))
}

export const minershopV11Commands: BotCommand[] = [
  {
    name: 'minershop',
    aliases: ['minertienda', 'miningstore'],
    category: 'economy',
    description: 'Tienda de mineros en el mismo carrusel estable que Nexora Store.',
    handler: minerShopCommand,
  },
  {
    name: 'minerbuy',
    aliases: ['buyminer', 'comprarminero'],
    category: 'economy',
    description: 'Compra uno o varios mineros por suscripción.',
    usage: 'minerbuy <1d|7d|15d|1m> [cantidad]',
    handler: (ctx) => minerBuyCommand(ctx, false),
  },
  {
    name: 'miner',
    aliases: ['minero', 'mining'],
    category: 'economy',
    description: 'Consulta, cobra o administra tus mineros.',
    usage: 'miner [status|collect|shop|buy <plan> [cantidad]]',
    handler: minerCommand,
  },
]
