#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const temp = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-v2-phase3-lease-'))
process.env.DATA_DIR = temp
process.env.SESSION_DIR = path.join(temp, 'session')
process.env.OLLAMA_ENABLED = 'false'
process.env.WEB_ENABLED = 'false'
delete process.env.NEXORA_GLOBAL_CONTROL_DB

try {
  const lease = await import('../apps/bot/dist/services/download-providers/lease.js')
  const root = lease.providerLeaseRoot()
  assert.equal(root, path.join(temp, 'provider-leases'))

  let active = 0
  let maxActive = 0
  const order = []
  const work = (id) => lease.withProviderLease('apkmirror', async () => {
    active += 1
    maxActive = Math.max(maxActive, active)
    order.push(`start:${id}`)
    await new Promise((resolve) => setTimeout(resolve, 120))
    order.push(`end:${id}`)
    active -= 1
    return id
  }, { waitMs: 3_000, releaseCooldownMs: 0, pollMs: 50 })

  const values = await Promise.all([work('a'), work('b')])
  assert.deepEqual([...values].sort(), ['a', 'b'])
  assert.equal(maxActive, 1, `provider lease allowed ${maxActive} concurrent holders: ${order.join(', ')}`)

  const staleDir = path.join(root, 'stale-test.lock')
  await mkdir(staleDir, { recursive: true })
  const staleOwner = path.join(staleDir, 'owner.json')
  await writeFile(staleOwner, JSON.stringify({ id: 'dead-process', provider: 'stale-test', pid: 999999, acquiredAt: 0 }))
  const old = new Date(Date.now() - 90_000)
  await utimes(staleOwner, old, old)

  const recovered = await lease.withProviderLease('stale-test', async () => 'recovered', {
    waitMs: 2_000,
    staleMs: 30_000,
    releaseCooldownMs: 0,
    pollMs: 50,
  })
  assert.equal(recovered, 'recovered')

  process.env.NEXORA_GLOBAL_CONTROL_DB = path.join(temp, 'global', 'ghost-nexora.sqlite')
  assert.equal(lease.providerLeaseRoot(), path.join(temp, 'global', 'provider-leases'))

  console.log('[V2 PHASE 3 LEASE] OK — concurrent APKMirror work is serialized, stale locks recover, and subbots resolve the shared global lease root.')
} finally {
  await rm(temp, { recursive: true, force: true })
}
