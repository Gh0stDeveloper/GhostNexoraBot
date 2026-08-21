import { economy } from './economy.js'

const db = economy.db
const now = () => Date.now()

db.exec(`
  CREATE TABLE IF NOT EXISTS sticker_preferences (
    user_jid TEXT PRIMARY KEY,
    pack_name TEXT NOT NULL,
    publisher TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`)

export const stickerPreferences = {
  get(userJid: string) {
    const row = db.prepare('SELECT pack_name AS packName, publisher FROM sticker_preferences WHERE user_jid = ?').get(userJid) as { packName: string; publisher: string } | undefined
    return row ?? { packName: 'Ghost Nexora Bot', publisher: 'Ghost Developer / Nexora' }
  },

  set(userJid: string, packName: string, publisher = 'Ghost Developer / Nexora') {
    const pack = packName.trim()
    const author = publisher.trim() || 'Ghost Developer / Nexora'
    if (!pack || pack.length > 80) throw new Error('El nombre del pack debe tener entre 1 y 80 caracteres.')
    if (author.length > 80) throw new Error('El nombre del autor admite hasta 80 caracteres.')
    db.prepare(`INSERT INTO sticker_preferences(user_jid, pack_name, publisher, updated_at) VALUES(?, ?, ?, ?)
      ON CONFLICT(user_jid) DO UPDATE SET pack_name = excluded.pack_name, publisher = excluded.publisher, updated_at = excluded.updated_at`)
      .run(userJid, pack, author, now())
    return this.get(userJid)
  },

  reset(userJid: string) {
    db.prepare('DELETE FROM sticker_preferences WHERE user_jid = ?').run(userJid)
    return this.get(userJid)
  },
}
