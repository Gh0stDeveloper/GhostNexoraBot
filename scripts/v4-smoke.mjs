import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const temp = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-v4-smoke-'))
process.env.DATA_DIR = temp
process.env.ADMIN_WEB_TOKEN = 'ci-smoke-admin-token-123456'

try {
  const { economy } = await import('../apps/bot/dist/services/economy.js')
  await import('../apps/bot/dist/services/identity.js')
  await import('../apps/bot/dist/services/work-compat-v4.js')
  const progression = await import('../apps/bot/dist/services/progression-v4.js')
  const world = await import('../apps/bot/dist/services/world-v4.js')
  const automation = await import('../apps/bot/dist/services/automation-v4.js')

  const alice = '5211111111111@s.whatsapp.net'
  const bob = '5212222222222@s.whatsapp.net'
  const group = '120363000000000000@g.us'

  world.credit(alice, 1_000_000, 'smoke_seed')
  world.credit(bob, 100_000, 'smoke_seed')

  const clan = world.createClan(alice, 'Smoke Guild')
  assert.equal(clan.name, 'Smoke Guild')
  const joined = world.joinClan(bob, clan.code)
  assert.equal(joined.id, clan.id)
  const donated = world.donateClan(bob, 1000)
  assert.equal(donated.treasury, 1000)

  const property = world.buyAsset(alice, 'house', 'property')
  assert.equal(property.label, 'Casa')
  assert.equal(world.assets(alice, 'property').some((item) => item.itemId === 'house'), true)

  const petId = world.adoptPet(alice, 'dragon', 'Nexo')
  assert.ok(petId > 0)
  assert.equal(world.pets(alice)[0]?.name, 'Nexo')

  economy.db.prepare(`INSERT INTO user_items_v4(user_jid, item_id, kind, quantity, updated_at)
    VALUES(?, 'wood', 'resource', 10, ?)
    ON CONFLICT(user_jid, item_id) DO UPDATE SET quantity = 10`).run(alice, Date.now())
  const listingId = world.createListing(alice, 'wood', 2, 500)
  const purchase = world.buyListing(bob, listingId)
  assert.equal(purchase.itemId, 'wood')
  assert.equal(world.inventory(bob).find((item) => item.itemId === 'wood')?.quantity, 2)

  progression.observeGroupActivity(group, alice, true, true)
  progression.observeGroupActivity(group, bob, true, false)
  const stats = progression.groupStats(group)
  assert.equal(stats.messages, 2)
  assert.equal(stats.commands, 1)
  assert.equal(stats.uniqueUsers, 2)

  const rep = progression.addReputation(alice, bob, 1, 'smoke')
  assert.equal(rep.score, 1)
  assert.equal(progression.reputation(bob).score, 1)

  const raid = world.startRaid(group, alice)
  assert.ok(raid.hp > 0)
  world.joinRaid(group, bob)
  const attack = world.raidAttack(group, alice)
  assert.equal(attack.ok, true)
  assert.equal(world.raidMembers(raid.id).length, 2)

  const season = progression.currentSeason(10)
  assert.ok(season.key)
  assert.ok(Array.isArray(season.rankings))

  economy.db.prepare(`INSERT INTO economy_ledger(user_jid, kind, amount, note, created_at)
    VALUES(?, 'work_v2', 123, 'smoke work', ?)`).run(alice, Date.now())
  const marker = economy.db.prepare("SELECT COUNT(*) as count FROM economy_ledger WHERE user_jid = ? AND kind = 'work' AND amount = 0 AND note LIKE 'v4_work_marker:%'").get(alice)
  assert.equal(Number(marker.count), 1)

  const ticketId = automation.openTicket(alice, group, 'Smoke ticket', 'Necesito ayuda')
  automation.replyTicket(ticketId, bob, 'staff', 'Respuesta de prueba')
  assert.equal(automation.ticket(ticketId)?.messages.length, 2)
  automation.closeTicket(ticketId, alice)
  assert.equal(automation.ticket(ticketId)?.status, 'closed')

  const announcementId = automation.addAnnouncement(group, alice, 'Anuncio smoke', 5 * 60_000)
  assert.ok(announcementId > 0)
  assert.equal(automation.listAnnouncements(group).length, 1)

  const pollId = automation.recordPoll(group, alice, 'message-smoke', '¿Funciona?', ['Sí', 'No'], 1)
  assert.ok(pollId > 0)
  assert.equal(automation.listPolls(group).length, 1)

  const profile = progression.progressionProfile(alice)
  assert.equal(profile.userJid, alice)

  console.log('V4 smoke validation passed')
} finally {
  await rm(temp, { recursive: true, force: true })
}
