import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(path, 'utf8')

const roadmap = read('README_NEXT_INTEGRATIONS.md')
const contracts = read('packages/control-api-contracts/src/index.ts')
const controlApi = read('apps/bot/src/services/control-api-v2.ts')
const mainRuntime = read('apps/bot/src/index.ts')
const discordRuntime = read('apps/bot/src/platform/discord/runtime.ts')
const telegramRuntime = read('apps/bot/src/platform/telegram/runtime.ts')
const webSecurity = read('apps/web/lib/web-security.ts')
const platformStatus = read('apps/web/lib/platform-status.ts')
const platformApi = read('apps/web/app/api/platforms/route.ts')
const dashboard = read('apps/web/components/platforms-dashboard.tsx')
const adminPage = read('apps/web/app/admin/page.tsx')
const subbotPage = read('apps/web/app/subbot/page.tsx')
const webI18n = read('apps/web/lib/i18n.ts')
const extraI18n = read('apps/web/lib/ops-extra-i18n.ts')
const groupPanel = read('apps/web/components/platform-groups-panel.tsx')

assert.match(roadmap, /## E3\. Pantalla Plataformas[\s\S]*Estado: TERMINADO/, 'E3 roadmap completion state missing')
assert.match(roadmap, /## E0\. Inventario de comunidades por plataforma/, 'E0 roadmap section missing')

assert.match(contracts, /export interface PlatformMetrics/, 'PlatformMetrics contract missing')
assert.match(contracts, /messagesPerMinute\?: number/, 'WhatsApp messages/min contract missing')
assert.match(contracts, /commandSyncAt\?: string \| null/, 'Discord command sync metric missing')
assert.match(contracts, /updatesProcessed\?: number/, 'Telegram updates metric missing')
assert.match(contracts, /platformRestart: \(id: PlatformId\)/, 'Platform restart contract path missing')

assert.match(controlApi, /countPlatformGroups\('whatsapp'\)/, 'WhatsApp group count must be exposed')
assert.match(controlApi, /messagesPerMinute: Number\(whatsapp\.messagesPerMinute/, 'WhatsApp messages/min must be exposed')
assert.match(controlApi, /sequence: discord\.sequence/, 'Discord sequence must be exposed')
assert.match(controlApi, /commandSyncAt: discord\.lastCommandSyncAt/, 'Discord command sync timestamp must be exposed')
assert.match(controlApi, /updatesProcessed: telegram\.updatesProcessed/, 'Telegram update count must be exposed')
assert.match(controlApi, /connect\|disconnect\|restart/, 'Control API must accept platform restart')
assert.match(controlApi, /await disconnect\(\)[\s\S]*await connect\(\)/, 'Platform restart must stop before starting')

assert.match(mainRuntime, /whatsappReconnectsTotal/, 'WhatsApp reconnect metric missing')
assert.match(mainRuntime, /whatsappMessagesProcessed/, 'WhatsApp processed-message metric missing')
assert.match(mainRuntime, /whatsappMessagesPerMinute/, 'WhatsApp rolling messages/min metric missing')
assert.match(mainRuntime, /whatsappLastActivityAt/, 'WhatsApp last activity metric missing')

assert.match(discordRuntime, /private reconnects = 0/, 'Discord reconnect metric missing')
assert.match(discordRuntime, /lastCommandSyncAt/, 'Discord command sync timestamp missing')
assert.match(discordRuntime, /lastCommandSyncError/, 'Discord command sync error missing')
assert.match(discordRuntime, /recordOpsRuntimeLog\('info', 'discord'/, 'Discord persistent runtime logs missing')

assert.match(telegramRuntime, /private reconnects = 0/, 'Telegram reconnect metric missing')
assert.match(telegramRuntime, /recordOpsRuntimeLog\('info', 'telegram'/, 'Telegram persistent runtime logs missing')

assert.match(webSecurity, /'platforms:view'/, 'Platform view permission missing')
assert.match(webSecurity, /'platforms:operate'/, 'Platform operation permission missing')
assert.match(webSecurity, /'platforms:disable'/, 'Owner-only platform disable permission missing')

assert.match(platformStatus, /runMainPlatformAction/, 'Server-side platform action helper missing')
assert.match(platformStatus, /authorization: `Bearer \$\{runtime\.adminToken\}`/, 'Control API token must stay server-side')
assert.match(platformStatus, /messagesPerMinute/, 'Web platform metrics normalization missing')
assert.match(platformStatus, /commandSyncAt/, 'Web Discord diagnostics missing')

assert.match(platformApi, /requireMutationSecurity/, 'Platform mutations must enforce CSRF/origin validation')
assert.match(platformApi, /action === 'disconnect' \? 'platforms:disable' : 'platforms:operate'/, 'Platform action permission split missing')
assert.match(platformApi, /sessionIsFreshForCriticalAction/, 'Disconnect must require fresh authentication')
assert.match(platformApi, /recordAdminAudit/, 'Platform actions must be audited')

assert.match(dashboard, /messagesPerMinute/, 'WhatsApp messages/min card missing')
assert.match(dashboard, /platforms\.sequence/, 'Discord sequence card missing')
assert.match(dashboard, /platforms\.telegramUpdates/, 'Telegram updates card missing')
assert.match(dashboard, /ConfirmSubmitButton/, 'Disconnect confirmation missing')
assert.match(dashboard, /\/api\/platforms/, 'Platform action forms missing')
assert.match(dashboard, /readOpsRuntimeLogs/, 'Platform log view missing')
assert.match(dashboard, /digits\.slice\(0, 2\).*digits\.slice\(-4\)/s, 'WhatsApp account must be partially masked')
assert.match(groupPanel, /maskedAccount/, 'WhatsApp account masking must also apply in group inventory')

assert.match(adminPage, /'platforms', t\('nav\.platforms'\)/, 'Admin Platforms tab missing')
assert.match(adminPage, /<PlatformsDashboard/, 'Admin Platforms screen missing')
assert.match(adminPage, /hasPermission\(role, 'platforms:operate'\)/, 'Admin platform operation permission wiring missing')
assert.match(adminPage, /hasPermission\(role, 'platforms:disable'\)/, 'Owner platform disconnect permission wiring missing')

assert.match(subbotPage, /'platforms', t\('nav\.platforms'\)/, 'Subbot Platforms tab missing')
assert.match(subbotPage, /mainRuntimeActions=\{false\}/, 'Subbot runtime controls must remain disabled')
assert.match(subbotPage, /canOperate=\{false\}/, 'Subbot platform operation must remain read-only')

assert.match(webI18n, /'nav\.platforms': 'Plataformas'/, 'Spanish Platforms navigation missing')
assert.match(webI18n, /'nav\.platforms': 'Platforms'/, 'English Platforms navigation missing')
assert.match(extraI18n, /'platforms\.diagnose': 'Diagnosticar'/, 'Spanish diagnostic action missing')
assert.match(extraI18n, /'platforms\.restart': 'Restart connection'/, 'English restart action missing')

console.log('Phase E3 platforms dashboard smoke passed')
