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
    `│ ${prefix}llm status     → resumen del modelo`,
    `│ ${prefix}llm progress   → avance del train actual`,
    `│ ${prefix}llm queue      → cola de documentos`,
    '│ *Documentos*',
    `│ ${prefix}llm add        → encola un documento`,
    `│ ${prefix}llm process    → procesa cola + entrena`,
    `│ ${prefix}llm docs       → listado corpus`,
    `│ ${prefix}llm seed       → instala pares de chat`,
    '│ *Entrenamiento*',
    `│ ${prefix}llm train      → entrenar ahora`,
    `│ ${prefix}llm stop       → detener train`,
    `│ ${prefix}llm auto on|off`,
    '│ *Memoria*',
    `│ ${prefix}llm ask <q>`,
    `│ ${prefix}llm search <q>`,
    '│ *Corpus remoto*',
    `│ ${prefix}llm sources`,
    `│ ${prefix}llm download <id...>`,
    `│ ${prefix}llm retry-failed`,
    `│ ${prefix}llm clear-done`,
    '╰━━━━━━━━━━━━━━━━━━╯',
  ].join('\n')
}

function statusText(prefix: string) {
  const s = miniLLM.stats()
  const q = getQueueStats()
  const t = trainingQueueStatus()
  const vectors = (() => {
    try {
      return countVectors()
    } catch {
      return s.vectorRecords
    }
  })()
  return [
    '╭━━〔 🧠 *LLM · STATUS* 〕━━╮',
    `┃ Modelo » *v${s.modelVersion}*`,
    `┃ Vocabulario » *${s.vocabSize}/${miniLLM.constants.VOCAB_LIMIT}*`,
    `┃ Vectores » *${vectors}*`,
    `┃ Documentos corpus » *${s.totalDocuments}*`,
    `┃ Fragmentos » *${s.totalChunks}*`,
    `┃ Mensajes vistos » *${s.totalMessages}*`,
    `┃ Entrenamientos » *${s.trainRuns}*`,
    `┃ Pasos totales » *${s.trainSteps}*`,
    `┃ Mejor loss » *${s.bestLoss?.toFixed(4) ?? 'N/D'}*`,
    `┃ Último loss » *${s.lastLoss?.toFixed(4) ?? 'N/D'}*`,
    `┃ Auto-train » *${s.autoTrainEnabled ? 'ON' : 'OFF'}*`,
    `┃ Cola docs » Q:${q.queued} P:${q.processing} OK:${q.completed} ✗:${q.failed}`,
    `┃ Train en cola » *${t.requested ? 'SÍ' : 'NO'}*`,
    `┃ Disco LLM » *${formatBytes(s.storageBytes)}*`,
    `┃ Último train » *${s.lastTrainAt ? new Date(s.lastTrainAt).toLocaleString('es-MX') : 'nunca'}*`,
    '╰━━━━━━━━━━━━━━━━━━╯',
    '',
    `_Status = foto fija del modelo. Para la barra de avance usa_ *${prefix}llm progress*`,
  ].join('\n')
}

