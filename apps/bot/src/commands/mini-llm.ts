import type { BotCommand } from '../types.js'
import { miniLLM } from '../services/mini-llm.js'
import { CORPUS_SOURCES } from '../llm/corpus-sources.js'
import { downloadSources, sourceStatus } from '../llm/corpus-manager.js'
import { enqueueDocumentFromWhatsApp, getQueueState } from '../llm/document-queue.js'
import { requestTraining, trainingQueueStatus } from '../llm/training-queue.js'
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
    '╭━━〔 🧠 *MINI-LLM LOCAL V3* 〕━━╮',
    `┃ ${prefix}llm status`,
    `┃ ${prefix}llm progress`,
    `┃ ${prefix}llm docs`,
    `┃ ${prefix}llm add`,
    `┃ ${prefix}llm sources`,
    `┃ ${prefix}llm download <id...>`,
    `┃ ${prefix}llm download defaults`,
    `┃ ${prefix}llm download-progress`,
    `┃ ${prefix}llm import`,
    `┃ ${prefix}llm train`,
    `┃ ${prefix}llm stop`,
    `┃ ${prefix}llm ask <pregunta>`,
    `┃ ${prefix}llm search <texto>`,
    `┃ ${prefix}llm auto on|off`,
    '╰━━━━━━━━━━━━━━━━━━╯',
  ].join('\n')
}

function sourcesText(prefix: string) {
  const names: Record<string, string> = { general: 'GENERAL', programming: 'PROGRAMACIÓN', science: 'CIENCIA / IA', spanish: 'ESPAÑOL', literature: 'LITERATURA' }
  const lines = ['╭━━〔 🧠 *LLM · FUENTES* 〕━━╮']
  for (const category of ['general', 'programming', 'science', 'spanish', 'literature']) {
    lines.push(`│ *${names[category]}*`)
    for (const source of CORPUS_SOURCES.filter((item) => item.category === category)) lines.push(`│ ${source.id} — ${source.title}${source.enabledByDefault ? '' : ' [manual]'}`)
  }
  lines.push('╰━━━━━━━━━━━━━━━━━━━━╯', '', `Uso: ${prefix}llm download <id...>`)
  return lines.join('\n')
}

function progressText() {
  const downloads = sourceStatus(); const queue = getQueueState().jobs; const stats = miniLLM.stats(); const training = trainingQueueStatus()
  return [
    '╭━━〔 🧠 *LLM · PROGRESO* 〕━━╮',
    `│ Descargas » *${downloads.state.active ? 'ACTIVA' : 'INACTIVA'}*`,
    `│ Fuentes » *${downloads.state.completed.length}/${CORPUS_SOURCES.length}*`,
    `│ Archivos » *${downloads.files.length}*`,
    `│ Documentos en cola » *${queue.filter((j) => j.status === 'queued').length}*`,
    `│ Documentos procesando » *${queue.filter((j) => j.status === 'processing').length}*`,
    `│ Documentos listos » *${queue.filter((j) => j.status === 'completed').length}*`,
    `│ Documentos fallidos » *${queue.filter((j) => j.status === 'failed').length}*`,
    `│ Entrenamiento » *${stats.learning ? 'ACTIVO' : training.requested ? 'EN COLA' : 'INACTIVO'}*`,
    `│ Pasos » *${stats.trainSteps}*`,
    `│ Último loss » *${stats.lastLoss?.toFixed(5) ?? 'N/D'}*`,
    '╰━━━━━━━━━━━━━━━━━━╯',
  ].join('\n')
}

