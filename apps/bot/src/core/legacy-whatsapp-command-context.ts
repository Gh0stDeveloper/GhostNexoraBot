import type { WAMessage, WASocket } from 'baileys'

/**
 * Temporary V1 compatibility bridge for WhatsApp-specific commands.
 *
 * New or migrated commands must not depend on this surface. B1 keeps it
 * outside CommandContext so Baileys does not leak into the neutral contract.
 */
export type NexoraSocket = Omit<WASocket, 'sendMessage'> & {
  sendMessage: (...args: any[]) => Promise<any>
}

export interface LegacyWhatsAppCommandContext {
  /** @deprecated Prefer adapter/sendText/sendMedia/sendUi/setTyping. */
  socket: NexoraSocket
  /** @deprecated Prefer normalizedMessage and neutral helpers. */
  message: WAMessage
}
