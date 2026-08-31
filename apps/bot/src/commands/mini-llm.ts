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
import { installSeedCorpus, getSeedSourceDir } from '../llm/seed-corpus.js'
import { countVectors, ingestAllCorpusFiles } from '../llm/incremental-corpus.js'
import { llmFreeChat } from '../services/llm-free-chat.js'
import { ollama } from '../services/ollama.js'
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
    '╭━━〔 🧠 *MINI-LLM / OLLAMA* 〕━━╮',
    `│ ${prefix}llm status | progress | memory`,
    `│ ${prefix}llm ollama status|on|off|model <id>`,
    `│ ${prefix}llm free on|off | global | mention`,
    `│ ${prefix}llm add | process | seed | train`,
    `│ ${prefix}llm ask <q> | search <q>`,
    '╰━━━━━━━━━━━━━━━━━━╯',
  ].join('\n')
}

export const miniLlmCommands: BotCommand[] = [{
  name: 'llm',
  aliases: ['minillm', 'localai', 'corpus', 'llmcorpus'],
  category: 'tools',
  description: 'Mini-LLM + Ollama: memoria, modo libre y agente.',
  usage: 'llm <status|memory|ollama|free|add|ask|…>',
  async handler(ctx) {
    const sub = (ctx.args[0] ?? 'status').toLowerCase()
    if (sub === 'help' || sub === 'ayuda') { await ctx.reply(help(ctx.prefix)); return }
    if (!ctx.isOwner && !ctx.isBotStaff) {
      throw new Error('Los comandos .llm son solo para Owner/Staff.')
    }

    if (sub === 'status' || sub === 'estado') {
      const s = miniLLM.stats()
      const q = getQueueStats()
      let vectors = s.vectorRecords
      try { vectors = countVectors() } catch {}
      const ping = await ollama.ping()
      await ctx.reply([
        '╭━━〔 🧠 *STATUS* 〕━━╮',
        `┃ Mini-LLM v${s.modelVersion} · vocab ${s.vocabSize}`,
        `┃ Vectores ${vectors} · steps ${s.trainSteps}`,
        `┃ ${ollama.statusLine()}`,
        ping.ok
          ? `┃ Ollama OK · modelos: ${(ping.models ?? []).slice(0, 4).join(', ') || '—'}${ping.hasModel ? ' · modelo listo' : ' · ¡pull del modelo!'}`
          : `┃ Ollama: no responde (${'error' in ping ? ping.error : 'off'})`,
        `┃ Libre: ${llmFreeChat.statusLine()}`,
        `┃ Cola Q:${q.queued} OK:${q.completed}`,
        '╰━━━━━━━━━━━━━━━━━━╯',
      ].join('\n'))
      return
    }

    if (sub === 'ollama') {
      const mode = (ctx.args[1] ?? 'status').toLowerCase()
      if (mode === 'on' || mode === 'off') {
        ollama.setEnabled(mode === 'on')
        await ctx.reply(`🧠 Ollama: *${mode.toUpperCase()}*\n${ollama.statusLine()}`)
        return
      }
      if (mode === 'model') {
        const name = ctx.args.slice(2).join(' ').trim()
        if (!name) throw new Error(`Uso: ${ctx.prefix}llm ollama model qwen2.5:1.5b`)
        ollama.setModel(name)
        await ctx.reply(`🧠 Modelo Ollama: *${name}*\nHaz \`ollama pull ${name}\` en el servidor si aún no está.`)
        return
      }
      if (mode === 'url') {
        const url = ctx.args[2]?.trim()
        if (!url) throw new Error(`Uso: ${ctx.prefix}llm ollama url http://127.0.0.1:11434`)
        ollama.setBaseUrl(url)
        await ctx.reply(`🧠 Ollama URL: ${url}`)
        return
      }
      const ping = await ollama.ping()
      await ctx.reply([
        '🧠 *OLLAMA*',
        ollama.statusLine(),
        ping.ok
          ? `Estado: OK\nModelos: ${(ping.models ?? []).join(', ') || 'ninguno'}\nModelo activo listo: ${ping.hasModel ? 'sí' : 'no (ollama pull …)'}`
          : `Estado: ERROR — ${'error' in ping ? ping.error : 'desconocido'}\nInstala: curl -fsSL https://ollama.com/install.sh | sh`,
        '',
        `Docs: docs/OLLAMA.md`,
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

    if (sub === 'memory' || sub === 'memoria' || sub === 'ingest' || sub === 'load') {
      await ctx.reply('🧠 Cargando documentos a memoria (seed + corpus)…')
      const seed = await installSeedCorpus(true)
      const ingested = await ingestAllCorpusFiles()
      requestTraining('manual', ctx.sender, true)
      const seedLine = seed.ok
        ? `Seed: ${seed.reason} · ${seed.installed} archivos · ${seed.chunks ?? 0} chunks`
        : `Seed: no encontrado (${getSeedSourceDir() ?? 'sin ruta'})`
      await ctx.reply([
        '✅ *MEMORIA ACTUALIZADA*',
        seedLine,
        `Corpus: ${ingested.ok}/${ingested.files} archivos OK`,
        `Chunks: ${ingested.chunks} · Vectores: ${ingested.vectors}`,
        'Ollama usará esta memoria como contexto (RAG).',
      ].join('\n'))
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
        await ctx.reply(`🧠 Slang: *${mode2.toUpperCase()}*`)
        return
      }
      if (mode === 'cooldown' || mode === 'cd') {
        if (mode2 === 'on' || mode2 === 'off') {
          llmFreeChat.setCooldownEnabled(mode2 === 'on')
          await ctx.reply(`🧠 Cooldown: *${mode2.toUpperCase()}*`)
          return
        }
        if (mode2 === 'set' || mode2 === 'ms') {
          const ms = Number(mode3 || ctx.args[3])
          if (!Number.isFinite(ms) || ms < 0) throw new Error(`Uso: ${ctx.prefix}llm free cooldown set <ms>`)
          llmFreeChat.setCooldownMs(ms)
          llmFreeChat.setCooldownEnabled(true)
          await ctx.reply(`🧠 Cooldown = *${ms} ms*`)
          return
        }
        throw new Error(`Uso: ${ctx.prefix}llm free cooldown on|off | set <ms>`)
      }
      if (mode === 'antispam' || mode === 'anti-spam' || mode === 'spam') {
        if (mode2 === 'on' || mode2 === 'off') {
          llmFreeChat.setAntispamEnabled(mode2 === 'on')
          await ctx.reply(`🧠 Anti-spam: *${mode2.toUpperCase()}*`)
          return
        }
        throw new Error(`Uso: ${ctx.prefix}llm free antispam on|off`)
      }
      if (mode === 'group' || mode === 'grupo') {
        if (mode2 === 'add') {
          if (!ctx.chatId.endsWith('@g.us')) throw new Error('Usa esto dentro de un grupo.')
          llmFreeChat.addGroup(ctx.chatId)
          await ctx.reply('✅ Grupo en whitelist.')
          return
        }
        if (mode2 === 'remove' || mode2 === 'del') {
          llmFreeChat.removeGroup(ctx.chatId)
          await ctx.reply('✅ Grupo fuera de whitelist.')
          return
        }
        if (mode2 === 'clear') {
          llmFreeChat.clearGroupWhitelist()
          await ctx.reply('✅ Whitelist vacía.')
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
        throw new Error(`Uso: ${ctx.prefix}llm free on|off | global | mention | antispam`)
      }
      if (mode === 'status' || mode === '') {
        await ctx.reply(`🧠 Libre: *${llmFreeChat.isEnabled(ctx.chatId) ? 'ON' : 'OFF'}*\n${llmFreeChat.statusLine()}`)
        return
      }
      llmFreeChat.setChat(ctx.chatId, mode === 'on')
      await ctx.reply(mode === 'on' ? '🔓 LLM liberado (Ollama + acciones).' : '🔒 LLM bloqueado.')
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
      await ctx.reply(`✅ En cola: ${job.filename} (${formatBytes(job.bytes)})\nLuego: *${ctx.prefix}llm memory*`)\n      return
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
      // Prefer Ollama if available
      try {
        if (ollama.getState().enabled) {
          const { runLlmAgent } = await import('../services/llm-agent.js')
          const result = await runLlmAgent({
            socket: ctx.socket,
            message: ctx.message,
            chatId: ctx.chatId,
            text: query,
            pushName: ctx.pushName,
          })
          if (result.reply) {
            await ctx.reply(result.reply)
            return
          }
        }
      } catch {}
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
