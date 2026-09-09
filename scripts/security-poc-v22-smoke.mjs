#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const temp = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-poc-v22-'))
process.env.DATA_DIR = temp
process.env.NEXORA_INSTANCE_ROLE = 'main'
delete process.env.NEXORA_GLOBAL_CONTROL_DB
delete process.env.NEXORA_SUBBOT_ID
delete process.env.EDIT_POC_ENABLED
delete process.env.EDIT_POC_CHAT_IDS

try {
  const poc = await import('../apps/bot/dist/services/security-poc-scope.js')

  const mainGroup = '120363000000000101@g.us'
  const subGroup = '120363000000000202@g.us'
  const sender = '5215550000000@s.whatsapp.net'

  assert.equal(poc.isPocChatAllowed(mainGroup), false, 'unknown groups must be denied by default')
  poc.addPocChat(mainGroup, 'Laboratorio Main', sender)
  assert.equal(poc.isPocChatAllowed(mainGroup), true, 'runtime add must authorize the test group immediately')
  assert.equal(poc.listPocChats().length, 1)
  assert.equal(poc.listPocChats()[0]?.chatId, mainGroup)
  assert.equal(poc.listPocChats()[0]?.label, 'Laboratorio Main')

  // Instance partitioning: switching to a subbot key must not inherit MainBot rows.
  process.env.NEXORA_SUBBOT_ID = '77'
  assert.equal(poc.isPocChatAllowed(mainGroup), false, 'subbot scope must not inherit MainBot PoC groups')
  poc.addPocChat(subGroup, 'Laboratorio Subbot', sender)
  assert.equal(poc.isPocChatAllowed(subGroup), true)
  assert.deepEqual(poc.listPocChats().map((row) => row.chatId), [subGroup])

  delete process.env.NEXORA_SUBBOT_ID
  assert.equal(poc.isPocChatAllowed(mainGroup), true, 'MainBot scope must still exist after subbot writes')
  assert.equal(poc.isPocChatAllowed(subGroup), false, 'MainBot must not see subbot PoC groups')

  // Direct edit PoC shape: target stanzaId must be reused as both edit.id and
  // sendMessage messageId option.
  const sent = []
  const relayed = []
  const fakeSocket = {
    async sendMessage(chatId, content, options) {
      sent.push({ chatId, content, options })
      return { key: { id: 'BOT_RESULT' } }
    },
    async relayMessage(chatId, content, options) {
      relayed.push({ chatId, content, options })
    },
  }

  await poc.executeEditMessageIdPoc(fakeSocket, mainGroup, 'TARGET_EDIT_ID', 'texto editado')
  assert.equal(sent.length, 1)
  assert.equal(sent[0].chatId, mainGroup)
  assert.equal(sent[0].content.edit.id, 'TARGET_EDIT_ID')
  assert.equal(sent[0].options.messageId, 'TARGET_EDIT_ID')

  // EditAll is bounded and consumes one allowance per non-privileged message.
  const enabled = poc.enableEditAllPoc(mainGroup, 'V22 collision test', sender)
  assert.equal(enabled.enabled, true)
  assert.equal(enabled.remaining, 20)
  assert.ok(enabled.expiresAt > Date.now())

  const incoming = {
    key: {
      remoteJid: mainGroup,
      participant: '5215551112222@s.whatsapp.net',
      fromMe: false,
      id: 'TARGET_COLLISION_ID',
    },
    message: { conversation: 'original' },
  }

  const executed = await poc.maybeRunEditAllPoc(fakeSocket, incoming, false)
  assert.equal(executed, true, 'active editall must execute on an ordinary test message')
  assert.equal(relayed.length, 1)
  assert.equal(relayed[0].chatId, mainGroup)
  assert.equal(relayed[0].content.extendedTextMessage.text, 'V22 collision test')
  assert.equal(relayed[0].options.messageId, 'TARGET_COLLISION_ID')
  assert.equal(poc.getEditAllPocStatus(mainGroup).remaining, 19)

  const beforePrivileged = relayed.length
  const ignored = await poc.maybeRunEditAllPoc(fakeSocket, {
    ...incoming,
    key: { ...incoming.key, id: 'PRIVILEGED_ID' },
  }, true)
  assert.equal(ignored, false, 'owner/staff messages must be excluded from EditAll')
  assert.equal(relayed.length, beforePrivileged)
  assert.equal(poc.getEditAllPocStatus(mainGroup).remaining, 19, 'privileged messages must not consume the cap')

  poc.disableEditAllPoc(mainGroup, sender)
  assert.equal(poc.getEditAllPocStatus(mainGroup).enabled, false)

  assert.equal(poc.removePocChat(mainGroup), true)
  assert.equal(poc.isPocChatAllowed(mainGroup), false, 'remove must revoke PoC scope immediately')

  process.env.NEXORA_SUBBOT_ID = '77'
  assert.equal(poc.removePocChat(subGroup), true)
  assert.equal(poc.listPocChats().length, 0)

  console.log('V22 command-managed PoC scope, isolation and messageId collision smoke: OK')
} finally {
  await rm(temp, { recursive: true, force: true })
}
