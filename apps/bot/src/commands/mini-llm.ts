import type { BotCommand } from '../types.js'
import { miniLLM } from '../services/mini-llm.js'
import { CORPUS_SOURCES } from '../llm/corpus-sources.js'
import { downloadSources, sourceStatus } from '../llm/corpus-manager.js'

let corpusDownloadRunning = false
let corpusTrainingRunning = false

function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

function corpusSourcesText(prefix: string) {
  const groups = new Map<string, typeof CORPUS_SOURCES>()
  for (const source of CORPUS_SOURCES) {
    const bucket = groups.get(source.category) ?? []
    bucket.push(source)
    groups.set(source.category, bucket)
  }
  const title: Record<string, string> = { programming: 'PROGRAMACIÓN', language: 'IDIOMA', math: 'MATEMÁTICAS / IA', culture: 'CULTURA' }
  const lines = ['╭━━〔 🧠 *LLM · FUENTES* 〕━━╮']
  for (const [category, sources] of groups) {
    lines.push(`│ *${title[category] ?? category.toUpperCase()}*`)
    for (const source of sources) lines.push(`│ ${source.id} — ${source.title}${source.enabledByDefault ? '' : ' [manual]'}`)
  }
  lines.push('╰━━━━━━━━━━━━━━━━━━━━╯', '', `Uso: ${prefix}llm download <id...>`, `Todo lo recomendado: ${prefix}llm download defaults`)
  return lines.join('\n')
}

function corpusProgressText(prefix: string) {
  const status = sourceStatus()
  const done = status.state.completed.length
  const failed = status.state.failed.length
  const total = CORPUS_SOURCES.length
  return [
    '╭━━〔 🧠 *LLM · DESCARGAS* 〕━━╮',
    `│ Estado » *${status.state.active ? 'DESCARGANDO' : corpusTrainingRunning ? 'PREPARANDO / ENTRENANDO' : 'INACTIVO'}*`,
    `│ Progreso » *${done}/${total}* fuentes`,
    `│ Archivos » *${status.files.length}*`,
    `│ Fallidas » *${failed}*`,
    `│ Actual » *${status.state.current ?? (corpusTrainingRunning ? 'procesando corpus' : '—')}*`,
    status.state.startedAt ? `│ Inicio » ${status.state.startedAt}` : '│ Inicio » —',
    status.state.finishedAt ? `│ Fin » ${status.state.finishedAt}` : '│ Fin » —',
    '╰━━━━━━━━━━━━━━━━━━━━╯',
    '',
    `Usa ${prefix}llm sources para ver el catálogo.`,
    corpusTrainingRunning ? `El entrenamiento del corpus se ejecuta en segundo plano.` : '',
  ].filter(Boolean).join('\n')
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
    `┃ ${prefix}llm ask <pregunta>`,
    `┃ ${prefix}llm search <texto>`,
    `┃ ${prefix}llm auto on|off`,
    '╰━━━━━━━━━━━━━━━━━━╯',
  ].join('\n')
}

async function trainDownloadedCorpus() {
  if (corpusTrainingRunning) return
  corpusTrainingRunning = true
  try {
    const { prepareCorpusAndTrain } = await import('../llm/train.js')
    return await prepareCorpusAndTrain()
  } finally {
    corpusTrainingRunning = false
  }
}

