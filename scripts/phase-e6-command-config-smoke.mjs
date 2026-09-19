import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const temp = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-e6-'))
process.env.DATA_DIR = temp
process.env.NEXORA_INSTANCE_ROLE = 'main'
delete process.env.NEXORA_SUBBOT_ID
delete process.env.NEXORA_GLOBAL_CONTROL_DB

try {
  const { performanceAudit } = await import('../apps/bot/dist/services/performance-audit.js')
  const runtimeConfig = await import('../apps/bot/dist/services/command-runtime-config.js')
  const { opsDb } = await import('../apps/bot/dist/services/ops-database.js')
  const { telegramCommandAliases } = await import('../apps/bot/dist/services/command-platform-support.js')

  const menu = { name: 'menu', aliases: ['help', 'comandos'], category: 'general', description: 'Menu' }
  const ping = { name: 'ping', aliases: ['p'], category: 'general', description: 'Ping' }
  const owner = { name: 'ownerci', aliases: [], category: 'owner', description: 'Owner CI' }

  performanceAudit.registerCommands([menu, ping, owner], 'main')
  performanceAudit.registerCommands([menu, ping], 'subbot:55')

  assert.equal(runtimeConfig.resolveConfiguredCommandName('help', 'main'), 'menu', 'aliases must resolve to the canonical command')
  assert.equal(telegramCommandAliases.get('start'), 'help', 'Telegram /start must inherit the canonical menu policy')

  const decide = (overrides = {}) => runtimeConfig.commandRuntimeDecision({
    commandName: 'ping',
    category: 'general',
    platform: 'whatsapp',
    isGroup: true,
    userId: 'user:e6',
    instanceKey: 'main',
    ...overrides,
  })

  assert.equal(decide().allowed, true, 'commands must remain enabled by default')

  opsDb.prepare(`INSERT INTO ops_command_settings(
      instance_key, command_name, enabled, whatsapp, discord, telegram, cooldown_ms,
      allow_groups, allow_private, permission_mode, updated_at
    ) VALUES('main', 'ping', 0, 1, 1, 1, 0, 1, 1, 'inherit', ?)`).run(Date.now())
  assert.equal(decide().reason, 'disabled')
  assert.equal(runtimeConfig.commandRuntimeDecision({
    commandName: 'ping', category: 'general', platform: 'whatsapp', isGroup: true,
    userId: 'sub-user', instanceKey: 'subbot:55',
  }).allowed, true, 'MainBot command configuration must not leak into a subbot')

  opsDb.prepare(`UPDATE ops_command_settings SET enabled = 1, whatsapp = 0 WHERE instance_key = 'main' AND command_name = 'ping'`).run()
  assert.equal(decide().reason, 'platform_disabled')
  assert.equal(decide({ platform: 'discord' }).allowed, true)

  opsDb.prepare(`UPDATE ops_command_settings SET whatsapp = 1, allow_groups = 0 WHERE instance_key = 'main' AND command_name = 'ping'`).run()
  assert.equal(decide().reason, 'groups_disabled')
  assert.equal(decide({ isGroup: false }).allowed, true)

  opsDb.prepare(`UPDATE ops_command_settings SET allow_groups = 1, allow_private = 0 WHERE instance_key = 'main' AND command_name = 'ping'`).run()
  assert.equal(decide({ isGroup: false }).reason, 'private_disabled')

  opsDb.prepare(`UPDATE ops_command_settings SET allow_private = 1, permission_mode = 'staff' WHERE instance_key = 'main' AND command_name = 'ping'`).run()
  assert.equal(decide().reason, 'permission')
  assert.equal(decide({ isStaff: true }).allowed, true, 'staff restriction must allow staff')
  assert.equal(decide({ isOwner: true }).allowed, true, 'staff restriction must allow owner')

  opsDb.prepare(`UPDATE ops_command_settings SET permission_mode = 'owner' WHERE instance_key = 'main' AND command_name = 'ping'`).run()
  assert.equal(decide({ isStaff: true }).reason, 'permission', 'owner mode must not be weakened to staff')
  assert.equal(decide({ isOwner: true }).allowed, true)
  assert.equal(decide({ isSubbotOwner: true }).allowed, true, 'subbot owner is owner of its isolated instance')

  opsDb.prepare(`UPDATE ops_command_settings SET permission_mode = 'inherit', cooldown_ms = 60000 WHERE instance_key = 'main' AND command_name = 'ping'`).run()
  runtimeConfig.markCommandCooldown('whatsapp', 'p', 'user:e6', 'main')
  const cooled = decide()
  assert.equal(cooled.reason, 'cooldown')
  assert.ok(cooled.remainingMs > 0)
  assert.equal(decide({ checkCooldown: false }).allowed, true, 'menus/search must be able to ignore transient cooldown state')
  assert.equal(decide({ isStaff: true }).allowed, true, 'staff must bypass the extra E6 cooldown')

  opsDb.prepare(`INSERT INTO ops_command_category_settings(instance_key, category, enabled, updated_at)
    VALUES('main', 'general', 0, ?)`).run(Date.now())
  assert.equal(decide({ checkCooldown: false }).reason, 'category_disabled')
  assert.equal(runtimeConfig.commandRuntimeDecision({
    commandName: 'ping', category: 'general', platform: 'whatsapp', isGroup: true,
    userId: 'sub-user', instanceKey: 'subbot:55', checkCooldown: false,
  }).allowed, true, 'category configuration must remain isolated by instance')

  const [
    roadmap,
    router,
    discord,
    telegram,
    menuSource,
    searchSource,
    webRoute,
    webSecurity,
    webOps,
    commandCenter,
    adminPage,
    subbotPage,
    subbots,
    webI18n,
  ] = await Promise.all([
    readFile(new URL('../README_NEXT_INTEGRATIONS.md', import.meta.url), 'utf8'),
    readFile(new URL('../apps/bot/src/core/router.ts', import.meta.url), 'utf8'),
    readFile(new URL('../apps/bot/src/platform/discord/router.ts', import.meta.url), 'utf8'),
    readFile(new URL('../apps/bot/src/platform/telegram/router.ts', import.meta.url), 'utf8'),
    readFile(new URL('../apps/bot/src/commands/menu-v5.ts', import.meta.url), 'utf8'),
    readFile(new URL('../apps/bot/src/commands/command-search.ts', import.meta.url), 'utf8'),
    readFile(new URL('../apps/web/app/api/control/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../apps/web/lib/web-security.ts', import.meta.url), 'utf8'),
    readFile(new URL('../apps/web/lib/ops.ts', import.meta.url), 'utf8'),
    readFile(new URL('../apps/web/components/command-center.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../apps/web/app/admin/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../apps/web/app/subbot/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../apps/bot/src/core/subbots.ts', import.meta.url), 'utf8'),
    readFile(new URL('../apps/web/lib/i18n.ts', import.meta.url), 'utf8'),
  ])

  assert.match(roadmap, /## E6\. Editor de configuración de comandos[\s\S]*Estado: (?:EN PROGRESO|TERMINADO)/, 'E6 roadmap must track active/completed implementation')

  for (const [label, source] of [['WhatsApp', router], ['Discord', discord], ['Telegram', telegram]]) {
    assert.match(source, /commandRuntimeDecision/, `${label} router must enforce E6 settings`)
    assert.match(source, /markCommandCooldown/, `${label} router must enforce E6 cooldowns`)
  }

  assert.match(menuSource, /commandRuntimeDecision/, 'WhatsApp menu must honor E6 runtime visibility')
  assert.match(menuSource, /checkCooldown: false/, 'WhatsApp menu must not hide commands only because a user is cooling down')
  assert.match(searchSource, /commandRuntimeDecision/, 'Command search must honor E6 runtime visibility')
  assert.match(searchSource, /checkCooldown: false/, 'Command search must ignore transient cooldown state')

  assert.match(webRoute, /'save_command_config'/, 'Web control must save per-command E6 settings')
  assert.match(webRoute, /'reset_command_config'/, 'Web control must reset per-command E6 settings')
  assert.match(webRoute, /'set_command_category'/, 'Web control must configure E6 categories')
  assert.match(webRoute, /'commands:manage'/, 'E6 writes must require the command management permission')
  assert.match(webRoute, /session\.role === 'subbot'/, 'Subbot Web mutations must remain forced to their own instance')
  assert.match(webRoute, /role === 'admin' && String\(command\.category\) === 'owner'/, 'Admin must not edit owner-category commands')
  assert.match(webRoute, /Boolean\(command\.discord\) && bool\(payload\.discord/, 'Web editor must not enable unsupported Discord commands')
  assert.match(webRoute, /Math\.min\(86_400_000/, 'Web editor must bound configurable cooldowns')

  assert.match(webSecurity, /\| 'commands:view'/, 'Command view permission missing')
  assert.match(webSecurity, /\| 'commands:manage'/, 'Command manage permission missing')
  assert.match(webSecurity, /support: new Set<WebPermission>\(\[[\s\S]*'commands:view'/, 'Support must retain command read access')
  assert.doesNotMatch(webSecurity.match(/support: new Set<WebPermission>\(\[[\s\S]*?\]\),/)?.[0] ?? '', /'commands:manage'/, 'Support must not receive E6 write permission')

  assert.match(webOps, /commandCategories: OpsCommandCategory\[]/, 'Web snapshot must expose command category state')
  assert.match(webOps, /cooldownMs: number/, 'Web snapshot must expose command cooldown')
  assert.match(webOps, /permissionMode: 'inherit' \| 'staff' \| 'owner'/, 'Web snapshot must expose E6 permission mode')

  assert.match(commandCenter, /name="enabled"/, 'E6 editor enabled control missing')
  assert.match(commandCenter, /name="whatsapp"/, 'E6 editor WhatsApp control missing')
  assert.match(commandCenter, /name="discord"/, 'E6 editor Discord control missing')
  assert.match(commandCenter, /name="telegram"/, 'E6 editor Telegram control missing')
  assert.match(commandCenter, /name="cooldownMs"/, 'E6 editor cooldown control missing')
  assert.match(commandCenter, /name="allowGroups"/, 'E6 editor groups control missing')
  assert.match(commandCenter, /name="allowPrivate"/, 'E6 editor private control missing')
  assert.match(commandCenter, /name="permissionMode"/, 'E6 editor permission control missing')
  assert.match(commandCenter, /set_command_category/, 'E6 category controls missing')
  assert.match(commandCenter, /key=\{selected\.commandName\}/, 'Changing selected command must remount uncontrolled editor fields')

  assert.match(adminPage, /canManageCommands = hasPermission\(role, 'commands:manage'\)/, 'Admin must derive E6 write capability from backend role permissions')
  assert.match(adminPage, /canManageOwnerCommands=\{role === 'owner'\}/, 'Only Owner may edit owner-category commands in Admin')
  assert.match(subbotPage, /instanceKey=\{instanceKey\}/, 'Subbot E6 editor must use its isolated instance key')
  assert.match(subbotPage, /canManageOwnerCommands/, 'Subbot owner must manage commands available to its own instance')

  assert.match(subbots, /deleteInstanceRows\('ops_command_settings'\)/, 'Permanent subbot deletion must clean E6 command settings')
  assert.match(subbots, /deleteInstanceRows\('ops_command_cooldowns'\)/, 'Permanent subbot deletion must clean E6 cooldown rows')
  assert.match(webI18n, /'commands\.permissionHelp'/, 'E6 permission safety copy missing')

  console.log('Phase E6 command configuration smoke passed')
} finally {
  await rm(temp, { recursive: true, force: true })
}