function progressText(prefix: string) {
  const s = miniLLM.stats()
  const q = getQueueStats()
  const downloads = sourceStatus()
  const t = trainingQueueStatus()
  const learning = s.learning
  const pct = learning
    ? Math.min(100, Math.max(0, Number(s.currentProgress) || 0))
    : t.requested
      ? 0
      : 100
  const barLen = 12
  const filled = Math.round((pct / 100) * barLen)
  const bar = '█'.repeat(filled) + '░'.repeat(Math.max(0, barLen - filled))
  const phase = learning
    ? s.currentMessage || 'Entrenando…'
    : t.requested
      ? 'En cola, esperando worker…'
      : 'Sin entrenamiento activo'
  return [
    '╭━━〔 🧠 *LLM · PROGRESS* 〕━━╮',
    `┃ Estado » *${learning ? 'ENTRENANDO' : t.requested ? 'EN COLA' : 'IDLE'}*`,
    `┃ Barra » [${bar}] *${pct}%*`,
    `┃ Paso » *${s.currentStep}/${Math.max(1, s.currentTotalSteps)}*`,
    `┃ Época » *${s.currentEpoch}/${Math.max(1, s.currentTotalEpochs || 2)}*`,
    `┃ Fase » ${phase}`,
    `┃ Loss vivo » *${s.lastLoss?.toFixed(5) ?? 'N/D'}*`,
    '┃ — Cola documentos —',
    `┃ Pendientes » *${q.queued}*`,
    `┃ Procesando » *${q.processing}*`,
    `┃ Listos » *${q.completed}*`,
    `┃ Fallidos » *${q.failed}*`,
    '┃ — Descargas corpus —',
    `┃ Activa » *${downloads.state.active ? 'SÍ' : 'NO'}*`,
    `┃ Fuentes OK » *${downloads.state.completed.length}/${CORPUS_SOURCES.length}*`,
    '╰━━━━━━━━━━━━━━━━━━╯',
    '',
    `_Progress = train + colas en vivo. Resumen del modelo:_ *${prefix}llm status*`,
  ].join('\n')
}

function queueText(prefix: string) {
  const queued = listJobsByStatus('queued').slice(-15)
  const processing = listJobsByStatus('processing').slice(-10)
  const completed = listJobsByStatus('completed').slice(-10)
  const failed = listJobsByStatus('failed').slice(-10)
  const line = (job: { filename: string; id: string; error?: string }) =>
    `• ${job.filename} \`${job.id.slice(0, 8)}\`${job.error ? ` — ${job.error.slice(0, 60)}` : ''}`
  return [
    '╭━━〔 🧠 *LLM · COLA* 〕━━╮',
    '┃ 📥 *Pendientes (inbox)*',
    queued.length ? queued.map(line).join('\n') : '┃ (vacío)',
    '',
    '┃ 🔄 *Procesando*',
    processing.length ? processing.map(line).join('\n') : '┃ (vacío)',
    '',
    '┃ ✅ *Procesados*',
    completed.length ? completed.map(line).join('\n') : '┃ (vacío)',
    '',
    '┃ ❌ *Fallidos*',
    failed.length ? failed.map(line).join('\n') : '┃ (vacío)',
    '╰━━━━━━━━━━━━━━━━━━╯',
    '',
    `Carpetas: inbox → processing → corpus/processed`,
    `Comandos: *${prefix}llm process* · *${prefix}llm retry-failed* · *${prefix}llm clear-done*`,
  ].join('\n')
}

function sourcesText(prefix: string) {
  const names: Record<string, string> = {
    general: 'GENERAL',
    programming: 'PROGRAMACIÓN',
    science: 'CIENCIA / IA',
    spanish: 'ESPAÑOL',
    literature: 'LITERATURA',
  }
  const lines = ['╭━━〔 🧠 *LLM · FUENTES* 〕━━╮']
  for (const category of ['general', 'programming', 'science', 'spanish', 'literature']) {
    lines.push(`│ *${names[category]}*`)
    for (const source of CORPUS_SOURCES.filter((item) => item.category === category)) {
      lines.push(`│ ${source.id} — ${source.title}${source.enabledByDefault ? '' : ' [manual]'}`)
    }
  }
  lines.push('╰━━━━━━━━━━━━━━━━━━━━╯', '', `Uso: ${prefix}llm download <id...>`) 
  return lines.join('\n')
}

