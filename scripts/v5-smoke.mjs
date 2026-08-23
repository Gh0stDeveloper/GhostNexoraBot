import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const temp = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-v5-smoke-'))
process.env.DATA_DIR = temp
process.env.ADMIN_WEB_TOKEN = 'ci-v5-admin-token-123456'

try {
  const { economy } = await import('../apps/bot/dist/services/economy.js')

  // Simula una instalación previa: wa_sha256 era NOT NULL y no existía content_sha256.
  economy.db.exec(`
    DROP TABLE IF EXISTS global_sticker_actions;
    CREATE TABLE global_sticker_actions (
      action TEXT PRIMARY KEY,
      wa_sha256 TEXT NOT NULL,
      file_path TEXT,
      updated_by TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)

  const { globalStickers } = await import('../apps/bot/dist/services/human-stickers.js')
  assert.equal(globalStickers.normalizeTrigger('  ¡QUÉ   BUENO! '), 'que bueno')
  const configured = await globalStickers.setAction('kick', Buffer.from('fake-webp-content'), 'ci@s.whatsapp.net')
  assert.ok(configured.contentSha)
  const action = economy.db.prepare("SELECT wa_sha256 as waSha, content_sha256 as contentSha FROM global_sticker_actions WHERE action='kick'").get()
  assert.ok(String(action.waSha).startsWith('content:'))
  assert.equal(action.contentSha, configured.contentSha)

  const { commands } = await import('../apps/bot/dist/commands/index.js')
  const { effectiveCommands } = await import('../apps/bot/dist/services/menu-registry.js')
  const effective = effectiveCommands()
  const tokens = new Set(effective.flatMap((row) => row.tokens))

  for (const expected of ['menu', 'help', 'comandos', 'privategift', 'privategrant', 'botsticker', 'kicksticker', 'waifu', 'rw', 'wsearch', 'winfo', 'wimage', 'ainfo', 'alist', 'ytmp3', 'ytmp4', 'facebook']) {
    assert.equal(tokens.has(expected), true, `missing effective command token: ${expected}`)
  }

  const menuOwner = effective.find((row) => row.tokens.includes('menu'))?.command
  assert.equal(menuOwner?.description.includes('todos los comandos'), true)
  const waifuOwner = effective.find((row) => row.tokens.includes('rw'))?.command
  assert.equal(waifuOwner?.description.includes('AniList'), true)
  assert.ok(commands.length > 100)

  console.log(`V5 smoke validation passed · ${effective.length} effective commands · ${tokens.size} command tokens`)
} finally {
  await rm(temp, { recursive: true, force: true })
}
