import type { BotCommand, CommandContext } from '../types.js'
import { COIN_SYMBOL, economy } from '../services/economy.js'
import { advancedEconomy } from '../services/economy-advanced.js'
import { bankingV10 } from '../services/banking-v10.js'
import { mining, MINER_MAX_COUNT } from '../services/mining.js'
import { professionsV2 } from '../services/professions-v2.js'

function wholeAmount(value: number) {
  if (!Number.isFinite(value)) return 0
  const normalized = Math.trunc(value)
  return Object.is(normalized, -0) ? 0 : normalized
}

const fmt = (value: number) => `${wholeAmount(value).toLocaleString('es-MX')} ${COIN_SYMBOL}`
const liabilityFmt = (value: number) => fmt(Math.max(0, wholeAmount(value)))

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
  const peerDebt = Math.max(0, debts.peers.reduce((sum, item) => sum + Math.max(0, wholeAmount(Number(item.balanceDue ?? 0))), 0))
  const bank = bankingV10.status(ctx.sender)
  const bankDebt = Math.max(0, wholeAmount(bank.totalDebt))
  const fines = Math.max(0, wholeAmount(pendingFines(ctx.sender)))
  const miner = mining.summary(ctx.sender)
  const profession = professionsV2.get(ctx.sender)
  const gross = balance.total + assets.investments + assets.cda
  const liabilities = bankDebt + peerDebt + fines
  const net = gross - liabilities

  await ctx.reply([
    '╭━━〔 🪙 *BILLETERA GLOBAL NXC* 〕━━╮',
    `┃ Cartera: *${fmt(balance.wallet)}*`,
    `┃ Banco: *${fmt(balance.bank)}*`,
    `┃ Inversiones: *${fmt(assets.investments)}*`,
    `┃ Plazo fijo: *${fmt(assets.cda)}*`,
    `┃ Minería pendiente: *${fmt(miner.pending)}*`,
    '┣━━━━━━━━━━━━━━━━',
    `┃ Crédito bancario: *${liabilityFmt(bankDebt)}*`,
    `┃ Préstamos de usuarios: *${liabilityFmt(peerDebt)}*`,
    `┃ Multas: *${liabilityFmt(fines)}*`,
    `┃ Pasivos totales: *${liabilityFmt(liabilities)}*`,
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
