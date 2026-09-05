import type { BotCommand, CommandContext } from '../types.js'
import { COIN_SYMBOL, economy } from '../services/economy.js'
import { advancedEconomy } from '../services/economy-advanced.js'
import { bankingV10 } from '../services/banking-v10.js'
import { mining, MINER_MAX_COUNT } from '../services/mining.js'
import { professionsV2 } from '../services/professions-v2.js'

const fmt = (value: number) => `${Math.floor(value).toLocaleString('es-MX')} ${COIN_SYMBOL}`

function pendingFines(userJid: string) {
  const db = economy.walletDb
  const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='economy_fines'").get()
  if (!exists) return 0
  const row = db.prepare("SELECT COALESCE(SUM(balance_due), 0) AS total FROM economy_fines WHERE user_jid = ? AND status = 'open'").get(userJid) as { total?: number }
  return Number(row.total ?? 0)
}

async function balanceV10(ctx: CommandContext) {
  const balance = economy.balance(ctx.sender)
  const assets = advancedEconomy.summary(ctx.sender)
  const debts = advancedEconomy.debts(ctx.sender)
  const peerDebt = debts.peers.reduce((sum, item) => sum + Number(item.balanceDue ?? 0), 0)
  const bank = bankingV10.status(ctx.sender)
  const fines = pendingFines(ctx.sender)
  const miner = mining.summary(ctx.sender)
  const profession = professionsV2.get(ctx.sender)
  const gross = balance.total + assets.investments + assets.cda
  const liabilities = bank.totalDebt + peerDebt + fines
  const net = gross - liabilities

  await ctx.reply([
    '╭━━〔 🪙 *BILLETERA GLOBAL NXC* 〕━━╮',
    `┃ Cartera: *${fmt(balance.wallet)}*`,
    `┃ Banco: *${fmt(balance.bank)}*`,
    `┃ Inversiones: *${fmt(assets.investments)}*`,
    `┃ Plazo fijo: *${fmt(assets.cda)}*`,
    `┃ Minería pendiente: *${fmt(miner.pending)}*`,
    '┣━━━━━━━━━━━━━━━━',
    `┃ Crédito bancario: *-${fmt(bank.totalDebt)}*`,
    `┃ Préstamos de usuarios: *-${fmt(peerDebt)}*`,
    `┃ Multas: *-${fmt(fines)}*`,
    `┃ Pasivos totales: *-${fmt(liabilities)}*`,
    '┣━━━━━━━━━━━━━━━━',
    `┃ Patrimonio bruto: *${fmt(gross)}*`,
    `┃ Patrimonio neto: *${fmt(net)}*`,
    `┃ Score crediticio: *${bank.profile.creditScore}/850 · ${bank.tier.label}*`,
    `┃ Mineros: *${miner.count}/${MINER_MAX_COUNT}* · ${fmt(miner.hourly)}/h`,
    `┃ Profesión: *${profession.emoji} ${profession.label}*`,
    '╰━━━━━━━━━━━━━━━━╯',
    '',
    `Banco y crédito: *${ctx.prefix}bank*`,
    `Minería: *${ctx.prefix}miner*`,
    `Tienda de mineros: *${ctx.prefix}minershop*`,
    '',
    'La cartera, el banco y las deudas bancarias son globales entre MainBot y subbots.',
  ].join('\n'))
}

export const balanceV10Commands: BotCommand[] = [
  {
    name: 'balance',
    aliases: ['bal', 'wallet', 'cartera'],
    category: 'economy',
    description: 'Billetera global con activos, pasivos, crédito, multas y patrimonio neto.',
    handler: balanceV10,
  },
]
