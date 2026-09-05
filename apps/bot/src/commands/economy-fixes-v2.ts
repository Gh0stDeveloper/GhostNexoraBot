import type { BotCommand, CommandContext } from '../types.js'
import { economy, COIN_SYMBOL } from '../services/economy.js'
import { advancedEconomy } from '../services/economy-advanced.js'
import { economyV2 } from '../services/economy-v2.js'
import { economyJustice } from '../services/economy-justice.js'
import { giveWaifu } from '../services/waifu.js'
import { resolveTarget } from '../utils/target.js'
import { getContextInfo } from '../utils/message.js'

const fmt = (value: number) => `${Math.floor(value).toLocaleString('es-MX')} ${COIN_SYMBOL}`

function parsePositive(value?: string) {
  const parsed = Number((value ?? '').replace(/[,_]/g, ''))
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error('Indica una cantidad válida.')
  return Math.floor(parsed)
}

function duration(ms: number) {
  const seconds = Math.max(1, Math.ceil(ms / 1000))
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return minutes ? `${minutes}m${rest ? ` ${rest}s` : ''}` : `${seconds}s`
}

function numericArgs(ctx: CommandContext) {
  return ctx.args.filter((arg) => /^\d[\d,_]*(?:\.\d+)?%?$/.test(arg))
}

function likelyDirectPhone(ctx: CommandContext, token: string, index: number) {
  if (index !== 0) return false
  const context = getContextInfo(ctx.message)
  if (context?.mentionedJid?.length || context?.participant) return false
  const digits = token.replace(/\D/g, '')
  return digits.length >= 8 && digits.length <= 15
}

function moneyTokens(ctx: CommandContext) {
  const values = numericArgs(ctx)
  return values.filter((token, index) => !likelyDirectPhone(ctx, token, index))
}

async function transfer(ctx: CommandContext) {
  const target = await resolveTarget(ctx, { requiredMessage: 'Menciona, responde o indica el número del usuario que recibirá los NXC.' })
  const values = moneyTokens(ctx)
  const value = parsePositive(values.at(-1)?.replace('%', ''))
  const sender = economyV2.transfer(ctx.sender, target!, value)
  const received = economy.balance(target!)
  await ctx.socket.sendMessage(ctx.chatId, {
    text: `💸 *TRANSFERENCIA GLOBAL COMPLETADA*\n━━━━━━━━━━━━━━\n📤 Enviaste: *${fmt(value)}*\n📥 @${target!.split('@')[0]} recibió el saldo en su billetera global.\n👛 Tu cartera: *${fmt(sender.wallet)}*\n👛 Cartera destino: *${fmt(received.wallet)}*`,
    mentions: [target!],
  }, { quoted: ctx.message })
}

async function addNxc(ctx: CommandContext) {
  const target = await resolveTarget(ctx, { requiredMessage: 'Menciona, responde o indica el número del usuario que recibirá NXC.' })
  const values = moneyTokens(ctx)
  const value = parsePositive(values.at(-1)?.replace('%', ''))
  const balance = economyV2.credit(target!, value, 'admin_nxc_grant')
  await ctx.socket.sendMessage(ctx.chatId, {
    text: `🪙 *NXC AÑADIDOS*\n━━━━━━━━━━━━━━\n@${target!.split('@')[0]} recibió *${fmt(value)}*.\nNueva cartera: *${fmt(balance.wallet)}*`,
    mentions: [target!],
  }, { quoted: ctx.message })
}

async function lend(ctx: CommandContext) {
  const target = await resolveTarget(ctx, { requiredMessage: 'Menciona, responde o indica el número del usuario que recibirá el préstamo.' })
  const values = moneyTokens(ctx)
  const value = parsePositive(values[0]?.replace('%', ''))
  const rateToken = values[1]?.replace('%', '')
  const interest = rateToken ? Number(rateToken) : 5
  if (!Number.isFinite(interest) || interest < 0 || interest > 25) throw new Error('El interés debe estar entre 0% y 25%.')
  const result = advancedEconomy.lend(ctx.sender, target!, value, interest)
  await ctx.socket.sendMessage(ctx.chatId, {
    text: `🤝 *PRÉSTAMO #${result.id}*\n━━━━━━━━━━━━━━\n@${target!.split('@')[0]} recibió *${fmt(result.amount)}*.\nInterés: *${result.rate}%*\nTotal a pagar: *${fmt(result.due)}*\nPago: *${ctx.prefix}loan pay*`,
    mentions: [target!],
  }, { quoted: ctx.message })
}

