import type { BotCommand, CommandContext } from '../types.js'
import { getContextInfo } from '../utils/message.js'
import { COIN_NAME, COIN_SYMBOL, economy } from '../services/economy.js'

const fmt = (value: number) => `${Math.floor(value).toLocaleString('es-MX')} ${COIN_SYMBOL}`
const duration = (ms: number) => {
  const minutes = Math.ceil(ms / 60_000)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.ceil(minutes / 60)
  return hours < 48 ? `${hours} h` : `${Math.ceil(hours / 24)} d`
}

function amountArg(value?: string) {
  if (!value) throw new Error('Indica una cantidad.')
  const amount = Number(value.replace(/[,_]/g, ''))
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Cantidad inválida.')
  return Math.floor(amount)
}

function targetFromContext(ctx: CommandContext) {
  const mentioned = getContextInfo(ctx.message)?.mentionedJid?.[0]
  if (mentioned) return mentioned
  const raw = ctx.args[0]?.replace(/\D/g, '')
  if (raw && raw.length >= 8) return `${raw}@s.whatsapp.net`
  throw new Error('Menciona al usuario o indica su número.')
}

const products = {
  private1d: { price: 800, kind: 'private_access', durationMs: 86400_000, label: 'Acceso privado · 1 día' },
  private7d: { price: 4200, kind: 'private_access', durationMs: 7 * 86400_000, label: 'Acceso privado · 7 días' },
  subbot1d: { price: 2500, kind: 'subbot_slot', durationMs: 86400_000, label: 'Subbot · 1 día' },
  subbot7d: { price: 12000, kind: 'subbot_slot', durationMs: 7 * 86400_000, label: 'Subbot · 7 días' },
  subbot30d: { price: 35000, kind: 'subbot_slot', durationMs: 30 * 86400_000, label: 'Subbot · 30 días' },
} as const

