import type { BotCommand, CommandContext } from '../types.js'
import { COIN_SYMBOL, economy } from '../services/economy.js'
import { advancedEconomy } from '../services/economy-advanced.js'
import { bankingV10 } from '../services/banking-v10.js'
import { mining, MINER_MAX_COUNT } from '../services/mining.js'
import { professionsV2 } from '../services/professions-v2.js'
import { sendInteractiveCard } from '../services/interactive.js'
import { minershopStyleV13Commands } from './minershop-style-v13.js'

const DAY = 86_400_000

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

function formatDuration(ms: number) {
  const safe = Math.max(0, ms)
  const days = Math.floor(safe / DAY)
  const hours = Math.floor((safe % DAY) / 3_600_000)
  const minutes = Math.ceil((safe % 3_600_000) / 60_000)
  return [days ? `${days}d` : '', hours ? `${hours}h` : '', !days && minutes ? `${minutes}m` : ''].filter(Boolean).join(' ') || '<1m'
}

async function balanceCommand(ctx: CommandContext) {
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

  const body = [
    `Cartera: *${fmt(balance.wallet)}*`,
    `Banco: *${fmt(balance.bank)}*`,
    `Inversiones: *${fmt(assets.investments)}*`,
    `Plazo fijo: *${fmt(assets.cda)}*`,
    `Minería pendiente: *${fmt(miner.pending)}*`,
    '━━━━━━━━━━━━━━━━',
    `Crédito bancario: *${liabilityFmt(bankDebt)}*`,
    `Préstamos de usuarios: *${liabilityFmt(peerDebt)}*`,
    `Multas: *${liabilityFmt(fines)}*`,
    `Pasivos totales: *${liabilityFmt(liabilities)}*`,
    '━━━━━━━━━━━━━━━━',
    `Patrimonio bruto: *${fmt(gross)}*`,
    `Patrimonio neto: *${fmt(net)}*`,
    `Score crediticio: *${bank.profile.creditScore}/850 · ${bank.tier.label}*`,
    `Mineros: *${miner.count}/${MINER_MAX_COUNT}* · ${fmt(miner.hourly)}/h`,
    `Profesión: *${profession.emoji} ${profession.label}*`,
    '',
    'La cartera, el banco y las deudas bancarias son globales entre MainBot y subbots.',
  ].join('\n')

  await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
    title: '🪙 BILLETERA GLOBAL NXC',
    body,
    footer: 'Nexora Economy · Ghost Nexora Bot',
    buttons: [
      { type: 'reply', text: '🏦 Banco', id: `${ctx.prefix}bank` },
      { type: 'reply', text: '⛏️ Minería', id: `${ctx.prefix}miner` },
    ],
  })
}

const effectiveMiner = minershopStyleV13Commands.find((command) => command.name === 'miner')

async function minerCommand(ctx: CommandContext) {
  const action = (ctx.args[0] ?? 'status').toLowerCase()
  if (!['status', 'estado', 'info'].includes(action)) {
    if (!effectiveMiner) throw new Error('El centro de minería no está disponible temporalmente.')
    await effectiveMiner.handler(ctx)
    return
  }

  const summary = mining.summary(ctx.sender)
  const subscriptions = summary.subscriptions.slice(0, 5).map((sub, index) =>
    `${index + 1}. *${sub.planId.toUpperCase()}* · vence ${new Date(sub.expiresAt).toLocaleString('es-MX')} · ${formatDuration(sub.expiresAt - Date.now())}`,
  )
  const body = [
    `Mineros activos: *${summary.count}/${MINER_MAX_COUNT}*`,
    `Permanentes legacy: *${summary.legacyCount}*`,
    `Suscripciones: *${summary.subscriptionCount}*`,
    `Producción: *${fmt(summary.hourly)}/h*`,
    `Pendiente: *${fmt(summary.pending)}*`,
    `Total minado: *${fmt(summary.totalMined)}*`,
    summary.nextExpiry ? `Próximo vencimiento: *${formatDuration(summary.nextExpiry - Date.now())}*` : 'Próximo vencimiento: *N/A*',
    subscriptions.length ? `\n*SUSCRIPCIONES ACTIVAS*\n${subscriptions.join('\n')}` : '',
  ].filter(Boolean).join('\n')

  await sendInteractiveCard(ctx.socket, ctx.chatId, ctx.message, {
    title: '⛏️ CENTRO DE MINERÍA NXC',
    body,
    footer: 'Nexora Mining · Ghost Nexora Bot',
    buttons: [
      { type: 'reply', text: '🛒 Comprar minero', id: `${ctx.prefix}minershop` },
      { type: 'reply', text: '💰 Cobrar', id: `${ctx.prefix}miner collect` },
    ],
  })
}

export const economyUiV18Commands: BotCommand[] = [
  {
    name: 'balance',
    aliases: ['bal', 'wallet', 'cartera'],
    category: 'economy',
    description: 'Billetera global NXC con botones directos para banco y minería.',
    handler: balanceCommand,
  },
  {
    name: 'miner',
    aliases: ['minero', 'mining'],
    category: 'economy',
    description: 'Centro de minería con acceso directo a compra y cobro.',
    usage: 'miner [status|collect|shop|buy <plan> [cantidad]]',
    handler: minerCommand,
  },
]
