#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const temp = mkdtempSync(path.join(os.tmpdir(), 'ghostnexora-private-policy-'))
const dataDir = path.join(temp, 'data')

Object.assign(process.env, {
  ENV_FILE: path.join(temp, 'missing.env'),
  DATA_DIR: dataDir,
  SESSION_DIR: path.join(dataDir, 'session'),
  OWNER_NUMBERS: '5211111111111',
  ADMIN_WEB_TOKEN: 'private-policy-smoke-token',
  OLLAMA_ENABLED: 'false',
  WEB_ENABLED: 'false',
})

try {
  const policy = await import('../apps/bot/dist/services/private-chat-policy.js')

  const message = (remoteJid, senderJid, fromMe = false) => ({
    key: {
      remoteJid,
      participant: senderJid,
      fromMe,
      id: 'smoke',
    },
    message: { conversation: '.ping' },
  })

  const regular = '5212222222222@s.whatsapp.net'
  const mainOwner = '5211111111111@s.whatsapp.net'
  const subbotOwner = '5213333333333@s.whatsapp.net'
  const group = '120363000000@g.us'

  assert.equal(policy.canProcessPrivateMessage(message(group, regular)), true, 'groups must remain enabled')
  assert.equal(policy.canProcessPrivateMessage(message(regular, regular)), false, 'regular private user must be silently blocked')
  assert.equal(policy.canProcessPrivateMessage(message(mainOwner, mainOwner)), true, 'MainBot owner must be allowed')
  assert.equal(policy.canSendToChatJid(group), true, 'group sends must remain enabled')
  assert.equal(policy.canSendToChatJid(regular), false, 'outbound MainBot private send must be blocked by default')
  assert.equal(policy.canSendToChatJid(mainOwner), true, 'outbound MainBot owner send must be allowed')

  policy.allowPrivateChat(regular, mainOwner)
  assert.equal(policy.isPrivateChatApproved(regular), true, 'allowlist grant was not persisted')
  assert.equal(policy.canProcessPrivateMessage(message(regular, regular)), true, 'approved MainBot private user must be allowed')
  assert.equal(policy.canSendToChatJid(regular), true, 'approved MainBot private outbound send must be allowed')
  policy.denyPrivateChat(regular)
  assert.equal(policy.canProcessPrivateMessage(message(regular, regular)), false, 'revoked MainBot private user must be blocked again')
  assert.equal(policy.canSendToChatJid(regular), false, 'revoked MainBot private outbound send must be blocked again')

  assert.equal(policy.canProcessPrivateMessage(message(subbotOwner, subbotOwner), subbotOwner), true, 'subbot owner must be allowed')
  assert.equal(policy.canProcessPrivateMessage(message(mainOwner, mainOwner), subbotOwner), false, 'global MainBot owner must not bypass a different subbot owner policy')
  assert.equal(policy.canProcessPrivateMessage(message(regular, regular), subbotOwner), false, 'unapproved subbot private user must be blocked')
  assert.equal(policy.canSendToChatJid(subbotOwner, subbotOwner), true, 'subbot owner outbound send must be allowed')
  assert.equal(policy.canSendToChatJid(mainOwner, subbotOwner), false, 'MainBot owner must not bypass subbot outbound firewall')
  assert.equal(policy.canSendToChatJid(regular, subbotOwner), false, 'unapproved subbot outbound send must be blocked')

  const guardedSources = [
    'apps/bot/src/index.ts',
    'apps/bot/src/termux-lite.ts',
    'apps/bot/src/subbot-worker.ts',
    'apps/bot/src/subbot-worker-termux.ts',
  ]
  for (const file of guardedSources) {
    const source = readFileSync(file, 'utf8')
    const guard = source.indexOf('canProcessPrivateMessage(')
    const identity = source.indexOf('observeMessageIdentity(')
    assert.ok(guard >= 0, `${file} is missing the private gate`)
    assert.ok(identity < 0 || guard < identity, `${file} must gate private traffic before identity/moderation routing`)
  }

  const router = readFileSync('apps/bot/src/core/router.ts', 'utf8')
  assert.ok(router.includes('if (!canProcessPrivateMessage(message, this.options.instanceOwnerJid)) return true'), 'router must silently consume unauthorized private traffic')
  assert.ok(!router.includes("hasEntitlement(sender, 'private_access')"), 'purchased private_access must not bypass the router')
  assert.ok(!router.includes('privateStorefrontCommands'), 'private storefront bypass must be removed')

  const session = readFileSync('apps/bot/src/core/session.ts', 'utf8')
  assert.ok(session.includes('canSendToChatJid'), 'socket must enforce outbound private firewall')
  assert.ok(session.includes("NEXORA_SUBBOT_OWNER_JID"), 'outbound firewall must isolate each subbot owner')

  const store = readFileSync('apps/bot/src/commands/shop-style-v13.ts', 'utf8')
  assert.ok(!store.includes("id: 'private1d'"), 'private1d must not be sold')
  assert.ok(!store.includes("id: 'private7d'"), 'private7d must not be sold')
  assert.ok(!store.includes("id: 'private30d'"), 'private30d must not be sold')
  assert.ok(store.includes("id.startsWith('private')"), 'legacy private purchases must be explicitly rejected')

  const { commands } = await import('../apps/bot/dist/commands/index.js')
  const privateCommand = [...commands].reverse().find((command) => command.name === 'private')
  assert.ok(privateCommand, '.private owner allowlist command must be registered')
  assert.equal(privateCommand.subbotOwnerAllowed, true, '.private must be available to subbot owners')

  console.log('private chat policy smoke: OK')
} finally {
  rmSync(temp, { recursive: true, force: true })
}
