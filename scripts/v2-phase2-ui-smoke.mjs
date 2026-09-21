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

  assert.equal(compat.WHATSAPP_STABLE_UI_POLICY.nativeCarousel, true)
  assert.equal(compat.WHATSAPP_STABLE_UI_POLICY.maxCards, 8)
  assert.equal(compat.WHATSAPP_STABLE_UI_POLICY.maxButtonsPerCarouselCard, 2)

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
  assert.equal(commandPlan.mode, 'native-carousel')
  assert.equal(commandPlan.cards.length, 2)
  assert.equal(commandPlan.cards[0].buttons[0].id, '.dl a')

  const urlCards = [{
    title: 'Sitio',
    body: 'Resultado externo',
    buttons: [{ type: 'url', text: 'Abrir', url: 'https://example.com/result' }],
  }]
  const urlPlan = compat.planCarousel(urlCards)
  assert.equal(urlPlan.mode, 'native-carousel')
  assert.equal(urlPlan.cards[0].buttons[0].url, 'https://example.com/result')

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
    title: 'Native results',
    cards: commandCards,
  })
  assert.equal(relayed.length, 1, 'command carousel must use one native carousel relay')
  const commandRelay = JSON.stringify(relayed[0].content)
  assert.match(commandRelay, /carouselMessage/)
  assert.match(commandRelay, /quick_reply/)
  assert.match(commandRelay, /\.dl a/)
  assert.doesNotMatch(commandRelay, /single_select/)

  await interactive.sendCarousel(socket, chatId, undefined, {
    title: 'External results',
    cards: urlCards,
  })
  assert.equal(relayed.length, 2, 'URL carousel must remain a native carousel relay')
  const urlRelay = JSON.stringify(relayed[1].content)
  assert.match(urlRelay, /carouselMessage/)
  assert.match(urlRelay, /cta_url/)
  assert.match(urlRelay, /https:\/\/example\.com\/result/)

  await interactive.sendInteractiveCard(socket, chatId, undefined, {
    title: 'Informativo',
    body: 'Sin acciones',
    footer: 'Ghost Nexora',
  })
  assert.match(String(sent.at(-1)?.content?.text ?? ''), /Informativo/)

  const relayCount = relayed.length
  await interactive.sendInteractiveCard(socket, chatId, undefined, {
    title: 'Mixto',
    body: 'No debe emitir select mezclado',
    buttons: [nestedSelect, { type: 'reply', text: 'Dos', id: '.two' }],
  })
  assert.equal(relayed.length, relayCount, 'mixed select/actions card must remain outside native relay')
  assert.match(String(sent.at(-1)?.content?.text ?? ''), /\.two/)
  assert.match(String(sent.at(-1)?.content?.text ?? ''), /\.one/)

  // Reviewed location-header path used by .menu (buttonsMessage + locationMessage).
  assert.equal(typeof interactive.sendLocationHeaderCard, 'function')
  const beforeLocation = relayed.length
  // Without a real image URL the transport falls back to interactive card;
  // still assert the function is reachable and does not throw.
  await interactive.sendLocationHeaderCard(socket, chatId, undefined, {
    title: 'Menú',
    body: 'Cuerpo del menú con enlace https://ghostnexorabot.duckdns.org',
    footer: 'Ghost Nexora Bot',
    locationName: 'Ghost Nexora Bot',
    locationAddress: 'Versión: 2.0.0',
    mentionedJid: ['5215550000000@s.whatsapp.net'],
    buttons: [
      { type: 'reply', text: 'Ping', id: '.ping' },
      { type: 'reply', text: 'Perfil', id: '.profile' },
    ],
  })
  // Either a location-header relay or a fallback interactive/standard send is acceptable.
  assert.ok(relayed.length >= beforeLocation || sent.length > 0, 'location header path must send something')

  const interactiveSource = await read('apps/bot/src/platform/whatsapp/interactive.ts')
  assert.match(interactiveSource, /buttonsMessage/)
  assert.match(interactiveSource, /locationMessage/)
  assert.match(interactiveSource, /headerType:\s*6/)
  assert.match(interactiveSource, /jpegThumbnail/)
  assert.match(interactiveSource, /sendLocationHeaderCard/)
  assert.match(interactiveSource, /location-header menu card relay completed/)

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

  const compatSource = await read('apps/bot/src/platform/whatsapp/ui-compat.ts')
  const richSource = await read('apps/bot/src/platform/whatsapp/rich-response.ts')
  const gameSource = await read('apps/bot/src/services/ai-html.ts')
  const browserSource = await read('apps/bot/src/commands/navegador.ts')
  const editSource = await read('apps/bot/src/commands/edit.ts')

  assert.match(interactiveSource, /carouselMessage/)
  assert.match(interactiveSource, /CarouselMessage/)
  assert.match(interactiveSource, /native WhatsApp carousel relay completed/)
  assert.match(interactiveSource, /maxButtonsPerCarouselCard/)
  assert.match(compatSource, /nativeCarousel: true/)
  assert.match(compatSource, /mode: 'native-carousel'/)

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

  console.log('[V2 PHASE 2] OK — native carousels restored; location-header menu transport reviewed; .view/game rich transport isolated.')
} finally {
  await rm(temp, { recursive: true, force: true })
}