async function give(ctx: CommandContext) {
  const target = await resolveTarget(ctx, { requiredMessage: 'Menciona, responde o indica el número del usuario que recibirá el personaje.' })
  const candidates = moneyTokens(ctx).map((token) => token.replace(/\D/g, '')).filter((token) => token.length > 0 && token.length <= 8)
  const id = Number(candidates.at(-1))
  if (!Number.isInteger(id) || id <= 0) throw new Error('Indica el ID de MyAnimeList del personaje.')
  const claim = giveWaifu(ctx.sender, target!, id)
  await ctx.socket.sendMessage(ctx.chatId, { text: `🎁 *${claim.name}* fue transferida a @${target!.split('@')[0]}.`, mentions: [target!] }, { quoted: ctx.message })
}

async function rob(ctx: CommandContext) {
  const target = await resolveTarget(ctx, { requiredMessage: 'Menciona o responde a la persona que intentas robar.' })
  const result = economyJustice.rob(ctx.sender, target!)

  if (!result.ok) {
    if (result.reason === 'fine_due') throw new Error(`Tienes una multa pendiente de ${fmt(result.fineDue)}. Debes pagarla con ${ctx.prefix}multa pagar antes de volver a robar.`)
    throw new Error(`La policía sigue alerta. Podrás volver a intentarlo en ${duration(result.remaining)}.`)
  }

  if (result.reason === 'empty') {
    await ctx.reply('🕵️ *NO HABÍA EFECTIVO SUFICIENTE*\n━━━━━━━━━━━━━━\nLa persona no lleva suficientes NXC en la cartera. El saldo del banco no puede ser robado.')
    return
  }

  if (result.success) {
    await ctx.socket.sendMessage(ctx.chatId, {
      text: [
        '🦹 *ROBO COMPLETADO*',
        '━━━━━━━━━━━━━━',
        `Objetivo: @${target!.split('@')[0]}`,
        `Botín: *${fmt(result.amount)}*`,
        `Nivel de búsqueda: *${result.record.heat}/100*`,
        `Robos exitosos: *${result.record.successfulRobs}*`,
        `Cartera global: *${fmt(result.balance.wallet)}*`,
      ].join('\n'),
      mentions: [target!],
    }, { quoted: ctx.message })
    return
  }

  await ctx.socket.sendMessage(ctx.chatId, {
    text: [
      '🚓 *TE ATRAPARON INTENTANDO ROBAR*',
      '━━━━━━━━━━━━━━',
      `Objetivo: @${target!.split('@')[0]}`,
      `Multa #${result.fine.id}: *${fmt(result.fine.amount)}*`,
      `Multas pendientes totales: *${fmt(result.fine.due)}*`,
      `Arrestos registrados: *${result.record.arrests}*`,
      `Nivel de búsqueda: *${result.record.heat}/100*`,
      '',
      `No puedes usar *${ctx.prefix}rob* ni *${ctx.prefix}crime* hasta pagar tu deuda.`,
      `Pagar: *${ctx.prefix}multa pagar*`,
    ].join('\n'),
    mentions: [target!],
  }, { quoted: ctx.message })
}

async function crime(ctx: CommandContext) {
  const result = economyJustice.crime(ctx.sender)
  if (!result.ok) {
    if (result.reason === 'fine_due') throw new Error(`Tienes una multa pendiente de ${fmt(result.fineDue)}. Págala con ${ctx.prefix}multa pagar antes de cometer otro crimen.`)
    throw new Error(`Debes esperar ${duration(result.remaining)} antes de volver a intentarlo.`)
  }

  if (result.success) {
    await ctx.reply([
      '🕶️ *CRIMEN EXITOSO*',
      '━━━━━━━━━━━━━━',
      `Evento: *${result.scenario}*`,
      `Ganancia: *+${fmt(result.amount)}*`,
      `Nivel de búsqueda: *${result.record.heat}/100*`,
      `Crímenes exitosos: *${result.record.successfulCrimes}*`,
      `Cartera global: *${fmt(result.balance.wallet)}*`,
    ].join('\n'))
    return
  }

  await ctx.reply([
    '🚓 *FUISTE DETENIDO*',
    '━━━━━━━━━━━━━━',
    `Evento: *${result.scenario}*`,
    `Multa #${result.fine.id}: *${fmt(result.fine.amount)}*`,
    `Deuda total por multas: *${fmt(result.fine.due)}*`,
    `Arrestos registrados: *${result.record.arrests}*`,
    `Nivel de búsqueda: *${result.record.heat}/100*`,
    '',
    `La multa no desaparece al cambiar al MainBot o a un subbot.`,
    `Debes pagarla con *${ctx.prefix}multa pagar* antes de volver a delinquir.`,
  ].join('\n'))
}

