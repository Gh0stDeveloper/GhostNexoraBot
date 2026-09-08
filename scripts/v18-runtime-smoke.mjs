#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const temp = mkdtempSync(path.join(os.tmpdir(), 'ghostnexora-v18-'))
const dataDir = path.join(temp, 'data')
Object.assign(process.env, {
  ENV_FILE: path.join(temp, 'missing.env'),
  DATA_DIR: dataDir,
  SESSION_DIR: path.join(dataDir, 'session'),
  OWNER_NUMBERS: '5215550000001',
  ADMIN_WEB_TOKEN: 'v18-runtime-smoke-token',
  OLLAMA_ENABLED: 'false',
  WEB_ENABLED: 'false',
})
delete process.env.NEXORA_INSTANCE_ROLE
delete process.env.NEXORA_GLOBAL_CONTROL_DB

try {
  const { createSubbotMessageGate } = await import('../apps/bot/dist/services/subbot-message-gate.js')
  const gate = createSubbotMessageGate(120_000)
  const now = Date.now()
  const message = (id, timestamp = now, text = '.ping') => ({
    key: { id, remoteJid: '120363111111111111@g.us', participant: '5215551000001@s.whatsapp.net' },
    messageTimestamp: Math.floor(timestamp / 1000),
    message: { conversation: text },
  })
  assert.equal(gate.shouldHandle('notify', message('notify-1'), now), true)
  assert.equal(gate.shouldHandle('notify', message('notify-1'), now), false, 'duplicate notify must be ignored')
  assert.equal(gate.shouldHandle('append', message('append-live', now - 10_000), now), true, 'recent append must be treated as live')
  assert.equal(gate.shouldHandle('append', message('append-old', now - 10 * 60_000), now), false, 'historical append must not execute')
  assert.equal(gate.shouldHandle('history', message('history-1'), now), false)

  const { economy } = await import('../apps/bot/dist/services/economy.js')
  const { observeGroupActivity } = await import('../apps/bot/dist/services/progression-v4.js')
  const {
    getGroupInactivitySettings,
    groupInactivityReport,
    setGroupInactivitySettings,
  } = await import('../apps/bot/dist/services/group-inactivity.js')

  const group = '120363222222222222@g.us'
  const low = '5215552000001@s.whatsapp.net'
  const enough = '5215552000002@s.whatsapp.net'
  const stale = '5215552000003@s.whatsapp.net'
  for (let i = 0; i < 10; i += 1) observeGroupActivity(group, low, true, false)
  for (let i = 0; i < 11; i += 1) observeGroupActivity(group, enough, true, false)
  for (let i = 0; i < 20; i += 1) observeGroupActivity(group, stale, true, false)
  economy.db.prepare('UPDATE group_user_activity_v4 SET last_activity_at = ? WHERE group_jid = ? AND user_jid = ?')
    .run(now - 8 * 86_400_000, group, stale)

  assert.deepEqual(getGroupInactivitySettings(group), { days: 7, minMessages: 0 })
  assert.deepEqual(setGroupInactivitySettings(group, 7, 10), { days: 7, minMessages: 10 })
  assert.deepEqual(getGroupInactivitySettings(group), { days: 7, minMessages: 10 })

  const report = groupInactivityReport(group, [{ id: low }, { id: enough }, { id: stale }], 7, { minMessages: 10, now })
  const byJid = new Map(report.inactive.map((item) => [item.userJid, item]))
  assert.equal(byJid.get(low)?.reason, 'low_messages')
  assert.equal(byJid.get(stale)?.reason, 'last_activity')
  assert.equal(byJid.has(enough), false)
  assert.equal(report.activeCount, 1)

  const { premiumStickersV18 } = await import('../apps/bot/dist/services/premium-stickers-v18.js')
  const lottieMessage = {
    key: { id: 'LOTTIE-INPUT', remoteJid: group, participant: low },
    message: {
      lottieStickerMessage: {
        message: {
          stickerMessage: {
            url: 'https://mmg.whatsapp.net/v/t62.15575-24/test.enc?mms3=true',
            fileSha256: Buffer.from('lottie-file-sha'),
            fileEncSha256: Buffer.from('lottie-file-enc-sha'),
            mediaKey: Buffer.from('01234567890123456789012345678901'),
            mimetype: 'application/was',
            height: 512,
            width: 512,
            directPath: '/v/t62.15575-24/test.enc',
            fileLength: 142693,
            mediaKeyTimestamp: Math.floor(now / 1000),
            stickerSentTs: now,
            isAnimated: false,
            isAvatar: false,
            isAiSticker: false,
            isLottie: true,
            premium: 1,
            emojis: '😭 🥺 🦭',
          },
        },
      },
    },
  }
  assert.ok(premiumStickersV18.extract(lottieMessage), 'must detect lottieStickerMessage payload')
  const stored = premiumStickersV18.addFromMessage(lottieMessage, low, { packName: 'Reacciones', label: 'triste', triggers: ['triste', 'llorar'] })
  assert.ok(stored.id > 0)
  assert.equal(premiumStickersV18.packs()[0]?.packName, 'Reacciones')
  assert.equal(Number(premiumStickersV18.packs()[0]?.lottieCount), 1)

  const relays = []
  const fakeSocket = {
    user: { id: '5215552999999:1@s.whatsapp.net' },
    relayMessage: async (jid, content, options) => { relays.push({ jid, content, options }) },
  }
  await premiumStickersV18.sendById(fakeSocket, group, stored.id, lottieMessage)
  assert.equal(relays.length, 1)
  assert.equal(relays[0].jid, group)
  assert.ok(relays[0].options?.messageId)
  assert.ok(relays[0].content, 'generated relay content must exist')

  const { commands } = await import('../apps/bot/dist/commands/index.js')
  const latest = (name) => [...commands].reverse().find((command) => command.name === name)
  assert.ok(latest('inactividad'), '.inactividad must be registered')
  assert.ok(latest('inactivos'), '.inactivos V18 must be registered')
  assert.ok(latest('expulsarinactivos'), '.expulsarinactivos V18 must be registered')
  assert.ok(latest('lottiesticker'), '.lottiesticker must be registered')
  assert.equal(latest('botsticker')?.subbotOwnerAllowed, true, 'subbot owner must be allowed to manage instance stickers')
  assert.equal(latest('lottiesticker')?.subbotOwnerAllowed, true)

  const balanceSource = readFileSync(new URL('../apps/bot/src/commands/economy-ui-v18.ts', import.meta.url), 'utf8')
  assert.ok(balanceSource.includes("text: '🏦 Banco'"))
  assert.ok(balanceSource.includes("text: '⛏️ Minería'"))
  assert.ok(balanceSource.includes("text: '🛒 Comprar minero'"))
  assert.ok(balanceSource.includes("text: '💰 Cobrar'"))

  const workerSource = readFileSync(new URL('../apps/bot/src/subbot-worker.ts', import.meta.url), 'utf8')
  const termuxWorkerSource = readFileSync(new URL('../apps/bot/src/subbot-worker-termux.ts', import.meta.url), 'utf8')
  const routerSource = readFileSync(new URL('../apps/bot/src/core/router.ts', import.meta.url), 'utf8')
  for (const source of [workerSource, termuxWorkerSource]) {
    assert.ok(source.includes('createSubbotMessageGate'))
    assert.ok(source.includes('socketGeneration'))
    assert.ok(source.includes('recordSubbotMessage(subbotId)'))
    assert.ok(source.includes('messageGate.shouldHandle(type, message)'))
  }
  assert.ok(routerSource.includes('resolveStoredIdentity'), 'subbot owner matching must resolve LID/PN aliases')
  assert.ok(routerSource.includes('sameIdentity(sender, this.options.instanceOwnerJid)'))

  console.log('v18 runtime smoke: OK')
} finally {
  rmSync(temp, { recursive: true, force: true })
}
