import { economy, COIN_SYMBOL } from './economy.js'
import { mining } from './mining.js'
import { professionsV2, V2_PROFESSIONS, type V2ProfessionId } from './professions-v2.js'

const db = economy.db
const now = () => Date.now()

type Metrics = {
  dailies: number
  works: number
  activeMiners: number
  netWorth: number
}

type CareerRule = {
  price: number
  requirement: (metrics: Metrics) => boolean
  requirementText: (metrics: Metrics) => string
}

const FREE = new Set<V2ProfessionId>(['developer', 'cook', 'carpenter', 'farmer', 'designer', 'musician', 'journalist', 'gamer'])

const RULES: Partial<Record<V2ProfessionId, CareerRule>> = {
  nurse: {
    price: 4_000,
    requirement: (m) => m.dailies >= 3,
    requirementText: (m) => `Reclamar 3 dailys (${Math.min(m.dailies, 3)}/3)`,
  },
  mechanic: {
    price: 4_000,
    requirement: (m) => m.works >= 5,
    requirementText: (m) => `Completar 5 trabajos (${Math.min(m.works, 5)}/5)`,
  },
  electrician: {
    price: 5_000,
    requirement: (m) => m.works >= 8,
    requirementText: (m) => `Completar 8 trabajos (${Math.min(m.works, 8)}/8)`,
  },
  teacher: {
    price: 5_000,
    requirement: (m) => m.dailies >= 5,
    requirementText: (m) => `Reclamar 5 dailys (${Math.min(m.dailies, 5)}/5)`,
  },
  firefighter: {
    price: 6_000,
    requirement: (m) => m.works >= 10,
    requirementText: (m) => `Completar 10 trabajos (${Math.min(m.works, 10)}/10)`,
  },
  police: {
    price: 6_000,
    requirement: (m) => m.works >= 12,
    requirementText: (m) => `Completar 12 trabajos (${Math.min(m.works, 12)}/12)`,
  },
  architect: {
    price: 8_000,
    requirement: (m) => m.works >= 15,
    requirementText: (m) => `Completar 15 trabajos (${Math.min(m.works, 15)}/15)`,
  },
  scientist: {
    price: 9_000,
    requirement: (m) => m.dailies >= 7 && m.activeMiners >= 1,
    requirementText: (m) => `7 dailys + 1 minero activo (${Math.min(m.dailies, 7)}/7 · ${Math.min(m.activeMiners, 1)}/1)`,
  },
  doctor: {
    price: 10_000,
    requirement: (m) => m.dailies >= 10,
    requirementText: (m) => `Reclamar 10 dailys (${Math.min(m.dailies, 10)}/10)`,
  },
  pilot: {
    price: 12_000,
    requirement: (m) => m.activeMiners >= 3,
    requirementText: (m) => `Tener 3 mineros activos (${Math.min(m.activeMiners, 3)}/3)`,
  },
  lawyer: {
    price: 12_000,
    requirement: (m) => m.dailies >= 12,
    requirementText: (m) => `Reclamar 12 dailys (${Math.min(m.dailies, 12)}/12)`,
  },
  entrepreneur: {
    price: 12_000,
    requirement: (m) => m.netWorth >= 20_000,
    requirementText: (m) => `Alcanzar 20,000 NXC de patrimonio (${Math.min(m.netWorth, 20_000).toLocaleString('es-MX')}/20,000)`,
  },
}

db.exec(`
  CREATE TABLE IF NOT EXISTS economy_profession_licenses (
    user_jid TEXT NOT NULL,
    profession TEXT NOT NULL,
    unlock_method TEXT NOT NULL,
    paid_price INTEGER NOT NULL DEFAULT 0,
    unlocked_at INTEGER NOT NULL,
    PRIMARY KEY(user_jid, profession)
  );
`)

