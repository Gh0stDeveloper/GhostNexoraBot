import type { BotCommand, CommandContext } from '../types.js'
import { getContextInfo } from '../utils/message.js'
import { COIN_NAME, COIN_SYMBOL, economy, PROFESSIONS } from '../services/economy.js'
import { advancedEconomy } from '../services/economy-advanced.js'
import { sendCarousel } from '../services/interactive.js'

const fmt = (value: number) => `${Math.floor(value).toLocaleString('es-MX')} ${COIN_SYMBOL}`
const duration = (ms: number) => {
  const seconds = Math.ceil(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.ceil(seconds / 60)
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

async function botAvatar(ctx: CommandContext) {
  const jid = ctx.socket.user?.id
  if (!jid) return undefined
  return ctx.socket.profilePictureUrl(jid, 'image').catch(() => undefined)
}

const products = {
  private1d: { price: 2000, kind: 'private_access', durationMs: 86400_000, label: 'Acceso privado · 1 día', emoji: '🔐', description: 'Activa todos los comandos en el chat privado durante 24 horas.' },
  private7d: { price: 10000, kind: 'private_access', durationMs: 7 * 86400_000, label: 'Acceso privado · 7 días', emoji: '🔐', description: 'Una semana de acceso privado con descuento por día.' },
  private30d: { price: 30000, kind: 'private_access', durationMs: 30 * 86400_000, label: 'Acceso privado · 30 días', emoji: '💎', description: 'Plan mensual para usar el bot directamente en privado.' },
  subbot1d: { price: 6000, kind: 'subbot_slot', durationMs: 86400_000, label: 'Subbot · 1 día', emoji: '🤖', description: 'Tu propia sesión de WhatsApp como subbot durante 24 horas.' },
  subbot7d: { price: 30000, kind: 'subbot_slot', durationMs: 7 * 86400_000, label: 'Subbot · 7 días', emoji: '🤖', description: 'Subbot independiente durante una semana.' },
  subbot30d: { price: 100000, kind: 'subbot_slot', durationMs: 30 * 86400_000, label: 'Subbot · 30 días', emoji: '👑', description: 'Subbot independiente durante 30 días con mejor precio por día.' },
} as const

export const economyCommands: BotCommand[] = [
  {
    name: 'balance', aliases: ['bal', 'wallet', 'cartera', 'banco'], category: 'economy',
    description: 'Consulta tu saldo, inversiones y deudas.',
    async handler(ctx) {
      const b = economy.balance(ctx.sender)
      const extra = advancedEconomy.summary(ctx.sender)
      const gross = b.total + extra.investments + extra.cda
      const net = gross - extra.debt
      const profession = economy.profession(ctx.sender)
      await ctx.reply([
        `╭━━〔 🪙 *${ctx.settings.currencyName.toUpperCase()}* 〕━━╮`,
        `┃ Cartera » *${fmt(b.wallet)}*`,
        `┃ Banco » *${fmt(b.bank)}*`,
        `┃ Inversiones » *${fmt(extra.investments)}*`,
        `┃ Plazo fijo » *${fmt(extra.cda)}*`,
        `┃ Deudas » *${fmt(extra.debt)}*`,
        `┃ Profesión » ${profession.emoji} *${profession.label}*`,
        '┣━━━━━━━━━━━━━━━━',
        `┃ Activos » *${fmt(gross)}*`,
        `┃ Patrimonio neto » *${fmt(net)}*`,
        '╰━━━━━━━━━━━━━━━━╯',
        '',
        `✦ Moneda interna: ${COIN_NAME} (${COIN_SYMBOL})`,
        `✦ ${ctx.prefix}daily · ${ctx.prefix}work · ${ctx.prefix}job · ${ctx.prefix}invest`,
      ].join('\n'))
    },
  },
  {
    name: 'job', aliases: ['profession', 'profesion', 'empleo'], category: 'economy',
    description: 'Consulta o cambia tu profesión persistente.', usage: 'job [profesión]',
    async handler(ctx) {
      const requested = ctx.argText.trim()
      if (requested && !['list', 'lista', 'menu'].includes(requested.toLowerCase())) {
        const selected = economy.setProfession(ctx.sender, requested)
        await ctx.reply(`💼 *PROFESIÓN ACTUALIZADA*\n━━━━━━━━━━━━━━\n${selected.emoji} Ahora trabajas como *${selected.label}*.\n💰 Rango base: *${fmt(selected.min)} — ${fmt(selected.max)}*\n⏱️ Puedes trabajar cada *1 minuto*.\n\nTu profesión quedará guardada hasta que elijas otra con *${ctx.prefix}job*.`)
        return
      }

      const current = economy.profession(ctx.sender)
      await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
        title: '💼 NEXORA · PROFESIONES',
        body: `Profesión actual: ${current.emoji} ${current.label}\nElige una profesión. Quedará guardada hasta que la cambies.`,
        footer: 'Trabajo disponible cada 1 minuto',
        cards: Object.entries(PROFESSIONS).map(([id, item]) => ({
          title: `${item.emoji} ${item.label}`,
          body: `${item.description}\n💰 ${fmt(item.min)} — ${fmt(item.max)} por trabajo`,
          buttons: [
            { type: 'reply', text: '✅ Elegir', id: `${ctx.prefix}job ${id}` },
            { type: 'reply', text: '💼 Elegir y trabajar', id: `${ctx.prefix}work ${id}` },
          ],
        })),
      })
    },
  },
  {
    name: 'work', aliases: ['w', 'trabajar', 'trabajo'], category: 'economy',
    description: 'Trabaja con tu profesión persistente para ganar Nexora Coins.', usage: 'work [profesión]',
    async handler(ctx) {
      if (ctx.args[0]) economy.setProfession(ctx.sender, ctx.args[0])
      const result = economy.work(ctx.sender)
      if (!result.ok) throw new Error(`Ya trabajaste recientemente. Vuelve en ${duration(result.remaining)}.`)
      await ctx.reply(`╭─〔 💼 *TRABAJO COMPLETADO* 〕\n│ Profesión » ${result.profession.emoji} *${result.profession.label}*\n│ Ganancia » *${fmt(result.reward)}*\n│ Cartera » *${fmt(result.wallet)}*\n│ Próximo trabajo » *1 minuto*\n╰──────────────`)
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
      await ctx.reply(`🏦 *DEPÓSITO COMPLETADO*\n━━━━━━━━━━━━━━\nDepositado: *${fmt(amount)}*\nCartera: ${fmt(b.wallet)}\nBanco: ${fmt(b.bank)}`)
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
      await ctx.reply(`🏧 *RETIRO COMPLETADO*\n━━━━━━━━━━━━━━\nRetirado: *${fmt(amount)}*\nCartera: ${fmt(b.wallet)}\nBanco: ${fmt(b.bank)}`)
    },
  },
  {
    name: 'transfer', aliases: ['pay', 'send', 'enviar', 'transferir'], category: 'economy',
    description: 'Transfiere Nexora Coins a otro usuario.', usage: 'transfer @usuario <cantidad>',
    async handler(ctx) {
      const target = targetFromContext(ctx)
      const amount = amountArg(ctx.args.find((arg) => /^\d[\d,_]*$/.test(arg)))
      const b = economy.transfer(ctx.sender, target, amount)
      await ctx.socket.sendMessage(ctx.chatId, { text: `💸 *TRANSFERENCIA COMPLETADA*\n━━━━━━━━━━━━━━\n@${target.split('@')[0]} recibió *${fmt(amount)}*.\nTu cartera: *${fmt(b.wallet)}*`, mentions: [target] }, { quoted: ctx.message })
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
        await ctx.reply('🕵️ *ROBO CANCELADO*\nEse usuario casi no lleva monedas en la cartera. El saldo bancario está protegido.')
      } else if (result.success) {
        await ctx.socket.sendMessage(ctx.chatId, { text: `🦹 *ROBO EXITOSO*\n━━━━━━━━━━━━━━\nObtuviste *${fmt(result.amount)}* de @${target.split('@')[0]}.`, mentions: [target] }, { quoted: ctx.message })
      } else {
        await ctx.reply(`🚓 *TE DESCUBRIERON*\n━━━━━━━━━━━━━━\nPerdiste *${fmt(result.amount)}* como penalización.`)
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
      await ctx.socket.sendMessage(ctx.chatId, { text: `🏆 *TOP 10 · NEXORA ECONOMY*\n━━━━━━━━━━━━━━\n${lines.join('\n\n')}`, mentions }, { quoted: ctx.message })
    },
  },
  {
    name: 'shop', aliases: ['store', 'tienda'], category: 'economy',
    description: 'Muestra la Nexora Store en carrusel.',
    async handler(ctx) {
      const avatar = await botAvatar(ctx)
      const balance = economy.balance(ctx.sender)
      await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
        title: '🛒 NEXORA STORE',
        body: `Saldo disponible: ${fmt(balance.total)}\nDesliza para comparar planes y compra directamente desde cada tarjeta.`,
        footer: 'Nexora Economy · Ghost Developer / Nexora',
        cards: Object.entries(products).map(([id, item]) => ({
          title: `${item.emoji} ${item.label}`,
          body: `${item.description}\n\n💰 Precio: ${fmt(item.price)}\n🆔 ${id}`,
          imageUrl: avatar,
          footer: item.kind === 'subbot_slot' ? 'Código de vinculación + QR disponibles' : 'Activación inmediata',
          buttons: [
            { type: 'reply', text: '🛒 Comprar', id: `${ctx.prefix}buy ${id}` },
            { type: 'reply', text: '🪙 Mi saldo', id: `${ctx.prefix}balance` },
            ...(item.kind === 'subbot_slot' ? [{ type: 'reply' as const, text: '🤖 Mi subbot', id: `${ctx.prefix}subbot status` }] : [{ type: 'reply' as const, text: '👤 Mi perfil', id: `${ctx.prefix}profile` }]),
          ],
        })),
      })
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
      if (item.kind === 'subbot_slot') {
        const active = economy.getActiveSubbot(ctx.sender)
        if (active) economy.db.prepare('UPDATE subbots SET expires_at = ? WHERE id = ?').run(result.expiresAt, active.id)
        else economy.createSubbot(ctx.sender, result.expiresAt)
      }
      await ctx.reply(`✅ *COMPRA COMPLETADA*\n━━━━━━━━━━━━━━\nProducto: *${item.label}*\nPrecio: ${fmt(item.price)}\nVence: ${new Date(result.expiresAt).toLocaleString('es-MX')}\n\n${item.kind === 'subbot_slot' ? `Vincula con *${ctx.prefix}subbot pair <número>*. Si el código no funciona, usa *${ctx.prefix}subbot qr* para recibir un QR.` : 'Tu acceso privado ya está activo.'}`)
    },
  },
]
