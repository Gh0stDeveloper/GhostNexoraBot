#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const inputArg = process.argv.find((arg) => arg.startsWith('--input='))
const inputPath = path.resolve(inputArg ? inputArg.slice('--input='.length) : 'artifacts/v2-current-inventory.json')
const baselinePath = path.resolve('docs/v2/baselines/phase1-command-regression.json')
const providerCatalogPath = path.resolve('docs/v2/baselines/providers-v2-phase3.json')

const PHASE3_COMMANDS = new Map([
  ['vk', ['vkd', 'vkvideo']],
  ['apkmirror', ['amirror', 'apkm']],
  ['apkmirrordl', ['amdl']],
  ['apkpure', ['apkp', 'pureapk']],
  ['apkpuredl', ['apdl']],
  ['providerhealth', ['dlhealth']],
])

const [report, baseline, providerCatalog] = await Promise.all([
  readFile(inputPath, 'utf8').then(JSON.parse),
  readFile(baselinePath, 'utf8').then(JSON.parse),
  readFile(providerCatalogPath, 'utf8').then(JSON.parse),
])

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function fingerprint(commands, profile) {
  const canonicalNames = [...new Set(commands.map((command) => command.name))].sort()
  const allTokens = [...new Set(commands.flatMap((command) => [command.name, ...(command.aliases ?? [])]))].sort()
  const canonicalCounts = new Map()
  const tokenOwners = new Map()
  const collisions = []
  for (const row of commands) {
    canonicalCounts.set(row.name, (canonicalCounts.get(row.name) ?? 0) + 1)
    for (const token of [row.name, ...(row.aliases ?? [])]) {
      const owner = tokenOwners.get(token)
      if (owner && owner !== row.name) collisions.push({ token, first: owner, second: row.name })
      else tokenOwners.set(token, row.name)
    }
  }
  return {
    commandCount: commands.length,
    canonicalCommandCount: canonicalNames.length,
    duplicateCanonicalNameCount: [...canonicalCounts.values()].filter((count) => count > 1).length,
    aliasCollisionCount: collisions.length,
    allTokenCount: allTokens.length,
    canonicalNamesSha256: sha256(`${canonicalNames.join('\n')}\n`),
    commandRowsSha256: sha256(`${commands.map((command) => JSON.stringify(command)).join('\n')}\n`),
    allTokensSha256: sha256(`${allTokens.join('\n')}\n`),
    sourceDuplicateCanonicalNameCount: (profile.duplicateCanonicalNames ?? []).length,
    sourceAliasCollisionCount: (profile.aliasCollisions ?? []).length,
  }
}

function assertEqual(label, actual, expected) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`)
}

assertEqual('historical provider inventory remains frozen', report.providers?.length ?? 0, baseline.providerCount)
assertEqual('phase3 provider catalog total', providerCatalog.totalProviders, 21)
for (const id of ['vk', 'apkmirror', 'apkpure']) {
  if (!providerCatalog.providers?.some((provider) => provider.id === id)) throw new Error(`Phase 3 provider catalog missing ${id}`)
}

for (const profileName of ['minimal', 'full']) {
  const profile = report.profiles?.[profileName]
  const expected = baseline.profiles?.[profileName]
  if (!profile || !expected) throw new Error(`Missing profile ${profileName}`)

  for (const [name, aliases] of PHASE3_COMMANDS) {
    const matches = (profile.commands ?? []).filter((command) => command.name === name)
    assertEqual(`${profileName}.${name}.count`, matches.length, 1)
    const actualAliases = [...(matches[0]?.aliases ?? [])].sort()
    assertEqual(`${profileName}.${name}.aliases`, JSON.stringify(actualAliases), JSON.stringify([...aliases].sort()))
  }

  const withoutPhase3 = (profile.commands ?? []).filter((command) => !PHASE3_COMMANDS.has(command.name))
  const frozen = fingerprint(withoutPhase3, profile)
  for (const [key, value] of Object.entries(expected)) {
    if (key === 'duplicateCanonicalNameCount') {
      assertEqual(`${profileName}.${key}`, frozen.duplicateCanonicalNameCount, value)
      continue
    }
    if (key === 'aliasCollisionCount') {
      assertEqual(`${profileName}.${key}`, frozen.aliasCollisionCount, value)
      continue
    }
    assertEqual(`${profileName}.${key}`, frozen[key], value)
  }

  assertEqual(`${profileName}.phase3 command delta`, (profile.commands ?? []).length - withoutPhase3.length, PHASE3_COMMANDS.size)
  assertEqual(`${profileName}.current command count`, profile.commandCount, expected.commandCount + PHASE3_COMMANDS.size)
  assertEqual(`${profileName}.current canonical count`, profile.canonicalCommandCount, expected.canonicalCommandCount + PHASE3_COMMANDS.size)
  assertEqual(`${profileName}.legacy duplicate canonical debt unchanged`, profile.duplicateCanonicalNames?.length ?? 0, expected.duplicateCanonicalNameCount)
  assertEqual(`${profileName}.legacy alias collision debt unchanged`, profile.aliasCollisions?.length ?? 0, expected.aliasCollisionCount)
  console.log(`[V2 PHASE 3] ${profileName}: +${PHASE3_COMMANDS.size} approved commands; frozen V1 fingerprint intact.`)
}

console.log('[V2 PHASE 3] PASS — Phase 3 adds only the approved provider commands and preserves the complete V1 registry surface.')
