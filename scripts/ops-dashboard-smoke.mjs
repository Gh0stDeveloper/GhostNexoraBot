import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

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

  const routerSource = await readFile(new URL('../apps/bot/src/core/router.ts', import.meta.url), 'utf8')
  const sessionSource = await readFile(new URL('../apps/bot/src/core/session.ts', import.meta.url), 'utf8')
  const groupRuntimeSource = await readFile(new URL('../apps/bot/src/services/group-ops-runtime.ts', import.meta.url), 'utf8')
  const controlSource = await readFile(new URL('../apps/web/app/api/control/route.ts', import.meta.url), 'utf8')
  const adminSource = await readFile(new URL('../apps/web/app/admin/page.tsx', import.meta.url), 'utf8')
  const subbotSource = await readFile(new URL('../apps/web/app/subbot/page.tsx', import.meta.url), 'utf8')
  const publicSource = await readFile(new URL('../apps/web/app/page.tsx', import.meta.url), 'utf8')

  assert.ok(routerSource.includes('performanceAudit.recordCommand'), 'router must audit every command execution')
  assert.ok(routerSource.includes("performanceAudit.recordStage('06'"), 'router must instrument plugin execution stage')
  assert.ok(sessionSource.includes("performanceAudit.recordStage('07'"), 'socket dispatch stage must be measured')
  assert.ok(sessionSource.includes('registerOpsSocket(socket)'), 'every Baileys instance must register its group runtime')
  assert.ok(groupRuntimeSource.includes('groupFetchAllParticipating'), 'group registry must come from the live WhatsApp socket')
  assert.ok(groupRuntimeSource.includes('groupLeave(groupJid)'), 'group leave control must execute on the owning socket')
  assert.ok(controlSource.includes("action === 'leave_group'"), 'web control must support leave_group')
  assert.ok(controlSource.includes('isSubbot ? `subbot:${subbot.subbotId}`'), 'subbot web session must force its own instance key')
  assert.ok(adminSource.includes('<OpsConsole'), 'admin must render shared operations console')
  assert.ok(subbotSource.includes('<OpsConsole'), 'subbot portal must render shared operations console')
  assert.ok(publicSource.includes('PIPELINE DAG'), 'public page must use the same operations design language')
  assert.equal(publicSource.includes('ops_groups'), false, 'public page must not expose private group registry internals')

  console.log('operations dashboard smoke: OK')
} finally {
  await rm(temp, { recursive: true, force: true })
}
