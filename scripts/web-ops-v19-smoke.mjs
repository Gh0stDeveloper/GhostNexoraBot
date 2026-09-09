#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file) => readFileSync(path.join(root, file), 'utf8')

const main = read('apps/bot/src/index.ts')
const groupOps = read('apps/bot/src/services/group-ops-runtime.ts')
const ops = read('apps/web/lib/ops.ts')
const control = read('apps/web/app/api/control/route.ts')
const admin = read('apps/web/app/admin/page.tsx')
const subbotPage = read('apps/web/app/subbot/page.tsx')
const consoleSource = read('apps/web/components/ops-console.tsx')
const quickStart = read('apps/web/components/PublicQuickStart.tsx')
const home = read('apps/web/app/page.tsx')
const subbotCommands = read('apps/bot/src/commands/subbots.ts')
const subbotCore = read('apps/bot/src/core/subbots.ts')

assert.match(main, /function effectiveMainConnected\(\)/, 'MainBot health must derive from the live socket')
assert.match(main, /markMainSocketLive\(socket\)/, 'live MainBot traffic must refresh connection state')
assert.match(main, /connected: live/, 'health response must expose effective live connection')

assert.match(groupOps, /CREATE TABLE IF NOT EXISTS ops_instance_status/, 'ops runtime must persist per-instance health')
assert.match(groupOps, /groupFetchAllParticipating\(\)/, 'full group synchronization must remain available')
assert.match(groupOps, /groupMetadata\(groupJid\)/, 'live group traffic must refresh individual group metadata')
assert.match(groupOps, /messages\.upsert/, 'group registry must observe real message traffic')
assert.match(groupOps, /last_group_sync_at/, 'group sync freshness must be persisted')

assert.match(ops, /runtime: OpsRuntimeStatus/, 'web snapshot must expose persistent runtime state')
assert.match(ops, /fresh = updatedAt > 0/, 'stale runtime heartbeats must not be shown as connected')
assert.match(control, /health\?\.connected\) \|\| persisted\.connected/, 'web diagnostic must combine health server and persisted heartbeat')
assert.match(control, /groupCount: persisted\.groupCount/, 'web diagnostic must expose safe group count')

for (const section of ['overview', 'groups', 'audit', 'management', 'subbots']) {
  assert.ok(admin.includes(`'${section}'`), `admin panel must expose ${section} section`)
}
for (const section of ['overview', 'groups', 'audit', 'account']) {
  assert.ok(subbotPage.includes(`'${section}'`), `subbot panel must expose ${section} section`)
}
assert.match(admin, /<table className="ops-table/, 'subbot instances must render as a compact table')
assert.match(consoleSource, /view === 'groups'/, 'groups must have a dedicated view')
assert.match(consoleSource, /view === 'audit'/, 'command audit must have a dedicated view')

assert.match(quickStart, /className="ops-button-primary fixed bottom-5 right-5/, 'quick-start button must reuse the site primary button theme')
assert.doesNotMatch(quickStart, /cyan-300|violet-300|violet-400/, 'quick-start UI must not keep the old cyan/violet theme')
assert.match(home, /PROPÓSITO Y OPERACIÓN/, 'public page must explain the bot purpose')
assert.match(home, /Administrar comunidades/, 'public page must explain group administration')
assert.match(home, /FLUJO NORMAL/, 'public page must explain the request/response flow')

assert.match(subbotCommands, /name: 'subbotdelete'/, 'subbot cleanup command must be registered')
assert.match(subbotCommands, /vencidos\|pendientes\|activos/, 'cleanup command must support status selectors')
assert.match(subbotCommands, /subbotdelete \$\{selector\} confirm/, 'destructive cleanup must require explicit confirmation')
assert.match(subbotCommands, /process\.env\.NEXORA_INSTANCE_ROLE === 'subbot'/, 'global cleanup must be blocked inside subbots')
assert.match(subbotCore, /async deleteById\(id: number\)/, 'subbot manager must implement permanent deletion')
assert.match(subbotCore, /DELETE FROM entitlements WHERE user_jid = \? AND kind = 'subbot_slot'/, 'permanent deletion must prevent entitlement-based recreation')
assert.match(subbotCore, /deleteInstanceRows\('ops_instance_status'\)/, 'permanent deletion must clear runtime heartbeat state')
assert.match(subbotCore, /rm\(path\.join\(config\.dataDir, 'subbots', String\(id\)\)/, 'permanent deletion must remove isolated session/data directory')

console.log('V19 web organization, MainBot health, groups and subbot cleanup: OK')
