import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [
  roadmap,
  economy,
  security,
  reader,
  view,
  admin,
  navigation,
  i18n,
  publicPage,
] = await Promise.all([
  readFile(new URL('../README_NEXT_INTEGRATIONS.md', import.meta.url), 'utf8'),
  readFile(new URL('../apps/bot/src/services/economy.ts', import.meta.url), 'utf8'),
  readFile(new URL('../apps/web/lib/web-security.ts', import.meta.url), 'utf8'),
  readFile(new URL('../apps/web/lib/economy-ledger.ts', import.meta.url), 'utf8'),
  readFile(new URL('../apps/web/components/economy-ledger-dashboard.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../apps/web/app/admin/page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../apps/web/components/unified-navigation.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../apps/web/lib/ops-extra-i18n.ts', import.meta.url), 'utf8'),
  readFile(new URL('../apps/web/app/page.tsx', import.meta.url), 'utf8'),
])

assert.match(roadmap, /## E9\. Ledger de economía[\s\S]*Estado: (?:EN PROGRESO|TERMINADO)/, 'E9 roadmap status missing')

assert.match(economy, /CREATE TABLE IF NOT EXISTS economy_transactions/, 'E9 transaction table missing')
assert.match(economy, /transaction_id TEXT PRIMARY KEY/, 'E9 transaction ID missing')
assert.match(economy, /wallet_before INTEGER/, 'E9 wallet before snapshot missing')
assert.match(economy, /bank_before INTEGER/, 'E9 bank before snapshot missing')
assert.match(economy, /balance_before INTEGER/, 'E9 balance before snapshot missing')
assert.match(economy, /wallet_after INTEGER NOT NULL/, 'E9 wallet after snapshot missing')
assert.match(economy, /balance_after INTEGER NOT NULL/, 'E9 balance after snapshot missing')
assert.match(economy, /CREATE TRIGGER(?: IF NOT EXISTS)? gn_e9_balance_change/, 'E9 automatic balance guard missing')
assert.match(economy, /CREATE TRIGGER(?: IF NOT EXISTS)? gn_e9_enrich_from_global_ledger/, 'E9 semantic enrichment trigger missing')
assert.match(economy, /CREATE TRIGGER(?: IF NOT EXISTS)? gn_e9_account_opening/, 'E9 opening/import audit missing')
assert.match(economy, /CREATE TRIGGER(?: IF NOT EXISTS)? gn_e9_account_closing/, 'E9 closing/merge audit missing')
assert.match(economy, /source TEXT NOT NULL/, 'E9 source field missing')
assert.match(economy, /legacy_ledger_id INTEGER/, 'E9 legacy correlation field missing')
assert.match(economy, /recordGlobalLedger\(/, 'E9 legacy metadata bridge missing')

assert.match(security, /'economy:ledger'/, 'E9 web permission missing')
assert.match(reader, /openGlobalEconomyDb/, 'E9 must read the shared economy database')
assert.match(reader, /economy_transactions/, 'E9 reader must use canonical transaction table')
assert.match(reader, /instance_role = 'subbot' AND instance_id = \?/, 'E9 subbot filtering missing')
assert.match(reader, /source = 'automatic_guard'/, 'E9 fallback counting missing')
assert.match(view, /ledger\.transactions/, 'E9 summary UI missing')
assert.match(view, /row\.transactionId/, 'E9 transaction id UI missing')
assert.match(view, /row\.balanceBefore/, 'E9 before/after balance UI missing')
assert.match(view, /row\.walletDelta/, 'E9 wallet/bank delta UI missing')
assert.match(admin, /AdminSection = [^\n]*'economy'/, 'E9 admin section missing')
assert.match(admin, /hasPermission\(role, 'economy:ledger'\)/, 'E9 owner permission enforcement missing')
assert.match(admin, /readEconomyLedger\(/, 'E9 admin reader integration missing')
assert.match(navigation, /\| 'economy'/, 'E9 navigation icon missing')
assert.match(i18n, /'ledger\.title'/, 'E9 i18n copy missing')

const rankingStart = publicPage.indexOf('<section id="comandos"')
const rankingEnd = publicPage.indexOf('<section id="descargas"', rankingStart)
const ranking = publicPage.slice(rankingStart, rankingEnd)
assert.ok(rankingStart >= 0 && rankingEnd > rankingStart, 'public command ranking section missing')
assert.match(ranking, /grid gap-px bg-white\/\[\.06\] md:grid-cols-2/, 'public command ranking must use compact two-column rows')
assert.match(ranking, /truncate text-\[10px\]/, 'public command descriptions must be compact')
assert.doesNotMatch(ranking, /xl:grid-cols-5/, 'old oversized ranking grid must stay removed')
assert.doesNotMatch(ranking, /min-h-\[3\.75rem\]/, 'old oversized description height must stay removed')

console.log('Phase E9 economy ledger + compact public ranking smoke passed')
