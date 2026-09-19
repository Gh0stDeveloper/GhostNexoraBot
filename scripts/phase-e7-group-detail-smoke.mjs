import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [
  roadmap,
  groupRuntime,
  groupDetail,
  groupView,
  adminDetail,
  subbotDetail,
  controlRoute,
  platformGroups,
  adminPage,
  subbotPage,
  subbots,
  audit,
] = await Promise.all([
  readFile(new URL('../README_NEXT_INTEGRATIONS.md', import.meta.url), 'utf8'),
  readFile(new URL('../apps/bot/src/services/group-ops-runtime.ts', import.meta.url), 'utf8'),
  readFile(new URL('../apps/web/lib/group-detail.ts', import.meta.url), 'utf8'),
  readFile(new URL('../apps/web/components/group-detail-view.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../apps/web/app/admin/groups/[groupId]/page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../apps/web/app/subbot/groups/[groupId]/page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../apps/web/app/api/control/route.ts', import.meta.url), 'utf8'),
  readFile(new URL('../apps/web/components/platform-groups-panel.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../apps/web/app/admin/page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../apps/web/app/subbot/page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../apps/bot/src/core/subbots.ts', import.meta.url), 'utf8'),
  readFile(new URL('../apps/web/lib/admin-audit.ts', import.meta.url), 'utf8'),
])

assert.match(roadmap, /## E7\. Vista detallada de grupo[\s\S]*Estado: (?:EN PROGRESO|TERMINADO)/, 'E7 roadmap must track active/completed implementation')

assert.match(groupRuntime, /CREATE TABLE IF NOT EXISTS ops_group_members/, 'E7 member snapshot table missing')
assert.match(groupRuntime, /CREATE TABLE IF NOT EXISTS ops_group_hourly_stats/, 'E7 rolling 24h activity table missing')
assert.match(groupRuntime, /CREATE TABLE IF NOT EXISTS ops_group_settings_snapshot/, 'E7 settings snapshot table missing')
assert.match(groupRuntime, /ensureColumn\('ops_group_control_requests', 'payload_json'/, 'E7 request payload migration missing')
assert.match(groupRuntime, /syncGroupMembers\(jid, participants, stamp\)/, 'E7 group member synchronization missing')
assert.match(groupRuntime, /syncGroupSettingsSnapshot\(jid\)/, 'E7 settings snapshot synchronization missing')
assert.match(groupRuntime, /request\.action === 'config'/, 'E7 group configuration runtime action missing')
assert.match(groupRuntime, /request\.action === 'broadcast'/, 'E7 group broadcast runtime action missing')
assert.match(groupRuntime, /setGroupCategoryOverride\(groupJid, 'adult'/, 'E7 adult command policy synchronization missing')

assert.match(groupDetail, /readGroupDetail\(instanceKey: string, groupJid: string\)/, 'E7 detail reader must require instance and group')
assert.match(groupDetail, /WHERE instance_key = \? AND group_jid = \?/, 'E7 detail queries must remain instance-scoped')
assert.match(groupDetail, /ops_group_members/, 'E7 detail reader must expose members/admins')
assert.match(groupDetail, /ops_group_settings_snapshot/, 'E7 detail reader must expose group configuration')
assert.match(groupDetail, /messages24h/, 'E7 detail reader must expose rolling 24h activity')
assert.match(groupDetail, /commandCategories/, 'E7 detail reader must expose command category policy')

assert.match(groupView, /group_config_update/, 'E7 configuration form missing')
assert.match(groupView, /group_broadcast/, 'E7 group broadcast form missing')
assert.match(groupView, /leave_group/, 'E7 leave action missing')
assert.match(groupView, /group_announce_/, 'E7 open/close group control missing')
assert.match(groupView, /group_lock_/, 'E7 info lock control missing')
assert.match(groupView, /mute_group_8h/, 'E7 mute control missing')
assert.match(groupView, /detail\.members\.map/, 'E7 member/admin list missing')
assert.match(groupView, /maskedMember/, 'E7 UI must mask participant identifiers')

assert.match(adminDetail, /ADMIN_SESSION_COOKIE/, 'Admin E7 route must require privileged session')
assert.match(adminDetail, /hasPermission\(session\.role, 'groups:view'\)/, 'Admin E7 route must enforce groups:view')
assert.match(adminDetail, /readGroupDetail\(instanceKey, groupJid\)/, 'Admin E7 route must scope group detail to selected instance')
assert.match(adminDetail, /session\.role === 'owner'/, 'Only Owner may select subbot instance from Admin E7 route')

assert.match(subbotDetail, /SUBBOT_SESSION_COOKIE/, 'Subbot E7 route must require subbot session')
assert.match(subbotDetail, /const instanceKey = `subbot:\$\{session\.subbotId\}`/, 'Subbot E7 route must force its own instance')
assert.match(subbotDetail, /readGroupDetail\(instanceKey, groupJid\)/, 'Subbot E7 route must read only its own instance')

assert.match(controlRoute, /'group_config_update'/, 'E7 Web control configuration action missing')
assert.match(controlRoute, /'group_broadcast'/, 'E7 Web control broadcast action missing')
assert.match(controlRoute, /return 'groups:manage'/, 'E7 writes must require group management permission')
assert.match(controlRoute, /group_not_registered_for_instance/, 'E7 writes must validate group membership in selected instance')
assert.match(controlRoute, /payload_json/, 'E7 Web control must persist sanitized request payloads')

assert.match(platformGroups, /detailBasePath/, 'E7 group inventory detail links missing')
assert.match(platformGroups, /encodeURIComponent\(row\.externalId\)/, 'E7 group links must encode group JIDs')
assert.match(adminPage, /detailBasePath="\/admin\/groups"/, 'Admin inventory must link to E7 detail')
assert.match(subbotPage, /detailBasePath="\/subbot\/groups"/, 'Subbot inventory must link to E7 detail')

assert.match(subbots, /deleteInstanceRows\('ops_group_members'\)/, 'Permanent subbot deletion must clean E7 member snapshots')
assert.match(subbots, /deleteInstanceRows\('ops_group_settings_snapshot'\)/, 'Permanent subbot deletion must clean E7 settings snapshots')
assert.match(audit, /'group_config_update', 'group_broadcast'/, 'E7 actions must be auditable by group JID')

console.log('Phase E7 group detail smoke passed')
