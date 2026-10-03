#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const root = process.cwd()
const temp = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-phase-d-'))
process.env.DATA_DIR = temp
process.env.SESSION_DIR = path.join(temp, 'session')
process.env.OLLAMA_ENABLED = 'false'
process.env.WEB_ENABLED = 'false'
delete process.env.NEXORA_SUBBOT_ID

const source = async (file) => readFile(path.join(root, file), 'utf8')

try {
  const { WhatsAppMessageCache } = await import('../apps/bot/dist/platform/whatsapp/message-cache.js')
  const cache = new WhatsAppMessageCache({ maxEntries: 64, ttlMs: 60_000 })
  const message = (chatId, id) => ({ key: { remoteJid: chatId, id, fromMe: false }, message: { conversation: id } })

  cache.set('chat-a@g.us', message('chat-a@g.us', 'same-id'), 1_000)
  cache.set('chat-b@g.us', message('chat-b@g.us', 'same-id'), 1_000)
  assert.equal(cache.get('chat-a@g.us', 'same-id', 2_000)?.key.remoteJid, 'chat-a@g.us', 'D2 cache must isolate equal message ids by chat')
  assert.equal(cache.get('chat-b@g.us', 'same-id', 2_000)?.key.remoteJid, 'chat-b@g.us', 'D2 cache cross-chat lookup leaked')

  cache.clear()
  for (let index = 0; index < 64; index += 1) cache.set('lru@g.us', message('lru@g.us', String(index)), 10_000 + index)
  assert.ok(cache.get('lru@g.us', '0', 11_000), 'D2 LRU touch probe missing')
  cache.set('lru@g.us', message('lru@g.us', '64'), 11_001)
  assert.equal(cache.get('lru@g.us', '1', 11_002), undefined, 'D2 LRU must evict the least recently used entry')
  assert.ok(cache.get('lru@g.us', '0', 11_002), 'D2 recently touched entry was evicted')
  cache.set('ttl@g.us', message('ttl@g.us', 'ttl'), 20_000)
  assert.equal(cache.get('ttl@g.us', 'ttl', 80_001), undefined, 'D2 TTL must expire stale messages')

  const { ExecutionQueueManager } = await import('../apps/bot/dist/services/execution-queues.js')
  const queues = new ExecutionQueueManager({
    global: 2,
    perGroup: 1,
    perUser: 1,
    downloads: 1,
    ai: 1,
    subbots: 1,
  })
  let active = 0
  let peak = 0
  const serialized = Array.from({ length: 3 }, (_, index) =>
    queues.run({ chatId: 'group-a', userId: 'user-a', isGroup: true, lane: 'downloads' }, async () => {
      active += 1
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 8 + index))
      active -= 1
    }))
  await Promise.all(serialized)
  assert.equal(peak, 1, 'D3 per-group/per-user/download queues must serialize competing work')

  active = 0
  peak = 0
  await Promise.all([
    queues.run({ chatId: 'g1', userId: 'u1', isGroup: true }, async () => {
      active += 1; peak = Math.max(peak, active); await new Promise((resolve) => setTimeout(resolve, 15)); active -= 1
    }),
    queues.run({ chatId: 'g2', userId: 'u2', isGroup: true }, async () => {
      active += 1; peak = Math.max(peak, active); await new Promise((resolve) => setTimeout(resolve, 15)); active -= 1
    }),
    queues.run({ chatId: 'g3', userId: 'u3', isGroup: true }, async () => {
      active += 1; peak = Math.max(peak, active); await new Promise((resolve) => setTimeout(resolve, 15)); active -= 1
    }),
  ])
  assert.equal(peak, 2, 'D3 global queue must enforce configured global concurrency')

  const { deliverWithOutbox, deliveryOutboxSnapshot } = await import('../apps/bot/dist/services/delivery-outbox.js')
  let attempts = 0
  const delivered = await deliverWithOutbox({
    platform: 'whatsapp',
    chatId: 'phase-d@g.us',
    kind: 'text',
    label: 'phase-d-success',
    correlationId: 'phase-d-correlation',
    maxAttempts: 4,
    backoffMs: [1, 1, 1],
  }, async () => {
    attempts += 1
    if (attempts < 3) throw new Error('synthetic delivery failure')
    return 'sent'
  })
  assert.equal(delivered, 'sent')
  assert.equal(attempts, 3, 'D4 outbox retry count mismatch')
  const successRow = deliveryOutboxSnapshot().find((row) => row.label === 'phase-d-success')
  assert.equal(successRow?.status, 'sent', 'D4 successful delivery must finish as sent')
  assert.equal(Number(successRow?.attempts), 3, 'D4 persisted attempt count mismatch')
  assert.equal(successRow?.correlationId, 'phase-d-correlation', 'D4 correlation id must survive outbox delivery')

  await assert.rejects(() => deliverWithOutbox({
    platform: 'whatsapp',
    chatId: 'phase-d@g.us',
    kind: 'text',
    label: 'phase-d-failed',
    maxAttempts: 2,
    backoffMs: [1],
  }, async () => { throw new Error('permanent synthetic failure') }), /permanent synthetic failure/)
  assert.equal(deliveryOutboxSnapshot().find((row) => row.label === 'phase-d-failed')?.status, 'failed', 'D4 terminal failure must persist failed state')

  const { whatsappUiFallbackChain } = await import('../apps/bot/dist/platform/whatsapp/ui-fallback.js')
  const uiChain = whatsappUiFallbackChain({
    kind: 'carousel',
    title: 'D5',
    cards: [
      { id: '1', title: 'One', body: 'Body one', buttons: [{ kind: 'command', label: 'Open', value: 'ping' }] },
      { id: '2', title: 'Two', body: 'Body two', buttons: [{ kind: 'url', label: 'Docs', value: 'https://example.com' }] },
    ],
  })
  assert.deepEqual(uiChain.map((entry) => entry.kind), ['carousel', 'card', 'list', 'text'], 'D5 fallback order must be Carousel -> Card -> List -> Plain text')

  const { prepareOutgoingMedia, withPreparedMedia } = await import('../apps/bot/dist/services/media-pipeline.js')
  const bytesPrepared = await prepareOutgoingMedia({
    kind: 'document',
    source: { kind: 'bytes', value: new Uint8Array([1, 2, 3, 4]) },
    fileName: 'probe.bin',
  }, { platform: 'Smoke', maxBytes: 16, mode: 'stream' })
  let streamed = 0
  for await (const chunk of await bytesPrepared.openStream()) streamed += chunk.byteLength
  assert.equal(streamed, 4, 'D6 MediaPipeline streaming bytes mismatch')
  await assert.rejects(() => prepareOutgoingMedia({
    kind: 'document',
    source: { kind: 'bytes', value: new Uint8Array(17) },
  }, { platform: 'Smoke', maxBytes: 16 }), /límite seguro/i)

  const originalFetch = globalThis.fetch
  let transcodeCalled = false
  globalThis.fetch = async () => new Response(new Uint8Array([5, 6, 7]), {
    status: 200,
    headers: { 'content-type': 'application/octet-stream', 'content-length': '3' },
  })
  try {
    await withPreparedMedia({
      kind: 'document',
      source: { kind: 'url', value: 'https://media.example/probe.bin' },
    }, {
      platform: 'Smoke',
      maxBytes: 32,
      mode: 'materialize',
      retries: 1,
      transcode: async (input) => {
        transcodeCalled = true
        assert.equal((await stat(input.path)).size, 3, 'D6 temp materialization size mismatch')
        return null
      },
    }, async (prepared) => {
      assert.equal(prepared.source.kind, 'path', 'D6 materialize mode must produce a temporary path')
      assert.equal((await stat(prepared.source.value)).size, 3)
    })
  } finally {
    globalThis.fetch = originalFetch
  }
  assert.equal(transcodeCalled, true, 'D6 optional transcode hook was not reached')

  const [
    contracts,
    adapter,
    router,
    sharedEngine,
    queuesSource,
    outboxSource,
    uiSource,
    mediaSource,
    discordAdapter,
    telegramAdapter,
    adminControl,
    groupOps,
    commandV2,
    roadmap,
  ] = await Promise.all([
    source('packages/platform-contracts/src/index.ts'),
    source('apps/bot/src/platform/whatsapp/adapter.ts'),
    source('apps/bot/src/core/router.ts'),
    source('apps/bot/src/core/shared-command-engine.ts'),
    source('apps/bot/src/services/execution-queues.ts'),
    source('apps/bot/src/services/delivery-outbox.ts'),
    source('apps/bot/src/platform/whatsapp/ui-fallback.ts'),
    source('apps/bot/src/services/media-pipeline.ts'),
    source('apps/bot/src/platform/discord/adapter.ts'),
    source('apps/bot/src/platform/telegram/adapter.ts'),
    source('apps/bot/src/services/admin-web-control.ts'),
    source('apps/bot/src/services/group-ops-runtime.ts'),
    source('apps/bot/src/commands/v2.ts'),
    source('README_NEXT_INTEGRATIONS.md'),
  ])

  assert.doesNotMatch(adapter, /activeUserId/, 'D1 mutable activeUserId must be removed')
  assert.match(contracts, /export interface DeliveryContext/, 'D1 explicit delivery context contract missing')
  assert.match(contracts, /delivery\?: DeliveryContext/, 'D1 SendOptions delivery context missing')
  assert.match(adapter, /deliveryLocale\(chatId: string, delivery\?: DeliveryContext\)/, 'D1 adapter locale must resolve from explicit delivery context')
  assert.match(router, /delivery: options\?\.delivery \?\? delivery/, 'D1 WhatsApp router must bind per-request delivery context')
  assert.match(sharedEngine, /correlationId: request\.correlationId/, 'D1 shared engine must propagate request correlation to delivery')

  assert.match(queuesSource, /global: 20/, 'D3 global default limit changed')
  assert.match(queuesSource, /perGroup: 3/, 'D3 group default limit changed')
  assert.match(queuesSource, /perUser: 2/, 'D3 user default limit changed')
  assert.match(queuesSource, /downloads: 4/, 'D3 downloads default limit changed')
  assert.match(queuesSource, /ai: 3/, 'D3 AI default limit changed')
  assert.match(router, /executionQueues\.run/, 'D3 command router is not queue-bound')

  for (const status of ['pending', 'sending', 'sent', 'retry', 'failed']) {
    assert.ok(outboxSource.includes(status), `D4 outbox status missing: ${status}`)
  }
  assert.match(outboxSource, /\[1_000, 3_000, 10_000\]/, 'D4 default exponential backoff policy missing')
  assert.match(adapter, /deliverWithOutbox/, 'D4 WhatsApp adapter delivery does not pass through outbox')
  assert.match(adminControl, /adapter\.sendText\(groupJid/, 'D4 admin broadcast bypasses adapter/outbox')
  assert.match(groupOps, /adapter\.sendText\(groupJid/, 'D4 group broadcast bypasses adapter/outbox')
  assert.match(commandV2, /ctx\.adapter\.sendText\(group\.id/, 'D4 command broadcast bypasses adapter/outbox')

  assert.match(uiSource, /whatsappUiFallbackChain/, 'D5 fallback planner missing')
  assert.match(adapter, /for \(const stage of whatsappUiFallbackChain\(ui\)\)/, 'D5 adapter fallback execution missing')

  assert.match(mediaSource, /mode: MediaPipelineMode/, 'D6 MediaPipeline mode contract missing')
  assert.match(mediaSource, /openStream/, 'D6 streaming API missing')
  assert.match(mediaSource, /mkdtemp/, 'D6 temporary download support missing')
  assert.match(mediaSource, /cleanup/, 'D6 cleanup contract missing')
  assert.match(mediaSource, /transcode\?:/, 'D6 optional transcoding hook missing')
  assert.match(adapter, /withPreparedMedia/, 'D6 WhatsApp adapter does not use common MediaPipeline')
  assert.match(discordAdapter, /withPreparedMedia/, 'D6 Discord adapter does not use common MediaPipeline')
  assert.match(telegramAdapter, /withPreparedMedia/, 'D6 Telegram adapter does not use common MediaPipeline')

  for (const phase of ['D1', 'D2', 'D3', 'D4', 'D5', 'D6']) {
    assert.match(roadmap, new RegExp(`## ${phase}\\.[\\s\\S]*?Estado: TERMINADO`), `${phase} roadmap status is not TERMINADO`)
  }
  assert.match(roadmap, /Fase D \| Runtime y entrega WhatsApp \| TERMINADO/, 'Phase D summary is not TERMINADO')

  const tempFile = path.join(temp, 'local-media.bin')
  await writeFile(tempFile, new Uint8Array([8, 9]))
  const localPrepared = await prepareOutgoingMedia({
    kind: 'document',
    source: { kind: 'path', value: tempFile },
  }, { platform: 'Smoke', maxBytes: 16, mode: 'stream' })
  assert.equal(localPrepared.size, 2, 'D6 local path size validation missing')

  console.log('Phase D1-D6 WhatsApp runtime and delivery smoke passed')
} finally {
  await rm(temp, { recursive: true, force: true })
}
