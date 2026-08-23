import type { BotCommand, CommandContext } from '../types.js'
import { COIN_SYMBOL } from '../services/economy.js'
import { careerLicenses, resolveCareerId } from '../services/career-licenses.js'
import { MINER_HOURLY_YIELD, MINER_MAX_COUNT, MINER_SUBSCRIPTION_PLANS, mining, type MinerSubscriptionPlanId } from '../services/mining.js'
import { professionsV2 } from '../services/professions-v2.js'
import { sendCarousel } from '../services/interactive.js'

const fmt = (value: number) => `${Math.floor(value).toLocaleString('es-MX')} ${COIN_SYMBOL}`
const DAY = 86400_000

function formatDuration(ms: number) {
  const days = Math.floor(ms / DAY)
  const hours = Math.floor((ms % DAY) / 3_600_000)
  const minutes = Math.max(0, Math.floor((ms % 3_600_000) / 60_000))
  return [days ? `${days}d` : '', hours ? `${hours}h` : '', !days && minutes ? `${minutes}m` : ''].filter(Boolean).join(' ') || '<1m'
}

function parsePlan(value?: string): MinerSubscriptionPlanId | null {
  const clean = (value ?? '').trim().toLowerCase()
  if (clean === '30d' || clean === '30dias' || clean === 'mes' || clean === 'month') return '1m'
  if (clean === '15dias') return '15d'
  if (clean === '7dias') return '7d'
  if (clean === '1dia') return '1d'
  return clean in MINER_SUBSCRIPTION_PLANS ? clean as MinerSubscriptionPlanId : null
}

async function jobMenu(ctx: CommandContext, requestedPage = 1) {
  const rows = careerLicenses.all(ctx.sender)
  const pageSize = 10
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const page = Math.max(1, Math.min(totalPages, Math.floor(requestedPage) || 1))
  const current = professionsV2.get(ctx.sender)
  const visible = rows.slice((page - 1) * pageSize, page * pageSize)
  const pageTarget = page >= totalPages ? 1 : page + 1

  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: '💼 NEXORA · PROFESIONES',
    body: `Profesión actual: ${current.emoji} ${current.label}\nPágina ${page}/${totalPages}. Puedes desbloquear carreras jugando o comprar el título directamente.`,
    footer: 'Los títulos comprados/desbloqueados son permanentes',
    cards: visible.map((status) => ({
      title: `${status.item.emoji} ${status.item.label}`,
      body: [
        status.item.description,
        `💰 ${fmt(status.item.min)} — ${fmt(status.item.max)} por trabajo`,
        status.unlocked ? '✅ Estado: DESBLOQUEADA' : '🔒 Estado: BLOQUEADA',
        `📋 ${status.requirement}`,
        status.price > 0 ? `🎓 Título directo: ${fmt(status.price)}` : '🎓 Sin costo de licencia',
      ].join('\n'),
      buttons: status.unlocked
        ? [
            { type: 'reply' as const, text: '✅ Elegir', id: `${ctx.prefix}job ${status.profession}` },
            { type: 'reply' as const, text: '💼 Elegir y trabajar', id: `${ctx.prefix}work ${status.profession}` },
            { type: 'reply' as const, text: `📖 Página ${pageTarget}`, id: `${ctx.prefix}job ${pageTarget}` },
          ]
        : [
            { type: 'reply' as const, text: '🎓 Comprar título', id: `${ctx.prefix}joblicense ${status.profession}` },
            { type: 'reply' as const, text: '📋 Requisitos', id: `${ctx.prefix}jobrequirements ${status.profession}` },
            { type: 'reply' as const, text: `📖 Página ${pageTarget}`, id: `${ctx.prefix}job ${pageTarget}` },
          ],
    })),
  })
}

async function jobCommand(ctx: CommandContext) {
  const input = ctx.argText.trim()
  if (!input || ['list', 'lista', 'menu'].includes(input.toLowerCase())) {
    await jobMenu(ctx, 1)
    return
  }
  if (/^\d+$/.test(input)) {
    await jobMenu(ctx, Number(input))
    return
  }
  careerLicenses.ensureCurrent(ctx.sender)
  const selected = careerLicenses.choose(ctx.sender, input)
  await ctx.reply([
    '💼 *PROFESIÓN ACTUALIZADA*',
    '━━━━━━━━━━━━━━',
    `${selected.emoji} Ahora trabajas como *${selected.label}*`,
    selected.description,
    `💰 Rango: *${fmt(selected.min)} — ${fmt(selected.max)}*`,
    '🎓 Tu habilitación para esta profesión queda guardada permanentemente.',
  ].join('\n'))
}

