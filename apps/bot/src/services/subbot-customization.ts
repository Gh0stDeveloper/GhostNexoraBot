import { economy } from './economy.js'

const db = economy.db
const now = () => Date.now()

export type SubbotCustomization = {
  subbotId: number
  shortName: string
  longName: string
  currencyName: string
}

db.exec(`
  CREATE TABLE IF NOT EXISTS subbot_customization (
    subbot_id INTEGER PRIMARY KEY,
    short_name TEXT NOT NULL DEFAULT 'Ghost Bot',
    long_name TEXT NOT NULL DEFAULT 'Ghost Nexora Subbot',
    currency_name TEXT NOT NULL DEFAULT 'Nexora Coins',
    updated_at INTEGER NOT NULL,
    FOREIGN KEY(subbot_id) REFERENCES subbots(id) ON DELETE CASCADE
  );
`)

function cleanName(value: string, min: number, max: number, label: string) {
  const text = value.trim().replace(/\s+/g, ' ')
  if (text.length < min || text.length > max) throw new Error(`${label} debe tener entre ${min} y ${max} caracteres.`)
  return text
}

function ensure(subbotId: number) {
  db.prepare(`INSERT OR IGNORE INTO subbot_customization(subbot_id, updated_at) VALUES(?, ?)`).run(subbotId, now())
}

export const subbotCustomization = {
  get(subbotId: number): SubbotCustomization {
    ensure(subbotId)
    return db.prepare(`SELECT subbot_id AS subbotId, short_name AS shortName, long_name AS longName,
      currency_name AS currencyName FROM subbot_customization WHERE subbot_id = ?`).get(subbotId) as SubbotCustomization
  },

  setNames(subbotId: number, shortName: string, longName?: string) {
    ensure(subbotId)
    const short = cleanName(shortName, 2, 24, 'El nombre corto')
    const long = cleanName(longName?.trim() || short, 2, 60, 'El nombre largo')
    db.prepare('UPDATE subbot_customization SET short_name = ?, long_name = ?, updated_at = ? WHERE subbot_id = ?')
      .run(short, long, now(), subbotId)
    return this.get(subbotId)
  },

  setCurrency(subbotId: number, currencyName: string) {
    ensure(subbotId)
    const currency = cleanName(currencyName, 2, 32, 'El nombre de la moneda')
    db.prepare('UPDATE subbot_customization SET currency_name = ?, updated_at = ? WHERE subbot_id = ?')
      .run(currency, now(), subbotId)
    return this.get(subbotId)
  },
}
