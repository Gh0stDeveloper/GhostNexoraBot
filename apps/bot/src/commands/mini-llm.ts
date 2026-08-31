import type { BotCommand } from '../types.js'
import { miniLLM } from '../services/mini-llm.js'
import { downloadSources } from '../llm/corpus-manager.js'
import {
  enqueueDocumentFromWhatsApp,
  getQueueStats,
  listJobsByStatus,
  clearCompletedJobs,
  retryFailedJobs,
} from '../llm/document-queue.js'
import { requestTraining, trainingQueueStatus } from '../llm/training-queue.js'
import { installSeedCorpus } from '../llm/seed-corpus.js'
import { countVectors } from '../llm/incremental-corpus.js'
import { llmFreeChat } from '../services/llm-free-chat.js'
import fs from 'node:fs'
import path from 'node:path'

function formatBytes(value: number) {
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${value} B`
}

function help(prefix: string) {
  return [
    '╭━━〔 🧠 *MINI-LLM* 〕━━╮',
    `│ ${prefix}llm status | progress | queue | docs`,
    `│ ${prefix}llm free on|off | global on|off`,
    `│ ${prefix}llm free mention|react|slang on|off`,
    `│ ${prefix}llm free cooldown on|off | set <ms>`,
    `│ ${prefix}llm free antispam on|off`,
    `│ ${prefix}llm free spam <n> [ventana_s]`,
    `│ ${prefix}llm free group add|remove|list|clear`,
    `│ ${prefix}llm add | process | seed | train | stop`,
    `│ ${prefix}llm ask <q> | search <q>`,
    '╰━━━━━━━━━━━━━━━━━━╯',
  ].join('\n')
}

export const miniLlmCommands: BotCommand[] = [{
  name: 'llm',
  aliases: ['minillm', 'localai', 'corpus', 'llmcorpus'],
  category: 'tools',
  description: 'Mini-LLM local: cola, train, modo libre y memoria.',
  usage: 'llm <status|progress|free|add|process|seed|train|ask|…>',
  async handler(ctx) {
    const sub = (ctx.args[0] ?? 'status').toLowerCase()
    if (sub === 'help' || sub === 'ayuda') { await ctx.reply(help(ctx.prefix)); return }
    if (!ctx.isOwner && !ctx.isBotStaff) {
      throw new Error('Los comandos .llm son solo para Owner/Staff. Con modo libre activo, escribe sin prefijo (en grupos: mención).')
    }

    if (sub === 'status' || sub === 'estado') {
      const s = miniLLM.stats()
      const q = getQueueStats()
      let vectors = s.vectorRecords
      try { vectors = countVectors() } catch {}
      await ctx.reply([
        '╭━━〔 🧠 *STATUS* 〕━━╮',
        `┃ Modelo v${s.modelVersion} · vocab ${s.vocabSize}`,
        `┃ Vectores ${vectors} · steps ${s.trainSteps}`,
        `┃ Loss ${s.lastLoss?.toFixed(4) ?? 'N/D'}`,
        `┃ Libre: ${llmFreeChat.statusLine()}`,
        `┃ Cola Q:${q.queued} P:${q.processing} OK:${q.completed}`,
        '╰━━━━━━━━━━━━━━━━━━╯',
      ].join('\n'))
      return
    }

    if (sub === 'progress' || sub === 'avance') {
      const s = miniLLM.stats()
      const q = getQueueStats()
      const t = trainingQueueStatus()
      const pct = s.learning ? Math.min(100, Number(s.currentProgress) || 0) : t.requested ? 0 : 100
      await ctx.reply(`🧠 Progress: ${s.learning ? 'ENTRENANDO' : t.requested ? 'EN COLA' : 'IDLE'} ${pct}%\nPaso ${s.currentStep}/${s.currentTotalSteps || 1}\nCola Q:${q.queued}`)
      return
    }

    if (sub === 'queue' || sub === 'cola') {
      const queued = listJobsByStatus('queued').slice(-10)
      await ctx.reply(queued.length ? queued.map((j) => `• ${j.filename}`).join('\n') : 'Cola vacía.')
      return
    }

    if (sub === 'docs' || sub === 'documentos') {
      const docs = miniLLM.listDocuments().slice(-40)
      await ctx.reply(
        docs.length
          ? docs.map((d: { name: string; size: number }, i: number) => `${i + 1}. ${d.name} (${formatBytes(d.size)})`).join('\n')
          : 'Sin documentos.',
      )
      return
    }

    if (sub === 'free' || sub === 'libre') {
      const mode = (ctx.args[1] ?? '').toLowerCase()
      const mode2 = (ctx.args[2] ?? '').toLowerCase()
      const mode3 = (ctx.args[3] ?? '').toLowerCase()

      if (mode === 'global') {
        if (!['on', 'off'].includes(mode2)) throw new Error(`Uso: ${ctx.prefix}llm free global on|off`)
        llmFreeChat.setGlobal(mode2 === 'on')
        await ctx.reply(`🧠 Libre GLOBAL: *${mode2.toUpperCase()}*\n${llmFreeChat.statusLine()}`)
        return
      }
      if (mode === 'mention' || mode === 'mencion' || mode === 'mención') {
        if (!['on', 'off'].includes(mode2)) throw new Error(`Uso: ${ctx.prefix}llm free mention on|off`)
        llmFreeChat.setRequireMention(mode2 === 'on')
        await ctx.reply(`🧠 Mención en grupos: *${mode2.toUpperCase()}*`)
        return
      }
      if (mode === 'react' || mode === 'reacciones') {
        if (!['on', 'off'].includes(mode2)) throw new Error(`Uso: ${ctx.prefix}llm free react on|off`)
        llmFreeChat.setReactions(mode2 === 'on')
        await ctx.reply(`🧠 Reacciones: *${mode2.toUpperCase()}*`)
        return
      }
      if (mode === 'slang' || mode === 'groserias' || mode === 'groserías') {
        if (!['on', 'off'].includes(mode2)) throw new Error(`Uso: ${ctx.prefix}llm free slang on|off`)
        llmFreeChat.setSlangEnabled(mode2 === 'on')
        await ctx.reply(`🧠 Respuestas con groserías: *${mode2.toUpperCase()}*\n${llmFreeChat.statusLine()}`)
        return
      }
      if (mode === 'cooldown' || mode === 'cd') {
        if (mode2 === 'on' || mode2 === 'off') {
          llmFreeChat.setCooldownEnabled(mode2 === 'on')
          await ctx.reply(`🧠 Cooldown: *${mode2.toUpperCase()}*\n${llmFreeChat.statusLine()}`)
          return
        }
        if (mode2 === 'set' || mode2 === 'ms') {
          const ms = Number(mode3 || ctx.args[3])
          if (!Number.isFinite(ms) || ms < 0) throw new Error(`Uso: ${ctx.prefix}llm free cooldown set <ms>  (0–120000)`)
          const value = llmFreeChat.setCooldownMs(ms)
          llmFreeChat.setCooldownEnabled(true)
          await ctx.reply(`🧠 Cooldown = *${value} ms* (activado)\n${llmFreeChat.statusLine()}`)
          return
        }
        if (mode2 === 'status' || mode2 === '') {
          const s = llmFreeChat.getState()
          await ctx.reply(`🧠 Cooldown: *${s.cooldownEnabled ? 'ON' : 'OFF'}* · ${s.cooldownMs} ms\nAnti-spam: *${s.antispamEnabled ? 'ON' : 'OFF'}* · máx ${s.maxRepliesPerWindow}/${Math.round(s.spamWindowMs / 1000)}s`)
          return
        }
        throw new Error(`Uso: ${ctx.prefix}llm free cooldown on|off | set <ms>`)
      }
      if (mode === 'antispam' || mode === 'anti-spam') {
        if (!['on', 'off'].includes(mode2)) throw new Error(`Uso: ${ctx.prefix}llm free antispam on|off`)
        llmFreeChat.setAntispamEnabled(mode2 === 'on')
        await ctx.reply(`🧠 Anti-spam LLM: *${mode2.toUpperCase()}*\n${llmFreeChat.statusLine()}`)
        return
      }
      if (mode === 'spam') {
        if (mode2 === 'on' || mode2 === 'off') {
          llmFreeChat.setAntispamEnabled(mode2 === 'on')
          await ctx.reply(`🧠 Anti-spam LLM: *${mode2.toUpperCase()}*\n${llmFreeChat.statusLine()}`)
          return
        }
        const n = Number(mode2)
        if (!Number.isFinite(n) || n < 1) throw new Error(`Uso: ${ctx.prefix}llm free spam on|off  o  spam <max> [ventana_s]`)
        llmFreeChat.setMaxRepliesPerWindow(n)
        llmFreeChat.setAntispamEnabled(true)
        if (mode3) {
          const sec = Number(mode3)
          if (Number.isFinite(sec) && sec >= 5) llmFreeChat.setSpamWindowMs(sec * 1000)
        }
        await ctx.reply(`🧠 Anti-spam actualizado (activado)\n${llmFreeChat.statusLine()}`)
        return
      }
      if (mode === 'group' || mode === 'grupo') {
        if (mode2 === 'add') {
          if (!ctx.chatId.endsWith('@g.us')) throw new Error('Usa esto dentro de un grupo.')
          llmFreeChat.addGroup(ctx.chatId)
          await ctx.reply(`✅ Grupo en whitelist.\n${llmFreeChat.statusLine()}`)
          return
        }
        if (mode2 === 'remove' || mode2 === 'del') {
          llmFreeChat.removeGroup(ctx.chatId)
          await ctx.reply('✅ Grupo fuera de whitelist.')
          return
        }
        if (mode2 === 'clear') {
          llmFreeChat.clearGroupWhitelist()
          await ctx.reply('✅ Whitelist vacía (= todos los grupos enabled).')
          return
        }
        if (mode2 === 'list') {
          const list = llmFreeChat.getState().groupWhitelist
          await ctx.reply(list.length ? list.map((g, i) => `${i + 1}. ${g}`).join('\n') : 'Whitelist vacía.')
          return
        }
        throw new Error(`Uso: ${ctx.prefix}llm free group add|remove|list|clear`)
      }
      if (!['on', 'off', 'status', ''].includes(mode)) {
        throw new Error(`Uso: ${ctx.prefix}llm free on|off | global | mention | react | slang | cooldown | antispam | spam | group`)
      }
      if (mode === 'status' || mode === '') {
        await ctx.reply(`🧠 Libre chat: *${llmFreeChat.isEnabled(ctx.chatId) ? 'ON' : 'OFF'}*\n${llmFreeChat.statusLine()}`)
        return
      }
      llmFreeChat.setChat(ctx.chatId, mode === 'on')
      await ctx.reply(mode === 'on' ? '🔓 LLM liberado en este chat.' : '🔒 LLM bloqueado en este chat.')
      return
    }

    if (sub === 'seed') {
      const force = (ctx.args[1] ?? '') === 'force'
      const result = await installSeedCorpus(force)
      await ctx.reply(result.ok ? `✅ Seed: ${result.reason} (${result.installed})` : '❌ Seed no encontrado')
      return
    }
    if (sub === 'process') {
      requestTraining('manual', ctx.sender, true)
      await ctx.reply(`⚙️ Process + train encolado. Q:${getQueueStats().queued}`)
      return
    }
    if (sub === 'retry-failed') { await ctx.reply(`🔁 ${retryFailedJobs()} reencolados`); return }
    if (sub === 'clear-done') { await ctx.reply(`🧹 ${clearCompletedJobs()} limpiados`); return }
    if (sub === 'download') {
      const ids = ctx.args.slice(1)
      if (!ids.length) throw new Error('llm download <id>')
      void downloadSources(ids)
      await ctx.reply(`⬇️ Descargando ${ids.length}…`)
      return
    }
    if (sub === 'add') {
      const job = await enqueueDocumentFromWhatsApp(ctx.message)
      await ctx.reply(`✅ En cola: ${job.filename} (${formatBytes(job.bytes)})`)
      return
    }
    if (sub === 'stop') {
      try {
        const statePath = path.join(miniLLM.ROOT, 'state.json')
        const current = JSON.parse(fs.readFileSync(statePath, 'utf8')) as Record<string, unknown>
        current.learning = false
        current.currentMessage = 'Detenido'
        fs.writeFileSync(statePath, JSON.stringify(current, null, 2))
      } catch {}
      await ctx.reply('⏹️ Stop solicitado.')
      return
    }
    if (sub === 'train' || sub === 'entrenar') {
      requestTraining('manual', ctx.sender, true)
      await ctx.reply('🧠 Train encolado.')
      return
    }
    if (sub === 'ask') {
      const query = ctx.args.slice(1).join(' ').trim()
      if (query.length < 2) throw new Error('llm ask <pregunta>')
      await ctx.reply(miniLLM.answer(query))
      return
    }
    if (sub === 'search') {
      const query = ctx.args.slice(1).join(' ').trim()
      const hits = miniLLM.search(query, 5)
      await ctx.reply(
        hits.length
          ? hits.map((h: { score: number; text: string }, i: number) => `${i + 1}. ${Math.round(h.score * 100)}%\n${h.text.slice(0, 500)}`).join('\n\n')
          : 'Sin hits',
      )
      return
    }
    if (sub === 'auto') {
      const mode = (ctx.args[1] ?? '').toLowerCase()
      if (!['on', 'off'].includes(mode)) throw new Error('llm auto on|off')
      const statePath = `${miniLLM.ROOT}/state.json`
      let current: Record<string, unknown> = {}
      try { current = JSON.parse(fs.readFileSync(statePath, 'utf8')) as Record<string, unknown> } catch {}
      current.autoTrainEnabled = mode === 'on'
      fs.writeFileSync(statePath, JSON.stringify(current, null, 2))
      await ctx.reply(`Auto-train ${mode}`)
      return
    }
    await ctx.reply(help(ctx.prefix))
  },
}]