async function jobRequirementsCommand(ctx: CommandContext) {
  const input = ctx.argText.trim()
  if (!input) {
    const m = careerLicenses.metrics(ctx.sender)
    await ctx.reply(`📋 *PROGRESO PROFESIONAL*\n━━━━━━━━━━━━━━\n🎁 Dailys reclamados: *${m.dailies}*\n💼 Trabajos completados: *${m.works}*\n⛏️ Mineros activos: *${m.activeMiners}/${MINER_MAX_COUNT}*\n💰 Patrimonio: *${fmt(m.netWorth)}*\n\nUsa *${ctx.prefix}jobrequirements <profesión>* para ver un requisito concreto.`)
    return
  }
  const id = resolveCareerId(input)
  if (!id) throw new Error('Profesión no reconocida.')
  const status = careerLicenses.status(ctx.sender, id)
  await ctx.reply([
    `📋 *REQUISITOS · ${status.item.emoji} ${status.item.label.toUpperCase()}*`,
    '━━━━━━━━━━━━━━',
    `${status.unlocked ? '✅' : '🔒'} ${status.requirement}`,
    status.price > 0 ? `🎓 Alternativa: comprar el título por *${fmt(status.price)}* con *${ctx.prefix}joblicense ${id}*.` : '🎓 Esta profesión no requiere una compra.',
    '',
    `Dailys: ${status.metrics.dailies} · Trabajos: ${status.metrics.works} · Mineros: ${status.metrics.activeMiners} · Patrimonio: ${fmt(status.metrics.netWorth)}`,
  ].join('\n'))
}

async function jobLicenseCommand(ctx: CommandContext) {
  const input = ctx.argText.trim()
  if (!input) throw new Error(`Uso: ${ctx.prefix}joblicense <profesión>`)
  const result = careerLicenses.buy(ctx.sender, input)
  if (result.alreadyUnlocked) {
    await ctx.reply(`ℹ️ Ya tienes desbloqueado permanentemente el título de *${result.item.label}*.`)
    return
  }
  await ctx.reply([
    result.price > 0 ? '🎓 *TÍTULO PROFESIONAL COMPRADO*' : '🏆 *TÍTULO PROFESIONAL DESBLOQUEADO*',
    '━━━━━━━━━━━━━━',
    `${result.item.emoji} Profesión: *${result.item.label}*`,
    result.price > 0 ? `💰 Precio: *${fmt(result.price)}*` : '✅ Cumpliste los requisitos; no se descontaron NXC.',
    `👛 Saldo restante: *${fmt(result.balance.total)}*`,
    '',
    `Ya puedes elegirla con *${ctx.prefix}job ${result.profession}*.` ,
  ].join('\n'))
}

async function workCommand(ctx: CommandContext) {
  careerLicenses.ensureCurrent(ctx.sender)
  const requested = ctx.argText.trim()
  if (requested) careerLicenses.choose(ctx.sender, requested)
  const result = professionsV2.work(ctx.sender)
  if (!result.ok) throw new Error(`Ya trabajaste recientemente. Vuelve en ${Math.max(1, Math.ceil(result.remaining / 1000))} s.`)
  await ctx.reply(`╭─〔 💼 *TRABAJO COMPLETADO* 〕\n│ Profesión » ${result.profession.emoji} *${result.profession.label}*\n│ Ganancia » *${fmt(result.reward)}*\n│ Cartera » *${fmt(result.balance.wallet)}*\n│ Próximo trabajo » *1 minuto*\n╰──────────────`)
}

async function minerShopCommand(ctx: CommandContext) {
  const summary = mining.summary(ctx.sender)
  await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
    title: '⛏️ NEXORA · TIENDA DE MINEROS',
    body: `Mineros activos: ${summary.count}/${MINER_MAX_COUNT}\nEspacios disponibles: ${summary.availableSlots}\nCada minero produce ${MINER_HOURLY_YIELD} NXC por hora. Elige una duración.`,
    footer: 'Suscripciones por minero · producción offline máxima 24 h por cobro',
    cards: Object.entries(MINER_SUBSCRIPTION_PLANS).map(([id, plan]) => {
      const estimated = Math.floor((plan.durationMs / 3_600_000) * MINER_HOURLY_YIELD)
      return {
        title: `⛏️ Minero · ${plan.label}`,
        body: [
          `💰 Precio por minero: ${fmt(plan.price)}`,
          `⚡ Producción: ${MINER_HOURLY_YIELD} NXC/h`,
          `📈 Producción teórica del plan: ${fmt(estimated)}`,
          `🕒 Duración: ${plan.label}`,
          `📦 Máximo simultáneo: ${MINER_MAX_COUNT} mineros`,
        ].join('\n'),
        buttons: [
          { type: 'reply' as const, text: '🛒 Comprar 1', id: `${ctx.prefix}minerbuy ${id} 1` },
          { type: 'reply' as const, text: '🛒 Comprar 3', id: `${ctx.prefix}minerbuy ${id} 3` },
          { type: 'reply' as const, text: '⛏️ Mis mineros', id: `${ctx.prefix}miner status` },
        ],
      }
    }),
  })
}

