import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [
  roadmap,
  runtime,
  security,
  userData,
  userView,
  adminPage,
  navigation,
  i18n,
] = await Promise.all([
  readFile(new URL('../README_NEXT_INTEGRATIONS.md', import.meta.url), 'utf8'),
  readFile(new URL('../apps/web/lib/runtime.ts', import.meta.url), 'utf8'),
  readFile(new URL('../apps/web/lib/web-security.ts', import.meta.url), 'utf8'),
  readFile(new URL('../apps/web/lib/user-dashboard.ts', import.meta.url), 'utf8'),
  readFile(new URL('../apps/web/components/user-dashboard.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../apps/web/app/admin/page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../apps/web/components/unified-navigation.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../apps/web/lib/ops-extra-i18n.ts', import.meta.url), 'utf8'),
])

assert.match(roadmap, /## E8\. Dashboard de usuarios[\s\S]*Estado: (?:EN PROGRESO|TERMINADO)/, 'E8 roadmap must track active/completed implementation')

assert.match(runtime, /openInstanceBotDb\(instanceKey: string\)/, 'E8 must read local data from the selected instance')
assert.match(runtime, /openGlobalEconomyDb\(\)/, 'E8 must read the global economy database explicitly')

assert.match(security, /'users:view'/, 'E8 users:view permission missing')
assert.match(security, /'users:financial'/, 'E8 users:financial permission missing')
assert.match(security, /'users:moderation'/, 'E8 users:moderation permission missing')
assert.match(security, /'users:subbots'/, 'E8 users:subbots permission missing')

assert.match(userData, /ops_user_metrics/, 'E8 search must use instance-scoped user telemetry')
assert.match(userData, /display_name AS displayName/, 'E8 search by user display name missing')
assert.match(userData, /community_profiles/, 'E8 XP and command profile source missing')
assert.match(userData, /global_economy_users/, 'E8 global NXC/bank source missing')
assert.match(userData, /rpg_inventory/, 'E8 inventory source missing')
assert.match(userData, /group_user_activity_v4/, 'E8 group activity source missing')
assert.match(userData, /group_warnings/, 'E8 warning source missing')
assert.match(userData, /subbots WHERE owner_jid = \?/, 'E8 owned subbot source missing')
assert.match(userData, /WHERE instance_key = \?/, 'E8 operational user data must remain instance-scoped')
assert.match(userData, /banRegistryAvailable/, 'E8 ban availability state missing')

assert.match(userView, /users\.searchPlaceholder/, 'E8 search UI missing')
assert.match(userView, /detail\.wallet/, 'E8 wallet display missing')
assert.match(userView, /detail\.bank/, 'E8 bank display missing')
assert.match(userView, /detail\.xp/, 'E8 XP display missing')
assert.match(userView, /detail\.level/, 'E8 level display missing')
assert.match(userView, /detail\.profession/, 'E8 profession display missing')
assert.match(userView, /detail\.inventory/, 'E8 inventory display missing')
assert.match(userView, /detail\.commandBreakdown/, 'E8 command breakdown missing')
assert.match(userView, /detail\.groupBreakdown/, 'E8 group breakdown missing')
assert.match(userView, /detail\.warningBreakdown/, 'E8 warning breakdown missing')
assert.match(userView, /detail\.subbots/, 'E8 subbot display missing')
assert.match(userView, /users\.restricted/, 'E8 role-gated UI missing')

assert.match(adminPage, /AdminSection = [^\n]*'users'/, 'E8 admin section missing')
assert.match(adminPage, /hasPermission\(role, 'users:view'\)/, 'E8 users:view enforcement missing')
assert.match(adminPage, /searchUserDashboard\(selectedInstance/, 'E8 search must use selected instance')
assert.match(adminPage, /readUserDashboardDetail\(selectedInstance/, 'E8 detail must use selected instance')
assert.match(adminPage, /<UserDashboard /, 'E8 admin dashboard rendering missing')

assert.match(navigation, /\| 'users'/, 'E8 unified navigation users icon missing')
assert.match(i18n, /'users\.title'/, 'E8 Spanish/English UI catalog missing')

console.log('Phase E8 user dashboard smoke passed')
