import type { BotCommand } from '../types.js'
import { miniLlmCommands } from './mini-llm.js'
import { registerTrainingNotificationSocket, startTrainingCompletionMonitor } from '../llm/training-completion-monitor.js'

startTrainingCompletionMonitor()

export const miniLlmManagedCommands: BotCommand[] = miniLlmCommands.map((command) => ({
  ...command,
  async handler(ctx) {
    registerTrainingNotificationSocket(ctx.socket)
    return command.handler(ctx)
  },
}))