export const miniLlmCommands: BotCommand[] = [
  {
    name: 'llm',
    aliases: ['minillm', 'localai', 'corpus', 'llmcorpus'],
    category: 'tools',
    description: 'Gestiona memoria, corpus, cola de documentos y Mini-LLM local.',
    usage:
      'llm <status|progress|queue|docs|add|process|seed|sources|download|train|stop|ask|search|auto|retry-failed|clear-done>',
    async handler(ctx) {
      const sub = (ctx.args[0] ?? 'status').toLowerCase()

      if (sub === 'help' || sub === 'ayuda') {
        await ctx.reply(help(ctx.prefix))
        return
      }

      if (sub === 'status' || sub === 'estado' || sub === 'info') {
        await ctx.reply(statusText(ctx.prefix))
        return
      }

      if (sub === 'progress' || sub === 'avance' || sub === 'prog') {
        await ctx.reply(progressText(ctx.prefix))
        return
      }

      if (sub === 'queue' || sub === 'cola') {
        await ctx.reply(queueText(ctx.prefix))
        return
      }

      if (sub === 'sources' || sub === 'fuentes') {
        await ctx.reply(sourcesText(ctx.prefix))
        return
      }

      if (sub === 'seed' || sub === 'semilla' || sub === 'pairs') {
        if (!ctx.isOwner && !ctx.isBotStaff) throw new Error('Solo Owner/Staff puede instalar el corpus seed.')
        const force = (ctx.args[1] ?? '').toLowerCase() === 'force'
        await ctx.reply('🌱 Instalando pares de conversación en el corpus…')
        const result = await installSeedCorpus(force)
        if (!result.ok) {
          await ctx.reply('❌ No encontré la carpeta de seed empaquetada en el bot.')
          return
        }
        if (result.reason === 'already_installed') {
          await ctx.reply(
            `✅ Seed ya estaba instalado (*${result.installed}* archivos).\nUsa *${ctx.prefix}llm seed force* para reinstalar e indexar otra vez.\nLuego *${ctx.prefix}llm train*.`,
          )
          return
        }
        await ctx.reply(
          `✅ *SEED INSTALADO*\n━━━━━━━━━━━━━━\nArchivos: *${result.installed}*\nFragmentos: *${'chunks' in result ? result.chunks : 0}*\n\nAhora: *${ctx.prefix}llm train* para entrenar con esos pares.`,
        )
        return
      }

      if (sub === 'process' || sub === 'procesar' || sub === 'run-queue') {
        if (!ctx.isOwner && !ctx.isBotStaff) throw new Error('Solo Owner/Staff puede procesar la cola.')
        const stats = getQueueStats()
        requestTraining('manual', ctx.sender, true)
        await ctx.reply(
          [
            '⚙️ *LLM · PROCESS*',
            '━━━━━━━━━━━━━━',
            `Pendientes en cola: *${stats.queued}*`,
            `Procesando: *${stats.processing}*`,
            '',
            'El worker va a:',
            '1) Ingestar documentos de *inbox*',
            '2) Moverlos a *corpus/processed*',
            '3) Lanzar una ronda de entrenamiento',
            '',
            `Sigue el avance con *${ctx.prefix}llm progress*`,
          ].join('\n'),
        )
        return
      }

      if (sub === 'retry-failed' || sub === 'reintentar') {
        if (!ctx.isOwner && !ctx.isBotStaff) throw new Error('Solo Owner/Staff.')
        const n = retryFailedJobs()
        await ctx.reply(`🔁 Reencolados *${n}* documento(s) fallidos → *inbox*. Usa *${ctx.prefix}llm process*.`)
        return
      }

      if (sub === 'clear-done' || sub === 'limpiar-listos') {
        if (!ctx.isOwner && !ctx.isBotStaff) throw new Error('Solo Owner/Staff.')
        const n = clearCompletedJobs()
        await ctx.reply(`🧹 Quitados *${n}* jobs completados del registro de cola (archivos en disco se conservan).`)
        return
      }

      if (sub === 'download' || sub === 'descargar' || sub === 'download-defaults' || sub === 'descargar-defaults') {
        if (!ctx.isOwner && !ctx.isBotStaff) throw new Error('Solo Owner/Staff puede gestionar las descargas del corpus.')
        const requested = ctx.args.slice(1).filter(Boolean)
        const ids =
          requested.length === 1 && requested[0].toLowerCase() === 'defaults'
            ? CORPUS_SOURCES.filter((source) => source.enabledByDefault).map((source) => source.id)
            : sub.includes('defaults')
              ? CORPUS_SOURCES.filter((source) => source.enabledByDefault).map((source) => source.id)
              : requested
        if (!ids.length) throw new Error(`Ejemplo: ${ctx.prefix}llm download tatoeba-es`)
        await ctx.reply(`⬇️ *LLM · CORPUS*\n━━━━━━━━━━━━━━\nDescargando *${ids.length}* fuente(s). El bot seguirá disponible.`)
        void downloadSources(ids)
          .then(async (result) => {
            const completed = result.state.completed.filter((id) => ids.includes(id))
            const failed = result.state.failed.filter((id) => ids.includes(id))
            await ctx.reply(
              `✅ *DESCARGA TERMINADA*\n━━━━━━━━━━━━━━\nCompletadas: *${completed.length}/${ids.length}*\nFallidas: *${failed.length}*\nArchivos: *${result.files.length}*\n\nAhora *${ctx.prefix}llm process* o *${ctx.prefix}llm train*.`,
            )
          })
          .catch(async (error) => {
            await ctx.reply(`❌ Error de descarga: ${error instanceof Error ? error.message : String(error)}`).catch(() => undefined)
          })
        return
      }

      if (sub === 'docs' || sub === 'documentos') {
        const docs = miniLLM.listDocuments()
        const queue = getQueueState().jobs
        const processed = docs.slice(-40).map((doc, i) => `✅ ${i + 1}. ${doc.name} · ${formatBytes(doc.size)}`)
        const queued = queue.filter((job) => job.status === 'queued').map((job) => `⏳ ${job.filename}`)
        const processing = queue.filter((job) => job.status === 'processing').map((job) => `🔄 ${job.filename}`)
        const failed = queue.filter((job) => job.status === 'failed').map((job) => `❌ ${job.filename}`)
        const sections = [
          ...(processed.length ? ['*En corpus*', ...processed] : []),
          ...(processing.length ? ['', '*Procesando*', ...processing] : []),
          ...(queued.length ? ['', '*Pendientes*', ...queued] : []),
          ...(failed.length ? ['', '*Fallidos*', ...failed] : []),
        ]
        await ctx.reply(
          sections.length
            ? `📚 *CORPUS LOCAL*\n━━━━━━━━━━━━━━\n${sections.join('\n')}\n\nUsa \`${ctx.prefix}llm process\` para encolar train.`
            : 'No hay documentos en el corpus ni en cola.',
        )
        return
      }

      if (sub === 'add' || sub === 'agregar' || sub === 'document') {
        if (!ctx.isOwner && !ctx.isBotStaff) throw new Error('Solo Owner/Staff puede añadir documentos.')
        await ctx.reply('📥 *LLM · DOCUMENTO*\n━━━━━━━━━━━━━━\nRecibiendo archivo → cola *inbox*…')
        const job = await enqueueDocumentFromWhatsApp(ctx.message)
        await ctx.reply(
          [
            '✅ *EN COLA*',
            '━━━━━━━━━━━━━━',
            `📄 *${job.filename}*`,
            `📦 *${formatBytes(job.bytes)}*`,
            `🆔 *${job.id}*`,
            `📂 ${documentQueuePaths.INBOX}`,
            '',
            `Estado: *queued*`,
            `Cuando quieras: *${ctx.prefix}llm process* (ingesta + train)`,
            `Ver cola: *${ctx.prefix}llm queue*`,
          ].join('\n'),
        )
        return
      }

      if (sub === 'stop' || sub === 'detener' || sub === 'cancel') {
        if (!ctx.isOwner && !ctx.isBotStaff) throw new Error('Solo Owner/Staff puede detener el entrenamiento.')
        const pidFile = path.join(miniLLM.ROOT, 'worker.pid')
        const trainingQueueFile = path.join(miniLLM.ROOT, 'training-queue.json')
        let pid: number | null = null
        try {
          const candidate = Number(fs.readFileSync(pidFile, 'utf8').trim())
          if (Number.isInteger(candidate) && candidate > 1) pid = candidate
        } catch {}
        try {
          fs.writeFileSync(trainingQueueFile, JSON.stringify({ requested: false }, null, 2))
        } catch {}
        if (pid !== null) {
          try {
            process.kill(pid, 'SIGTERM')
          } catch (error) {
            if (!(error instanceof Error) || !error.message.includes('ESRCH')) throw error
          }
        }
        try {
          const statePath = path.join(miniLLM.ROOT, 'state.json')
          const current = JSON.parse(fs.readFileSync(statePath, 'utf8')) as Record<string, unknown>
          current.learning = false
          current.currentMessage = 'Detenido por usuario'
          const tmp = `${statePath}.tmp`
          fs.writeFileSync(tmp, JSON.stringify(current, null, 2))
          fs.renameSync(tmp, statePath)
        } catch {}
        await ctx.reply(
          pid !== null
            ? '⏹️ *ENTRENAMIENTO DETENIDO*\n━━━━━━━━━━━━━━\nSe canceló la corrida. Los *model.bin / corpus.bin* se conservan.\nPuedes usar `.llm ask` con lo ya aprendido.'
            : '⏹️ *ENTRENAMIENTO DETENIDO*\n━━━━━━━━━━━━━━\nNo había worker de train activo; se limpió la solicitud pendiente.',
        )
        return
      }

      if (
        sub === 'import' ||
        sub === 'importar' ||
        sub === 'rebuild' ||
        sub === 'reconstruir' ||
        sub === 'train' ||
        sub === 'entrenar'
      ) {
        if (!ctx.isOwner && !ctx.isBotStaff) throw new Error('Solo Owner/Staff puede controlar el entrenamiento.')
        requestTraining(sub === 'import' || sub === 'importar' ? 'import' : 'manual', ctx.sender, true)
        await ctx.reply(
          [
            '🧠 *TRAIN ENCOLADO*',
            '━━━━━━━━━━━━━━',
            'El worker procesará documentos pendientes y entrenará el modelo.',
            `Sigue la barra con *${ctx.prefix}llm progress*`,
            `Resumen del modelo: *${ctx.prefix}llm status*`,
          ].join('\n'),
        )
        return
      }

      if (sub === 'ask' || sub === 'pregunta' || sub === 'query') {
        const query = ctx.args.slice(1).join(' ').trim()
        if (query.length < 2) throw new Error(`Uso: ${ctx.prefix}llm ask <pregunta>`)
        await ctx.reply('🧠 Consultando memoria local…')
        await ctx.reply(miniLLM.answer(query))
        return
      }

      if (sub === 'search' || sub === 'buscar') {
        const query = ctx.args.slice(1).join(' ').trim()
        if (query.length < 2) throw new Error(`Uso: ${ctx.prefix}llm search <texto>`)
        const hits = miniLLM.search(query, 5)
        if (!hits.length) {
          await ctx.reply('No se encontraron coincidencias.')
          return
        }
        await ctx.reply(
          `🔎 *MEMORIA LOCAL*\n━━━━━━━━━━━━━━\n${hits
            .map((hit, i) => `${i + 1}. ${Math.round(hit.score * 100)}%\n${hit.text.slice(0, 700)}`)
            .join('\n\n')}`,
        )
        return
      }

      if (sub === 'auto') {
        if (!ctx.isOwner && !ctx.isBotStaff) throw new Error('Solo Owner/Staff puede cambiar el auto-entrenamiento.')
        const mode = (ctx.args[1] ?? '').toLowerCase()
        if (!['on', 'off'].includes(mode)) throw new Error(`Uso: ${ctx.prefix}llm auto on|off`)
        const statePath = `${miniLLM.ROOT}/state.json`
        let current: Record<string, unknown> = {}
        try {
          current = JSON.parse(fs.readFileSync(statePath, 'utf8')) as Record<string, unknown>
        } catch {}
        current.autoTrainEnabled = mode === 'on'
        fs.writeFileSync(statePath, JSON.stringify(current, null, 2))
        await ctx.reply(`🧠 Auto-entrenamiento: *${mode.toUpperCase()}*`) 
        return
      }

      await ctx.reply(help(ctx.prefix))
    },
  },
]
