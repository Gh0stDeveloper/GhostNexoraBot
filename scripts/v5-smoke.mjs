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

  for (const expected of [
    'menu', 'help', 'comandos', 'privategift', 'privategrant', 'botsticker', 'kicksticker',
    'waifu', 'rw', 'wsearch', 'winfo', 'wimage', 'ainfo', 'alist', 'ytmp3', 'ytmp4', 'facebook',
    'minershop', 'minertienda', 'minerbuy', 'comprarminero', 'joblicense', 'comprartitulo', 'jobrequirements',
    'adultgif', 'reactiongif', 'adultmedia',
    'mc', 'minecraft', 'mchelp', 'mcseed', 'mcstronghold', 'mcbioma', 'mcanchor', 'mcstruct',
    'mcskin', 'mccape', 'mcplayer', 'mcperfil', 'mcjugador', 'mcgamertag', 'mcserver', 'mccraft', 'mcalert', 'mcprice',
    'styles', 'estilos', 'themes', 'botstyles', 'waifustyles', 'style', 'estilo', 'theme', 'botstyle',
  ]) {
    assert.equal(tokens.has(expected), true, `missing effective command token: ${expected}`)
  }

  const menuOwner = effective.find((row) => row.tokens.includes('menu'))?.command
  assert.equal(menuOwner?.description.includes('todos los comandos'), true)
  const waifuOwner = effective.find((row) => row.tokens.includes('rw'))?.command
  assert.equal(waifuOwner?.description.includes('AniList'), true)
  const minerShopOwner = effective.find((row) => row.tokens.includes('minershop'))?.command
  assert.equal(minerShopOwner?.description.includes('estilo visual activo'), true, 'minershop V13 style override is not effective')
  const shopOwner = effective.find((row) => row.tokens.includes('shop'))?.command
  assert.equal(shopOwner?.description.includes('estilo visual activo'), true, 'shop V13 style override is not effective')
  const adultGifOwner = effective.find((row) => row.tokens.includes('adultgif'))?.command
  assert.equal(adultGifOwner?.description.includes('carga/reproducción'), true, 'adultgif V11 override is not effective')
  const mcPlayerOwner = effective.find((row) => row.tokens.includes('mcplayer'))?.command
  assert.equal(mcPlayerOwner?.description.includes('Bedrock/Xbox'), true, 'Minecraft V12 profile override is not effective')
  const stylesOwner = effective.find((row) => row.tokens.includes('styles'))?.command
  assert.equal(stylesOwner?.description.includes('AniList'), true, 'styles V13 command is not effective')
  const styleOwner = effective.find((row) => row.tokens.includes('style'))?.command
  assert.equal(styleOwner?.description.includes('staff'), true, 'style command must allow staff-managed visual styles')

  const { normalizeMinecraftPlayerQuery } = await import('../apps/bot/dist/services/minecraft-profile-v12.js')
  assert.equal(normalizeMinecraftPlayerQuery('  JULIAN   AGZ  '), 'JULIAN AGZ')
  assert.equal(normalizeMinecraftPlayerQuery('Java_Player'), 'Java_Player')

  const {
    listBotVisualStyles,
    getBotVisualStyle,
    getCurrentBotVisualStyle,
    setCurrentBotVisualStyle,
  } = await import('../apps/bot/dist/services/bot-styles-v13.js')
  const styles = listBotVisualStyles()
  assert.equal(styles.length, 24)
  assert.equal(styles.length % 6, 0)
  assert.equal(getCurrentBotVisualStyle().id, 'default')
  assert.equal(getBotVisualStyle('megumi')?.id, 'megumin')
  assert.equal(getBotVisualStyle('tsukasa yusaki')?.id, 'tsukasa')
  assert.equal(getBotVisualStyle('zero 2')?.id, 'zerotwo')
  assert.equal(getBotVisualStyle('sakura')?.id, 'marin')
  assert.equal(setCurrentBotVisualStyle('megumi', 'ci@s.whatsapp.net').id, 'megumin')
  assert.equal(getCurrentBotVisualStyle().id, 'megumin')
  assert.equal(setCurrentBotVisualStyle('default', 'ci@s.whatsapp.net').id, 'default')

  assert.ok(commands.length > 100)

  // Suscripciones mineras: tres planes simultáneos deben contar como tres mineros activos.
  const minerUser = 'miner-ci@s.whatsapp.net'
  economy.balance(minerUser)
  economy.db.prepare('UPDATE economy_users SET wallet = 50000 WHERE user_jid = ?').run(minerUser)
  const { mining, MINER_SUBSCRIPTION_PLANS } = await import('../apps/bot/dist/services/mining.js')
  assert.deepEqual(Object.keys(MINER_SUBSCRIPTION_PLANS), ['1d', '7d', '15d', '1m'])
  const bought = mining.purchaseSubscription(minerUser, '1d', 3)
  assert.equal(bought.quantity, 3)
  assert.equal(bought.count, 3)
  assert.equal(bought.subscriptionCount, 3)
  assert.equal(bought.totalPrice, MINER_SUBSCRIPTION_PLANS['1d'].price * 3)

  // Carreras: piloto se desbloquea con 3 mineros; médico con 10 dailys o 10,000 NXC.
  const { careerLicenses } = await import('../apps/bot/dist/services/career-licenses.js')
  const pilotBefore = careerLicenses.status(minerUser, 'pilot')
  assert.equal(pilotBefore.unlocked, true)
  assert.equal(pilotBefore.method, 'progress-ready')
  assert.equal(careerLicenses.choose(minerUser, 'pilot').id, 'pilot')

  const doctorUser = 'doctor-ci@s.whatsapp.net'
  economy.balance(doctorUser)
  let doctorStatus = careerLicenses.status(doctorUser, 'doctor')
  assert.equal(doctorStatus.unlocked, false)
  assert.equal(doctorStatus.price, 10000)
  const ledger = economy.db.prepare('INSERT INTO economy_ledger(user_jid, kind, amount, note, created_at) VALUES(?, ?, ?, ?, ?)')
  for (let i = 0; i < 10; i += 1) ledger.run(doctorUser, 'daily', 1, 'ci daily', Date.now() - i)
  doctorStatus = careerLicenses.status(doctorUser, 'doctor')
  assert.equal(doctorStatus.unlocked, true)
  assert.equal(careerLicenses.choose(doctorUser, 'doctor').id, 'doctor')

  const paidDoctor = 'paid-doctor-ci@s.whatsapp.net'
  economy.balance(paidDoctor)
  economy.db.prepare('UPDATE economy_users SET wallet = 20000 WHERE user_jid = ?').run(paidDoctor)
  const license = careerLicenses.buy(paidDoctor, 'doctor')
  assert.equal(license.price, 10000)
  assert.equal(license.method, 'purchase')
  assert.equal(economy.balance(paidDoctor).total, 10000)
  assert.equal(careerLicenses.choose(paidDoctor, 'doctor').id, 'doctor')

  console.log(`V5 smoke validation passed · ${effective.length} effective commands · ${tokens.size} command tokens`)
} finally {
  await rm(temp, { recursive: true, force: true })
}
