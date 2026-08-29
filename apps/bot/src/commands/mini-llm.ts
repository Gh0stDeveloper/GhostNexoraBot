import type { BotCommand } from '../types.js'
import { miniLLM } from '../services/mini-llm.js'
import { downloadMessageMedia } from '../utils/message.js'

function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}
function duration(ms: number) {
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(1)} s`
}
function help(prefix: string) {
  return [
    `╭━━〔 🧠 *MINI-LLM LOCAL* 〕━━╮`,
    `┃ ${prefix}llm status`,
    `┃ ${prefix}llm docs`,
    `┃ ${prefix}llm add`,
    `┃ ${prefix}llm train`,
    `┃ ${prefix}llm ask <pregunta>`,
    `┃ ${prefix}llm auto on|off`,
    `╰━━━━━━━━━━━━━━━━━━╯`,
    '',
    'Envía o responde a un PDF, DOCX o TXT con *llm add* para incorporarlo al corpus.',
  ].join('\n')
}

export const miniLlmCommands: BotCommand[] = [
  {
    name: 'llm',
    aliases: ['minillm', 'localai'],
    category: 'tools',
    description: 'Gestiona el aprendizaje local y la memoria del Mini-LLM.',
    usage: 'llm <status|docs|add|train|ask|auto>',
    async handler(ctx) {
      const sub = (ctx.args[0] ?? 'status').toLowerCase()
      if (sub === 'help' || sub === 'ayuda') { await ctx.reply(help(ctx.prefix)); return }
      if (sub === 'status') {
        const s = miniLLM.stats()
        await ctx.reply([
          '╭━━〔 🧠 *MINI-LLM · ESTADO* 〕━━╮',
          `┃ Documentos » *${s.totalDocuments}*`,
          `┃ Fragmentos » *${s.totalChunks}*`,
          `┃ Mensajes » *${s.totalMessages}*`,
          `┃ Pendientes » *${s.pendingMessages}*`,
          `┃ Vectores » *${s.vectorRecords}*`,
          `┃ Vocabulario » *${s.vocabSize}*`,
          `┃ Entrenamientos » *${s.trainRuns}*`,
          `┃ Pasos » *${s.trainSteps}*`,
          `┃ Modelo » *v${s.modelVersion}*`,
          `┃ Último train » *${s.lastTrainAt ?? 'Nunca'}*`,
          `┃ Última pérdida » *${s.lastLoss?.toFixed(5) ?? 'N/D'}*`,
          `┃ Auto-train » *${s.autoTrainEnabled ? 'ON' : 'OFF'}*`,
          `┃ Almacenamiento » *${formatBytes(s.storageBytes)}*`,
          `╰━━━━━━━━━━━━━━━━━━╯`,
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
        const media = await downloadMessageMedia(ctx.message)
        if (!media || media.kind !== 'document') throw new Error('Envía o responde a un PDF, DOCX o TXT con el comando.')
        const started = Date.now()
        await ctx.reply('📥 *MINI-LLM*\n━━━━━━━━━━━━━━\nProcesando documento y actualizando el corpus...')
        const result = await miniLLM.addDocument(ctx.socket, ctx.message)
        await ctx.reply(`✅ *DOCUMENTO AÑADIDO*\n━━━━━━━━━━━━━━\n📄 ${result.name}\n🧩 Fragmentos: *${result.chunks}*\n📝 Caracteres: *${result.characters.toLocaleString('es-MX')}*\n⏱️ ${duration(Date.now() - started)}`)
        return
      }
      if (sub === 'train' || sub === 'entrenar') {
        if (!ctx.isOwner && !ctx.isBotStaff) throw new Error('Solo Owner/Staff puede iniciar entrenamiento.')
        const result = await miniLLM.train('manual')
        if (!result.started) { await ctx.reply('🧠 Ya hay un entrenamiento en ejecución.'); return }
        await ctx.reply(`✅ *ENTRENAMIENTO COMPLETADO*\n━━━━━━━━━━━━━━\nPasos: *${result.steps}*\nLoss: *${result.loss?.toFixed(5) ?? 'N/D'}*\nDuración: *${duration(result.durationMs)}*`)
        return
      }
      if (sub === 'ask' || sub === 'pregunta' || sub === 'query') {
        const query = ctx.args.slice(1).join(' ').trim()
        if (query.length < 2) throw new Error(`Uso: ${ctx.prefix}llm ask <pregunta>`)
        await ctx.reply(`🧠 Buscando en la memoria local: *${query}*...`)
        await ctx.reply(miniLLM.answer(query))
        return
      }
      if (sub === 'auto') {
        if (!ctx.isOwner && !ctx.isBotStaff) throw new Error('Solo Owner/Staff puede cambiar el auto-entrenamiento.')
        const mode = (ctx.args[1] ?? '').toLowerCase()
        if (!['on', 'off'].includes(mode)) throw new Error(`Uso: ${ctx.prefix}llm auto on|off`)
        const stats = miniLLM.stats()
        const fs = await import('node:fs')
        const statePath = `${miniLLM.ROOT}/state.json`
        const current = JSON.parse(fs.readFileSync(statePath, 'utf8')) as Record<string, unknown>
        current.autoTrainEnabled = mode === 'on'
        fs.writeFileSync(statePath, JSON.stringify(current, null, 2))
        await ctx.reply(`🧠 Auto-entrenamiento: *${mode.toUpperCase()}*\nIntervalo: *30 minutos*\nPendientes actuales: *${stats.pendingMessages}*`)
        return
      }
      await ctx.reply(help(ctx.prefix))
    },
  },
]
