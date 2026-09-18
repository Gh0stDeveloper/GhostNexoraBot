import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(path, 'utf8')

const roadmap = read('README_NEXT_INTEGRATIONS.md')
const registry = read('apps/bot/src/services/platform-group-registry.ts')
const whatsapp = read('apps/bot/src/services/group-ops-runtime.ts')
const discordRuntime = read('apps/bot/src/platform/discord/runtime.ts')
const discordGateway = read('apps/bot/src/platform/discord/gateway.ts')
const discordRest = read('apps/bot/src/platform/discord/rest.ts')
const telegramRuntime = read('apps/bot/src/platform/telegram/runtime.ts')
const telegramClient = read('apps/bot/src/platform/telegram/client.ts')
const webOps = read('apps/web/lib/ops.ts')
const platformPanel = read('apps/web/components/platform-groups-panel.tsx')
const adminPage = read('apps/web/app/admin/page.tsx')
const subbotPage = read('apps/web/app/subbot/page.tsx')

assert.match(roadmap, /Fase E \| Dashboard Web V2 \| EN PROGRESO/, 'Phase E must be prioritized')
assert.match(roadmap, /Fase B \| Núcleo multiplataforma compartido \| POSPUESTO/, 'Phase B must remain postponed')
assert.match(roadmap, /Fase C \| Paridad Discord y Telegram \| POSPUESTO/, 'Phase C must remain postponed')
assert.match(roadmap, /Fase D \| Runtime y entrega WhatsApp \| POSPUESTO/, 'Phase D must remain postponed')

assert.match(registry, /CREATE TABLE IF NOT EXISTS ops_platform_groups/, 'cross-platform group registry table missing')
assert.match(registry, /platform TEXT NOT NULL/, 'platform dimension missing from group registry')
assert.match(registry, /PRIMARY KEY\(instance_key, platform, external_id\)/, 'group registry must remain isolated by instance/platform/id')
assert.match(registry, /replacePlatformGroups/, 'authoritative platform inventory replace helper missing')
assert.match(registry, /upsertPlatformGroup/, 'observed platform inventory upsert helper missing')

assert.match(whatsapp, /groupFetchAllParticipating\(\)/, 'WhatsApp must retain full participating-group sync')
assert.match(whatsapp, /groups\.upsert/, 'WhatsApp inventory must observe group upsert events')
assert.match(whatsapp, /groups\.update/, 'WhatsApp inventory must observe group update events')
assert.match(whatsapp, /observeGroupJid/, 'WhatsApp traffic must recover groups even before a full sync')
assert.match(whatsapp, /replacePlatformGroups\('whatsapp'/, 'WhatsApp full sync must feed the cross-platform registry')
assert.match(whatsapp, /last_group_sync_attempt_at/, 'WhatsApp sync attempt timestamp must be persisted')
assert.match(whatsapp, /last_group_sync_error/, 'WhatsApp sync errors must be persisted')
assert.match(whatsapp, /setTimeout\(\(\) => \{[\s\S]*lastSyncAt === 0/, 'WhatsApp initial group sync must retry after connection')

assert.match(discordGateway, /GUILD_CREATE/, 'Discord Gateway must observe guild joins/availability')
assert.match(discordGateway, /GUILD_DELETE/, 'Discord Gateway must observe guild leaves')
assert.match(discordRest, /getGuild\(guildId/, 'Discord REST must hydrate guild metadata')
assert.match(discordRuntime, /replacePlatformGroups\('discord'/, 'Discord READY must seed authoritative guild inventory')
assert.match(discordRuntime, /upsertPlatformGroup\('discord'/, 'Discord runtime must persist observed guilds')
assert.match(discordRuntime, /removePlatformGroup\('discord'/, 'Discord guild leave must remove inventory entry')

assert.match(telegramClient, /'my_chat_member'/, 'Telegram polling must receive bot membership updates')
assert.match(telegramRuntime, /chat\.type !== 'group' && chat\.type !== 'supergroup'/, 'Telegram inventory must be limited to groups/supergroups')
assert.match(telegramRuntime, /upsertPlatformGroup\('telegram'/, 'Telegram observed groups must be persisted')
assert.match(telegramRuntime, /removePlatformGroup\('telegram'/, 'Telegram bot removal must remove observed group')
assert.match(telegramRuntime, /telegram-my-chat-member/, 'Telegram membership changes must identify their inventory source')

assert.match(webOps, /export type OpsPlatformGroup/, 'Web snapshot type for platform groups missing')
assert.match(webOps, /ops_platform_groups/, 'Web must read the platform group registry')
assert.match(webOps, /lastGroupSyncAttemptAt/, 'Web must expose group sync attempt timestamp')
assert.match(webOps, /lastGroupSyncError/, 'Web must expose WhatsApp sync errors')
assert.match(webOps, /legacy-ops-groups/, 'Web must preserve legacy WhatsApp group inventory as migration fallback')

for (const platform of ['whatsapp', 'discord', 'telegram']) {
  assert.match(platformPanel, new RegExp(`platform="${platform}"`), `${platform} platform section missing from dashboard`)
}
assert.match(platformPanel, /Sincronizar WhatsApp/, 'WhatsApp manual sync control missing')
assert.match(platformPanel, /lastGroupSyncError/, 'WhatsApp sync error must be visible in dashboard')
assert.match(platformPanel, /Telegram Bot API no ofrece una lista histórica completa/, 'Telegram inventory limitation must be explicit')
assert.match(adminPage, /<PlatformGroupsPanel/, 'Admin groups view must render platform inventory')
assert.match(subbotPage, /<PlatformGroupsPanel/, 'Subbot groups view must render platform inventory')

console.log('Phase E platform groups dashboard smoke passed')
