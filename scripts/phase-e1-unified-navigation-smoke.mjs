import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(path, 'utf8')

const roadmap = read('README_NEXT_INTEGRATIONS.md')
const navigation = read('apps/web/components/unified-navigation.tsx')
const css = read('apps/web/app/globals.css')
const publicPage = read('apps/web/app/page.tsx')
const adminPage = read('apps/web/app/admin/page.tsx')
const subbotPage = read('apps/web/app/subbot/page.tsx')
const i18n = read('apps/web/lib/i18n.ts')

assert.match(roadmap, /## E1\. Navegación lateral[\s\S]*Estado: EN PROGRESO/, 'E1 roadmap must be in progress while PR is open')

assert.match(navigation, /'use client'/, 'Unified navigation must be interactive on mobile')
assert.match(navigation, /export function UnifiedNavigation/, 'Shared navigation component missing')
assert.match(navigation, /ops-sidebar hidden lg:flex/, 'Desktop sidebar mode missing')
assert.match(navigation, /ops-mobile-nav lg:hidden/, 'Mobile navigation header missing')
assert.match(navigation, /ops-drawer-overlay/, 'Mobile drawer overlay missing')
assert.match(navigation, /document\.body\.style\.overflow = 'hidden'/, 'Drawer must lock background scrolling')
assert.match(navigation, /event\.key === 'Escape'/, 'Drawer must close on Escape')
assert.match(navigation, /aria-expanded=\{open\}/, 'Mobile menu must expose expanded state')
assert.match(navigation, /aria-controls="ghost-nexora-mobile-navigation"/, 'Mobile menu must identify controlled drawer')
assert.match(navigation, /aria-current=\{anchorActive \? 'page' : undefined\}/, 'Active navigation item must be accessible')
assert.match(navigation, /window\.location\.hash/, 'Public anchor active state must follow URL hash')
assert.match(navigation, /onClick=\{close\}/, 'Navigation links must close the mobile drawer')

assert.match(css, /\.ops-sidebar \{/, 'Shared desktop sidebar styles missing')
assert.match(css, /width:272px/, 'Desktop sidebar width must remain stable')
assert.match(css, /\.ops-shell-content \{ margin-left:272px; \}/, 'Desktop content must reserve sidebar space')
assert.match(css, /\.ops-mobile-nav \{[\s\S]*display:flex/, 'Mobile top bar layout missing')
assert.match(css, /\.ops-drawer \{/, 'Mobile drawer styles missing')
assert.match(css, /\.ops-drawer-overlay \{/, 'Mobile drawer overlay styles missing')

for (const source of [publicPage, adminPage, subbotPage]) {
  assert.match(source, /<UnifiedNavigation/, 'Every primary web surface must use UnifiedNavigation')
  assert.match(source, /className="ops-shell"/, 'Every primary web surface must use the shared navigation shell')
  assert.match(source, /className="ops-shell-content"/, 'Every primary web surface must reserve shared navigation content space')
}

assert.match(publicPage, /href: '#inicio'/, 'Public navigation must link to Home')
assert.match(publicPage, /href: '#descargas'/, 'Public navigation must link to Downloads')
assert.match(publicPage, /href: '#comandos'/, 'Public navigation must link to Commands')
assert.match(publicPage, /href: '#funcionamiento'/, 'Public navigation must link to Operation')
assert.match(publicPage, /href: '#arquitectura'/, 'Public navigation must link to Architecture')
assert.match(publicPage, /href: '#modulos'/, 'Public navigation must link to Modules')
assert.match(publicPage, /href: '#seguridad'/, 'Public navigation must link to Security')
assert.match(publicPage, /actionHref="\/login"/, 'Public sidebar must retain secure login action')
assert.doesNotMatch(publicPage, /<header className="sticky top-0 z-30/, 'Legacy public horizontal navbar must be removed')

assert.match(adminPage, /const navigationItems: UnifiedNavItem\[] = sections\.map/, 'Admin navigation must derive from role-filtered sections')
assert.match(adminPage, /badge=\{roleLabel\(role\)\}/, 'Admin/Support role must be visible in the shared sidebar')
assert.match(adminPage, /role === 'owner'/, 'Owner-only section filtering must remain')
assert.match(adminPage, /\['management', t\('nav\.management'\)/, 'Owner management section must remain available')
assert.match(adminPage, /\['subbots', t\('nav\.subbots'\)/, 'Owner subbots section must remain available')
assert.doesNotMatch(adminPage, /<nav className="mt-5 flex gap-2 overflow-x-auto/, 'Legacy Admin tabs must be removed')

assert.match(subbotPage, /const navigationItems: UnifiedNavItem\[] = sections\.map/, 'Subbot navigation must derive from isolated sections')
assert.match(subbotPage, /brandTitle=\{`SUBBOT #\$\{subbot\.id\}`\}/, 'Subbot identity must remain visible in shared sidebar')
assert.match(subbotPage, /sectionIds: SubbotSection\[] = \['overview', 'platforms', 'groups', 'audit', 'diagnostics', 'account'\]/, 'Subbot must retain only its isolated sections')
assert.doesNotMatch(subbotPage, /management|nav\.subbots|nav\.security/, 'Subbot sidebar must not expose MainBot owner navigation')
assert.doesNotMatch(subbotPage, /<nav className="mt-5 flex gap-2 overflow-x-auto/, 'Legacy Subbot tabs must be removed')

assert.match(i18n, /'home\.navAria': 'Navegación principal'/, 'Spanish public navigation accessibility label missing')
assert.match(i18n, /'home\.navAria': 'Primary navigation'/, 'English public navigation accessibility label missing')
assert.match(i18n, /'nav\.close': 'Cerrar navegación'/, 'Spanish drawer close label missing')
assert.match(i18n, /'nav\.close': 'Close navigation'/, 'English drawer close label missing')

console.log('Phase E1 unified navigation smoke passed')
