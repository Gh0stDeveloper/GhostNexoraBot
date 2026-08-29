import type { BotCommand } from '../types.js'
import { CORPUS_SOURCES } from '../llm/corpus-sources.js'
import { downloadDefaults, downloadSources, sourceStatus } from '../llm/corpus-manager.js'

let running = false

function catalogText(prefix: string) {
  const groups = new Map<string, typeof CORPUS_SOURCES>()
  for (const source of CORPUS_SOURCES) {
    const bucket = groups.get(source.category) ?? []
    bucket.push(source); groups.set(source.category, bucket)
  }
  const title: Record<string, string> = { programming: 'PROGRAMACIÓN', language: 'IDIOMA', math: 'MATEMÁTICAS / IA', culture: 'CULTURA' }
  const lines: string[] = ['╭━━〔 🧠 *LLM · FUENTES* 〕━━╮']
  for (const [category, sources] of groups) {
    lines.push(`│ *${title[category] ?? category.toUpperCase()}*`)
    for (const source of sources) lines.push(`│ ${source.id} — ${source.title}${source.enabledByDefault ? '' : ' [manual]'}`)
  }
  lines.push('╰━━━━━━━━━━━━━━━━━━━━╯', '', `Uso: ${prefix}llm download <id...>`, `Todo lo recomendado: ${prefix}llm download defaults`)
  return lines.join('\n')
}

function progressText(prefix: string) {
  const status = sourceStatus()
  const done = status.state.completed.length
  const failed = status.state.failed.length
  const total = CORPUS_SOURCES.length
  const files = status.files.length
  return [
    '╭━━〔 🧠 *LLM · DESCARGAS* 〕━━╮',
    `│ Estado » *${status.state.active ? 'DESCARGANDO' : 'INACTIVO'}*`,
    `│ Progreso » *${done}/${total}* fuentes`,
    `│ Archivos » *${files}*`,
    `│ Fallidas » *${failed}*`,
    `│ Actual » *${status.state.current ?? '—'}*`,
    status.state.startedAt ? `│ Inicio » ${status.state.startedAt}` : '│ Inicio » —',
    status.state.finishedAt ? `│ Fin » ${status.state.finishedAt}` : '│ Fin » —',
    '╰━━━━━━━━━━━━━━━━━━━━╯',
    '',
    `Usa ${prefix}llm sources para ver el catálogo.`,
  ].join('\n')
}

export const llmCorpusCommands: BotCommand[] = [{
  name: 'llm', aliases: ['corpus','llmcorpus'], category: 'tools', ownerOnly: true,
  description: 'Administra el corpus local del Mini-LLM y sus descargas.', usage: 'llm <sources|download|progress>',
  async handler(ctx) {
    const action = (ctx.args[0] ?? 'progress').toLowerCase()
    if (action === 'sources' || action === 'fuentes') { await ctx.reply(catalogText(ctx.prefix)); return }
    if (action === 'progress' || action === 'status' || action === 'estado') { await ctx.reply(progressText(ctx.prefix)); return }
    if (action === 'download' || action === 'descargar') {
      if (running) throw new Error('Ya hay una descarga de corpus en ejecución.')
      const requested = ctx.args.slice(1).filter(Boolean)
      const ids = requested.length === 1 && requested[0].toLowerCase() === 'defaults'
        ? CORPUS_SOURCES.filter((s) => s.enabledByDefault).map((s) => s.id)
        : requested
      if (!ids.length) throw new Error(`Indica fuentes. Ejemplo: ${ctx.prefix}llm download ts-book node-book`)
      running = true
      await ctx.reply(`⬇️ *LLM*\n━━━━━━━━━━━━━━\nIniciando descarga de *${ids.length}* fuente(s).\nUsa ${ctx.prefix}llm progress para consultar el avance.`)
      void downloadSources(ids).finally(() => { running = false })
      return
    }
    if (action === 'download-defaults') {
      if (running) throw new Error('Ya hay una descarga de corpus en ejecución.')
      running = true
      await ctx.reply('⬇️ *LLM*\n━━━━━━━━━━━━━━\nIniciando fuentes recomendadas.')
      void downloadDefaults().finally(() => { running = false })
      return
    }
    throw new Error(`Uso: ${ctx.prefix}llm sources | download <id...> | progress`)
  },
}]
