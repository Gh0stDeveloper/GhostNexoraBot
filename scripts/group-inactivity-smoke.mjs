#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const temp = mkdtempSync(path.join(os.tmpdir(), 'ghostnexora-group-inactive-'))
const dataDir = path.join(temp, 'data')
Object.assign(process.env, {
  ENV_FILE: path.join(temp, 'missing.env'),
  DATA_DIR: dataDir,
  SESSION_DIR: path.join(dataDir, 'session'),
  OWNER_NUMBERS: '5215550000001',
  ADMIN_WEB_TOKEN: 'group-inactivity-smoke-token',
  OLLAMA_ENABLED: 'false',
  WEB_ENABLED: 'false',
})

try {
  const { economy } = await import('../apps/bot/dist/services/economy.js')
  const { observeGroupActivity } = await import('../apps/bot/dist/services/progression-v4.js')
  const { groupInactivityReport, normalizeInactiveDays } = await import('../apps/bot/dist/services/group-inactivity.js')
  const { commands } = await import('../apps/bot/dist/commands/index.js')

  const group = '120363999999999999@g.us'
  const inactive = '5215550000010@s.whatsapp.net'
  const active = '5215550000011@s.whatsapp.net'
  const unknown = '5215550000012@s.whatsapp.net'
  const admin = '5215550000013@s.whatsapp.net'
  const owner = '5215550000001@s.whatsapp.net'
  const staff = '5215550000014@s.whatsapp.net'
  const subbotOwner = '5215550000015@s.whatsapp.net'
  const bot = '5215550000099@s.whatsapp.net'
  const old = Date.now() - 45 * 86_400_000

  for (const jid of [inactive, active, admin, owner, staff, subbotOwner, bot]) {
    observeGroupActivity(group, jid, true, false)
  }
  economy.db.prepare('UPDATE group_user_activity_v4 SET last_activity_at = ? WHERE group_jid = ? AND user_jid != ?')
    .run(old, group, active)

  const participants = [
    { id: inactive },
    { id: active },
    { id: unknown },
    { id: admin, admin: 'admin' },
    { id: owner },
    { id: staff },
    { id: subbotOwner },
    { id: bot },
  ]

  assert.equal(normalizeInactiveDays(undefined), 30)
  assert.equal(normalizeInactiveDays('45d'), 45)
  assert.throws(() => normalizeInactiveDays('0'))

  const report = groupInactivityReport(group, participants, 30, {
    protectedJids: [bot, subbotOwner],
    protectedNumbers: ['5215550000001', '5215550000014'],
  })
  assert.deepEqual(report.inactive.map((item) => item.userJid), [inactive])
  assert.equal(report.activeCount, 1)
  assert.equal(report.unknown.length, 1)
  assert.equal(report.unknown[0]?.userJid, unknown)
  assert.equal(report.protectedCount, 5)
  assert.ok(report.inactive[0].inactiveDays >= 44)

  const listCommand = [...commands].reverse().find((command) => command.name === 'inactivos')
  const kickCommand = [...commands].reverse().find((command) => command.name === 'expulsarinactivos')
  assert.ok(listCommand, '.inactivos is not registered')
  assert.ok(kickCommand, '.expulsarinactivos is not registered')
  assert.equal(listCommand.groupOnly, true)
  assert.equal(listCommand.adminOnly, true)
  assert.notEqual(listCommand.botAdminOnly, true, 'listing should not require the bot to be admin')
  assert.equal(kickCommand.groupOnly, true)
  assert.equal(kickCommand.adminOnly, true)
  assert.equal(kickCommand.botAdminOnly, true)

  const sent = []
  const removals = []
  const socket = {
    user: { id: bot },
    groupMetadata: async () => ({ subject: 'Grupo CI', participants }),
    sendMessage: async (_jid, content) => { sent.push(content); return {} },
    groupParticipantsUpdate: async (_jid, targets, action) => {
      removals.push({ targets: [...targets], action })
      return targets.map((target) => ({ status: '200', jid: target }))
    },
  }
  const settings = {
    botAdmins: ['5215550000014'],
    botDisplayName: 'Ghost Nexora Bot',
  }
  const baseCtx = {
    socket,
    message: { key: { remoteJid: group, id: 'smoke-message' }, message: { conversation: '.inactivos 30' } },
    chatId: group,
    sender: owner,
    pushName: 'Owner',
    commandName: 'inactivos',
    args: ['30'],
    argText: '30',
    prefix: '.',
    settings,
    locale: 'es',
    t: (key) => key,
    isOwner: true,
    isBotStaff: true,
    isGroup: true,
    isSubbotOwner: false,
    instanceOwnerJid: subbotOwner,
    reply: async (text) => { sent.push({ text }); return {} },
    react: async () => ({}),
  }

  await listCommand.handler(baseCtx)
  assert.equal(removals.length, 0, 'listing inactive users must never remove anyone')
  assert.ok(sent.some((content) => String(content?.text ?? '').includes('USUARIOS INACTIVOS')))
  assert.ok(sent.some((content) => String(content?.text ?? '').includes('Sin historial')))

  await kickCommand.handler({ ...baseCtx, commandName: 'expulsarinactivos' })
  assert.equal(removals.length, 1)
  assert.equal(removals[0].action, 'remove')
  assert.deepEqual(removals[0].targets, [inactive])
  assert.ok(!removals[0].targets.includes(unknown))
  assert.ok(!removals[0].targets.includes(admin))
  assert.ok(!removals[0].targets.includes(owner))
  assert.ok(!removals[0].targets.includes(staff))
  assert.ok(!removals[0].targets.includes(subbotOwner))
  assert.ok(!removals[0].targets.includes(bot))

  console.log('group inactivity smoke: OK')
} finally {
  rmSync(temp, { recursive: true, force: true })
}
