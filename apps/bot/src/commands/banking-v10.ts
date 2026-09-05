import type { BotCommand, CommandContext } from '../types.js'
import { COIN_SYMBOL } from '../services/economy.js'
import { bankingV10 } from '../services/banking-v10.js'

const fmt = (value: number) => `${Math.floor(value).toLocaleString('es-MX')} ${COIN_SYMBOL}`

function amount(value?: string) {
  const parsed = Number((value ?? '').replace(/[,_]/g, ''))
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error('Indica una cantidad válida.')
  return Math.floor(parsed)
}

function duration(ms: number) {
  if (ms <= 0) return 'vencido'
  const days = Math.floor(ms / 86_400_000)
  const hours = Math.floor((ms % 86_400_000) / 3_600_000)
  const minutes = Math.ceil((ms % 3_600_000) / 60_000)
  return [days ? `${days}d` : '', hours ? `${hours}h` : '', !days && minutes ? `${minutes}m` : ''].filter(Boolean).join(' ') || '<1m'
}

function loanStatusLabel(status: string) {
  if (status === 'active') return 'AL CORRIENTE'
  if (status === 'delinquent') return 'EN MORA'
  if (status === 'defaulted') return 'INCUMPLIMIENTO'
  return status.toUpperCase()
}

async function bankStatus(ctx: CommandContext) {
  const state = bankingV10.status(ctx.sender)
  const loanLines = state.loans.slice(0, 5).map((loan) => {
    const remaining = loan.dueAt - Date.now()
    return [
      `• Préstamo #${loan.id} · *${loanStatusLabel(loan.status)}*`,
      `  Pendiente: *${fmt(loan.balanceDue)}*`,
      `  Vencimiento: ${new Date(loan.dueAt).toLocaleString('es-MX')} (${duration(remaining)})`,
      loan.lateFeeTotal > 0 ? `  Mora acumulada: *${fmt(loan.lateFeeTotal)}* · ${loan.lateDaysApplied} día(s)` : '',
    ].filter(Boolean).join('\n')
  })

  await ctx.reply([
    '╭━━〔 🏦 *BANCO NEXORA* 〕━━╮',
    `┃ Score crediticio: *${state.profile.creditScore}/${850}*`,
    `┃ Nivel: *${state.tier.label}*`,
    `┃ Tasa actual: *${(state.tier.interestBp / 100).toFixed(2)}%*`,
    `┃ Plazo disponible: *${state.tier.termDays} días*`,
    `┃ Límite de crédito: *${fmt(state.maxLoan)}*`,
    `┃ Préstamos pagados: *${state.profile.completedLoans}*`,
    `┃ Atrasos: *${state.profile.lateLoans}* · Defaults: *${state.profile.defaults}*`,
    '┣━━━━━━━━━━━━━━━━',
    `┃ Cartera: *${fmt(state.balance.wallet)}*`,
    `┃ Cuenta bancaria: *${fmt(state.balance.bank)}*`,
    `┃ Deuda bancaria: *${fmt(state.totalDebt)}*`,
    '╰━━━━━━━━━━━━━━━━╯',
    loanLines.length ? `\n*CRÉDITOS ACTIVOS*\n${loanLines.join('\n\n')}` : '\n✅ No tienes créditos bancarios pendientes.',
    '',
    `Solicitar: *${ctx.prefix}bank loan <monto>*`,
    `Cotizar: *${ctx.prefix}bank quote <monto>*`,
    `Pagar: *${ctx.prefix}bank pay <monto|all>*`,
    `Score: *${ctx.prefix}creditscore*`,
    `Historial: *${ctx.prefix}bank history*`,
    `Depositar: *${ctx.prefix}bank deposit <monto>*`,
    `Retirar: *${ctx.prefix}bank withdraw <monto>*`,
  ].join('\n'))
}

