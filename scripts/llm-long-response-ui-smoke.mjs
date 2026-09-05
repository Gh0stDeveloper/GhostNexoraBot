import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

// Simula una VPS existente que todavía conserva el valor histórico de 45 s.
process.env.OLLAMA_ENABLED = 'false'
process.env.OLLAMA_TIMEOUT_MS = '45000'
delete process.env.BOT_MESSAGE_TIMEOUT_MS

const { config } = await import('../apps/bot/dist/config.js')
const { ollama } = await import('../apps/bot/dist/services/ollama.js')

const ollamaConfig = ollama.getConfig()
const queue = ollama.getQueueStats()
assert.equal(ollamaConfig.configuredTimeoutMs, 45_000, 'legacy .env value should still parse')
assert.equal(ollamaConfig.timeoutMs, 360_000, 'Ollama generation must have a 6-minute minimum timeout')
assert.equal(ollamaConfig.keepAlive, '30m', 'Qwen should remain loaded between requests')
assert.equal(ollamaConfig.numPredict, 768, 'Qwen should have enough output budget for long answers')
assert.equal(queue.waitTimeoutMs, 360_000, 'queued local generations must be allowed to wait up to 6 minutes')
assert.equal(queue.maxQueued, 8, 'local inference queue should absorb short bursts without CPU concurrency')
assert.equal(config.botMessageTimeoutMs, 900_000, 'message routing must allow up to 15 minutes')

const ollamaSource = await readFile(new URL('../apps/bot/dist/services/ollama.js', import.meta.url), 'utf8')
assert.equal(ollamaSource.includes('keep_alive'), true, 'Ollama request must keep the model loaded')
assert.equal(ollamaSource.includes('num_predict'), true, 'Ollama request must expose a long-response token budget')

const indexSource = await readFile(new URL('../apps/bot/dist/index.js', import.meta.url), 'utf8')
assert.equal(indexSource.includes('config.botMessageTimeoutMs'), true, 'routeMessage must use the configurable long timeout')

const timeoutSource = await readFile(new URL('../apps/bot/dist/utils/timeout.js', import.meta.url), 'utf8')
assert.equal(timeoutSource.includes('clearTimeout(timer)'), true, 'long timeout timers must be cleared after normal completion')

const { buildDamasGameHtml } = await import('../apps/bot/dist/services/damas-game.js')
const damasHtml = buildDamasGameHtml()
assert.equal(damasHtml.includes('width="560" height="640"'), true, 'checkers canvas must stay large and touch-friendly')
assert.equal(damasHtml.includes('aspect-ratio:7/8'), true, 'checkers must use the enlarged vertical layout')
assert.equal(damasHtml.includes('tablero táctil grande'), true, 'checkers UI should identify the large touch layout')
assert.equal(damasHtml.includes('CS*.38'), true, 'checkers pieces should scale up with the enlarged cells')
assert.equal(damasHtml.includes('minimax'), true, 'strategic checkers AI must remain enabled')
assert.equal(damasHtml.includes('AudioContext'), true, 'checkers sound must remain enabled')

console.log('Long Ollama response + large checkers UI smoke: OK')