function clean(value: string) {
  return value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

const aliases: Record<string, V2ProfessionId> = {
  dev: 'developer', developer: 'developer', programador: 'developer', programadora: 'developer', desarrollador: 'developer', desarrolladora: 'developer',
  chef: 'cook', cook: 'cook', cocinero: 'cook', cocinera: 'cook',
  carpenter: 'carpenter', carpintero: 'carpenter', carpintera: 'carpenter',
  scientist: 'scientist', cientifico: 'scientist', cientifica: 'scientist',
  doctor: 'doctor', doctora: 'doctor', medico: 'doctor', medica: 'doctor',
  nurse: 'nurse', enfermero: 'nurse', enfermera: 'nurse',
  mechanic: 'mechanic', mecanico: 'mechanic', mecanica: 'mechanic',
  electrician: 'electrician', electricista: 'electrician',
  architect: 'architect', arquitecto: 'architect', arquitecta: 'architect',
  teacher: 'teacher', profesor: 'teacher', profesora: 'teacher', maestro: 'teacher', maestra: 'teacher',
  farmer: 'farmer', agricultor: 'farmer', agricultora: 'farmer',
  pilot: 'pilot', piloto: 'pilot', pilota: 'pilot',
  firefighter: 'firefighter', bombero: 'firefighter', bombera: 'firefighter',
  police: 'police', policia: 'police',
  designer: 'designer', disenador: 'designer', disenadora: 'designer',
  musician: 'musician', musico: 'musician', musica: 'musician',
  journalist: 'journalist', periodista: 'journalist',
  lawyer: 'lawyer', abogado: 'lawyer', abogada: 'lawyer',
  entrepreneur: 'entrepreneur', emprendedor: 'entrepreneur', emprendedora: 'entrepreneur',
  gamer: 'gamer', jugador: 'gamer', jugadora: 'gamer',
}

export function resolveCareerId(value: string): V2ProfessionId | null {
  const normalized = clean(value)
  if (normalized in V2_PROFESSIONS) return normalized as V2ProfessionId
  return aliases[normalized] ?? null
}

function metrics(userJid: string): Metrics {
  economy.balance(userJid)
  const dailyRow = db.prepare("SELECT COUNT(*) AS count FROM economy_ledger WHERE user_jid = ? AND kind = 'daily'").get(userJid) as { count?: number }
  const workRow = db.prepare("SELECT COUNT(*) AS count FROM economy_ledger WHERE user_jid = ? AND kind IN ('work', 'work_v2')").get(userJid) as { count?: number }
  const balance = economy.balance(userJid)
  const miner = mining.summary(userJid)
  return {
    dailies: Number(dailyRow.count ?? 0),
    works: Number(workRow.count ?? 0),
    activeMiners: miner.count,
    netWorth: balance.total,
  }
}

function license(userJid: string, profession: V2ProfessionId) {
  return db.prepare(`SELECT unlock_method AS unlockMethod, paid_price AS paidPrice, unlocked_at AS unlockedAt
    FROM economy_profession_licenses WHERE user_jid = ? AND profession = ?`).get(userJid, profession) as
    { unlockMethod: string; paidPrice: number; unlockedAt: number } | undefined
}

function persistLicense(userJid: string, profession: V2ProfessionId, method: string, paidPrice = 0) {
  db.prepare(`INSERT INTO economy_profession_licenses(user_jid, profession, unlock_method, paid_price, unlocked_at)
    VALUES(?, ?, ?, ?, ?)
    ON CONFLICT(user_jid, profession) DO NOTHING`).run(userJid, profession, method, paidPrice, now())
}

function debitTotal(userJid: string, price: number, profession: V2ProfessionId) {
  const balance = economy.balance(userJid)
  if (balance.total < price) throw new Error(`Necesitas ${price.toLocaleString('es-MX')} ${COIN_SYMBOL} para comprar este título.`)
  const walletUse = Math.min(balance.wallet, price)
  const bankUse = price - walletUse
  db.prepare('UPDATE economy_users SET wallet = wallet - ?, bank = bank - ? WHERE user_jid = ?').run(walletUse, bankUse, userJid)
  db.prepare('INSERT INTO economy_ledger(user_jid, kind, amount, note, created_at) VALUES(?, ?, ?, ?, ?)')
    .run(userJid, 'profession_license', -price, `profession:${profession}`, now())
}

export const careerLicenses = {
  metrics,

  status(userJid: string, profession: V2ProfessionId) {
    const item = V2_PROFESSIONS[profession]
    const userMetrics = metrics(userJid)
    if (FREE.has(profession)) {
      return { profession, item, unlocked: true, method: 'free' as const, price: 0, requirement: 'Disponible para todos', metrics: userMetrics }
    }
    const existing = license(userJid, profession)
    if (existing) {
      return { profession, item, unlocked: true, method: existing.unlockMethod, price: RULES[profession]?.price ?? 0, requirement: 'Título desbloqueado permanentemente', metrics: userMetrics }
    }
    const rule = RULES[profession]
    if (!rule) {
      return { profession, item, unlocked: true, method: 'free' as const, price: 0, requirement: 'Disponible para todos', metrics: userMetrics }
    }
    const earned = rule.requirement(userMetrics)
    return {
      profession,
      item,
      unlocked: earned,
      method: earned ? 'progress-ready' as const : 'locked' as const,
      price: rule.price,
      requirement: rule.requirementText(userMetrics),
      metrics: userMetrics,
    }
  },

  ensureCurrent(userJid: string) {
    const current = professionsV2.get(userJid)
    if (FREE.has(current.id) || license(userJid, current.id)) return current
    // No quitamos una profesión que el usuario ya tenía antes de introducir licencias.
    persistLicense(userJid, current.id, 'legacy', 0)
    return current
  },

  choose(userJid: string, requested: string) {
    const profession = resolveCareerId(requested)
    if (!profession) throw new Error('Profesión no reconocida. Usa .job para ver las disponibles.')
    const status = this.status(userJid, profession)
    if (!status.unlocked) {
      throw new Error(`${status.item.emoji} ${status.item.label} está bloqueada. Requisito: ${status.requirement}. También puedes comprar el título por ${status.price.toLocaleString('es-MX')} ${COIN_SYMBOL} con .joblicense ${profession}.`)
    }
    if (status.method === 'progress-ready') persistLicense(userJid, profession, 'progress', 0)
    return professionsV2.set(userJid, profession)
  },

  buy(userJid: string, requested: string) {
    const profession = resolveCareerId(requested)
    if (!profession) throw new Error('Profesión no reconocida.')
    if (FREE.has(profession)) throw new Error('Esa profesión no necesita título de pago.')
    const existing = license(userJid, profession)
    if (existing) return { profession, item: V2_PROFESSIONS[profession], price: 0, method: existing.unlockMethod, alreadyUnlocked: true, balance: economy.balance(userJid) }
    const status = this.status(userJid, profession)
    if (status.method === 'progress-ready') {
      persistLicense(userJid, profession, 'progress', 0)
      return { profession, item: V2_PROFESSIONS[profession], price: 0, method: 'progress', alreadyUnlocked: false, balance: economy.balance(userJid) }
    }
    const price = status.price
    db.exec('BEGIN IMMEDIATE')
    try {
      debitTotal(userJid, price, profession)
      persistLicense(userJid, profession, 'purchase', price)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    return { profession, item: V2_PROFESSIONS[profession], price, method: 'purchase', alreadyUnlocked: false, balance: economy.balance(userJid) }
  },

  all(userJid: string) {
    this.ensureCurrent(userJid)
    return (Object.keys(V2_PROFESSIONS) as V2ProfessionId[]).map((profession) => this.status(userJid, profession))
  },
}