async function fine(ctx: CommandContext) {
  const action = (ctx.args[0] ?? 'status').toLowerCase()
  if (['pagar', 'pay', 'pago'].includes(action)) {
    const raw = (ctx.args[1] ?? 'all').toLowerCase()
    const requested = ['all', 'todo', 'total'].includes(raw) ? undefined : parsePositive(raw)
    const result = economyJustice.payFine(ctx.sender, requested)
    await ctx.reply([
      '🏛️ *PAGO DE MULTA*',
      '━━━━━━━━━━━━━━',
      `Pagado: *${fmt(result.paid)}*`,
      `Pendiente: *${fmt(result.remaining)}*`,
      `Cartera: *${fmt(result.balance.wallet)}*`,
      `Banco: *${fmt(result.balance.bank)}*`,
      result.remaining === 0 ? 'Estado: *SIN MULTAS PENDIENTES*' : `Puedes continuar pagando con *${ctx.prefix}multa pagar [monto|todo]*.`,
    ].join('\n'))
    return
  }

  const summary = economyJustice.fineSummary(ctx.sender)
  if (!summary.rows.length) {
    await ctx.reply([
      '🏛️ *MULTAS Y ANTECEDENTES*',
      '━━━━━━━━━━━━━━',
      'Multas pendientes: *0 NXC*',
      `Arrestos: *${summary.record.arrests}*`,
      `Nivel de búsqueda: *${summary.record.heat}/100*`,
      'Estado: *AL DÍA*',
    ].join('\n'))
    return
  }

  const rows = summary.rows.slice(0, 6).map((item) => `#${item.id} · ${item.source === 'rob' ? 'Robo' : 'Crimen'} · *${fmt(item.balanceDue)}*\n  ${item.reason}`)
  await ctx.reply([
    '🏛️ *MULTAS PENDIENTES*',
    '━━━━━━━━━━━━━━',
    ...rows,
    '',
    `Total: *${fmt(summary.total)}*`,
    `Arrestos: *${summary.record.arrests}* · Búsqueda: *${summary.record.heat}/100*`,
    `Pagar todo: *${ctx.prefix}multa pagar*`,
    `Pago parcial: *${ctx.prefix}multa pagar <monto>*`,
  ].join('\n'))
}

async function criminalRecord(ctx: CommandContext) {
  const summary = economyJustice.fineSummary(ctx.sender)
  const record = summary.record
  await ctx.reply([
    '📋 *ANTECEDENTES NEXORA*',
    '━━━━━━━━━━━━━━',
    `Arrestos: *${record.arrests}*`,
    `Crímenes exitosos: *${record.successfulCrimes}*`,
    `Robos exitosos: *${record.successfulRobs}*`,
    `Nivel de búsqueda: *${record.heat}/100*`,
    `Multas pendientes: *${fmt(summary.total)}*`,
    '',
    'El nivel de búsqueda disminuye gradualmente con el tiempo.',
  ].join('\n'))
}

export const economyFixV2Commands: BotCommand[] = [
  { name: 'transfer', aliases: ['pay', 'send', 'enviar', 'transferir'], category: 'economy', description: 'Transfiere NXC global por mención, respuesta o número.', handler: transfer },
  { name: 'addnxc', aliases: ['givencx', 'grantnxc'], category: 'owner', description: 'Añade NXC a la billetera global de un usuario.', staffOnly: true, handler: addNxc },
  { name: 'lend', aliases: ['prestar'], category: 'economy', description: 'Presta NXC por mención, respuesta o número.', handler: lend },
  { name: 'wgive', aliases: ['givewaifu', 'regalarwaifu'], category: 'collection', description: 'Regala un personaje por mención, respuesta o número.', handler: give },
  { name: 'rob', aliases: ['robar', 'steal'], category: 'economy', description: 'Intenta robar NXC con arrestos, nivel de búsqueda y multas persistentes.', usage: 'rob @usuario', handler: rob },
  { name: 'crime', aliases: ['crimen'], category: 'economy', description: 'Crimen de riesgo con antecedentes y multas obligatorias.', handler: crime },
  { name: 'fine', aliases: ['multa', 'multas'], category: 'economy', description: 'Consulta o paga multas pendientes.', usage: 'multa [pagar [monto|todo]]', handler: fine },
  { name: 'record', aliases: ['antecedentes', 'criminalrecord'], category: 'economy', description: 'Consulta tus antecedentes económicos de crimen y robo.', handler: criminalRecord },
]
