#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const temp = await mkdtemp(path.join(os.tmpdir(), 'ghostnexora-valley-edit-v23-'))
process.env.DATA_DIR = temp
process.env.NEXORA_INSTANCE_ROLE = 'main'
delete process.env.NEXORA_GLOBAL_CONTROL_DB
delete process.env.NEXORA_SUBBOT_ID

try {
  const poc = await import('../apps/bot/dist/services/security-poc-scope.js')
  const { default: editCommand } = await import('../apps/bot/dist/commands/edit.js')

  const group = '120363000000000303@g.us'
  const owner = '5215550000000@s.whatsapp.net'
  poc.addPocChat(group, 'Valley parity lab', owner)

  function commandMessage(targetId, commandId) {
    return {
      key: {
        remoteJid: group,
        participant: owner,
        fromMe: false,
        id: commandId,
      },
      message: {
        extendedTextMessage: {
          text: '.edit texto nuevo',
          contextInfo: {
            stanzaId: targetId,
            participant: '5215551112222@s.whatsapp.net',
            quotedMessage: { conversation: 'mensaje objetivo' },
          },
        },
      },
    }
  }

  function context(socket, targetId, commandId, text) {
    return {
      isOwner: true,
      isBotStaff: false,
      isGroup: true,
      chatId: group,
      sender: owner,
      prefix: '.',
      argText: text,
      args: text.split(/\s+/).filter(Boolean),
      socket,
      message: commandMessage(targetId, commandId),
    }
  }

  // ValleyBot parity: base message -> edit.id=baseId -> packet messageId=quoted stanzaId
  // -> delete quoted stanzaId through the callback.
  {
    const sent = []
    const relayed = []
    let sendCount = 0
    const socket = {
      async sendMessage(chatId, content, options) {
        sendCount += 1
        sent.push({ chatId, content, options })
        if (sendCount === 1) return { key: { id: 'VALLEY_BASE_ID' } }
        return { key: { id: `SEND_${sendCount}` } }
      },
      async relayMessage(chatId, content, options) {
        relayed.push({ chatId, content, options })
      },
    }

    await editCommand.handler(context(socket, 'TARGET_VALLEYBOT_ID', 'COMMAND_A', 'texto por ValleyBot'))

    assert.equal(sent.length, 3, 'ValleyBot path must create base, send edit and delete target')
    assert.equal(sent[0].chatId, group)
    assert.equal(sent[0].content.text, '', 'base message must preserve the upstream empty baseText')
    assert.equal(sent[1].content.text, 'texto por ValleyBot')
    assert.equal(sent[1].content.edit.id, 'VALLEY_BASE_ID', 'edit.id must use the generated base message ID')
    assert.equal(sent[1].options.messageId, 'TARGET_VALLEYBOT_ID', 'edit packet must reuse the quoted stanzaId')
    assert.equal(sent[2].content.delete.id, 'TARGET_VALLEYBOT_ID', 'callback must delete the quoted stanzaId exactly like ValleyBot')
    assert.equal(relayed.length, 0, 'ValleyInvisible fallback must not run when ValleyBot succeeds')
  }

  // ValleyInvisible parity: if the ValleyBot transport rejects the edit packet,
  // preserve extendedTextMessage + relayMessage + messageId=customId unchanged.
  {
    const sent = []
    const relayed = []
    let sendCount = 0
    const socket = {
      async sendMessage(chatId, content, options) {
        sendCount += 1
        sent.push({ chatId, content, options })
        if (sendCount === 1) return { key: { id: 'VALLEY_FALLBACK_BASE' } }
        if (sendCount === 2) throw new Error('simulated edit transport rejection')
        return { key: { id: `SEND_${sendCount}` } }
      },
      async relayMessage(chatId, content, options) {
        relayed.push({ chatId, content, options })
      },
    }

    await editCommand.handler(context(socket, 'TARGET_INVISIBLE_ID', 'COMMAND_B', 'texto por ValleyInvisible'))

    assert.equal(sent.length, 2, 'fallback case must stop the ValleyBot sequence at the rejected edit')
    assert.equal(relayed.length, 1, 'ValleyInvisible collision primitive must execute exactly once')
    assert.equal(relayed[0].chatId, group)
    assert.deepEqual(relayed[0].content, {
      extendedTextMessage: {
        text: 'texto por ValleyInvisible',
      },
    })
    assert.equal(relayed[0].options.messageId, 'TARGET_INVISIBLE_ID', 'ValleyInvisible must force customId as relay messageId')
  }

  assert.equal(poc.removePocChat(group), true)
  console.log('V23 ValleyBot edit + ValleyInvisible messageId collision parity: OK')
} finally {
  await rm(temp, { recursive: true, force: true })
}
