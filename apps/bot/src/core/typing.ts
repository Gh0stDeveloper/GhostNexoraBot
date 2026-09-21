import type { PlatformAdapter } from '@ghostnexora/platform-contracts'

export function startTypingIndicator(adapter: PlatformAdapter, chatId: string, intervalMs = 4_500) {
  // WhatsApp keeps the capability in the shared contract, but presence traffic is
  // deliberately disabled at runtime to avoid periodic auxiliary events.
  if (adapter.id === 'whatsapp') return () => undefined
  if (!adapter.capabilities.typing || !adapter.setTyping) return () => undefined

  void adapter.setTyping(chatId, true).catch(() => undefined)
  const timer = setInterval(() => {
    void adapter.setTyping?.(chatId, true).catch(() => undefined)
  }, intervalMs)
  timer.unref?.()

  return () => {
    clearInterval(timer)
    void adapter.setTyping?.(chatId, false).catch(() => undefined)
  }
}
