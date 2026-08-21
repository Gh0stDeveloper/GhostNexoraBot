import { economy } from './economy.js'

const db = economy.db
const now = () => Date.now()
const DEFAULT_PACK = 'Nexora Bot | Nexora'
const DEFAULT_PUBLISHER = 'Nexora'

db.exec(`
  CREATE TABLE IF NOT EXISTS sticker_preferences (
    user_jid TEXT PRIMARY KEY,
    pack_name TEXT NOT NULL,
    publisher TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`)

function cleanPack(value: string) {
  const pack = value.trim()
  if (!pack || pack.length > 80) throw new Error('El nombre del pack debe tener entre 1 y 80 caracteres.')
  return pack
}

function cleanPublisher(value: string) {
  const publisher = value.trim()
  if (!publisher || publisher.length > 80) throw new Error('El alias del autor debe tener entre 1 y 80 caracteres.')
  return publisher
}

export const stickerPreferences = {
  get(userJid: string) {
    const row = db.prepare('SELECT pack_name AS packName, publisher FROM sticker_preferences WHERE user_jid = ?').get(userJid) as { packName: string; publisher: string } | undefined
    return row ?? { packName: DEFAULT_PACK, publisher: DEFAULT_PUBLISHER }
  },

  set(userJid: string, packName: string, publisher?: string) {
    const current = this.get(userJid)
    const pack = cleanPack(packName)
    const author = cleanPublisher(publisher ?? current.publisher)
    db.prepare(`INSERT INTO sticker_preferences(user_jid, pack_name, publisher, updated_at) VALUES(?, ?, ?, ?)
      ON CONFLICT(user_jid) DO UPDATE SET pack_name = excluded.pack_name, publisher = excluded.publisher, updated_at = excluded.updated_at`)
      .run(userJid, pack, author, now())
    return this.get(userJid)
  },

  setPublisher(userJid: string, publisher: string) {
    const current = this.get(userJid)
    return this.set(userJid, current.packName, cleanPublisher(publisher))
  },

  reset(userJid: string) {
    db.prepare('DELETE FROM sticker_preferences WHERE user_jid = ?').run(userJid)
    return this.get(userJid)
  },
}
