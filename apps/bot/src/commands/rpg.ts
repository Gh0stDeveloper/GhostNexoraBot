import type { BotCommand, CommandContext } from '../types.js'
import { getContextInfo } from '../utils/message.js'
import { economy } from '../services/economy.js'
import { advancedEconomy } from '../services/economy-advanced.js'
import { RPG_ITEMS, rpg, type RpgItem } from '../services/rpg.js'
import { sendCarousel } from '../services/interactive.js'

const fmt = (value: number) => `${Math.floor(value).toLocaleString('es-MX')} NXC`

function duration(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return [h ? `${h}h` : '', m ? `${m}m` : '', !h && s ? `${s}s` : ''].filter(Boolean).join(' ') || '0s'
}

function item(value?: string): RpgItem {
  const name = (value ?? '').toLowerCase() as RpgItem
  if (!(name in RPG_ITEMS)) throw new Error(`Ítem inválido. Usa .tienda para ver: ${Object.keys(RPG_ITEMS).join(', ')}.`)
  return name
}

function amount(value?: string, fallback = 1) {
  if (!value) return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error('Cantidad inválida.')
  return Math.floor(parsed)
}

async function target(ctx: CommandContext) {
  const mention = getContextInfo(ctx.message)?.mentionedJid?.[0]
  if (!mention) return null
  if (!ctx.isGroup) return mention
  const metadata = await ctx.socket.groupMetadata(ctx.chatId).catch(() => null)
  const participant = metadata?.participants.find((p) => [p.id, p.phoneNumber, p.lid].filter(Boolean).includes(mention))
  return participant?.phoneNumber ?? participant?.id ?? mention
}

async function botAvatar(ctx: CommandContext) {
  const jid = ctx.socket.user?.id
  if (!jid) return undefined
  return ctx.socket.profilePictureUrl(jid, 'image').catch(() => undefined)
}