export const economyCommands: BotCommand[] = [
  {
    name: 'balance', aliases: ['bal', 'wallet', 'cartera', 'banco'], category: 'economy',
    description: 'Consulta tu saldo de Nexora Coins.',
    async handler(ctx) {
      const b = economy.balance(ctx.sender)
      await ctx.reply(`💰 *CENTRO DE ECONOMÍA*\n\n🪙 Moneda: *${COIN_NAME} (${COIN_SYMBOL})*\n👛 Cartera: *${fmt(b.wallet)}*\n🏦 Banco: *${fmt(b.bank)}*\n💎 Patrimonio: *${fmt(b.total)}*\n\nUsa *${ctx.prefix}work* para trabajar y *${ctx.prefix}deposit* para proteger saldo en el banco.`)
    },
  },
  {
    name: 'work', aliases: ['w', 'trabajar', 'trabajo'], category: 'economy',
    description: 'Trabaja para ganar Nexora Coins.',
    async handler(ctx) {
      const result = economy.work(ctx.sender)
      if (!result.ok) throw new Error(`Ya trabajaste recientemente. Vuelve en ${duration(result.remaining)}.`)
      const jobs = ['desarrollo web', 'soporte técnico', 'moderación', 'edición multimedia', 'administración de servidores', 'QA de aplicaciones']
      const job = jobs[Math.floor(Math.random() * jobs.length)]
      await ctx.reply(`💼 *WORK COMPLETADO*\n\nRealizaste un trabajo de *${job}*.\n🪙 Ganaste: *${fmt(result.reward)}*\n👛 Cartera: *${fmt(result.wallet)}*`)
    },
  },
  {
    name: 'deposit', aliases: ['dep', 'depositar', 'guardar'], category: 'economy',
    description: 'Mueve Nexora Coins de tu cartera al banco.', usage: 'deposit <cantidad>',
    async handler(ctx) {
      const amount = ctx.args[0]?.toLowerCase() === 'all' || ctx.args[0]?.toLowerCase() === 'todo'
        ? economy.balance(ctx.sender).wallet
        : amountArg(ctx.args[0])
      const b = economy.deposit(ctx.sender, amount)
      await ctx.reply(`🏦 Depositaste *${fmt(amount)}*.\n👛 Cartera: ${fmt(b.wallet)}\n🏦 Banco: ${fmt(b.bank)}`)
    },
  },
  {
    name: 'withdraw', aliases: ['with', 'retirar', 'sacar'], category: 'economy',
    description: 'Retira Nexora Coins del banco.', usage: 'withdraw <cantidad>',
    async handler(ctx) {
      const amount = ctx.args[0]?.toLowerCase() === 'all' || ctx.args[0]?.toLowerCase() === 'todo'
        ? economy.balance(ctx.sender).bank
        : amountArg(ctx.args[0])
      const b = economy.withdraw(ctx.sender, amount)
      await ctx.reply(`🏧 Retiraste *${fmt(amount)}*.\n👛 Cartera: ${fmt(b.wallet)}\n🏦 Banco: ${fmt(b.bank)}`)
    },
  },
  {
    name: 'transfer', aliases: ['pay', 'send', 'enviar', 'transferir'], category: 'economy',
    description: 'Transfiere Nexora Coins a otro usuario.', usage: 'transfer @usuario <cantidad>',
    async handler(ctx) {
      const target = targetFromContext(ctx)
      const amount = amountArg(ctx.args.find((arg) => /^\d[\d,_]*$/.test(arg)))
      const b = economy.transfer(ctx.sender, target, amount)
      await ctx.socket.sendMessage(ctx.chatId, { text: `💸 Transferencia realizada.\n\n➡️ @${target.split('@')[0]} recibió *${fmt(amount)}*.\n👛 Tu cartera: *${fmt(b.wallet)}*`, mentions: [target] }, { quoted: ctx.message })
    },
  },
  {
    name: 'rob', aliases: ['robar', 'steal'], category: 'economy',
    description: 'Intenta robar Nexora Coins de la cartera de otro usuario.', usage: 'rob @usuario',
    async handler(ctx) {
      const target = targetFromContext(ctx)
      const result = economy.rob(ctx.sender, target)
      if (!result.ok) throw new Error(`Debes esperar ${duration(result.remaining)} antes de volver a robar.`)
      if (result.reason === 'empty') {
        await ctx.reply('🕵️ Ese usuario casi no lleva Nexora Coins en la cartera. El dinero del banco no se puede robar.')
      } else if (result.success) {
        await ctx.socket.sendMessage(ctx.chatId, { text: `🦹 Robo exitoso: obtuviste *${fmt(result.amount)}* de @${target.split('@')[0]}.`, mentions: [target] }, { quoted: ctx.message })
      } else {
        await ctx.reply(`🚓 Te descubrieron. Perdiste *${fmt(result.amount)}* como penalización.`)
      }
    },
  },
  {
    name: 'top', aliases: ['rich', 'leaderboard', 'topcoins'], category: 'economy',
    description: 'Muestra el top 10 de economía.',
    async handler(ctx) {
      const rows = economy.top(10)
      if (!rows.length) throw new Error('Todavía no hay usuarios en la economía.')
      const mentions = rows.map((row) => row.userJid)
      const lines = rows.map((row, index) => `${index + 1}. @${row.userJid.split('@')[0]}\n   👛 ${fmt(row.wallet)} · 🏦 ${fmt(row.bank)} · 💎 ${fmt(row.total)}`)
      await ctx.socket.sendMessage(ctx.chatId, { text: `🏆 *TOP 10 · NEXORA ECONOMY*\n\n${lines.join('\n\n')}`, mentions }, { quoted: ctx.message })
    },
  },
  {
    name: 'shop', aliases: ['store', 'tienda'], category: 'economy',
    description: 'Muestra productos que se compran con Nexora Coins.',
    async handler(ctx) {
      const lines = Object.entries(products).map(([id, item]) => `• *${id}* — ${item.label}\n  ${fmt(item.price)}`)
      await ctx.reply(`🛒 *NEXORA STORE*\n\n${lines.join('\n\n')}\n\nCompra con *${ctx.prefix}buy <producto>*.`)
    },
  },
  {
    name: 'buy', aliases: ['comprar'], category: 'economy',
    description: 'Compra acceso o una ranura de subbot.', usage: 'buy <producto>',
    async handler(ctx) {
      const id = (ctx.args[0] ?? '').toLowerCase() as keyof typeof products
      const item = products[id]
      if (!item) throw new Error(`Producto inválido. Consulta ${ctx.prefix}shop.`)
      const result = economy.purchase(ctx.sender, item.price, item.kind, item.durationMs, { product: id })
      if (item.kind === 'subbot_slot' && !economy.getActiveSubbot(ctx.sender)) {
        economy.createSubbot(ctx.sender, result.expiresAt)
      }
      await ctx.reply(`✅ Compra completada.\n\n📦 *${item.label}*\n🪙 Precio: ${fmt(item.price)}\n⏳ Vence: ${new Date(result.expiresAt).toLocaleString('es-MX')}\n\n${item.kind === 'subbot_slot' ? `Continúa con *${ctx.prefix}subbot pair <número>*.` : 'Tu acceso privado ya está activo.'}`)
    },
  },
]
