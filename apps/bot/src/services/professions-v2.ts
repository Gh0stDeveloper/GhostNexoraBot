import { economy } from './economy.js'

const db = economy.db
const now = () => Date.now()

export const V2_PROFESSIONS = {
  developer: { label: 'Desarrollador/a', emoji: '💻', min: 80, max: 190, description: 'Software, bots, APIs y automatización.' },
  cook: { label: 'Cocinero/a', emoji: '👨‍🍳', min: 65, max: 175, description: 'Cocina, repostería y servicio gastronómico.' },
  carpenter: { label: 'Carpintero/a', emoji: '🪚', min: 70, max: 180, description: 'Muebles, estructuras y trabajos de madera.' },
  scientist: { label: 'Científico/a', emoji: '🔬', min: 85, max: 205, description: 'Investigación, laboratorio y descubrimientos.' },
  doctor: { label: 'Médico/a', emoji: '🩺', min: 85, max: 210, description: 'Atención clínica y cuidado de pacientes.' },
  nurse: { label: 'Enfermero/a', emoji: '💉', min: 75, max: 190, description: 'Cuidados, hospital y atención comunitaria.' },
  mechanic: { label: 'Mecánico/a', emoji: '🔧', min: 70, max: 185, description: 'Diagnóstico y reparación de vehículos.' },
  electrician: { label: 'Electricista', emoji: '⚡', min: 75, max: 190, description: 'Instalaciones y mantenimiento eléctrico.' },
  architect: { label: 'Arquitecto/a', emoji: '🏗️', min: 80, max: 200, description: 'Diseño y planificación de espacios.' },
  teacher: { label: 'Profesor/a', emoji: '📚', min: 65, max: 175, description: 'Enseñanza y formación.' },
  farmer: { label: 'Agricultor/a', emoji: '🌾', min: 55, max: 165, description: 'Cultivo, campo y producción de alimentos.' },
  pilot: { label: 'Piloto/a', emoji: '✈️', min: 90, max: 220, description: 'Operación y navegación aérea.' },
  firefighter: { label: 'Bombero/a', emoji: '🚒', min: 75, max: 195, description: 'Rescate, prevención y emergencias.' },
  police: { label: 'Policía', emoji: '👮', min: 70, max: 185, description: 'Seguridad y servicio comunitario.' },
  designer: { label: 'Diseñador/a', emoji: '🎨', min: 60, max: 180, description: 'Diseño visual, UI y creatividad.' },
  musician: { label: 'Músico/a', emoji: '🎸', min: 55, max: 185, description: 'Composición, interpretación y espectáculos.' },
  journalist: { label: 'Periodista', emoji: '📰', min: 60, max: 180, description: 'Investigación, entrevistas y noticias.' },
  lawyer: { label: 'Abogado/a', emoji: '⚖️', min: 80, max: 205, description: 'Asesoría y representación jurídica.' },
  entrepreneur: { label: 'Emprendedor/a', emoji: '📈', min: 50, max: 230, description: 'Negocios con mayor variación de ingresos.' },
  gamer: { label: 'Jugador/a profesional', emoji: '🎮', min: 45, max: 210, description: 'Competencias, streaming y eventos.' },
} as const

export type V2ProfessionId = keyof typeof V2_PROFESSIONS
const DEFAULT: V2ProfessionId = 'developer'

db.exec(`
  CREATE TABLE IF NOT EXISTS economy_professions_v2 (
    user_jid TEXT PRIMARY KEY,
    profession TEXT NOT NULL DEFAULT 'developer',
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS economy_cooldowns_v2 (
    user_jid TEXT NOT NULL,
    action TEXT NOT NULL,
    last_used INTEGER NOT NULL,
    PRIMARY KEY(user_jid, action)
  );
`)

function normalize(value: string): V2ProfessionId | null {
  const clean = value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const aliases: Record<string, V2ProfessionId> = {
    chef: 'cook', cocinero: 'cook', cocinera: 'cook', carpintero: 'carpenter', carpintera: 'carpenter', cientifico: 'scientist', cientifica: 'scientist',
    medico: 'doctor', medica: 'doctor', doctor: 'doctor', doctora: 'doctor', enfermero: 'nurse', enfermera: 'nurse', mecanico: 'mechanic', mecanica: 'mechanic',
    electricista: 'electrician', arquitecto: 'architect', arquitecta: 'architect', profesor: 'teacher', profesora: 'teacher', maestro: 'teacher', maestra: 'teacher',
    agricultor: 'farmer', agricultora: 'farmer', piloto: 'pilot', pilota: 'pilot', bombero: 'firefighter', bombera: 'firefighter', policia: 'police',
    disenador: 'designer', disenadora: 'designer', musico: 'musician', musica: 'musician', periodista: 'journalist', abogado: 'lawyer', abogada: 'lawyer',
    emprendedor: 'entrepreneur', emprendedora: 'entrepreneur', jugador: 'gamer', jugadora: 'gamer', programador: 'developer', programadora: 'developer', dev: 'developer',
  }
  if (clean in V2_PROFESSIONS) return clean as V2ProfessionId
  return aliases[clean] ?? null
}

function ensure(userJid: string) {
  economy.balance(userJid)
  db.prepare('INSERT OR IGNORE INTO economy_professions_v2(user_jid, profession, updated_at) VALUES(?, ?, ?)').run(userJid, DEFAULT, now())
}

export const professionsV2 = {
  get(userJid: string) {
    ensure(userJid)
    const row = db.prepare('SELECT profession FROM economy_professions_v2 WHERE user_jid = ?').get(userJid) as { profession?: string }
    const id = normalize(row.profession ?? '') ?? DEFAULT
    return { id, ...V2_PROFESSIONS[id] }
  },

  set(userJid: string, requested: string) {
    ensure(userJid)
    const id = normalize(requested)
    if (!id) throw new Error('Profesión no reconocida. Usa .job para ver la lista disponible.')
    db.prepare('UPDATE economy_professions_v2 SET profession = ?, updated_at = ? WHERE user_jid = ?').run(id, now(), userJid)
    return { id, ...V2_PROFESSIONS[id] }
  },

  work(userJid: string) {
    ensure(userJid)
    const row = db.prepare("SELECT last_used as lastUsed FROM economy_cooldowns_v2 WHERE user_jid = ? AND action = 'work'").get(userJid) as { lastUsed?: number } | undefined
    const remaining = Math.max(0, Number(row?.lastUsed ?? 0) + 60_000 - now())
    if (remaining) return { ok: false as const, remaining }
    const profession = this.get(userJid)
    const reward = profession.min + Math.floor(Math.random() * (profession.max - profession.min + 1))
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare(`INSERT INTO economy_cooldowns_v2(user_jid, action, last_used) VALUES(?, 'work', ?)
        ON CONFLICT(user_jid, action) DO UPDATE SET last_used = excluded.last_used`).run(userJid, now())
      db.prepare('UPDATE economy_users SET wallet = wallet + ? WHERE user_jid = ?').run(reward, userJid)
      db.prepare('INSERT INTO economy_ledger(user_jid, kind, amount, note, created_at) VALUES(?, ?, ?, ?, ?)')
        .run(userJid, 'work_v2', reward, `profession:${profession.id}`, now())
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    return { ok: true as const, reward, profession, balance: economy.balance(userJid) }
  },
}