export const rpgCommands: BotCommand[] = [
  {
    name: 'grimorio', aliases: ['grimoire', 'inventario'], category: 'games', description: 'Muestra gemas, inventario y buffs RPG.',
    async handler(ctx) {
      const profile = rpg.profile(ctx.sender)
      const inventory = Object.entries(profile.inventory)
      const items = inventory.length ? inventory.map(([name, qty]) => `│ ${name} × *${qty}*`).join('\n') : '│ Inventario vacío'
      const buffs = profile.buffs.length
        ? profile.buffs.map((buff) => `│ ${buff.kind} » *${duration(buff.expiresAt - Date.now())}*`).join('\n')
        : '│ Sin buffs activos'
      await ctx.reply([
        '╭━━〔 📖 *GRIMORIO NEXORA* 〕━━╮',
        `┃ Gemas » *${profile.gems}* 💎`,
        '┣━ Inventario',
        items,
        '┣━ Buffs',
        buffs,
        '╰━━━━━━━━━━━━━━━━╯',
        '',
        `Usa *${ctx.prefix}tienda* para comprar y *${ctx.prefix}usar <item>* para activar.`,
      ].join('\n'))
    },
  },
  {
    name: 'tienda', aliases: ['rpgshop', 'grimoriotienda'], category: 'games', description: 'Muestra la tienda del Grimorio RPG en carrusel.',
    async handler(ctx) {
      const avatar = await botAvatar(ctx)
      const profile = rpg.profile(ctx.sender)
      await sendCarousel(ctx.socket, ctx.chatId, ctx.message, {
        title: '🛍️ TIENDA DEL GRIMORIO',
        body: `💎 Gemas: ${profile.gems}\n🪙 Cartera: ${fmt(economy.balance(ctx.sender).wallet)}\nDesliza para ver los artefactos disponibles.`,
        footer: 'Grimorio Nexora · RPG',
        cards: Object.entries(RPG_ITEMS).map(([name, cfg]) => ({
          title: `✨ ${name.toUpperCase()}`,
          body: `${cfg.description}\n\n💰 Precio: ${fmt(cfg.price)}`,
          imageUrl: avatar,
          footer: 'El artículo se guarda en tu inventario',
          buttons: [
            { type: 'reply', text: '🛒 Comprar', id: `${ctx.prefix}comprar ${name}` },
            { type: 'reply', text: '📖 Grimorio', id: `${ctx.prefix}grimorio` },
            { type: 'reply', text: '🛒 Nexora Store', id: `${ctx.prefix}shop` },
          ],
        })),
      })
    },
  },
  {
    name: 'comprar', aliases: ['buyitem'], category: 'games', description: 'Compra un artículo del Grimorio con NXC.', usage: 'comprar <item> [cantidad]',
    async handler(ctx) {
      const selected = item(ctx.args[0])
      const qty = amount(ctx.args[1])
      const result = rpg.buy(ctx.sender, selected, qty)
      await ctx.reply(`🛍️ *COMPRA RPG COMPLETADA*\n━━━━━━━━━━━━━━\nÍtem: *${selected} × ${result.quantity}*\nCosto: *${fmt(result.cost)}*\nCartera: *${fmt(result.balance.wallet)}*`)
    },
  },
  {
    name: 'usar', aliases: ['useitem'], category: 'games', description: 'Activa un artículo del Grimorio.', usage: 'usar <item> [@usuario]',
    async handler(ctx) {
      const selected = item(ctx.args[0])
      const other = selected === 'maldicion' ? await target(ctx) : null
      if (selected === 'maldicion' && !other) throw new Error('Menciona al usuario que recibirá la maldición.')
      const result = rpg.use(ctx.sender, selected, other ?? undefined)
      const mentions = result.targetJid ? [result.targetJid] : []
      await ctx.socket.sendMessage(ctx.chatId, {
        text: `✨ *ÍTEM ACTIVADO · ${selected.toUpperCase()}*\n━━━━━━━━━━━━━━\n${result.text}`,
        mentions,
      }, { quoted: ctx.message })
    },
  },
  {
    name: 'givegema', aliases: ['givegem', 'dargema'], category: 'games', description: 'Transfiere gemas RPG a otro usuario.', usage: 'givegema @usuario [cantidad]',
    async handler(ctx) {
      const other = await target(ctx)
      if (!other) throw new Error('Menciona al usuario que recibirá las gemas.')
      const numeric = ctx.args.find((arg) => /^\d+$/.test(arg))
      const result = rpg.transferGems(ctx.sender, other, amount(numeric))
      await ctx.socket.sendMessage(ctx.chatId, {
        text: `💎 *TRANSFERENCIA DE GEMAS*\n━━━━━━━━━━━━━━\n@${other.split('@')[0]} recibió *${result.amount} gema(s)*.\nTus gemas: *${result.from.gems}*`,
        mentions: [other],
      }, { quoted: ctx.message })
    },
  },
  {
    name: 'work', aliases: ['w', 'trabajar', 'trabajo'], category: 'economy', description: 'Trabaja con tu profesión; los buffs del Grimorio modifican la recompensa.', usage: 'work [profesión]',
    async handler(ctx) {
      if (ctx.args[0]) economy.setProfession(ctx.sender, ctx.args[0])
      const result = economy.work(ctx.sender)
      if (!result.ok) throw new Error(`Ya trabajaste recientemente. Vuelve en ${duration(result.remaining)}.`)
      const fortune = Boolean(rpg.hasBuff(ctx.sender, 'fortune'))
      const cursed = Boolean(rpg.hasBuff(ctx.sender, 'curse'))
      let adjustment = 0
      if (fortune) adjustment += Math.floor(result.reward * 0.25)
      if (cursed) adjustment -= Math.floor(result.reward * 0.20)
      const balance = adjustment ? rpg.adjustWallet(ctx.sender, adjustment, 'rpg_work_modifier', fortune ? 'fortune' : 'curse') : economy.balance(ctx.sender)
      const finalReward = result.reward + adjustment
      await ctx.reply(`╭─〔 💼 *TRABAJO COMPLETADO* 〕\n│ Profesión » ${result.profession.emoji} *${result.profession.label}*\n│ Base » ${fmt(result.reward)}\n${fortune ? `│ Fortuna » +${fmt(Math.floor(result.reward * 0.25))}\n` : ''}${cursed ? `│ Maldición » -${fmt(Math.floor(result.reward * 0.20))}\n` : ''}│ Ganancia final » *${fmt(finalReward)}*\n│ Cartera » *${fmt(balance.wallet)}*\n│ Próximo trabajo » *1 minuto*\n╰──────────────`)
    },
  },
  {
    name: 'crime', aliases: ['crimen'], category: 'economy', description: 'Comete un crimen; Sombras aumenta la recompensa exitosa.',
    async handler(ctx) {
      const result = advancedEconomy.crime(ctx.sender)
      if (!result.ok) throw new Error(`Podrás intentarlo de nuevo en ${duration(result.remaining)}.`)
      if (result.success) {
        const shadow = Boolean(rpg.hasBuff(ctx.sender, 'shadows'))
        const bonus = shadow ? Math.floor(result.amount * 0.20) : 0
        const balance = bonus ? rpg.adjustWallet(ctx.sender, bonus, 'rpg_shadow_bonus', 'crime') : result.balance
        await ctx.reply(`🕶️ *CRIMEN EXITOSO*\n━━━━━━━━━━━━━━\nGanancia base: *${fmt(result.amount)}*${bonus ? `\nSombras: *+${fmt(bonus)}*` : ''}\nCartera: *${fmt(balance.wallet)}*`)
      } else {
        await ctx.reply(`🚓 *TE ATRAPARON*\n━━━━━━━━━━━━━━\nMulta: *${fmt(result.amount)}*\nCartera: *${fmt(result.balance.wallet)}*`)
      }
    },
  },
  {
    name: 'rob', aliases: ['robar', 'steal'], category: 'economy', description: 'Intenta robar; el Escudo del Grimorio protege a la víctima.', usage: 'rob @usuario',
    async handler(ctx) {
      const other = await target(ctx)
      if (!other) throw new Error('Menciona al usuario que quieres intentar robar.')
      const shield = rpg.hasBuff(other, 'shield')
      if (shield) {
        economy.db.prepare('UPDATE economy_users SET last_rob = ? WHERE user_jid = ?').run(Date.now(), ctx.sender)
        await ctx.socket.sendMessage(ctx.chatId, {
          text: `🛡️ *ROBO BLOQUEADO*\n━━━━━━━━━━━━━━\nEl escudo de @${other.split('@')[0]} rechazó el intento.\nProtección restante: *${duration(shield - Date.now())}*`,
          mentions: [other],
        }, { quoted: ctx.message })
        return
      }
      const result = economy.rob(ctx.sender, other)
      if (!result.ok) throw new Error(`Debes esperar ${duration(result.remaining)} antes de volver a robar.`)
      if (result.reason === 'empty') await ctx.reply('🕵️ Esa cartera casi no tiene saldo; el banco está protegido.')
      else if (result.success) await ctx.socket.sendMessage(ctx.chatId, { text: `🦹 *ROBO EXITOSO*\nObtuviste *${fmt(result.amount)}* de @${other.split('@')[0]}.`, mentions: [other] }, { quoted: ctx.message })
      else await ctx.reply(`🚓 *ROBO FALLIDO*\nPerdiste *${fmt(result.amount)}*.`)
    },
  },
  {
    name: 'daily', aliases: ['diario'], category: 'economy', description: 'Recompensa diaria con posibilidad de obtener una gema.',
    async handler(ctx) {
      const result = advancedEconomy.daily(ctx.sender)
      if (!result.ok) throw new Error(`Tu recompensa diaria estará lista en ${duration(result.remaining)}.`)
      const gem = Math.random() < 0.20
      const rpgProfile = gem ? rpg.addGems(ctx.sender, 1) : rpg.profile(ctx.sender)
      await ctx.reply(`🎁 *RECOMPENSA DIARIA*\n━━━━━━━━━━━━━━\nGanaste: *${fmt(result.reward)}*${gem ? '\n💎 Bonus: *1 gema*' : ''}\nCartera: *${fmt(result.balance.wallet)}*\nGemas: *${rpgProfile.gems}*`)
    },
  },
]