async function creditScore(ctx: CommandContext) {
  const state = bankingV10.status(ctx.sender)
  const nextTier = state.profile.creditScore < 600 ? 600
    : state.profile.creditScore < 650 ? 650
      : state.profile.creditScore < 700 ? 700
        : state.profile.creditScore < 750 ? 750
          : state.profile.creditScore < 800 ? 800
            : null
  await ctx.reply([
    '📊 *SCORE CREDITICIO NEXORA*',
    '━━━━━━━━━━━━━━',
    `Puntuación: *${state.profile.creditScore}/850*`,
    `Clasificación: *${state.tier.label}*`,
    `Tasa disponible: *${(state.tier.interestBp / 100).toFixed(2)}%*`,
    `Límite actual: *${fmt(state.maxLoan)}*`,
    `Créditos pagados: *${state.profile.completedLoans}*`,
    `Créditos con atraso: *${state.profile.lateLoans}*`,
    `Incumplimientos: *${state.profile.defaults}*`,
    nextTier ? `Siguiente nivel: *${nextTier} puntos* (${nextTier - state.profile.creditScore} por recuperar).` : 'Nivel máximo de crédito alcanzado.',
    '',
    'Pagar antes del vencimiento mejora el score. La mora y los defaults lo reducen.',
  ].join('\n'))
}

async function bankHistory(ctx: CommandContext) {
  const rows = bankingV10.history(ctx.sender, 10)
  if (!rows.length) {
    await ctx.reply('🏦 *HISTORIAL BANCARIO*\n━━━━━━━━━━━━━━\nTodavía no hay movimientos crediticios registrados.')
    return
  }
  const kind: Record<string, string> = {
    loan_opened: 'Crédito abierto',
    payment: 'Pago',
    loan_paid: 'Crédito liquidado',
    late_fee: 'Cargo por mora',
    credit_score: 'Cambio de score',
  }
  const lines = rows.map((row) => {
    const amountText = row.amount ? ` · ${row.amount > 0 ? '+' : ''}${fmt(row.amount)}` : ''
    return `• ${new Date(row.createdAt).toLocaleString('es-MX')}\n  *${kind[row.kind] ?? row.kind}*${row.loanId ? ` · #${row.loanId}` : ''}${amountText}`
  })
  await ctx.reply(`🏦 *HISTORIAL BANCARIO*\n━━━━━━━━━━━━━━\n${lines.join('\n\n')}`)
}

