import type { BotCommand } from '../types.js'
import { miniLLM } from '../services/mini-llm.js'
import { CORPUS_SOURCES } from '../llm/corpus-sources.js'
import { downloadSources, sourceStatus } from '../llm/corpus-manager.js'
import {
  enqueueDocumentFromWhatsApp,
  getQueueState,
  getQueueStats,
  listJobsByStatus,
  clearCompletedJobs,
  retryFailedJobs,
  documentQueuePaths,
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
    '╭━━〔 🧠 *MINI-LLM LOCAL* 〕━━╮',
    '│ *Estado*',
    `│ ${prefix}llm status`,
    `│ ${prefix}llm progress`,
    `│ ${prefix}llm queue`,
    '│ *Libre (chat sin prefijo)*',
    `│ ${prefix}llm free on|off`,
    `│ ${prefix}llm free global on|off`,
    '│ *Documentos / train*',
    `│ ${prefix}llm add | process | seed | train | stop`,
    `│ ${prefix}llm docs | auto on|off`,
    '│ *Memoria*',
    `│ ${prefix}llm ask <q> | search <q>`,
    '│ *Corpus*',
    `│ ${prefix}llm sources | download <id>`,
    `│ ${prefix}llm retry-failed | clear-done`,
    '╰━━━━━━━━━━━━━━━━━━╯',
  ].join('\n')
}

function statusText(prefix: string) {
  const s = miniLLM.stats()
  const q = getQueueStats()
  const t = trainingQueueStatus()
  let vectors = s.vectorRecords
  try { vectors = countVectors() } catch {}
  return [
    '╭━━〔 🧠 *LLM · STATUS* 〕━━╮',
    `┃ Modelo » *v${s.modelVersion}*`,
    `┃ Vocab » *${s.vocabSize}/${miniLLM.constants.VOCAB_LIMIT}*`,
    `┃ Vectores » *${vectors}*`,
    `┃ Docs » *${s.totalDocuments}* · chunks *${s.totalChunks}*`,
    `┃ Train runs » *${s.trainRuns}* · steps *${s.trainSteps}*`,
    `┃ Loss » last *${s.lastLoss?.toFixed(4) ?? 'N/D'}* · best *${s.bestLoss?.toFixed(4) ?? 'N/D'}*`,
    `┃ Auto-train » *${s.autoTrainEnabled ? 'ON' : 'OFF'}*`,
    `┃ Libre » *${llmFreeChat.statusLine()}*`,
    `┃ Cola » Q:${q.queued} P:${q.processing} OK:${q.completed} ✗:${q.failed}`,
    `┃ Disco » *${formatBytes(s.storageBytes)}*`,
    '╰━━━━━━━━━━━━━━━━━━╯',
    `_Progress:_ *${prefix}llm progress*`,
  ].join('\n')
}

function progressText(prefix: string) {
  const s = miniLLM.stats()
  const q = getQueueStats()
  const t = trainingQueueStatus()
  const learning = s.learning
  const pct = learning ? Math.min(100, Math.max(0, Number(s.currentProgress) || 0)) : t.requested ? 0 : 100
  const barLen = 12
  const filled = Math.round((pct / 100) * barLen)
  const bar = '█'.repeat(filled) + '░'.repeat(Math.max(0, barLen - filled))
  return [
    '╭━━〔 🧠 *LLM · PROGRESS* 〕━━╮',
    `┃ Estado » *${learning ? 'ENTRENANDO' : t.requested ? 'EN COLA' : 'IDLE'}*`,
    `┃ Barra » [${bar}] *${pct}%*`,
    `┃ Paso » *${s.currentStep}/${Math.max(1, s.currentTotalSteps)}*`,
    `┃ Época » *${s.currentEpoch}/${Math.max(1, s.currentTotalEpochs || 2)}*`,
    `┃ Fase » ${learning ? (s.currentMessage || '…') : t.requested ? 'En cola' : 'Sin train'}`,
    `┃ Loss » *${s.lastLoss?.toFixed(5) ?? 'N/D'}*`,
    `┃ Cola docs » Q:${q.queued} P:${q.processing} OK:${q.completed} ✗:${q.failed}`,
    '╰━━━━━━━━━━━━━━━━━━╯',
  ].join('\n')
}

