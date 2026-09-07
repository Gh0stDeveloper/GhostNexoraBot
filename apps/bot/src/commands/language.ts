import type { BotCommand, CommandContext } from '../types.js'
import { community } from '../services/community.js'
import { isGroupAdministrator } from '../utils/target.js'
import { localeName, translate, type LocaleCode } from '../i18n/index.js'
import { isSupportedLocale } from '../i18n/types.js'

function canManageGlobal(ctx: CommandContext) {
  return ctx.isOwner || ctx.isBotStaff || ctx.isSubbotOwner
}

async function requireGroupManager(ctx: CommandContext) {
  if (!ctx.isGroup) throw new Error(ctx.t('language.error.groupOnly'))
  if (!(await isGroupAdministrator(ctx))) throw new Error(ctx.t('language.error.groupAdmin'))
}

function parseLocale(raw?: string): LocaleCode | null {
  const value = raw?.trim().toLowerCase()
  if (!value) return null
  if (value === 'español' || value === 'espanol' || value === 'spanish') return 'es'
  if (value === 'inglés' || value === 'ingles' || value === 'english') return 'en'
  return isSupportedLocale(value) ? value : null
}

async function status(ctx: CommandContext) {
  const global = ctx.settings.language
  const group = ctx.isGroup ? community.getGroupSettings(ctx.chatId).language : null
  const lines = [
    ctx.t('language.status.title'),
    '━━━━━━━━━━━━━━',
    `${ctx.t('language.status.global')}: *${localeName(global, ctx.locale)} (${global})*`,
  ]
  if (ctx.isGroup) {
    lines.push(`${ctx.t('language.status.group')}: *${group ? `${localeName(group, ctx.locale)} (${group})` : ctx.t('language.status.inherit')}*`)
  }
  lines.push(`${ctx.t('language.status.effective')}: *${localeName(ctx.locale, ctx.locale)} (${ctx.locale})*`)
  lines.push('', ctx.t('language.usage', { prefix: ctx.prefix }))
  await ctx.reply(lines.join('\n'))
}

async function setGlobal(ctx: CommandContext, rawLocale?: string) {
  if (!canManageGlobal(ctx)) throw new Error(ctx.t('language.error.globalPermission'))
  const locale = parseLocale(rawLocale)
  if (!locale) throw new Error(ctx.t('language.error.invalid'))
  await ctx.settings.setLanguage(locale)
  await ctx.reply(translate(locale, 'language.changed.global', { language: localeName(locale, locale) }))
}

async function setGroup(ctx: CommandContext, rawLocale?: string) {
  await requireGroupManager(ctx)
  const value = rawLocale?.trim().toLowerCase() ?? ''
  if (['inherit', 'heredar', 'default', 'global', 'auto'].includes(value)) {
    community.setGroupLanguage(ctx.chatId, null)
    const inherited = ctx.settings.language
    await ctx.reply(translate(inherited, 'language.changed.inherit', { language: localeName(inherited, inherited) }))
    return
  }
  const locale = parseLocale(value)
  if (!locale) throw new Error(ctx.t('language.error.invalid'))
  community.setGroupLanguage(ctx.chatId, locale)
  await ctx.reply(translate(locale, 'language.changed.group', { language: localeName(locale, locale) }))
}

async function languageCommand(ctx: CommandContext) {
  const action = (ctx.args[0] ?? '').trim().toLowerCase()
  if (!action || ['status', 'estado', 'current', 'actual'].includes(action)) {
    await status(ctx)
    return
  }

  if (['global', 'bot', 'instance', 'instancia'].includes(action)) {
    await setGlobal(ctx, ctx.args[1])
    return
  }

  if (['group', 'grupo', 'chat'].includes(action)) {
    await setGroup(ctx, ctx.args[1])
    return
  }

  if (ctx.isGroup && ['inherit', 'heredar', 'default', 'auto'].includes(action)) {
    await setGroup(ctx, action)
    return
  }

  const shorthandLocale = parseLocale(action)
  if (shorthandLocale) {
    if (ctx.isGroup) await setGroup(ctx, shorthandLocale)
    else await setGlobal(ctx, shorthandLocale)
    return
  }

  throw new Error(ctx.t('language.usage', { prefix: ctx.prefix }))
}

export const languageCommands: BotCommand[] = [
  {
    name: 'language',
    aliases: ['lang', 'idioma'],
    category: 'general',
    description: 'Configura el idioma global de la instancia o un idioma independiente para cada grupo.',
    usage: 'language [es|en|global <es|en>|group <es|en|inherit>]',
    subbotOwnerAllowed: true,
    handler: languageCommand,
  },
]
