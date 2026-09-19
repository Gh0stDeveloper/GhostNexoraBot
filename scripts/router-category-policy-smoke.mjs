import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(path, 'utf8')

const policy = read('apps/bot/src/services/group-command-policy.ts')
const router = read('apps/bot/src/core/router.ts')
const menu = read('apps/bot/src/commands/menu-v5.ts')
const search = read('apps/bot/src/commands/command-search.ts')
const es = read('apps/bot/src/i18n/locales/es/default.ts')
const en = read('apps/bot/src/i18n/locales/en/default.ts')

const communityLine = policy.split('\n').find((line) => line.includes('community: new Set<CommandCategory>')) ?? ''
assert.match(communityLine, /'subbots'/, 'community profile must keep the public .subbot command usable for normal members')
assert.doesNotMatch(communityLine, /'adult'/, 'adult commands must remain opt-in per group')
assert.doesNotMatch(communityLine, /'owner'/, 'owner/staff category must remain privileged')

assert.match(router, /router\.categoryDisabled/, 'router must use a localized category policy response')
assert.match(es, /'router\.categoryDisabled'/, 'Spanish category-disabled translation missing')
assert.match(en, /'router\.categoryDisabled'/, 'English category-disabled translation missing')

assert.match(menu, /isGroupCommandCategoryAllowed/, 'menu must respect group command category policy')
assert.match(menu, /groupPolicyBypass/, 'menu must preserve admin\/staff policy bypass')
assert.match(search, /isGroupCommandCategoryAllowed/, 'command search must respect group command category policy')
assert.match(search, /visibleTo\(ctx, hit\.command, groupAdmin\)/, 'command search results must be filtered to commands usable by the current member')

console.log('Router category policy, menu visibility and subbot access smoke passed')
