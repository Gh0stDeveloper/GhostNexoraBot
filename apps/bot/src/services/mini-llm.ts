import { miniLLM as core } from './mini-llm-transformer.js'
import { enqueueDocumentFromWhatsApp } from '../llm/document-queue.js'
import type { WAMessage } from 'baileys'

export const miniLLM = {
  ...core,
  async addDocument(_socket: unknown, message: WAMessage) {
    const job = await enqueueDocumentFromWhatsApp(message)
    return {
      name: job.filename,
      chunks: 0,
      characters: 0,
      queued: true,
      jobId: job.id,
      bytes: job.bytes,
    }
  },
  startAutoTrain() { return undefined },
}
