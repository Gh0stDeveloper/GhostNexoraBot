#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const inputArg = process.argv.find((arg) => arg.startsWith('--input='))
const inputPath = path.resolve(inputArg ? inputArg.slice('--input='.length) : 'artifacts/v2-current-inventory.json')
const baselinePath = path.resolve('docs/v2/baselines/phase1-command-regression.json')

const [report, baseline] = await Promise.all([
  readFile(inputPath, 'utf8').then(JSON.parse),
  readFile(baselinePath, 'utf8').then(JSON.parse),
])

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function fingerprint(profile) {
  const commands = profile.commands ?? []
  const canonicalNames = [...new Set(commands.map((command) => command.name))].sort()
  const allTokens = [...new Set(commands.flatMap((command) => [command.name, ...(command.aliases ?? [])]))].sort()
  return {
    commandCount: commands.length,
    canonicalCommandCount: canonicalNames.length,
    duplicateCanonicalNameCount: (profile.duplicateCanonicalNames ?? []).length,
    aliasCollisionCount: (profile.aliasCollisions ?? []).length,
    allTokenCount: allTokens.length,
    canonicalNamesSha256: sha256(`${canonicalNames.join('\n')}\n`),
    commandRowsSha256: sha256(`${commands.map((command) => JSON.stringify(command)).join('\n')}\n`),
    allTokensSha256: sha256(`${allTokens.join('\n')}\n`),
  }
}

function assertEqual(label, actual, expected) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`)
}

assertEqual('providerCount', report.providers?.length ?? 0, baseline.providerCount)
for (const profileName of ['minimal', 'full']) {
  const actualProfile = report.profiles?.[profileName]
  const expectedProfile = baseline.profiles?.[profileName]
  if (!actualProfile || !expectedProfile) throw new Error(`Missing profile ${profileName}`)
  const actual = fingerprint(actualProfile)
  for (const [key, expected] of Object.entries(expectedProfile)) {
    assertEqual(`${profileName}.${key}`, actual[key], expected)
  }
  console.log(`[V2 PHASE 1] ${profileName}: ${actual.commandCount} entries, ${actual.canonicalCommandCount} canonical, registry fingerprint unchanged.`)
}

console.log('[V2 PHASE 1] PASS — WhatsApp adapter migration did not change the frozen V1 command/provider surface.')
