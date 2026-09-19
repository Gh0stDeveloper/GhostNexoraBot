#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = process.cwd()
const temp = mkdtempSync(path.join(os.tmpdir(), 'ghostnexora-adult-access-'))
const dataDir = path.join(temp, 'data')
mkdirSync(dataDir, { recursive: true })

Object.assign(process.env, {
  ENV_FILE: path.join(temp, 'missing.env'),
  DATA_DIR: dataDir,
  SESSION_DIR: path.join(dataDir, 'session'),
  NEXORA_GLOBAL_CONTROL_DB: path.join(temp, 'control.sqlite'),
  NEXORA_GLOBAL_ECONOMY_DB: path.join(temp, 'economy.sqlite'),
  NEXORA_INSTANCE_ROLE: 'main',
  OWNER_NUMBERS: '',
  ADMIN_WEB_TOKEN: 'adult-access-smoke',
  OLLAMA_ENABLED: 'false',
  WEB_ENABLED: 'false',
})

try {
  const runtime = await import('../apps/bot/dist/services/command-runtime-config.js')
  const { opsDb } = await import('../apps/bot/dist/services/ops-database.js')

  const insert = opsDb.prepare(`INSERT INTO ops_command_settings(
      instance_key, command_name, enabled, whatsapp, discord, telegram, cooldown_ms,
      allow_groups, allow_private, permission_mode, updated_at
    ) VALUES('main', ?, 1, 1, 1, 1, 0, 1, 1, ?, ?)`)

  insert.run('fuck', 'owner', Date.now())
  const adultConfig = runtime.getCommandRuntimeConfig('fuck', 'adult', 'main')
  assert.equal(adultConfig.permissionMode, 'inherit', 'adult user commands must ignore stale Owner-only runtime permission')

  const adultDecision = runtime.commandRuntimeDecision({
    commandName: 'fuck',
    category: 'adult',
    platform: 'whatsapp',
    isGroup: true,
    userId: '5215550000001@s.whatsapp.net',
    isOwner: false,
    isStaff: false,
    isSubbotOwner: false,
    instanceKey: 'main',
  })
  assert.equal(adultDecision.allowed, true, 'regular adult command user must not be blocked as Owner-only')

  insert.run('normaltool', 'owner', Date.now())
  const normalDecision = runtime.commandRuntimeDecision({
    commandName: 'normaltool',
    category: 'tools',
    platform: 'whatsapp',
    isGroup: true,
    userId: '5215550000002@s.whatsapp.net',
    isOwner: false,
    isStaff: false,
    isSubbotOwner: false,
    instanceKey: 'main',
  })
  assert.equal(normalDecision.allowed, false, 'Owner-only runtime permission must still apply outside adult category')
  assert.equal(normalDecision.reason, 'permission')

  const router = readFileSync(path.join(root, 'apps/bot/src/core/router.ts'), 'utf8')
  const roleplay = readFileSync(path.join(root, 'apps/bot/src/commands/adult-roleplay-v8.ts'), 'utf8')
  const registry = readFileSync(path.join(root, 'apps/bot/src/commands/index.ts'), 'utf8')
  const adultMode = readFileSync(path.join(root, 'apps/bot/src/commands/group-adult-mode.ts'), 'utf8')

  assert.match(router, /adultConsentBootstrapCommands = new Set\(\['adult18'\]\)/, 'adult18 must remain available as consent bootstrap')
  assert.match(router, /candidate\.category === 'adult'[\s\S]*economy\.getGroupPolicy\(chatId\)\.adultAllowed/, 'adultmode must be authoritative for regular members through the B2 authorization hook')
  assert.match(roleplay, /name: 'dick'/, 'dick command missing')
  assert.match(roleplay, /name: 'fuck'/, 'fuck command missing')
  assert.match(roleplay, /name: 'cum'/, 'cum command missing')
  assert.match(roleplay, /name: 'preñar'/, 'preñar command missing')
  assert.match(roleplay, /category: 'adult' as const/, 'adult roleplay commands must remain in adult category')
  assert.doesNotMatch(roleplay, /name: def\.name,[\s\S]{0,220}ownerOnly:\s*true/, 'adult roleplay user commands must not be ownerOnly')
  assert.doesNotMatch(roleplay, /name: def\.name,[\s\S]{0,220}staffOnly:\s*true/, 'adult roleplay user commands must not be staffOnly')
  assert.match(registry, /adultRoleplayV8Commands/, 'adult roleplay V8 commands must remain registered')
  assert.match(adultMode, /setGroupCategoryOverride\(ctx\.chatId, 'adult', enabled \? 'allow' : 'deny'\)/, 'adultmode must synchronize command policy')

  console.log('Adult regular-user access smoke passed')
} finally {
  rmSync(temp, { recursive: true, force: true })
}
