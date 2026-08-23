import type { BotCommand, CommandContext } from '../types.js'
import { economy, COIN_SYMBOL } from '../services/economy.js'
import { advancedEconomy } from '../services/economy-advanced.js'
import { economyV2 } from '../services/economy-v2.js'
import { giveWaifu } from '../services/waifu.js'
import { resolveTarget } from '../utils/target.js'
import { getContextInfo } from '../utils/message.js'

const fmt = (value: number) => `${Math.floor(value).toLocaleString('es-MX')} ${COIN_SYMBOL}`

function parsePositive(value?: string) {
  const parsed = Number((value ?? '').replace(/[,_]/g, ''))
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error('Indica una cantidad válida.')
  return Math.floor(parsed)
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

export const economyFixV2Commands: BotCommand[] = [
  { name: 'transfer', aliases: ['pay', 'send', 'enviar', 'transferir'], category: 'economy', description: 'Transfiere NXC global por mención, respuesta o número.', handler: transfer },
  { name: 'addnxc', aliases: ['givencx', 'grantnxc'], category: 'owner', description: 'Añade NXC a la billetera global de un usuario.', staffOnly: true, handler: addNxc },
  { name: 'lend', aliases: ['prestar'], category: 'economy', description: 'Presta NXC por mención, respuesta o número.', handler: lend },
  { name: 'wgive', aliases: ['givewaifu', 'regalarwaifu'], category: 'collection', description: 'Regala un personaje por mención, respuesta o número.', handler: give },
]
