import assert from 'node:assert/strict'
import {
  PLATFORM_IDS,
  createPlatformCapabilities,
  isPlatformId,
  normalizedUiToText,
  supportsCapabilities,
} from '../packages/platform-contracts/dist/index.js'
import { MemoryPlatformAdapter } from '../packages/platform-contracts/dist/testing.js'
import {
  createCommandInventory,
  findCommandCollisions,
  isCommandAvailable,
} from '../packages/core/dist/index.js'
import {
  createEntityKey,
  createRuntimeNamespace,
  isHealthyRuntimeState,
} from '../packages/runtime/dist/index.js'

assert.deepEqual(PLATFORM_IDS, ['whatsapp', 'telegram', 'discord'])
for (const platform of PLATFORM_IDS) assert.equal(isPlatformId(platform), true)
assert.equal(isPlatformId('signal'), false)

const capabilities = createPlatformCapabilities({
  editMessage: true,
  reactions: true,
  typing: true,
  buttons: true,
  files: true,
  maxUploadBytes: 25_000_000,
})
assert.equal(supportsCapabilities(capabilities, ['editMessage', 'buttons']), true)
assert.equal(supportsCapabilities(capabilities, ['carousel']), false)
assert.throws(() => createPlatformCapabilities({ maxUploadBytes: -1 }), /non-negative safe integer/)

const cardText = normalizedUiToText({
  kind: 'card',
  title: 'Descarga lista',
  body: 'Selecciona una acción',
  buttons: [
    { kind: 'command', label: 'Descargar', value: '.download token_123' },
    { kind: 'url', label: 'Fuente', value: 'https://example.com' },
  ],
})
assert.match(cardText, /Descarga lista/)
assert.match(cardText, /\.download token_123/)
assert.match(cardText, /https:\/\/example\.com/)

const adapter = new MemoryPlatformAdapter('telegram', 'main', capabilities)
await adapter.start()
assert.equal(adapter.started, true)
const sent = await adapter.sendText('chat-1', 'hola')
assert.equal(sent.platform, 'telegram')
await adapter.sendUi('chat-1', { kind: 'text', text: 'fallback' })
await adapter.editMessage('chat-1', sent.messageId, 'hola editado')
await adapter.react('chat-1', sent.messageId, 'ok')
await adapter.setTyping('chat-1', true)
assert.equal(adapter.deliveries.length, 5)
await adapter.stop()
assert.equal(adapter.started, false)

const commandFixture = [
  { name: 'Ping', aliases: ['p'], category: 'general', description: 'Prueba.' },
  { name: 'Info', aliases: ['about'], category: 'general', description: 'Información.' },
]
const inventory = createCommandInventory(commandFixture)
assert.deepEqual(inventory.map((row) => row.name), ['info', 'ping'])
assert.deepEqual(findCommandCollisions(commandFixture), [])
assert.deepEqual(
  findCommandCollisions([
    ...commandFixture,
    { name: 'Probe', aliases: ['p'], category: 'tools', description: 'Colisión.' },
  ]),
  ['p:ping:probe'],
)
assert.equal(isCommandAvailable({ ...commandFixture[0], scope: 'shared' }, 'discord', capabilities), true)
assert.equal(isCommandAvailable({ ...commandFixture[0], scope: 'runtime-only' }, 'discord', capabilities), false)
assert.equal(isCommandAvailable({ ...commandFixture[0], requiresCapabilities: ['carousel'] }, 'telegram', capabilities), false)

const identity = { platform: 'whatsapp', botInstanceId: 'main bot' }
assert.equal(createRuntimeNamespace(identity), 'whatsapp:main%20bot')
assert.equal(createEntityKey(identity, 'user', '521234@server'), 'whatsapp:main%20bot:user:521234%40server')
assert.equal(isHealthyRuntimeState('running'), true)
assert.equal(isHealthyRuntimeState('degraded'), true)
assert.equal(isHealthyRuntimeState('failed'), false)

console.log('[V2 CONTRACTS] OK — platform/core/runtime contracts are buildable and testable without Baileys.')
