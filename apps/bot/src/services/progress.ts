import type { CommandContext } from '../types.js'

export type DownloadStage = 'preparing' | 'downloading' | 'processing' | 'sending' | 'done'

const labels: Record<DownloadStage, string> = {
  preparing: 'Preparando', downloading: 'Descargando', processing: 'Procesando', sending: 'Enviando', done: 'Completado',
}

export async function createDownloadProgress(ctx: CommandContext, subject: string) {
  const sent = await ctx.socket.sendMessage(ctx.chatId, {
    text: `⬇️ *${subject}*\n━━━━━━━━━━━━━━\n⏳ ${labels.preparing}…`,
  }, { quoted: ctx.message })

  async function update(stage: DownloadStage, detail?: string) {
    if (!sent?.key) return
    const icon = stage === 'done' ? '✅' : stage === 'sending' ? '📤' : stage === 'processing' ? '⚙️' : '⬇️'
    const text = `${icon} *${subject}*\n━━━━━━━━━━━━━━\n${stage === 'done' ? '✅' : '⏳'} ${labels[stage]}…${detail ? `\n${detail}` : ''}`
    await ctx.socket.sendMessage(ctx.chatId, { text, edit: sent.key }).catch(() => undefined)
  }

  return { update }
}