function queueText(prefix: string) {
  const line = (job: { filename: string; id: string; error?: string }) =>
    `• ${job.filename} \`${job.id.slice(0, 8)}\`${job.error ? ` — ${job.error.slice(0, 50)}` : ''}`
  const queued = listJobsByStatus('queued').slice(-12)
  const processing = listJobsByStatus('processing').slice(-8)
  const completed = listJobsByStatus('completed').slice(-8)
  const failed = listJobsByStatus('failed').slice(-8)
  return [
    '╭━━〔 🧠 *LLM · COLA* 〕━━╮',
    '┃ 📥 Pendientes', queued.length ? queued.map(line).join('\n') : '┃ (vacío)',
    '┃ 🔄 Procesando', processing.length ? processing.map(line).join('\n') : '┃ (vacío)',
    '┃ ✅ Listos', completed.length ? completed.map(line).join('\n') : '┃ (vacío)',
    '┃ ❌ Fallidos', failed.length ? failed.map(line).join('\n') : '┃ (vacío)',
    '╰━━━━━━━━━━━━━━━━━━╯',
    `*${prefix}llm process* · *${prefix}llm retry-failed* · *${prefix}llm clear-done*`,
  ].join('\n')
}

export const miniLlmCommands: BotCommand[] = [{
  name: 'llm',
  aliases: ['minillm', 'localai', 'corpus', 'llmcorpus'],
  category: 'tools',
  description: 'Mini-LLM local: cola, train, modo libre y memoria.',
  usage: 'llm <status|progress|queue|free|add|process|seed|train|ask|search|…>',
  async handler(ctx) {
    const sub = (ctx.args[0] ?? 'status').toLowerCase()
    if (sub === 'help' || sub === 'ayuda') { await ctx.reply(help(ctx.prefix)); return }

    if (!ctx.isOwner && !ctx.isBotStaff) {
      throw new Error('Los comandos .llm son solo para Owner/Staff. Si el modo libre está activo, escribe sin prefijo.')
    }

    if (sub === 'status' || sub === 'estado' || sub === 'info') { await ctx.reply(statusText(ctx.prefix)); return }
    if (sub === 'progress' || sub === 'avance' || sub === 'prog') { await ctx.reply(progressText(ctx.prefix)); return }
    if (sub === 'queue' || sub === 'cola') { await ctx.reply(queueText(ctx.prefix)); return }

    if (sub === 'free' || sub === 'libre' || sub === 'release' || sub === 'liberar') {
      const mode = (ctx.args[1] ?? '').toLowerCase()
      const mode2 = (ctx.args[2] ?? '').toLowerCase()
      if (mode === 'global') {
        if (!['on', 'off'].includes(mode2)) throw new Error(`Uso: ${ctx.prefix}llm free global on|off`)
        llmFreeChat.setGlobal(mode2 === 'on')
        await ctx.reply(`🧠 *LLM LIBRE GLOBAL*: *${mode2.toUpperCase()}*\n${llmFreeChat.statusLine()}`)
        return
      }
      if (!['on', 'off', 'status', 'estado', ''].includes(mode)) {
        throw new Error(`Uso: ${ctx.prefix}llm free on|off | ${ctx.prefix}llm free global on|off`)
      }
      if (mode === 'status' || mode === 'estado' || mode === '') {
        await ctx.reply(`🧠 *LLM LIBRE*\nChat: *${llmFreeChat.isEnabled(ctx.chatId) ? 'ON' : 'OFF'}*\n${llmFreeChat.statusLine()}`)
        return
      }
      llmFreeChat.setChat(ctx.chatId, mode === 'on')
      await ctx.reply(mode === 'on'
        ? `🔓 *LLM LIBERADO* en este chat. Responde sin prefijo si sabe algo. Off: *${ctx.prefix}llm free off*`
        : `🔒 *LLM bloqueado* en este chat.`)
      return
    }

    if (sub === 'seed' || sub === 'semilla') {
      const force = (ctx.args[1] ?? '').toLowerCase() === 'force'
      await ctx.reply('🌱 Instalando seed…')
      const result = await installSeedCorpus(force)
      if (!result.ok) { await ctx.reply('❌ Seed no encontrado en el paquete.'); return }
      if (result.reason === 'already_installed') {
        await ctx.reply(`✅ Seed ya instalado (*${result.installed}*). Usa *${ctx.prefix}llm seed force* y luego *${ctx.prefix}llm train*.`)
        return
      }
      await ctx.reply(`✅ Seed: *${result.installed}* archivos. Ahora *${ctx.prefix}llm train*.`)
      return
    }

    if (sub === 'process' || sub === 'procesar') {
      const stats = getQueueStats()
      requestTraining('manual', ctx.sender, true)
      await ctx.reply(`⚙️ Process encolado. Pendientes: *${stats.queued}*. Mira *${ctx.prefix}llm progress*.`)
      return
    }

    if (sub === 'retry-failed' || sub === 'reintentar') {
      await ctx.reply(`🔁 Reencolados *${retryFailedJobs()}* fallidos.`)
      return
    }
    if (sub === 'clear-done' || sub === 'limpiar-listos') {
      await ctx.reply(`🧹 Limpiados *${clearCompletedJobs()}* jobs completados del registro.`)
      return
    }

    if (sub === 'download' || sub === 'descargar') {
      const requested = ctx.args.slice(1).filter(Boolean)
      const ids = requested.length === 1 && requested[0].toLowerCase() === 'defaults'
        ? CORPUS_SOURCES.filter((s) => s.enabledByDefault).map((s) => s.id) : requested
      if (!ids.length) throw new Error(`Ejemplo: ${ctx.prefix}llm download tatoeba-es`)
      await ctx.reply(`⬇️ Descargando *${ids.length}* fuente(s)…`)
      void downloadSources(ids).then(async (result) => {
        await ctx.reply(`✅ Descarga: ${result.state.completed.length} ok, ${result.state.failed.length} fail. Luego *${ctx.prefix}llm process*.`)
      }).catch(async (e) => { await ctx.reply(`❌ ${e instanceof Error ? e.message : String(e)}`).catch(() => undefined) })
      return
    }

    if (sub === 'sources' || sub === 'fuentes') {
      const lines = CORPUS_SOURCES.map((s) => `• ${s.id} — ${s.title}`)
      await ctx.reply(`Fuentes:\n${lines.join('\n')}\n\n${ctx.prefix}llm download <id>`)
      return
    }

    if (sub === 'docs' || sub === 'documentos') {
      const docs = miniLLM.listDocuments().slice(-30)
      await ctx.reply(docs.length ? docs.map((d, i) => `${i + 1}. ${d.name} (${formatBytes(d.size)})`).join('\n') : 'Sin documentos.')
      return
    }

    if (sub === 'add' || sub === 'agregar') {
      const job = await enqueueDocumentFromWhatsApp(ctx.message)
      await ctx.reply(`✅ En cola: *${job.filename}* (${formatBytes(job.bytes)})\n*${ctx.prefix}llm process*`)
      return
    }

    if (sub === 'stop' || sub === 'detener') {
      const pidFile = path.join(miniLLM.ROOT, 'worker.pid')
      const trainingQueueFile = path.join(miniLLM.ROOT, 'training-queue.json')
      let pid: number | null = null
      try { const c = Number(fs.readFileSync(pidFile, 'utf8').trim()); if (Number.isInteger(c) && c > 1) pid = c } catch {}
      try { fs.writeFileSync(trainingQueueFile, JSON.stringify({ requested: false }, null, 2)) } catch {}
      if (pid !== null) { try { process.kill(pid, 'SIGTERM') } catch (e) { if (!(e instanceof Error) || !e.message.includes('ESRCH')) throw e } }
      try {
        const statePath = path.join(miniLLM.ROOT, 'state.json')
        const current = JSON.parse(fs.readFileSync(statePath, 'utf8')) as Record<string, unknown>
        current.learning = false
        current.currentMessage = 'Detenido por usuario'
        fs.writeFileSync(statePath, JSON.stringify(current, null, 2))
      } catch {}
      await ctx.reply('⏹️ Entrenamiento detenido. model.bin se conserva.')
      return
    }

    if (sub === 'train' || sub === 'entrenar' || sub === 'import' || sub === 'importar') {
      requestTraining(sub.startsWith('import') ? 'import' : 'manual', ctx.sender, true)
      await ctx.reply(`🧠 Train encolado. *${ctx.prefix}llm progress*`)
      return
    }

    if (sub === 'ask' || sub === 'pregunta' || sub === 'query') {
      const query = ctx.args.slice(1).join(' ').trim()
      if (query.length < 2) throw new Error(`Uso: ${ctx.prefix}llm ask <pregunta>`)
      await ctx.reply(miniLLM.answer(query))
      return
    }

    if (sub === 'search' || sub === 'buscar') {
      const query = ctx.args.slice(1).join(' ').trim()
      if (query.length < 2) throw new Error(`Uso: ${ctx.prefix}llm search <texto>`)
      const hits = miniLLM.search(query, 5)
      if (!hits.length) { await ctx.reply('Sin coincidencias.'); return }
      await ctx.reply(hits.map((h, i) => `${i + 1}. ${Math.round(h.score * 100)}%\n${h.text.slice(0, 500)}`).join('\n\n'))
      return
    }

    if (sub === 'auto') {
      const mode = (ctx.args[1] ?? '').toLowerCase()
      if (!['on', 'off'].includes(mode)) throw new Error(`Uso: ${ctx.prefix}llm auto on|off`)
      const statePath = `${miniLLM.ROOT}/state.json`
      let current: Record<string, unknown> = {}
      try { current = JSON.parse(fs.readFileSync(statePath, 'utf8')) as Record<string, unknown> } catch {}
      current.autoTrainEnabled = mode === 'on'
      fs.writeFileSync(statePath, JSON.stringify(current, null, 2))
      await ctx.reply(`🧠 Auto-train: *${mode.toUpperCase()}*`)
      return
    }

    await ctx.reply(help(ctx.prefix))
  },
}]
