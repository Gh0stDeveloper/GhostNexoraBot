import type { PlatformAdapter } from '@ghostnexora/platform-contracts'

export function startTypingIndicator(_adapter: PlatformAdapter, _chatId: string, _intervalMs = 4_500) {
  // Presence/typing traffic is intentionally disabled for WhatsApp safety.
  // Keep the helper as a no-op so existing callers do not need special cases.
  return () => undefined
}
