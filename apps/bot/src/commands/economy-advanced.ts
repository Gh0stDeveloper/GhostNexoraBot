import type { BotCommand, CommandContext } from '../types.js'
import { economy, COIN_SYMBOL } from '../services/economy.js'
import { advancedEconomy } from '../services/economy-advanced.js'
import { getContextInfo } from '../utils/message.js'

const fmt = (value: number) => `${Math.floor(value).toLocaleString('es-MX')} ${COIN_SYMBOL}`

function remaining(ms: number) {
  const total = Math.ceil(ms / 1000)
  const d = Math.floor(total / 86400)
  const h = Math.floor((total % 86400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  return [d ? `${d}d` : '', h ? `${h}h` : '', m ? `${m}m` : '', !d && !h && !m ? `${total}s` : ''].filter(Boolean).join(' ')
}

function amount(value?: string) {
  const parsed = Number((value ?? '').replace(/[,_]/g, ''))
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error('Indica una cantidad válida.')
  return Math.floor(parsed)
}

async function targetJid(ctx: CommandContext) {
  const mention = getContextInfo(ctx.message)?.mentionedJid?.[0]
  if (!mention) throw new Error('Menciona al usuario que recibirá el préstamo.')
  if (!ctx.isGroup) return mention
  const metadata = await ctx.socket.groupMetadata(ctx.chatId).catch(() => null)
  const participant = metadata?.participants.find((item) => [item.id, item.lid, item.phoneNumber].filter(Boolean).includes(mention))
  return participant?.phoneNumber ?? participant?.id ?? mention
}

export const advancedEconomyCommands: BotCommand[] = [
  {
    name: 'daily', aliases: ['diario'], category: 'economy', description: 'Reclama una recompensa cada 24 horas.',
    async handler(ctx) {
      const result = advancedEconomy.daily(ctx.sender)
      if (!result.ok) throw new Error(`Tu recompensa diaria estará lista en ${remaining(result.remaining)}.`)
      await ctx.reply(`🎁 *RECOMPENSA DIARIA*\n━━━━━━━━━━━━━━\nGanaste: *${fmt(result.reward)}*\nCartera: *${fmt(result.balance.wallet)}*\n\nVuelve mañana por otra recompensa.`)
    },
  },
  {
    name: 'crime', aliases: ['crimen'], category: 'economy', description: 'Intenta un crimen con riesgo y recompensa.',
    async handler(ctx) {
      const result = advancedEconomy.crime(ctx.sender)
      if (!result.ok) throw new Error(`Podrás intentarlo de nuevo en ${remaining(result.remaining)}.`)
      await ctx.reply(result.success
        ? `🕶️ *CRIMEN EXITOSO*\n━━━━━━━━━━━━━━\nEscapaste con *${fmt(result.amount)}*.\nCartera: ${fmt(result.balance.wallet)}`
        : `🚓 *TE ATRAPARON*\n━━━━━━━━━━━━━━\nMulta: *${fmt(result.amount)}*.\nCartera: ${fmt(result.balance.wallet)}`)
    },
  },
  {
    name: 'slut', aliases: ['atrevido'], category: 'economy', description: 'Trabajo atrevido con mayor riesgo y posible ganancia.',
    async handler(ctx) {
      const result = advancedEconomy.daringWork(ctx.sender)
      if (!result.ok) throw new Error(`Debes esperar ${remaining(result.remaining)}.`)
      await ctx.reply(result.success
        ? `❤️‍🔥 *TRABAJO ATREVIDO COMPLETADO*\n━━━━━━━━━━━━━━\nGanancia: *${fmt(result.amount)}*\nCartera: ${fmt(result.balance.wallet)}`
        : `💸 *EL TRABAJO SALIÓ MAL*\n━━━━━━━━━━━━━━\nPérdida: *${fmt(result.amount)}*\nCartera: ${fmt(result.balance.wallet)}`)
    },
  },
  {
    name: 'invest', aliases: ['invertir'], category: 'economy', description: 'Invierte de 1 a 24 horas con rendimiento variable.', usage: 'invest <monto> [horas]|status|collect',
    async handler(ctx) {
      const action = (ctx.args[0] ?? 'status').toLowerCase()
      if (action === 'status') {
        const item = advancedEconomy.investment(ctx.sender)
        if (!item) throw new Error('No tienes una inversión activa.')
        const pending = Math.max(0, item.maturesAt - Date.now())
        await ctx.reply(`📈 *INVERSIÓN ACTIVA*\n━━━━━━━━━━━━━━\nCapital: *${fmt(item.principal)}*\nVence: ${new Date(item.maturesAt).toLocaleString('es-MX')}\nEstado: *${pending ? `faltan ${remaining(pending)}` : 'lista para cobrar'}*`)
        return
      }
      if (['collect', 'cobrar', 'retirar'].includes(action)) {
        const result = advancedEconomy.collectInvestment(ctx.sender)
        if (!result.ok) throw new Error(`La inversión todavía no vence. Faltan ${remaining(result.remaining)}.`)
        const sign = result.profit >= 0 ? '+' : ''
        await ctx.reply(`📊 *INVERSIÓN CERRADA*\n━━━━━━━━━━━━━━\nCapital inicial: ${fmt(result.item.principal)}\nRetorno: *${fmt(result.item.returnAmount)}*\nResultado: *${sign}${fmt(result.profit)}*\nCartera: ${fmt(result.balance.wallet)}`)
        return
      }
      const value = amount(ctx.args[0])
      const hours = Number(ctx.args[1] ?? 6)
      const result = advancedEconomy.startInvestment(ctx.sender, value, hours)
      await ctx.reply(`📈 *INVERSIÓN ABIERTA*\n━━━━━━━━━━━━━━\nCapital: *${fmt(result.amount)}*\nDuración: *${result.hours}h*\nVence: ${new Date(result.maturesAt).toLocaleString('es-MX')}\n\nEl rendimiento ya quedó fijado internamente y se revela al cobrar.`)
    },
  },
  {
    name: 'cda', aliases: ['plazofijo'], category: 'economy', description: 'Plazo fijo de 3/6/9/12 días.', usage: 'cda <3|6|9|12> <monto>|status|collect|cancel confirmar',
    async handler(ctx) {
      const action = (ctx.args[0] ?? 'status').toLowerCase()
      if (action === 'status') {
        const item = advancedEconomy.cda(ctx.sender)
        if (!item) throw new Error('No tienes un plazo fijo activo.')
        await ctx.reply(`🏦 *PLAZO FIJO*\n━━━━━━━━━━━━━━\nCapital: ${fmt(item.principal)}\nCobro final: ${fmt(item.returnAmount)}\nPlazo: ${item.termDays} días\nVence: ${new Date(item.maturesAt).toLocaleString('es-MX')}\nEstado: *${item.maturesAt <= Date.now() ? 'LISTO' : remaining(item.maturesAt - Date.now())}*`)
        return
      }
      if (['collect', 'cobrar'].includes(action)) {
        const result = advancedEconomy.collectCda(ctx.sender)
        if (!result.ok) throw new Error(`Todavía faltan ${remaining(result.remaining)}.`)
        await ctx.reply(`🏦 *PLAZO FIJO COBRADO*\n━━━━━━━━━━━━━━\nRecibiste: *${fmt(result.item.returnAmount)}*\nCartera: ${fmt(result.balance.wallet)}`)
        return
      }
      if (action === 'cancel') {
        if (!['confirmar', 'confirm', 'aceptar'].includes((ctx.args[1] ?? '').toLowerCase())) throw new Error(`Cancelar antes de tiempo aplica 8% de penalización. Usa ${ctx.prefix}cda cancel confirmar.`)
        const result = advancedEconomy.cancelCda(ctx.sender)
        await ctx.reply(`⚠️ *PLAZO FIJO CANCELADO*\n━━━━━━━━━━━━━━\nReembolso: ${fmt(result.refund)}\nPenalización: ${fmt(result.penalty)}\nCartera: ${fmt(result.balance.wallet)}`)
        return
      }
      const days = Number(ctx.args[0])
      const value = amount(ctx.args[1])
      const result = advancedEconomy.startCda(ctx.sender, days, value)
      await ctx.reply(`🏦 *PLAZO FIJO CREADO*\n━━━━━━━━━━━━━━\nCapital: ${fmt(result.amount)}\nPlazo: ${result.days} días\nInterés: ${result.rate}%\nCobro final: *${fmt(result.returnAmount)}*\nVence: ${new Date(result.maturesAt).toLocaleString('es-MX')}`)
    },
  },
  {
    name: 'loan', aliases: ['prestamo'], category: 'economy', description: 'Solicita un préstamo al banco.', usage: 'loan <monto>|status',
    async handler(ctx) {
      const action = (ctx.args[0] ?? 'status').toLowerCase()
      if (action === 'status') {
        const debts = advancedEconomy.debts(ctx.sender)
        const bank = debts.bank
        const peerTotal = debts.peers.reduce((sum, item) => sum + item.balanceDue, 0)
        await ctx.reply(`🏦 *CENTRO DE DEUDAS*\n━━━━━━━━━━━━━━\nBanco: *${fmt(bank?.balanceDue ?? 0)}*\nPréstamos de usuarios: *${fmt(peerTotal)}*\nTotal: *${fmt((bank?.balanceDue ?? 0) + peerTotal)}*`)
        return
      }
      const result = advancedEconomy.requestBankLoan(ctx.sender, amount(ctx.args[0]))
      await ctx.reply(`🏦 *PRÉSTAMO APROBADO*\n━━━━━━━━━━━━━━\nRecibiste: *${fmt(result.amount)}*\nDebes devolver: *${fmt(result.due)}*\nInterés: 12%\nVencimiento: ${new Date(result.dueAt).toLocaleString('es-MX')}`)
    },
  },
  {
    name: 'paydebt', aliases: ['pagardeuda'], category: 'economy', description: 'Paga la deuda bancaria o el préstamo más antiguo.', usage: 'paydebt [monto|all]',
    async handler(ctx) {
      const arg = ctx.args[0]?.toLowerCase()
      const requested = !arg || arg === 'all' || arg === 'todo' ? undefined : amount(arg)
      const result = advancedEconomy.payDebt(ctx.sender, requested)
      await ctx.reply(`💳 *PAGO DE DEUDA*\n━━━━━━━━━━━━━━\nDestino: *${result.type === 'bank' ? 'Banco Nexora' : 'Préstamo entre usuarios'}*\nPagado: *${fmt(result.amount)}*\nPendiente: *${fmt(result.remaining)}*\nCartera: ${fmt(result.balance.wallet)}`)
    },
  },
  {
    name: 'lend', aliases: ['prestar'], category: 'economy', description: 'Presta dinero a otro usuario con interés de 0-25%.', usage: 'lend @usuario <monto> [interés%]',
    async handler(ctx) {
      const target = await targetJid(ctx)
      const numeric = ctx.args.filter((arg) => /^\d+(?:\.\d+)?%?$/.test(arg))
      const value = amount(numeric[0]?.replace('%', ''))
      const interest = Number(numeric[1]?.replace('%', '') ?? 5)
      const result = advancedEconomy.lend(ctx.sender, target, value, interest)
      await ctx.socket.sendMessage(ctx.chatId, {
        text: `🤝 *PRÉSTAMO ENTRE USUARIOS #${result.id}*\n━━━━━━━━━━━━━━\n@${target.split('@')[0]} recibió *${fmt(result.amount)}*.\nInterés: *${result.rate}%*\nDebe devolver: *${fmt(result.due)}*\nPuede pagar con *${ctx.prefix}paydebt*.`,
        mentions: [target],
      }, { quoted: ctx.message })
    },
  },
  {
    name: 'baltop', aliases: ['topgrupo'], category: 'economy', description: 'Muestra los usuarios más ricos del grupo.', groupOnly: true,
    async handler(ctx) {
      const metadata = await ctx.socket.groupMetadata(ctx.chatId)
      const memberJids = new Set(metadata.participants.flatMap((item) => [item.id, item.phoneNumber].filter(Boolean) as string[]))
      const rows = economy.top(25).filter((row) => memberJids.has(row.userJid)).slice(0, 10)
      if (!rows.length) throw new Error('Todavía no hay suficientes datos económicos de este grupo.')
      const mentions = rows.map((row) => row.userJid)
      const lines = rows.map((row, i) => `${i + 1}. @${row.userJid.split('@')[0]} · ${fmt(row.total)}`)
      await ctx.socket.sendMessage(ctx.chatId, { text: `🏆 *TOP ECONOMÍA DEL GRUPO*\n━━━━━━━━━━━━━━\n${lines.join('\n')}`, mentions }, { quoted: ctx.message })
    },
  },
  {
    name: 'balglobal', aliases: ['topglobal'], category: 'economy', description: 'Muestra el top 10 global de economía.',
    async handler(ctx) {
      const rows = economy.top(10)
      const mentions = rows.map((row) => row.userJid)
      const lines = rows.map((row, i) => `${i + 1}. @${row.userJid.split('@')[0]} · ${fmt(row.total)}`)
      await ctx.socket.sendMessage(ctx.chatId, { text: `🌍 *TOP 10 GLOBAL · NEXORA ECONOMY*\n━━━━━━━━━━━━━━\n${lines.join('\n')}`, mentions }, { quoted: ctx.message })
    },
  },
]
