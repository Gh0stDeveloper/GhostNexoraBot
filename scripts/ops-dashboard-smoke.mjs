import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'

const temp = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-ops-smoke-'))
process.env.DATA_DIR = temp
process.env.NEXORA_INSTANCE_ROLE = 'main'
delete process.env.NEXORA_GLOBAL_CONTROL_DB
delete process.env.NEXORA_SUBBOT_ID

try {
  const { performanceAudit, PIPELINE_STAGES } = await import('../apps/bot/dist/services/performance-audit.js')

  const fast = { name: 'fastci', category: 'tools', description: 'Fast CI command' }
  const slow = { name: 'slowci', category: 'tools', description: 'Slow CI command' }
  performanceAudit.registerCommands([fast, slow], 'main')
  performanceAudit.recordStage('01', 0.25, 'main')
  performanceAudit.recordStage('02', 1.5, 'main')
  performanceAudit.recordStage('06', 840, 'main')
  performanceAudit.recordCommand(fast, 45, true, 1024, 'main')
  performanceAudit.recordCommand(slow, 900, true, 8192, 'main')
  performanceAudit.recordCommand(slow, 1100, false, 4096, 'main')

  const main = performanceAudit.snapshot('main')
  assert.equal(main.stages.length, 7)
  assert.deepEqual(main.stages.map((stage) => stage.id), PIPELINE_STAGES.map((stage) => stage.id))
  assert.equal(main.summary.auditedCommands, 2)
  assert.equal(main.commands.find((row) => row.commandName === 'fastci')?.status, 'optimal')
  const slowRow = main.commands.find((row) => row.commandName === 'slowci')
  assert.ok(slowRow)
  assert.equal(slowRow.invocations, 2)
  assert.equal(slowRow.successes, 1)
  assert.equal(slowRow.failures, 1)
  assert.ok(slowRow.avgUs >= 1_000_000)
  assert.ok(['slow', 'critical'].includes(slowRow.status))
  assert.equal(main.stages.find((stage) => stage.id === '06')?.status, 'bottleneck')

  const subCommand = { name: 'subonly', category: 'groups', description: 'Subbot-only CI command' }
  performanceAudit.registerCommands([subCommand], 'subbot:77')
  performanceAudit.recordCommand(subCommand, 35, true, -2048, 'subbot:77')
  const sub = performanceAudit.snapshot('subbot:77')
  assert.equal(sub.summary.auditedCommands, 1)
  assert.equal(sub.commands[0]?.commandName, 'subonly')
  assert.equal(sub.commands.some((row) => row.commandName === 'slowci'), false, 'subbot telemetry must not leak MainBot commands')
  assert.equal(main.commands.some((row) => row.commandName === 'subonly'), false, 'MainBot telemetry must not leak subbot commands')

  performanceAudit.reset('subbot:77')
  const subReset = performanceAudit.snapshot('subbot:77')
  assert.equal(subReset.commands[0]?.invocations, 0, 'reset must preserve audit catalog but clear metrics')
  assert.equal(performanceAudit.snapshot('main').commands.find((row) => row.commandName === 'slowci')?.invocations, 2, 'subbot reset must not touch MainBot')

  const { recordProviderAttempt, readProviderHealth } = await import('../apps/bot/dist/services/provider-health.js')
  recordProviderAttempt('youtube', { ok: true, latencyMs: 120, instanceKey: 'main' })
  recordProviderAttempt('youtube', { ok: false, latencyMs: 220, errorCode: 'timeout', instanceKey: 'main' })
  recordProviderAttempt('tiktok', { ok: true, latencyMs: 80, instanceKey: 'subbot:77' })

  const mainProviderHealth = readProviderHealth('main')
  const youtubeHealth = mainProviderHealth.find((row) => row.providerId === 'youtube')
  assert.ok(youtubeHealth, 'provider health must persist YouTube telemetry')
  assert.equal(youtubeHealth.requests, 2)
  assert.equal(youtubeHealth.successes, 1)
  assert.equal(youtubeHealth.failures, 1)
  assert.equal(youtubeHealth.consecutiveFailures, 1)
  assert.ok(youtubeHealth.averageLatencyMs >= 169 && youtubeHealth.averageLatencyMs <= 171)
  assert.equal(youtubeHealth.lastError, 'timeout')
  assert.equal(mainProviderHealth.some((row) => row.providerId === 'tiktok'), false, 'provider telemetry must stay isolated from subbots')
  assert.equal(readProviderHealth('subbot:77').some((row) => row.providerId === 'tiktok'), true, 'subbot provider telemetry must use its own instance key')

  const { executeAdminWebControl } = await import('../apps/bot/dist/services/admin-web-control.js')
  const { economy } = await import('../apps/bot/dist/services/economy.js')
  const adminUser = '5215558887777@s.whatsapp.net'
  const before = economy.balance(adminUser)
  const credit = await executeAdminWebControl({ action: 'add_nxc', userJid: adminUser, amount: 1750 }, null)
  assert.equal(credit.ok, true)
  assert.equal(economy.balance(adminUser).wallet, before.wallet + 1750, 'web NXC grant must credit the global wallet')

  const grant = await executeAdminWebControl({ action: 'grant_subbot', userJid: adminUser, durationMs: 86_400_000 }, null)
  assert.equal(grant.ok, true)
  const grantedSubbot = economy.getActiveSubbot(adminUser)
  assert.ok(grantedSubbot, 'web subbot grant must create an active instance')
  assert.ok(grantedSubbot.expiresAt > Date.now())

  await assert.rejects(
    () => executeAdminWebControl({ action: 'reset_own_subbot', id: grantedSubbot.id, userJid: '5210000000000@s.whatsapp.net' }, null),
    /no pertenece/i,
    'subbot owner reset must reject a different owner',
  )
  const ownReset = await executeAdminWebControl({ action: 'reset_own_subbot', id: grantedSubbot.id, userJid: adminUser }, null)
  assert.equal(ownReset.ok, true)
  assert.equal(economy.listSubbots().find((row) => row.id === grantedSubbot.id)?.status, 'pending')
  await assert.rejects(() => executeAdminWebControl({ action: 'broadcast', message: 'CI' }, null), /no está conectado/i)

  const backupResult = await executeAdminWebControl({ action: 'create_backup' }, null)
  assert.equal(backupResult.ok, true, 'admin control must create an operational backup')
  const backupFileName = backupResult.result?.fileName
  assert.equal(typeof backupFileName, 'string')
  const backupBytes = await readFile(path.join(temp, 'backups', backupFileName))
  assert.ok(backupBytes.length > 0, 'backup archive must not be empty')
  const backupArchive = JSON.parse(gunzipSync(backupBytes).toString('utf8'))
  assert.equal(backupArchive.product, 'Ghost Nexora Bot')
  assert.equal(backupArchive.source?.instance, 'main')
  assert.equal(backupArchive.source?.sessionIncluded, false, 'WhatsApp session must be excluded from operational backups')
  assert.ok(backupArchive.files?.some((file) => file.name === 'ghostnexora.sqlite'), 'backup must include the main operational database')
  assert.ok(backupArchive.files?.some((file) => file.name === 'nexora-economy.sqlite'), 'backup must include the global economy database')
  assert.equal(backupArchive.files?.some((file) => /session|creds|auth/i.test(file.name)), false, 'backup file catalog must not contain WhatsApp credentials')

  const routerSource = await readFile(new URL('../apps/bot/src/core/router.ts', import.meta.url), 'utf8')
  const sessionSource = await readFile(new URL('../apps/bot/src/core/session.ts', import.meta.url), 'utf8')
  const groupRuntimeSource = await readFile(new URL('../apps/bot/src/services/group-ops-runtime.ts', import.meta.url), 'utf8')
  const providerHealthSource = await readFile(new URL('../apps/bot/src/services/provider-health.ts', import.meta.url), 'utf8')
  const backupServiceSource = await readFile(new URL('../apps/bot/src/services/backup-service.ts', import.meta.url), 'utf8')
  const lempiClientSource = await readFile(new URL('../apps/bot/src/services/lempi-client.ts', import.meta.url), 'utf8')
  const commandSearchSource = await readFile(new URL('../apps/bot/src/commands/command-search.ts', import.meta.url), 'utf8')
  const commandIndexSource = await readFile(new URL('../apps/bot/src/commands/index.ts', import.meta.url), 'utf8')
  const controlSource = await readFile(new URL('../apps/web/app/api/control/route.ts', import.meta.url), 'utf8')
  const backupDownloadSource = await readFile(new URL('../apps/web/app/api/backups/download/route.ts', import.meta.url), 'utf8')
  const backupPanelSource = await readFile(new URL('../apps/web/components/backup-panel.tsx', import.meta.url), 'utf8')
  const opsExtraI18nSource = await readFile(new URL('../apps/web/lib/ops-extra-i18n.ts', import.meta.url), 'utf8')
  const webOpsSource = await readFile(new URL('../apps/web/lib/ops.ts', import.meta.url), 'utf8')
  const opsConsoleSource = await readFile(new URL('../apps/web/components/ops-console.tsx', import.meta.url), 'utf8')
  const adminControlSource = await readFile(new URL('../apps/bot/src/services/admin-web-control.ts', import.meta.url), 'utf8')
  const adminSource = await readFile(new URL('../apps/web/app/admin/page.tsx', import.meta.url), 'utf8')
  const subbotSource = await readFile(new URL('../apps/web/app/subbot/page.tsx', import.meta.url), 'utf8')
  const publicSource = await readFile(new URL('../apps/web/app/page.tsx', import.meta.url), 'utf8')
  const webI18nSource = await readFile(new URL('../apps/web/lib/i18n.ts', import.meta.url), 'utf8')

  assert.ok(routerSource.includes('performanceAudit.recordCommand'), 'router must audit every command execution')
  assert.ok(routerSource.includes("performanceAudit.recordStage('06'"), 'router must instrument plugin execution stage')
  assert.ok(sessionSource.includes("performanceAudit.recordStage('07'"), 'socket dispatch stage must be measured')
  assert.ok(sessionSource.includes('registerOpsSocket(socket)'), 'every Baileys instance must register its group runtime')
  assert.ok(groupRuntimeSource.includes('groupFetchAllParticipating'), 'group registry must come from the live WhatsApp socket')
  assert.ok(groupRuntimeSource.includes('groupLeave(groupJid)'), 'group leave control must execute on the owning socket')
  assert.ok(groupRuntimeSource.includes('chatModify({ mute:'), 'group runtime must execute WhatsApp mute changes on the owning socket')
  assert.ok(groupRuntimeSource.includes('ops_group_chat_preferences'), 'group mute state must be persisted per instance')
  assert.ok(providerHealthSource.includes('ops_provider_health'), 'provider health must be persisted in the operations database')
  assert.ok(providerHealthSource.includes('instance_key'), 'provider health must remain isolated by instance')
  assert.ok(backupServiceSource.includes("sessionIncluded: false"), 'backup format must explicitly declare session exclusion')
  assert.ok(backupServiceSource.includes('VACUUM INTO'), 'backup service must create consistent SQLite snapshots')
  assert.ok(backupServiceSource.includes('MAX_BACKUPS = 30'), 'backup service must enforce bounded retention')
  assert.ok(lempiClientSource.includes('recordProviderAttempt'), 'LemPi requests must feed provider health telemetry')
  assert.ok(commandSearchSource.includes('effectiveCommands()'), 'command search must use the live effective command registry')
  assert.ok(commandSearchSource.includes("name: 'buscarcomando'"), 'command search must expose .buscarcomando')
  assert.ok(commandSearchSource.includes('command.aliases'), 'command search must index aliases')
  assert.ok(commandSearchSource.includes('command.description'), 'command search must index descriptions')
  assert.ok(commandIndexSource.includes('...commandSearchCommands'), 'active command catalog must register command search')
  assert.ok(controlSource.includes("'leave_group'"), 'web control must support leave_group')
  assert.ok(controlSource.includes("'mute_group_8h'"), 'web control must support 8 hour group mute')
  assert.ok(controlSource.includes("'mute_group_7d'"), 'web control must support 7 day group mute')
  assert.ok(controlSource.includes("'unmute_group'"), 'web control must support group unmute')
  assert.ok(controlSource.includes("if (session.role === 'subbot')") && controlSource.includes('instance = `subbot:${session.subbotId}`'), 'subbot web session must force its own instance key')
  assert.ok(backupDownloadSource.includes('ADMIN_SESSION_COOKIE'), 'backup downloads must require an admin session')
  assert.ok(backupDownloadSource.includes('safeBackupFileName'), 'backup download path must reject traversal or arbitrary files')
  assert.ok(backupPanelSource.includes("action\" value=\"create_backup"), 'admin backup panel must expose manual backup creation')
  assert.ok(backupPanelSource.includes("t('backup.title')"), 'backup panel must source user-facing copy from its catalog')
  assert.ok(opsExtraI18nSource.includes("'provider.title': 'Salud de proveedores'"), 'Spanish provider-health catalog must be present')
  assert.ok(opsExtraI18nSource.includes("'backup.title': 'Backups operativos'"), 'Spanish backup catalog must be present')
  assert.ok(webOpsSource.includes('ops_provider_health'), 'web snapshot must read provider health telemetry')
  assert.ok(webOpsSource.includes('ops_group_chat_preferences'), 'web snapshot must expose persisted group mute state')
  assert.ok(opsConsoleSource.includes("x('provider.title')"), 'operations console must render localized provider health')
  assert.ok(opsConsoleSource.includes('mute_group_8h'), 'operations console must expose group mute controls')
  assert.ok(adminControlSource.includes("action === 'create_backup'"), 'bot control must implement manual backup creation')
  assert.ok(adminControlSource.includes("action === 'add_nxc'"), 'bot control must implement web NXC grants')
  assert.ok(adminControlSource.includes("action === 'grant_subbot'"), 'bot control must implement web subbot grants')
  assert.ok(adminControlSource.includes("action === 'broadcast'"), 'bot control must implement web broadcast')
  assert.ok(adminSource.includes('<BackupPanel'), 'admin management page must render backup management')
  assert.ok(adminSource.includes('<OpsConsole'), 'admin must render shared operations console')
  assert.ok(subbotSource.includes('<OpsConsole'), 'subbot portal must render shared operations console')
  assert.ok(publicSource.includes("t('home.archEyebrow')"), 'public page must source the operations design language from i18n')
  assert.ok(webI18nSource.includes("'home.archEyebrow': 'PIPELINE DAG'"), 'Spanish web catalog must preserve the public operations design language')
  assert.ok(webI18nSource.includes("'home.archEyebrow': 'PIPELINE DAG'"), 'English web catalog must preserve the public operations design language')
  assert.equal(publicSource.includes('ops_groups'), false, 'public page must not expose private group registry internals')

  console.log('operations dashboard smoke: OK')
} finally {
  await rm(temp, { recursive: true, force: true })
}
