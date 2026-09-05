import type { BotCommand, CommandContext } from '../types.js'
import { COIN_SYMBOL } from '../services/economy.js'
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

async function minerShopCommand(ctx: CommandContext) {
  const summary = mining.summary(ctx.sender)
  const plans = Object.entries(MINER_SUBSCRIPTION_PLANS).map(([id, plan]) => {
    const estimated = Math.floor((plan.durationMs / 3_600_000) * MINER_HOURLY_YIELD)
    return [
      `*${id.toUpperCase()} · ${plan.label}*`,
      `Precio: *${fmt(plan.price)}* por minero`,
      `Producción: *${fmt(MINER_HOURLY_YIELD)}/h*`,
      `Producción teórica: *${fmt(estimated)}*`,
      `Comprar 1: *${ctx.prefix}minerbuy ${id} 1*`,
      `Comprar varios: *${ctx.prefix}minerbuy ${id} <cantidad>*`,
    ].join('\n')
  })

  await ctx.reply([
    '╭━━〔 ⛏️ *NEXORA MINER SHOP* 〕━━╮',
    `┃ Mineros activos: *${summary.count}/${MINER_MAX_COUNT}*`,
    `┃ Espacios disponibles: *${summary.availableSlots}*`,
    `┃ Producción actual: *${fmt(summary.hourly)}/h*`,
    `┃ Pendiente de cobro: *${fmt(summary.pending)}*`,
    `┃ Acumulación offline: máximo *${summary.capHours}h*`,
    '╰━━━━━━━━━━━━━━━━╯',
    '',
    plans.join('\n\n'),
    '',
    `Máximo simultáneo: *${MINER_MAX_COUNT} mineros*.`,
    `Ver mis mineros: *${ctx.prefix}miner*`,
    `Cobrar producción: *${ctx.prefix}miner collect*`,
    '',
    'Esta tienda usa mensajes estándar de WhatsApp y no requiere carruseles ni botones experimentales.',
  ].join('\n'))
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

export const minershopV10Commands: BotCommand[] = [
  {
    name: 'minershop',
    aliases: ['minertienda', 'miningstore'],
    category: 'economy',
    description: 'Tienda compatible de suscripciones de mineros, sin carruseles experimentales.',
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
    description: 'Consulta, cobra o administra tus mineros mediante mensajes compatibles.',
    usage: 'miner [status|collect|shop|buy <plan> [cantidad]]',
    handler: minerCommand,
  },
]
