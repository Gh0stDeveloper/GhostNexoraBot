import type { CommandContext } from '../types.js'
import { createOpsJob } from './ops-jobs.js'

export type DownloadStage = 'preparing' | 'downloading' | 'processing' | 'sending' | 'done'

const labels: Record<DownloadStage, string> = {
  preparing: 'Preparando', downloading: 'Descargando', processing: 'Procesando', sending: 'Enviando', done: 'Completado',
}

export async function createDownloadProgress(ctx: CommandContext, subject: string) {
  const job = createOpsJob({
    type: 'download',
    label: subject,
    source: `command:${ctx.commandName}`,
    cancellable: false,
    retryable: false,
    waitingDetail: 'command_download_created',
  })
  job.start('preparing')

  const sent = await ctx.sendText(`⬇️ *${subject}*\n━━━━━━━━━━━━━━\n⏳ ${labels.preparing}…`)

  async function update(stage: DownloadStage, detail?: string) {
    const progress = stage === 'preparing' ? 5
      : stage === 'downloading' ? 30
        : stage === 'processing' ? 60
          : stage === 'sending' ? 85
            : 100
    if (stage === 'done') job.complete(detail ?? 'done')
    else job.update(progress, detail ?? stage)

    if (!sent.messageId) return
    const icon = stage === 'done' ? '✅' : stage === 'sending' ? '📤' : stage === 'processing' ? '⚙️' : '⬇️'
    const text = `${icon} *${subject}*\n━━━━━━━━━━━━━━\n${stage === 'done' ? '✅' : '⏳'} ${labels[stage]}…${detail ? `\n${detail}` : ''}`
    await ctx.editMessage(sent.messageId, text).catch(() => undefined)
  }

  return {
    jobId: job.id,
    update,
    fail(error: unknown) {
      job.fail(error)
    },
  }
}
