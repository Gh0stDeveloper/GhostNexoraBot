import { miniLlmCommands } from '../commands/mini-llm.js'
import { registerTrainingNotificationSocket, startTrainingCompletionMonitor } from './training-completion-monitor.js'

let patched = false

export function installTrainingCommandPatch() {
  startTrainingCompletionMonitor()
  if (patched) return
  const command = miniLlmCommands.find((item) => item.name === 'llm')
  if (!command) return
  const original = command.handler
  command.handler = async (ctx) => {
    registerTrainingNotificationSocket(ctx.socket)
    return original(ctx)
  }
  patched = true
}