export const miniLlmCommands: BotCommand[] = [{
  name: 'llm',
  aliases: ['minillm', 'localai', 'corpus', 'llmcorpus'],
  category: 'tools',
  description: 'Gestiona memoria, corpus, documentos y Mini-LLM local.',
  usage: 'llm <status|progress|docs|add|sources|download|download-progress|import|train|stop|ask|search|auto>',
  async handler(ctx) {
    const sub = (ctx.args[0] ?? 'status').toLowerCase()
    if (sub === 'help' || sub === 'ayuda') { await ctx.reply(help(ctx.prefix)); return }
    if (sub === 'sources' || sub === 'fuentes') { await ctx.reply(sourcesText(ctx.prefix)); return }
    if (sub === 'download-progress' || sub === 'downloadprogress' || sub === 'descarga' || sub === 'progress-download') { await ctx.reply(progressText()); return }

    if (sub === 'download' || sub === 'descargar' || sub === 'download-defaults' || sub === 'descargar-defaults') {
      if (!ctx.isOwner && !ctx.isBotStaff) throw new Error('Solo Owner/Staff puede gestionar las descargas del corpus.')
      const requested = ctx.args.slice(1).filter(Boolean)
      const ids = requested.length === 1 && requested[0].toLowerCase() === 'defaults' ? CORPUS_SOURCES.filter((source) => source.enabledByDefault).map((source) => source.id) : sub.includes('defaults') ? CORPUS_SOURCES.filter((source) => source.enabledByDefault).map((source) => source.id) : requested
      if (!ids.length) throw new Error(`Ejemplo: ${ctx.prefix}llm download tatoeba-es`)
      await ctx.reply(`⬇️ *LLM · CORPUS*\n━━━━━━━━━━━━━━\nDescargando *${ids.length}* fuente(s). El bot seguirá disponible.`)
      void downloadSources(ids).then(async (result) => {
        const completed = result.state.completed.filter((id) => ids.includes(id)); const failed = result.state.failed.filter((id) => ids.includes(id))
        await ctx.reply(`✅ *DESCARGA TERMINADA*\n━━━━━━━━━━━━━━\nCompletadas: *${completed.length}/${ids.length}*\nFallidas: *${failed.length}*\nArchivos: *${result.files.length}*\n\nAhora usa *${ctx.prefix}llm import* o *${ctx.prefix}llm train*.`)
      }).catch(async (error) => { await ctx.reply(`❌ Error de descarga: ${error instanceof Error ? error.message : String(error)}`).catch(() => undefined) })
      return
    }

    if (sub === 'status' || sub === 'progress' || sub === 'avance') {
      const s = miniLLM.stats(); const q = getQueueState().jobs; const rq = trainingQueueStatus(); const state = s.learning ? 'ENTRENANDO' : rq.requested ? 'EN COLA' : 'EN ESPERA'; const pct = s.learning ? `${s.currentProgress}% · ${s.currentStep}/${Math.max(1, s.currentTotalSteps)}` : rq.requested ? 'EN COLA' : '100%'
      await ctx.reply(['╭━━〔 🧠 *MINI-LLM · ESTADO* 〕━━╮', `┃ Estado » *${state}*`, `┃ Progreso » *${pct}*`, `┃ Fase » *${s.currentMessage}*`, `┃ Documentos » *${s.totalDocuments}*`, `┃ Fragmentos » *${s.totalChunks}*`, `┃ Vectores » *${s.vectorRecords}*`, `┃ Vocabulario » *${s.vocabSize}/${miniLLM.constants.VOCAB_LIMIT}*`, `┃ Entrenamientos » *${s.trainRuns}*`, `┃ Pasos » *${s.trainSteps}*`, `┃ Último loss » *${s.lastLoss?.toFixed(5) ?? 'N/D'}*`, `┃ Cola docs » *${q.filter((j) => j.status === 'queued').length}*`, `┃ Almacenamiento » *${formatBytes(s.storageBytes)}*`, '╰━━━━━━━━━━━━━━━━━━╯'].join('\n')); return
    }

    if (sub === 'docs' || sub === 'documentos') {
      const docs = miniLLM.listDocuments(); const queue = getQueueState().jobs
      const processedIds = new Set(docs.map((doc) => doc.name))
      const processed = docs.slice(-40).map((doc, i) => `✅ ${i + 1}. ${doc.name} · ${formatBytes(doc.size)}`)
      const queued = queue.filter((job) => job.status === 'queued').map((job) => `⏳ ${job.filename} · ${job.id}`)
      const processing = queue.filter((job) => job.status === 'processing').map((job) => `🔄 ${job.filename} · ${job.id}`)
      const completed = queue.filter((job) => job.status === 'completed' && !processedIds.has(job.filename)).map((job) => `✅ ${job.filename} · ${job.id}`)
      const failed = queue.filter((job) => job.status === 'failed').map((job) => `❌ ${job.filename} · ${job.error ?? 'error'}`)
      const sections = [
        ...(processed.length ? ['*Procesados*', ...processed] : []),
        ...(completed.length ? ['', '*Completados en cola*', ...completed] : []),
        ...(processing.length ? ['', '*Procesando*', ...processing] : []),
        ...(queued.length ? ['', '*Pendientes*', ...queued] : []),
        ...(failed.length ? ['', '*Fallidos*', ...failed] : []),
      ]
      await ctx.reply(sections.length ? `📚 *CORPUS LOCAL*\n━━━━━━━━━━━━━━\n${sections.join('\n')}\n\nUsa \`${ctx.prefix}llm train\` para entrenar con el corpus disponible.` : 'No hay documentos en el corpus ni en cola.')
      return
    }

    if (sub === 'add' || sub === 'agregar' || sub === 'document') {
      if (!ctx.isOwner && !ctx.isBotStaff) throw new Error('Solo Owner/Staff puede añadir documentos.')
      await ctx.reply('📥 *LLM · DOCUMENTO*\n━━━━━━━━━━━━━━\nRecibiendo el archivo. El aprendizaje se ejecutará fuera del proceso de WhatsApp...')
      const job = await enqueueDocumentFromWhatsApp(ctx.message)
      await ctx.reply(`✅ *DOCUMENTO RECIBIDO*\n━━━━━━━━━━━━━━\n📄 *${job.filename}*\n📦 *${formatBytes(job.bytes)}*\n🆔 *${job.id}*\n\nQuedó en cola para el worker LLM.`); return
    }

    if (sub === 'stop' || sub === 'detener' || sub === 'cancel') {
      if (!ctx.isOwner && !ctx.isBotStaff) throw new Error('Solo Owner/Staff puede detener el entrenamiento.')
      const pidFile = path.join(miniLLM.ROOT, 'worker.pid'); const trainingQueueFile = path.join(miniLLM.ROOT, 'training-queue.json'); let pid: number | null = null
      try { const candidate = Number(fs.readFileSync(pidFile, 'utf8').trim()); if (Number.isInteger(candidate) && candidate > 1) pid = candidate } catch {}
      try { fs.writeFileSync(trainingQueueFile, JSON.stringify({ requested: false }, null, 2)) } catch {}
      if (pid !== null) { try { process.kill(pid, 'SIGTERM') } catch (error) { if (!(error instanceof Error) || !error.message.includes('ESRCH')) throw error } }
      try { const statePath = path.join(miniLLM.ROOT, 'state.json'); const current = JSON.parse(fs.readFileSync(statePath, 'utf8')) as Record<string, unknown>; current.learning = false; current.currentProgress = 0; current.currentStep = 0; current.currentTotalSteps = 0; current.currentTotalEpochs = 0; current.currentMessage = 'Detenido por usuario'; const tmp = `${statePath}.tmp`; fs.writeFileSync(tmp, JSON.stringify(current, null, 2)); fs.renameSync(tmp, statePath) } catch {}
      await ctx.reply(pid !== null ? '⏹️ *ENTRENAMIENTO DETENIDO*\n━━━━━━━━━━━━━━\nEl worker fue detenido y la solicitud pendiente fue cancelada. Puedes usar `.llm train` para iniciar otro entrenamiento.' : '⏹️ *ENTRENAMIENTO DETENIDO*\n━━━━━━━━━━━━━━\nNo había un worker activo; también se limpió la cola de entrenamiento.'); return
    }

    if (sub === 'import' || sub === 'importar' || sub === 'rebuild' || sub === 'reconstruir' || sub === 'train' || sub === 'entrenar') {
      if (!ctx.isOwner && !ctx.isBotStaff) throw new Error('Solo Owner/Staff puede controlar el entrenamiento.')
      requestTraining(sub === 'import' || sub === 'importar' ? 'import' : 'manual', ctx.sender, true)
      await ctx.reply(`🧠 *TRABAJO LLM ENCOLADO*\n━━━━━━━━━━━━━━\nEl worker independiente procesará el corpus y actualizará el modelo.\nAl terminar esta corrida se guardará un checkpoint final y se detendrá el entrenamiento automático.\nConsulta *${ctx.prefix}llm progress*.`); return
    }

    if (sub === 'ask' || sub === 'pregunta' || sub === 'query') { const query = ctx.args.slice(1).join(' ').trim(); if (query.length < 2) throw new Error(`Uso: ${ctx.prefix}llm ask <pregunta>`); await ctx.reply('🧠 Consultando memoria local...'); await ctx.reply(miniLLM.answer(query)); return }
    if (sub === 'search' || sub === 'buscar') { const query = ctx.args.slice(1).join(' ').trim(); if (query.length < 2) throw new Error(`Uso: ${ctx.prefix}llm search <texto>`); const hits = miniLLM.search(query, 5); if (!hits.length) { await ctx.reply('No se encontraron coincidencias.'); return } await ctx.reply(`🔎 *MEMORIA LOCAL*\n━━━━━━━━━━━━━━\n${hits.map((hit, i) => `${i + 1}. ${Math.round(hit.score * 100)}%\n${hit.text.slice(0, 700)}`).join('\n\n')}`); return }
    if (sub === 'auto') { if (!ctx.isOwner && !ctx.isBotStaff) throw new Error('Solo Owner/Staff puede cambiar el auto-entrenamiento.'); const mode = (ctx.args[1] ?? '').toLowerCase(); if (!['on', 'off'].includes(mode)) throw new Error(`Uso: ${ctx.prefix}llm auto on|off`); const statePath = `${miniLLM.ROOT}/state.json`; let current: Record<string, unknown> = {}; try { current = JSON.parse(fs.readFileSync(statePath, 'utf8')) as Record<string, unknown> } catch {} current.autoTrainEnabled = mode === 'on'; fs.writeFileSync(statePath, JSON.stringify(current, null, 2)); await ctx.reply(`🧠 Auto-entrenamiento: *${mode.toUpperCase()}*`); return }
    await ctx.reply(help(ctx.prefix))
  },
}]