async function minerBuyCommand(ctx: CommandContext, shifted = false) {
  const plan = parsePlan(ctx.args[shifted ? 1 : 0])
  if (!plan) throw new Error(`Plan inválido. Usa ${ctx.prefix}minershop para ver 1d, 7d, 15d y 1m.`)
  const quantityRaw = ctx.args[shifted ? 2 : 1] ?? '1'
  const quantity = Number(quantityRaw)
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MINER_MAX_COUNT) throw new Error(`La cantidad debe estar entre 1 y ${MINER_MAX_COUNT}.`)
  const result = mining.purchaseSubscription(ctx.sender, plan, quantity)
  await ctx.reply([
    '✅ *SUSCRIPCIÓN MINERA ACTIVADA*',
    '━━━━━━━━━━━━━━',
    `⛏️ Mineros añadidos: *${result.quantity}*`,
    `🕒 Plan: *${result.plan.label}*`,
    `💰 Total: *${fmt(result.totalPrice)}*`,
    `⚡ Producción actual: *${fmt(result.hourly)}/h*`,
    `📦 Mineros activos: *${result.count}/${MINER_MAX_COUNT}*`,
    `📅 Vencen: *${new Date(result.expiresAt).toLocaleString('es-MX')}*`,
    `👛 Saldo: *${fmt(result.balance.total)}*`,
    result.collectedBeforePurchase > 0 ? `🪙 Antes de activar se cobraron automáticamente *${fmt(result.collectedBeforePurchase)}* pendientes.` : '',
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
    await ctx.reply(`⛏️ *COBRO MINERO*\n━━━━━━━━━━━━━━\n🪙 Cobrado: *${fmt(result.amount)}*\n👛 Cartera: *${fmt(result.balance.wallet)}*\n⚡ Producción actual: *${fmt(result.hourly)}/h*\n📦 Mineros activos: *${result.count}/${MINER_MAX_COUNT}*`)
    return
  }

  const summary = mining.summary(ctx.sender)
  const subscriptionLines = summary.subscriptions.slice(0, 5).map((sub, index) => `│ ${index + 1}. ${sub.planId} · vence ${new Date(sub.expiresAt).toLocaleString('es-MX')}`)
  await ctx.reply([
    '╭━━〔 ⛏️ *CENTRO DE MINERÍA NXC* 〕━━╮',
    `┃ Mineros activos » *${summary.count}/${MINER_MAX_COUNT}*`,
    `┃ Permanentes legacy » *${summary.legacyCount}*`,
    `┃ Suscripciones activas » *${summary.subscriptionCount}*`,
    `┃ Producción » *${fmt(summary.hourly)}/h*`,
    `┃ Pendiente » *${fmt(summary.pending)}*`,
    `┃ Total minado » *${fmt(summary.totalMined)}*`,
    summary.nextExpiry ? `┃ Próximo vencimiento » *${formatDuration(summary.nextExpiry - Date.now())}*` : '┃ Próximo vencimiento » *N/A*',
    '╰━━━━━━━━━━━━━━━━╯',
    subscriptionLines.length ? `\n*Suscripciones*\n${subscriptionLines.join('\n')}` : '',
    '',
    `🛒 Tienda: *${ctx.prefix}minershop*`,
    `🪙 Cobrar: *${ctx.prefix}miner collect*`,
    `📦 Comprar directo: *${ctx.prefix}minerbuy <1d|7d|15d|1m> [cantidad]*`,
  ].filter(Boolean).join('\n'))
}

export const economyCareersV5Commands: BotCommand[] = [
  { name: 'job', aliases: ['profession', 'profesion', 'empleo'], category: 'economy', description: 'Elige profesión; algunas requieren progreso o comprar un título.', usage: 'job [página|profesión]', handler: jobCommand },
  { name: 'jobrequirements', aliases: ['jobrequisitos', 'careerrequirements'], category: 'economy', description: 'Consulta requisitos de desbloqueo de profesiones.', usage: 'jobrequirements [profesión]', handler: jobRequirementsCommand },
  { name: 'joblicense', aliases: ['careerlicense', 'comprartitulo', 'buytitle'], category: 'economy', description: 'Compra permanentemente el título/licencia de una profesión.', usage: 'joblicense <profesión>', handler: jobLicenseCommand },
  { name: 'work', aliases: ['w', 'trabajar', 'trabajo'], category: 'economy', description: 'Trabaja con la profesión elegida; respeta sus requisitos.', usage: 'work [profesión]', handler: workCommand },
  { name: 'minershop', aliases: ['minertienda', 'miningstore'], category: 'economy', description: 'Tienda separada de suscripciones de mineros en carrusel.', handler: minerShopCommand },
  { name: 'minerbuy', aliases: ['buyminer', 'comprarminero'], category: 'economy', description: 'Compra uno o varios mineros por suscripción.', usage: 'minerbuy <1d|7d|15d|1m> [cantidad]', handler: (ctx) => minerBuyCommand(ctx, false) },
  { name: 'miner', aliases: ['minero', 'mining'], category: 'economy', description: 'Consulta, cobra o administra tus mineros activos.', usage: 'miner [status|collect|shop|buy <plan> [cantidad]]', handler: minerCommand },
]
