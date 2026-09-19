import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(path, 'utf8')

const roadmap = read('README_NEXT_INTEGRATIONS.md')
const health = read('apps/bot/src/services/provider-health.ts')
const spotify = read('apps/bot/src/services/spotify.ts')
const anime = read('apps/bot/src/services/anime.ts')
const jikan = read('apps/bot/src/services/jikan-v2.ts')
const ai = read('apps/bot/src/services/ai.ts')
const ops = read('apps/web/lib/ops.ts')
const dashboard = read('apps/web/components/providers-dashboard.tsx')
const diagnostics = read('apps/web/components/developer-diagnostics.tsx')
const admin = read('apps/web/app/admin/page.tsx')
const subbot = read('apps/web/app/subbot/page.tsx')
const navigation = read('apps/web/components/unified-navigation.tsx')
const i18n = read('apps/web/lib/i18n.ts')
const extraI18n = read('apps/web/lib/ops-extra-i18n.ts')

assert.match(roadmap, /## E4\. Dashboard de Providers y APIs[\s\S]*Estado: TERMINADO/, 'E4 roadmap must be completed')

for (const provider of ['lempi', 'spotify', 'jikan', 'anime1v', 'openrouter']) {
  assert.match(health, new RegExp(`${provider.replace('-', '\\-')}:\s*'`, 'i'), `Provider label missing: ${provider}`)
}
assert.match(health, /export async function trackedProviderCall/, 'Shared provider telemetry wrapper missing')
assert.match(health, /providerCircuitAllows/, 'Provider circuit breaker gate missing')
assert.match(health, /CIRCUIT_FAILURE_THRESHOLD = 3/, 'Circuit breaker failure threshold changed unexpectedly')
assert.match(health, /CIRCUIT_OPEN_MS = 5 \* 60_000/, 'Circuit breaker open interval changed unexpectedly')

assert.match(spotify, /trackedProviderCall\('spotify'/, 'Spotify traffic must publish provider telemetry')
assert.match(anime, /return 'anime1v'/, 'Anime1v traffic must map to its own provider telemetry')
assert.match(anime, /host === 'api\.jikan\.moe'/, 'Anime Jikan traffic must map to Jikan telemetry')
assert.match(jikan, /recordProviderAttempt\('jikan'/, 'Jikan V2 must publish provider telemetry')
assert.match(ai, /trackedProviderCall\(providerId/, 'AI requests must publish provider telemetry')
assert.match(ai, /providerId = isOpenRouter\(\) \? 'openrouter'/, 'OpenRouter must use a dedicated provider id')

assert.match(ops, /circuitState: 'closed' \| 'open' \| 'half-open'/, 'Web provider model must expose circuit state')
assert.match(ops, /function providerCircuitState/, 'Web snapshot must derive circuit breaker state')
assert.match(ops, /lastSuccessAt/, 'Provider last-success telemetry missing')
assert.match(ops, /lastFailureAt/, 'Provider last-failure telemetry missing')
assert.match(ops, /lastError/, 'Provider last-error telemetry missing')

for (const provider of ['lempi', 'spotify', 'jikan', 'anime1v', 'openrouter']) {
  assert.match(dashboard, new RegExp(`id: '${provider}'`), `Primary provider card missing: ${provider}`)
}
assert.match(dashboard, /successRate/, 'Provider success-rate display missing')
assert.match(dashboard, /averageLatencyMs/, 'Average provider latency display missing')
assert.match(dashboard, /lastLatencyMs/, 'Last provider latency display missing')
assert.match(dashboard, /circuitState/, 'Circuit breaker display missing')
assert.match(dashboard, /lastSuccessAt/, 'Last provider success display missing')
assert.match(dashboard, /lastFailureAt/, 'Last provider failure display missing')
assert.match(dashboard, /lastError/, 'Last provider error display missing')
assert.match(dashboard, /filter\(\(provider\) => !knownIds\.has/, 'Unknown/runtime providers must still be displayed')

assert.match(admin, /'providers', t\('nav\.providers'\), ServerCog/, 'Admin Providers navigation missing')
assert.match(admin, /<ProvidersDashboard providers=\{snapshot\.providers\}/, 'Admin Providers screen missing')
assert.match(subbot, /'providers', t\('nav\.providers'\), ServerCog/, 'Subbot Providers navigation missing')
assert.match(subbot, /<ProvidersDashboard providers=\{snapshot\.providers\}/, 'Subbot isolated Providers screen missing')
assert.match(navigation, /\| 'providers'/, 'Unified navigation provider icon missing')
assert.match(navigation, /providers: Boxes/, 'Unified provider navigation icon mapping missing')

assert.equal(/provider\.averageLatencyMs/.test(diagnostics), false, 'Provider product telemetry must not remain duplicated in Developer Diagnostics')
assert.match(i18n, /'nav\.providers': 'Providers'/, 'Providers navigation translation missing')
assert.match(extraI18n, /'provider\.dashboardTitle': 'Providers y APIs'/, 'Spanish E4 dashboard copy missing')
assert.match(extraI18n, /'provider\.dashboardTitle': 'Providers and APIs'/, 'English E4 dashboard copy missing')
assert.match(extraI18n, /'provider\.circuit\.open': 'ABIERTO'/, 'Spanish circuit-breaker copy missing')
assert.match(extraI18n, /'provider\.circuit\.open': 'OPEN'/, 'English circuit-breaker copy missing')

console.log('Phase E4 providers dashboard smoke passed')