async function bankCommand(ctx: CommandContext) {
  const action = (ctx.args[0] ?? 'status').toLowerCase()

  if (['status', 'estado', 'info', 'menu'].includes(action)) {
    await bankStatus(ctx)
    return
  }

  if (['score', 'creditscore', 'credito', 'perfil'].includes(action)) {
    await creditScore(ctx)
    return
  }

  if (['history', 'historial', 'movimientos'].includes(action)) {
    await bankHistory(ctx)
    return
  }

  if (['quote', 'cotizar', 'simular', 'simulacion'].includes(action)) {
    const quote = bankingV10.quote(ctx.sender, amount(ctx.args[1]))
    await ctx.reply([
      '🧾 *COTIZACIÓN DE CRÉDITO*',
      '━━━━━━━━━━━━━━',
      `Capital: *${fmt(quote.amount)}*`,
      `Score: *${quote.profile.creditScore} · ${quote.tier.label}*`,
      `Tasa: *${quote.interestPercent.toFixed(2)}%*`,
      `Interés: *${fmt(quote.interest)}*`,
      `Total a devolver: *${fmt(quote.totalDue)}*`,
      `Plazo: *${quote.termDays} días*`,
      `Límite disponible: *${fmt(quote.maxLoan)}*`,
      '',
      `Solicitar: *${ctx.prefix}bank loan ${quote.amount}*`,
    ].join('\n'))
    return
  }

  if (['loan', 'pedir', 'solicitar', 'apply', 'prestamo'].includes(action) || /^\d/.test(action)) {
    const rawAmount = /^\d/.test(action) ? action : ctx.args[1]
    const result = bankingV10.requestLoan(ctx.sender, amount(rawAmount))
    await ctx.reply([
      '✅ *CRÉDITO APROBADO*',
      '━━━━━━━━━━━━━━',
      `Préstamo: *#${result.loanId}*`,
      `Depositado en cartera: *${fmt(result.amount)}*`,
      `Score: *${result.profile.creditScore} · ${result.tier.label}*`,
      `Tasa fija: *${result.interestPercent.toFixed(2)}%*`,
      `Interés: *${fmt(result.interest)}*`,
      `Total a devolver: *${fmt(result.totalDue)}*`,
      `Plazo: *${result.termDays} días*`,
      `Vence: *${new Date(result.dueAt).toLocaleString('es-MX')}*`,
      `Cartera actual: *${fmt(result.balance.wallet)}*`,
      '',
      `Puedes hacer pagos parciales con *${ctx.prefix}bank pay <monto>* o liquidar con *${ctx.prefix}bank pay all*.` ,
    ].join('\n'))
    return
  }

  if (['pay', 'pagar', 'payment', 'abonar'].includes(action)) {
    const raw = (ctx.args[1] ?? 'all').toLowerCase()
    const requested = ['all', 'todo', 'total'].includes(raw) ? undefined : amount(raw)
    const result = bankingV10.pay(ctx.sender, requested)
    await ctx.reply([
      '💳 *PAGO BANCARIO APLICADO*',
      '━━━━━━━━━━━━━━',
      `Pagado: *${fmt(result.amount)}*`,
      `Desde cartera: *${fmt(result.walletUsed)}*`,
      `Desde banco: *${fmt(result.bankUsed)}*`,
      `Deuda restante: *${fmt(result.remaining)}*`,
      result.settled.length ? `Créditos liquidados: *${result.settled.map((id) => `#${id}`).join(', ')}*` : 'Pago parcial registrado.',
      `Score actual: *${result.profile.creditScore}/850*`,
      `Saldo disponible: *${fmt(result.balance.total)}*`,
    ].join('\n'))
    return
  }

  if (['deposit', 'depositar', 'guardar'].includes(action)) {
    const value = amount(ctx.args[1])
    const balance = bankingV10.deposit(ctx.sender, value)
    await ctx.reply(`🏦 *DEPÓSITO COMPLETADO*\n━━━━━━━━━━━━━━\nDepositado: *${fmt(value)}*\nCartera: *${fmt(balance.wallet)}*\nBanco: *${fmt(balance.bank)}*`)
    return
  }

  if (['withdraw', 'retirar', 'sacar'].includes(action)) {
    const value = amount(ctx.args[1])
    const balance = bankingV10.withdraw(ctx.sender, value)
    await ctx.reply(`🏧 *RETIRO COMPLETADO*\n━━━━━━━━━━━━━━\nRetirado: *${fmt(value)}*\nCartera: *${fmt(balance.wallet)}*\nBanco: *${fmt(balance.bank)}*`)
    return
  }

  throw new Error(`Acción bancaria no reconocida. Usa ${ctx.prefix}bank para ver el menú.`)
}

export const bankingV10Commands: BotCommand[] = [
  {
    name: 'bank',
    aliases: ['banco', 'loan', 'prestamo', 'credito'],
    category: 'economy',
    description: 'Banco global: crédito, score, mora, pagos, depósitos e historial.',
    usage: 'bank [status|loan <monto>|quote <monto>|pay <monto|all>|score|history|deposit <monto>|withdraw <monto>]',
    handler: bankCommand,
  },
  {
    name: 'creditscore',
    aliases: ['scorecredito', 'creditoscore', 'credit-score'],
    category: 'economy',
    description: 'Consulta tu score y condiciones crediticias actuales.',
    handler: creditScore,
  },
]
