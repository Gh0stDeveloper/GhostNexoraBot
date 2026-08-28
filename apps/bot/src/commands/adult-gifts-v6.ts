import type { BotCommand, CommandContext } from '../types.js'
import { randomAdultGift, type AdultGiftKey } from '../services/adult-gifts.js'
import { effectiveCommands } from '../services/menu-registry.js'
import { economy } from '../services/economy.js'

const giftKeys: readonly AdultGiftKey[] = ['tease', 'flirt', 'seduce', 'kiss', 'cuddle', 'blush', 'love', 'bite']

function targetFromContext(ctx: CommandContext) {
  const mentioned = ctx.mentions?.[0]
  if (mentioned) return mentioned
  const participant = ctx.message.message?.extendedTextMessage?.contextInfo?.participant
  return participant ?? null
}

function adultEnabled(ctx: CommandContext) {
  const text = ctx.argText.toLowerCase()
  return text.includes('adult18') || text.includes('18+')
}

function giftHandler(key: AdultGiftKey) {
  return async (ctx: CommandContext) => {
    if (!adultEnabled(ctx)) throw new Error(`Confirma primero el acceso +18 con *${ctx.prefix}adult18 accept* y vuelve a usar el comando con 18+.`)
    const target = targetFromContext(ctx)
    if (!target) throw new Error('Menciona o responde al usuario que recibirá el regalo.')
    if (target === ctx.sender) throw new Error('No puedes enviarte este regalo a ti mismo.')
    const text = randomAdultGift(key)
    await ctx.reply(`${text}\n\n🔞 Regalo adulto no explícito y consensuado.\n👤 Destinatario: @${target.split('@')[0]}`)
  }
}

export const adultGiftV6Commands: BotCommand[] = [
  ...giftKeys.map((key) => ({
    name: `gift${key}`,
    aliases: [`adult${key}`, `18${key}`],
    category: 'adult' as const,
    description: `Envía una reacción adulta no explícita de tipo ${key}.`,
    usage: `gift${key} 18+ @usuario`,
    handler: giftHandler(key),
  })),
  {
    name: 'adultgifts',
    aliases: ['gift18', 'gifts18'],
    category: 'adult',
    description: 'Muestra los regalos adultos no explícitos disponibles.',
    usage: 'adultgifts',
    handler: async (ctx) => {
      await ctx.reply([
        '🔞 *REGALOS ADULTOS · NO EXPLÍCITOS*',
        '━━━━━━━━━━━━━━',
        'Usa *18+* y menciona o responde al destinatario.',
        '',
        ...giftKeys.map((key) => `• ${ctx.prefix}gift${key} 18+ @usuario`),
        '',
        `Primero confirma con *${ctx.prefix}adult18 accept*.`,
      ].join('\n'))
    },
  },
]
