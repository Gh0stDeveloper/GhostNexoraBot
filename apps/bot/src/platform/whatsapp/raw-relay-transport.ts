import type { WASocket } from 'baileys'

/**
 * Reviewed low-level WhatsApp relay boundary.
 *
 * Raw relayMessage access is centralized here so compatibility bridges can use
 * it without spreading Baileys raw transport calls through routers/adapters.
 */
export async function relayWhatsAppMessage(
  socket: Pick<WASocket, 'relayMessage'>,
  jid: string,
  content: unknown,
  relayOptions?: unknown,
) {
  return socket.relayMessage(jid, content as never, relayOptions as never)
}