export const miniLlmCommands: BotCommand[] = [{
  name: 'llm',
  aliases: ['minillm', 'localai', 'corpus', 'llmcorpus'],
  category: 'tools',
  description: 'Gestiona el Mini-LLM local, corpus, memoria, descargas y entrenamiento.',
  usage: 'llm <status|progress|docs|add|sources|download|download-progress|import|train|ask|search|auto>',
  async handler(ctx) {
    const sub = (ctx.args[0] ?? 'status').toLowerCase()

    if (sub === 'help' || sub === 'ayuda') { await ctx.reply(help(ctx.prefix)); return }
    if (sub === 'sources' || sub === 'fuentes') { await ctx.reply(corpusSourcesText(ctx.prefix)); return }
    if (sub === 'download-progress' || sub === 'downloadprogress' || sub === 'descarga') { await ctx.reply(corpusProgressText(ctx.prefix)); return }

    if (sub === 'download' || sub === 'descargar' || sub === 'download-defaults' || sub === 'descargar-defaults') {
      if (!ctx.isOwner && !ctx.isBotStaff) throw new Error('Solo Owner/Staff puede gestionar las descargas del corpus.')
      if (corpusDownloadRunning || corpusTrainingRunning) throw new Error('Ya hay una tarea del corpus en ejecución.')
      const requested = ctx.args.slice(1).filter(Boolean)
      const ids = requested.length === 1 && requested[0].toLowerCase() === 'defaults'
        ? CORPUS_SOURCES.filter((source) => source.enabledByDefault).map((source) => source.id)
        : (sub.includes('defaults') ? CORPUS_SOURCES.filter((source) => source.enabledByDefault).map((source) => source.id) : requested)
      if (!ids.length) throw new Error(`Indica fuentes. Ejemplo: ${ctx.prefix}llm download ts-book node-book`)
      corpusDownloadRunning = true
      await ctx.reply(`⬇️ *LLM · CORPUS*\n━━━━━━━━━━━━━━\nIniciando descarga de *${ids.length}* fuente(s).\nEl bot seguirá disponible mientras se descargan.\nDespués usa *${ctx.prefix}llm import* o *${ctx.prefix}llm train* para estudiar los documentos.`)
      void downloadSources(ids)
        .then(async (result) => {
          const completed = result.state.completed.filter((id) => ids.includes(id))
          const failed = result.state.failed.filter((id) => ids.includes(id))
          await ctx.reply(`✅ *LLM · DESCARGA TERMINADA*\n━━━━━━━━━━━━━━\n📥 Completadas: *${completed.length}/${ids.length}*\n❌ Fallidas: *${failed.length}*\n📚 Archivos locales: *${result.files.length}*\n\nUsa *${ctx.prefix}llm import* para procesar y entrenar el corpus.`)
        })
        .catch(async (error) => {
          console.error(error)
          await ctx.reply(`❌ *LLM · DESCARGA*\n━━━━━━━━━━━━━━\n${error instanceof Error ? error.message : 'No se pudo completar la descarga.'}`).catch(() => undefined)
        })
        .finally(() => { corpusDownloadRunning = false })
      return
    }

    if (sub === 'status' || sub === 'progress' || sub === 'avance') {
      const s = miniLLM.stats()
      const progress = s.learning ? `${s.currentProgress}% · ${s.currentStep}/${s.currentTotalSteps}` : '100%'
      await ctx.reply([
        '╭━━〔 🧠 *MINI-LLM · ESTADO* 〕━━╮',
        `┃ Estado » *${s.learning ? 'ENTRENANDO' : corpusTrainingRunning ? 'PREPARANDO CORPUS' : 'EN ESPERA'}*`,
        `┃ Progreso » *${progress}*`,
        `┃ Fase » *${s.currentMessage}*`,
        `┃ Época » *${s.currentEpoch}/${s.currentTotalEpochs || 1}*`,
        `┃ Documentos » *${s.totalDocuments}*`,
        `┃ Fragmentos » *${s.totalChunks}*`,
        `┃ Mensajes » *${s.totalMessages}*`,
        `┃ Pendientes » *${s.pendingMessages}*`,
        `┃ Vectores » *${s.vectorRecords}*`,
        `┃ Vocabulario » *${s.vocabSize}/${miniLLM.constants.VOCAB_LIMIT}*`,
        `┃ Atención » *${miniLLM.constants.HEADS} heads · ${miniLLM.constants.DIM} dim*`,
        `┃ Entrenamientos » *${s.trainRuns}*`,
        `┃ Pasos realizados » *${s.trainSteps}*`,
        `┃ Modelo » *v${s.modelVersion}*`,
        `┃ Último loss » *${s.lastLoss?.toFixed(5) ?? 'N/D'}*`,
        `┃ Mejor loss » *${s.bestLoss?.toFixed(5) ?? 'N/D'}*`,
        `┃ Último entrenamiento » *${s.lastTrainAt ?? 'N/D'}*`,
        `┃ Auto-train » *${s.autoTrainEnabled ? 'ON' : 'OFF'}*`,
        `┃ Almacenamiento » *${formatBytes(s.storageBytes)}*`,
        '╰━━━━━━━━━━━━━━━━━━╯',
      ].join('\n'))
      return
    }

    if (sub === 'docs' || sub === 'documentos') {
      const docs = miniLLM.listDocuments()
      if (!docs.length) { await ctx.reply('No hay documentos cargados en el corpus local.'); return }
      const visible = docs.slice(-30).map((doc, i) => `${i + 1}. ${doc.name} · ${formatBytes(doc.size)}`)
      await ctx.reply(`📚 *CORPUS LOCAL*\n━━━━━━━━━━━━━━\n${visible.join('\n')}\n\nTotal visible: *${visible.length}*`)
      return
    }

    if (sub === 'add' || sub === 'agregar' || sub === 'document') {
      if (!ctx.isOwner && !ctx.isBotStaff) throw new Error('Solo Owner/Staff puede añadir documentos al corpus.')
      await ctx.reply('📥 *MINI-LLM*\n━━━━━━━━━━━━━━\nProcesando documento y actualizando el corpus...')
      const result = await miniLLM.addDocument(ctx.socket, ctx.message)
      await ctx.reply(`✅ *DOCUMENTO AÑADIDO*\n━━━━━━━━━━━━━━\n📄 ${result.name}\n🧩 Fragmentos: *${result.chunks}*\n📝 Caracteres: *${result.characters.toLocaleString('es-MX')}*`)
      return
    }

    if (sub === 'import' || sub === 'importar' || sub === 'rebuild' || sub === 'reconstruir') {
      if (!ctx.isOwner && !ctx.isBotStaff) throw new Error('Solo Owner/Staff puede importar el corpus.')
      if (corpusTrainingRunning || miniLLM.stats().learning) { await ctx.reply(`🧠 Ya hay un entrenamiento en ejecución. Consulta *${ctx.prefix}llm progress*.`); return }
      await ctx.reply(`📚 *IMPORTACIÓN DEL CORPUS*\n━━━━━━━━━━━━━━\nLeyendo PDF, DOCX y TXT desde el corpus local y preparando el aprendizaje...`)
      void trainDownloadedCorpus().then(async (result) => {
        if (!result?.ok) { await ctx.reply('No se encontraron documentos compatibles en el corpus local.'); return }
        await ctx.reply(`✅ *CORPUS PREPARADO Y APRENDIDO*\n━━━━━━━━━━━━━━\n📚 Documentos: *${result.documents}*\n📝 Caracteres: *${result.characters.toLocaleString('es-MX')}*\n🔤 Vocabulario: *${result.vocab}*\n🧠 Pasos: *${result.steps}*\n📉 Loss promedio: *${result.averageLoss?.toFixed(5) ?? 'N/D'}*`)
      }).catch(async (error) => { console.error(error); await ctx.reply(`❌ No se pudo preparar el corpus: ${error instanceof Error ? error.message : 'error desconocido'}`).catch(() => undefined) })
      return
    }

    if (sub === 'train' || sub === 'entrenar') {
      if (!ctx.isOwner && !ctx.isBotStaff) throw new Error('Solo Owner/Staff puede iniciar entrenamiento.')
      if (corpusTrainingRunning || miniLLM.stats().learning) { await ctx.reply(`🧠 Ya hay un entrenamiento en ejecución. Consulta *${ctx.prefix}llm progress*.`); return }
      await ctx.reply(`🧠 *ENTRENAMIENTO INICIADO*\n━━━━━━━━━━━━━━\nSe procesará el corpus disponible y se actualizará *model.bin*.\nConsulta *${ctx.prefix}llm progress* mientras aprende.`)
      void trainDownloadedCorpus()
        .then(async (result) => {
          if (!result?.ok) { await ctx.reply('No hay corpus válido para entrenar. Ejecuta primero *.llm download ...* y luego *.llm import*.'); return }
          await ctx.reply(`✅ *ENTRENAMIENTO TERMINADO*\n━━━━━━━━━━━━━━\n📚 Documentos: *${result.documents}*\n📝 Caracteres: *${result.characters.toLocaleString('es-MX')}*\n🧠 Pasos: *${result.steps}*\n📉 Loss promedio: *${result.averageLoss?.toFixed(5) ?? 'N/D'}*`)
        })
        .catch(async (error) => { console.error(error); await ctx.reply(`❌ El entrenamiento local falló: ${error instanceof Error ? error.message : 'error desconocido'}`).catch(() => undefined) })
      return
    }

    if (sub === 'ask' || sub === 'pregunta' || sub === 'query') {
      const query = ctx.args.slice(1).join(' ').trim(); if (query.length < 2) throw new Error(`Uso: ${ctx.prefix}llm ask <pregunta>`)
      await ctx.reply('🧠 Consultando memoria local...'); await ctx.reply(miniLLM.answer(query)); return
    }

    if (sub === 'search' || sub === 'buscar') {
      const query = ctx.args.slice(1).join(' ').trim(); if (query.length < 2) throw new Error(`Uso: ${ctx.prefix}llm search <texto>`)
      const hits = miniLLM.search(query, 5); if (!hits.length) { await ctx.reply('No se encontraron coincidencias en la memoria local.'); return }
      await ctx.reply(`🔎 *MEMORIA LOCAL*\n━━━━━━━━━━━━━━\n${hits.map((hit, i) => `${i + 1}. ${Math.round(hit.score * 100)}%\n${hit.text.slice(0, 700)}`).join('\n\n')}`); return
    }

    if (sub === 'auto') {
      if (!ctx.isOwner && !ctx.isBotStaff) throw new Error('Solo Owner/Staff puede cambiar el auto-entrenamiento.')
      const mode = (ctx.args[1] ?? '').toLowerCase(); if (!['on', 'off'].includes(mode)) throw new Error(`Uso: ${ctx.prefix}llm auto on|off`)
      const fs = await import('node:fs'); const statePath = `${miniLLM.ROOT}/state.json`; const current = JSON.parse(fs.readFileSync(statePath, 'utf8')) as Record<string, unknown>
      current.autoTrainEnabled = mode === 'on'; fs.writeFileSync(statePath, JSON.stringify(current, null, 2)); await ctx.reply(`🧠 Auto-entrenamiento: *${mode.toUpperCase()}*\nIntervalo: *30 minutos*`); return
    }

    await ctx.reply(help(ctx.prefix))
  },
}]
