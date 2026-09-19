#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file) => readFileSync(path.join(root, file), 'utf8')

const css = read('apps/web/app/globals.css')
const controls = read('apps/web/components/ops-client-controls.tsx')
const nav = read('apps/web/components/unified-navigation.tsx')
const loading = read('apps/web/components/ops-loading.tsx')
const adminLoading = read('apps/web/app/admin/loading.tsx')
const subbotLoading = read('apps/web/app/subbot/loading.tsx')
const admin = read('apps/web/app/admin/page.tsx')
const subbot = read('apps/web/app/subbot/page.tsx')
const usage = read('apps/web/components/ops-usage-dashboard.tsx')
const jobs = read('apps/web/components/jobs-dashboard.tsx')
const backups = read('apps/web/components/backup-panel.tsx')
const i18n = read('apps/web/lib/i18n.ts')
const roadmap = read('README_NEXT_INTEGRATIONS.md')

assert.match(css, /Phase E14 · Operations Center visual system/, 'E14 visual layer missing')
for (const cls of [
  '.ops-page-frame', '.ops-page-header', '.ops-badge', '.ops-command-trigger',
  '.ops-modal-layer', '.ops-command-palette', '.ops-toast', '.ops-empty-state',
  '.ops-skeleton', '.ops-chart-frame',
]) {
  assert.ok(css.includes(cls), `E14 CSS primitive missing: ${cls}`)
}
assert.match(css, /@media \(max-width:639px\)/, 'E14 mobile breakpoint missing')
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/, 'reduced-motion support must remain')
assert.match(css, /focus-visible/, 'focus-visible accessibility must remain')

assert.doesNotMatch(controls, /window\.confirm\(/, 'native window.confirm must be replaced by E14 modal')
assert.match(controls, /role="dialog"/, 'E14 confirmation modal missing')
assert.match(controls, /export function OpsToast/, 'E14 toast component missing')
assert.match(controls, /aria-live="polite"/, 'E14 toast accessibility missing')

assert.match(nav, /event\.metaKey \|\| event\.ctrlKey/, 'E14 command palette shortcut missing')
assert.match(nav, /key\.toLowerCase\(\) === 'k'/, 'E14 Cmd/Ctrl+K shortcut missing')
assert.match(nav, /ops-command-palette/, 'E14 command palette UI missing')
assert.match(nav, /t\('nav\.search'\)/, 'E14 command palette must be localized')
assert.match(nav, /ops-mobile-menu-button[\s\S]*Search/, 'E14 mobile palette entry missing')

assert.match(loading, /ops-skeleton/, 'E14 skeleton component missing')
assert.match(adminLoading, /OpsLoading/, 'Admin route skeleton missing')
assert.match(subbotLoading, /OpsLoading/, 'Subbot route skeleton missing')

assert.match(admin, /className="ops-page-frame"/, 'Admin E14 page frame missing')
assert.match(admin, /className="ops-page-header"/, 'Admin E14 header missing')
assert.match(admin, /<OpsToast tone="success"/, 'Admin success toast missing')
assert.match(admin, /<OpsToast tone="error"/, 'Admin error toast missing')
assert.doesNotMatch(admin, />Operations Center</, 'Admin normal view should not expose internal Operations Center kicker')

assert.match(subbot, /className="ops-page-frame"/, 'Subbot E14 page frame missing')
assert.match(subbot, /className="ops-page-header"/, 'Subbot E14 header missing')
assert.match(subbot, /<OpsToast tone="success"/, 'Subbot success toast missing')
assert.match(subbot, /<OpsToast tone="error"/, 'Subbot error toast missing')

assert.match(usage, /ops-empty-state compact/, 'Usage ranking empty state missing')
assert.match(usage, /ops-chart-frame/, 'Usage chart visual frame missing')
assert.match(jobs, /ops-empty-state/, 'Jobs empty state missing')
assert.match(backups, /ops-empty-state/, 'Backups empty state missing')

for (const key of ["'nav.search'", "'nav.noResults'", "'nav.current'"]) {
  assert.ok(i18n.includes(key), `E14 i18n key missing: ${key}`)
}

assert.match(roadmap, /## E14\. Diseño visual[\s\S]*Estado: (?:EN PROGRESO|TERMINADO)/, 'E14 roadmap status missing')

console.log('Phase E14 visual polish smoke passed')
