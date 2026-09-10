#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const root = process.cwd()
const temp = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-v2-ui-'))
process.env.DATA_DIR = temp
process.env.SESSION_DIR = path.join(temp, 'session')
process.env.OLLAMA_ENABLED = 'false'
process.env.WEB_ENABLED = 'false'

const read = (file) => readFile(path.join(root, file), 'utf8')

try {
  const compat = await import('../apps/bot/dist/platform/whatsapp/ui-compat.js')
  const interactive = await import('../apps/bot/dist/platform/whatsapp/interactive.js')
  const rich = await import('../apps/bot/dist/platform/whatsapp/rich-response.js')

  assert.equal(compat.WHATSAPP_STABLE_UI_POLICY.nativeCarousel, false)
  assert.equal(compat.WHATSAPP_STABLE_UI_POLICY.maxCards, 8)

  const commandCards = [
    {
      title: 'Resultado A',
      body: 'Primera opción',
      buttons: [{ type: 'reply', text: 'Descargar A', id: '.dl a' }],
    },
    {
      title: 'Resultado B',
      body: 'Segunda opción',
      buttons: [{ type: 'reply', text: 'Descargar B', id: '.dl b' }],
    },
  ]
  const commandPlan = compat.planCarousel(commandCards)
  assert.equal(commandPlan.mode, 'select-first')
  assert.equal(commandPlan.sections.length, 2)
  assert.equal(commandPlan.sections[0].rows[0].id, '.dl a')

  const urlCards = [{
    title: 'Sitio',
    body: 'Resultado externo',
    buttons: [{ type: 'url', text: 'Abrir', url: 'https://example.com/result' }],
  }]
  const urlPlan = compat.planCarousel(urlCards)
  assert.equal(urlPlan.mode, 'text-fallback')
  assert.equal(urlPlan.reason, 'contains-url-actions')
  const urlText = compat.carouselFallbackText({ title: 'Resultados', cards: urlCards })
  assert.match(urlText, /https:\/\/example\.com\/result/)
  assert.match(urlText, /Abrir/)

  const nestedSelect = {
    type: 'select',
    text: 'Seleccionar',
    sections: [{ title: 'Opciones', rows: [{ id: '.one', title: 'Uno' }] }],
  }
  assert.equal(compat.planInteractiveCard([]).mode, 'standard-message')
  assert.equal(compat.planInteractiveCard([nestedSelect]).mode, 'native-flow')
  assert.equal(compat.planInteractiveCard([nestedSelect, { type: 'reply', text: 'Dos', id: '.two' }]).mode, 'text-fallback')

  const sent = []
  const relayed = []
  let nextId = 0
  const socket = {
    user: { id: '5215551111111:1@s.whatsapp.net' },
    async sendMessage(jid, content, options) {
      nextId += 1
      const result = { key: { remoteJid: jid, fromMe: true, id: `safe-${nextId}` }, message: content }
      sent.push({ jid, content, options, result })
      return result
    },
    async relayMessage(jid, content, options) {
      relayed.push({ jid, content, options })
    },
  }

  const chatId = '120363000000000000@g.us'
  await interactive.sendCarousel(socket, chatId, undefined, {
    title: 'Compat results',
    cards: commandCards,
  })
  assert.equal(relayed.length, 1, 'command carousel must become one select-first Native Flow relay')
  const selectRelay = JSON.stringify(relayed[0].content)
  assert.match(selectRelay, /single_select/)
  assert.doesNotMatch(selectRelay, /carouselMessage|CarouselMessage/)

  const relayCount = relayed.length
  await interactive.sendCarousel(socket, chatId, undefined, {
    title: 'External results',
    cards: urlCards,
  })
  assert.equal(relayed.length, relayCount, 'URL carousel must avoid native interactive relay')
  assert.match(String(sent.at(-1)?.content?.text ?? ''), /https:\/\/example\.com\/result/)

  await interactive.sendInteractiveCard(socket, chatId, undefined, {
    title: 'Informativo',
    body: 'Sin acciones',
    footer: 'Ghost Nexora',
  })
  assert.match(String(sent.at(-1)?.content?.text ?? ''), /Informativo/)

  await interactive.sendInteractiveCard(socket, chatId, undefined, {
    title: 'Mixto',
    body: 'No debe emitir select mezclado',
    buttons: [nestedSelect, { type: 'reply', text: 'Dos', id: '.two' }],
  })
  assert.equal(relayed.length, relayCount, 'mixed select/actions must remain outside native relay')
  assert.match(String(sent.at(-1)?.content?.text ?? ''), /\.two/)
  assert.match(String(sent.at(-1)?.content?.text ?? ''), /\.one/)

  const beforeRich = relayed.length
  const responseId = 'message-phase2-smoke'
  const richMessage = await rich.relayWhatsAppRichResponse(socket, chatId, {
    responseId,
    submessages: [{ messageType: 2, messageText: 'HTML' }],
    unifiedData: Buffer.from('{"ok":true}').toString('base64'),
    timeoutMs: 2_000,
    logLabel: 'phase2-smoke',
  })
  assert.equal(relayed.length, beforeRich + 1)
  assert.equal(relayed.at(-1).options.messageId, richMessage.key.id)
  const richRelay = JSON.stringify(relayed.at(-1).content)
  assert.match(richRelay, /botForwardedMessage/)
  assert.match(richRelay, /richResponseMessage/)

  const interactiveSource = await read('apps/bot/src/platform/whatsapp/interactive.ts')
  const compatSource = await read('apps/bot/src/platform/whatsapp/ui-compat.ts')
  const richSource = await read('apps/bot/src/platform/whatsapp/rich-response.ts')
  const gameSource = await read('apps/bot/src/services/ai-html.ts')
  const browserSource = await read('apps/bot/src/commands/navegador.ts')
  const editSource = await read('apps/bot/src/commands/edit.ts')

  assert.doesNotMatch(interactiveSource, /carouselMessage|CarouselMessage/)
  assert.match(interactiveSource, /planCarousel/)
  assert.match(interactiveSource, /single_select/)
  assert.match(compatSource, /nativeCarousel: false/)
  assert.match(compatSource, /contains-url-actions/)

  for (const source of [gameSource, browserSource]) {
    assert.match(source, /relayWhatsAppRichResponse/)
    assert.doesNotMatch(source, /generateWAMessageFromContent/)
    assert.doesNotMatch(source, /\.relayMessage\(/)
  }
  assert.match(richSource, /generateWAMessageFromContent/)
  assert.match(richSource, /messageId/)
  assert.match(richSource, /botForwardedMessage/)

  // Valley bug-bounty behavior remains outside the UI compatibility layer.
  assert.match(editSource, /executeEditMessageIdPoc/)
  assert.match(editSource, /executeValleyInvisibleMessageIdCollision/)
  assert.doesNotMatch(editSource, /ui-compat|planCarousel|relayWhatsAppRichResponse/)

  console.log('[V2 PHASE 2] OK — stable UI removes native carousels, preserves actions and shares the .view/game rich transport.')
} finally {
  await rm(temp, { recursive: true, force: true })
}
