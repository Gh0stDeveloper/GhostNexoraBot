import { economy } from './economy.js'

const db = economy.db

db.exec(`
  CREATE TABLE IF NOT EXISTS work_compat_v4 (
    source_ledger_id INTEGER PRIMARY KEY,
    created_at INTEGER NOT NULL
  );
`)

const pending = db.prepare(`
  SELECT l.id, l.user_jid as userJid, l.created_at as createdAt
  FROM economy_ledger l
  LEFT JOIN work_compat_v4 c ON c.source_ledger_id = l.id
  WHERE l.kind = 'work_v2' AND c.source_ledger_id IS NULL
  ORDER BY l.id ASC
`).all() as Array<{ id: number; userJid: string; createdAt: number }>

if (pending.length) {
  db.exec('BEGIN IMMEDIATE')
  try {
    const mark = db.prepare('INSERT OR IGNORE INTO work_compat_v4(source_ledger_id, created_at) VALUES(?, ?)')
    const ledger = db.prepare(`INSERT INTO economy_ledger(user_jid, kind, amount, counterparty_jid, note, created_at)
      VALUES(?, 'work', 0, NULL, ?, ?)`)
    for (const row of pending) {
      const inserted = mark.run(row.id, Date.now())
      if (Number(inserted.changes) === 1) ledger.run(row.userJid, `v4_work_marker:${row.id}`, row.createdAt)
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

db.exec(`
  CREATE TRIGGER IF NOT EXISTS trg_work_v2_compat_v4
  AFTER INSERT ON economy_ledger
  WHEN NEW.kind = 'work_v2'
  BEGIN
    INSERT OR IGNORE INTO work_compat_v4(source_ledger_id, created_at) VALUES(NEW.id, NEW.created_at);
    INSERT INTO economy_ledger(user_jid, kind, amount, counterparty_jid, note, created_at)
    SELECT NEW.user_jid, 'work', 0, NULL, 'v4_work_marker:' || NEW.id, NEW.created_at
    WHERE changes() = 1;
  END;
`)
