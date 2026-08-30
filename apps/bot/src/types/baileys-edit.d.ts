import type { WAMessage, AnyMessageContent } from 'baileys'

declare module 'baileys' {
  interface WASocket {
    sendMessage(jid: string, content: AnyMessageContent, options?: { edit?: WAMessage['key']; quoted?: WAMessage } & Record<string, unknown>): Promise<WAMessage | undefined>
  }
}
