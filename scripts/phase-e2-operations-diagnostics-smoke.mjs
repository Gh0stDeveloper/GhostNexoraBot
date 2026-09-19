import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(path, 'utf8')

const roadmap = read('README_NEXT_INTEGRATIONS.md')
const adminPage = read('apps/web/app/admin/page.tsx')
const subbotPage = read('apps/web/app/subbot/page.tsx')
const opsConsole = read('apps/web/components/ops-console.tsx')
const operations = read('apps/web/components/operations-overview.tsx')
const diagnostics = read('apps/web/components/developer-diagnostics.tsx')
const runtimeDiagnostics = read('apps/web/components/runtime-diagnostics-panel.tsx')
const controlRoute = read('apps/web/app/api/control/route.ts')
const webI18n = read('apps/web/lib/i18n.ts')
const extraI18n = read('apps/web/lib/ops-extra-i18n.ts')

assert.match(roadmap, /## E2\. Separar información operativa de diagnóstico[\s\S]*Estado: EN PROGRESO/, 'E2 roadmap must be in progress while PR is open')

assert.match(adminPage, /'diagnostics', t\('nav\.diagnostics'\), Wrench/, 'Admin diagnostics navigation missing')
assert.match(adminPage, /<OperationsOverview/, 'Admin overview must render operational summary')
assert.match(adminPage, /<DeveloperDiagnostics/, 'Admin diagnostics section missing')
assert.doesNotMatch(adminPage, /view="overview"/, 'Admin overview must not render the legacy technical OpsConsole overview')
assert.match(adminPage, /admin\.stat\.platforms/, 'Admin overview must prioritize active platform count')

assert.match(subbotPage, /'diagnostics', t\('nav\.diagnostics'\), Wrench/, 'Subbot diagnostics navigation missing')
assert.match(subbotPage, /<OperationsOverview/, 'Subbot overview must render operational summary')
assert.match(subbotPage, /<DeveloperDiagnostics/, 'Subbot must have isolated diagnostics')
assert.doesNotMatch(subbotPage, /view="overview"/, 'Subbot overview must not render legacy technical diagnostics')
assert.match(subbotPage, /sectionIds: SubbotSection\[\] = \['overview', 'platforms', 'groups', 'audit', 'diagnostics', 'account'\]/, 'Subbot diagnostics route must be explicitly allowed')

assert.equal(/CommandAuditTable/.test(opsConsole), false, 'Technical command profiler must leave the Audit/Groups console')
assert.match(opsConsole, /AdminAuditTable rows=\{snapshot\.adminAudit\}/, 'Audit must retain administrative history')
assert.match(opsConsole, /GroupActivityPanel/, 'Detailed group activity must live in Groups')
assert.equal(/RuntimeDiagnosticsPanel/.test(opsConsole), false, 'Runtime diagnostics must not remain in OpsConsole')

assert.match(operations, /OpsAlertCenter/, 'Operational overview must surface alerts')
assert.match(operations, /platformStatuses\.filter\(\(item\) => item\.connected\)/, 'Operational overview must surface platform state')
assert.match(operations, /snapshot\.summary\.throughputMps/, 'Operational overview must surface traffic')
assert.match(operations, /snapshot\.platformGroups\.length \|\| snapshot\.groups\.length/, 'Operational overview must surface communities')
assert.match(operations, /providerIssues/, 'Operational overview must surface provider incidents')
assert.match(operations, /lastGroupSyncError/, 'Operational overview must surface WhatsApp sync problems')

assert.match(diagnostics, /RuntimeDiagnosticsPanel/, 'Developer diagnostics must include runtime diagnostics')
assert.match(diagnostics, /CommandAuditTable/, 'Developer diagnostics must include command profiler')
assert.match(diagnostics, /snapshot\.stages\.map/, 'Developer diagnostics must include pipeline DAG stages')
assert.match(diagnostics, /µs/, 'Developer diagnostics must contain internal microsecond timing')
assert.match(diagnostics, /provider\.averageLatencyMs/, 'Developer diagnostics must keep detailed provider telemetry')
assert.match(diagnostics, /reset_audit/, 'Technical metric reset must move to Diagnostics')

assert.match(runtimeDiagnostics, /diagnostics\.heap/, 'Heap metrics must live in runtime diagnostics')
assert.match(runtimeDiagnostics, /RuntimeLogTable/, 'Technical runtime logs must live in diagnostics')
assert.equal(/OpsAlertCenter/.test(runtimeDiagnostics), false, 'Operational alerts must not remain buried in runtime diagnostics')
assert.equal(/GroupActivityPanel/.test(runtimeDiagnostics), false, 'Group activity must not remain in runtime diagnostics')

assert.match(controlRoute, /'diagnostics'/, 'Control redirects must preserve diagnostics section')
assert.match(webI18n, /'nav\.diagnostics': 'Diagnóstico'/, 'Spanish diagnostics navigation missing')
assert.match(webI18n, /'nav\.diagnostics': 'Diagnostics'/, 'English diagnostics navigation missing')
assert.match(extraI18n, /'operations\.title': 'Estado operativo'/, 'Spanish operations copy missing')
assert.match(extraI18n, /'operations\.title': 'Operational status'/, 'English operations copy missing')
assert.match(extraI18n, /'diagnostics\.developerTitle': 'Developer \/ Diagnostics'/, 'Developer diagnostics copy missing')

console.log('Phase E2 operations/diagnostics separation smoke passed')
