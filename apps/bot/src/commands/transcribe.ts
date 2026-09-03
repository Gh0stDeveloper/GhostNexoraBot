import type { BotCommand } from '../types.js'
import { hasAudio, transcribeWhatsAppAudio } from '../services/audio-transcribe.js'

export const transcribeCommands: BotCommand[] = [
  {
    name: 'transcribir',
    aliases: ['stt', 'whisper', 'audio2text', 'a2t'],
    category: 'tools',
    description: 'Transcribe a texto un audio o nota de voz (responde al audio).',
    usage: 'transcribir (responde a un audio)',
    async handler(ctx) {
      if (!hasAudio(ctx.message)) {
        throw new Error('Responde a un audio o nota de voz y usa .transcribir')
      }
      await ctx.react('🎧').catch(() => undefined)
      const text = await transcribeWhatsAppAudio(ctx.message, true)
      if (!text.trim()) throw new Error('No pude obtener texto del audio.')
      await ctx.reply(
        [
          '🎧 *Transcripción*',
          '',
          text.trim(),
          '',
          '_✧ Ghost Nexora Bot · Ghost Developer ✧_',
        ].join('\n'),
      )
    },
  },
]
