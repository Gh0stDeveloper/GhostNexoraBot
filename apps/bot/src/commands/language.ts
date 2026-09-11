import type { BotCommand, CommandContext } from '../types.js'
import { community } from '../services/community.js'
import { isGroupAdministrator } from '../utils/target.js'
import {
  clearPlatformLocale,
  localeName,
  platformLocalePreference,
  resolvePlatformLocale,
  setPlatformLocale,
  translate,
  type LocaleCode,
} from '../i18n/index.js'
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

function isInherit(raw?: string) {
  return ['inherit', 'heredar', 'default', 'global', 'auto', 'clear', 'reset'].includes(raw?.trim().toLowerCase() ?? '')
}

function platformContext(ctx: CommandContext) {
  return { platform: 'whatsapp' as const, botInstanceId: ctx.adapter.botInstanceId }
}

async function status(ctx: CommandContext) {
  const platform = platformContext(ctx)
  const global = ctx.settings.language
  const group = ctx.isGroup ? community.getGroupSettings(ctx.chatId).language : null
  const user = platformLocalePreference(platform, 'user', ctx.sender)
  const bot = platformLocalePreference(platform, 'bot', 'self')
  const effective = resolvePlatformLocale({
    ...platform,
    chatId: ctx.chatId,
    userId: ctx.sender,
  })
  const lines = [
    ctx.t('language.status.title'),
    '━━━━━━━━━━━━━━',
    `${ctx.t('language.status.global')}: *${localeName(global, effective)} (${global})*`,
    `${ctx.t('language.status.bot')}: *${bot ? `${localeName(bot, effective)} (${bot})` : ctx.t('language.status.none')}*`,
    `${ctx.t('language.status.user')}: *${user ? `${localeName(user, effective)} (${user})` : ctx.t('language.status.none')}*`,
  ]
  if (ctx.isGroup) {
    lines.push(`${ctx.t('language.status.group')}: *${group ? `${localeName(group, effective)} (${group})` : ctx.t('language.status.inherit')}*`)
  }
  lines.push(`${ctx.t('language.status.effective')}: *${localeName(effective, effective)} (${effective})*`)
  lines.push('', translate(effective, 'language.usage.phase6', { command: `${ctx.prefix}language` }))
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
  if (isInherit(rawLocale)) {
    community.setGroupLanguage(ctx.chatId, null)
    const inherited = resolvePlatformLocale({ ...platformContext(ctx), chatId: ctx.chatId, userId: ctx.sender })
    await ctx.reply(translate(inherited, 'language.changed.inherit', { language: localeName(inherited, inherited) }))
    return
  }
  const locale = parseLocale(rawLocale)
  if (!locale) throw new Error(ctx.t('language.error.invalid'))
  community.setGroupLanguage(ctx.chatId, locale)
  await ctx.reply(translate(locale, 'language.changed.group', { language: localeName(locale, locale) }))
}

async function setUser(ctx: CommandContext, rawLocale?: string) {
  const platform = platformContext(ctx)
  if (isInherit(rawLocale)) {
    clearPlatformLocale(platform, 'user', ctx.sender)
    const inherited = resolvePlatformLocale({ ...platform, chatId: ctx.chatId, userId: ctx.sender })
    await ctx.reply(translate(inherited, 'language.changed.userInherit'))
    return
  }
  const locale = parseLocale(rawLocale)
  if (!locale) throw new Error(ctx.t('language.error.invalid'))
  setPlatformLocale(platform, 'user', ctx.sender, locale)
  await ctx.reply(translate(locale, 'language.changed.user', { language: localeName(locale, locale) }))
}

async function setBot(ctx: CommandContext, rawLocale?: string) {
  if (!canManageGlobal(ctx)) throw new Error(ctx.t('language.error.botPermission'))
  const platform = platformContext(ctx)
  if (isInherit(rawLocale)) {
    clearPlatformLocale(platform, 'bot', 'self')
    const inherited = ctx.settings.language
    await ctx.reply(translate(inherited, 'language.changed.botInherit'))
    return
  }
  const locale = parseLocale(rawLocale)
  if (!locale) throw new Error(ctx.t('language.error.invalid'))
  setPlatformLocale(platform, 'bot', 'self', locale)
  await ctx.reply(translate(locale, 'language.changed.bot', { language: localeName(locale, locale) }))
}

async function languageCommand(ctx: CommandContext) {
  const action = (ctx.args[0] ?? '').trim().toLowerCase()
  if (!action || ['status', 'estado', 'current', 'actual'].includes(action)) {
    await status(ctx)
    return
  }

  if (['global', 'instance', 'instancia'].includes(action)) {
    await setGlobal(ctx, ctx.args[1])
    return
  }

  if (['bot', 'platform', 'plataforma'].includes(action)) {
    await setBot(ctx, ctx.args[1])
    return
  }

  if (['user', 'usuario', 'me', 'personal'].includes(action)) {
    await setUser(ctx, ctx.args[1])
    return
  }

  if (['group', 'grupo', 'chat'].includes(action)) {
    await setGroup(ctx, ctx.args[1])
    return
  }

  if (ctx.isGroup && isInherit(action)) {
    await setGroup(ctx, action)
    return
  }

  const shorthandLocale = parseLocale(action)
  if (shorthandLocale) {
    if (ctx.isGroup) await setGroup(ctx, shorthandLocale)
    else await setUser(ctx, shorthandLocale)
    return
  }

  if (!ctx.isGroup && isInherit(action)) {
    await setUser(ctx, action)
    return
  }

  throw new Error(ctx.t('language.usage.phase6', { command: `${ctx.prefix}language` }))
}

export const languageCommands: BotCommand[] = [
  {
    name: 'language',
    aliases: ['lang', 'idioma'],
    category: 'general',
    description: 'Configura idioma personal, de grupo, plataforma o global.',
    usage: 'language [es|en|inherit|user <...>|group <...>|bot <...>|global <es|en>]',
    subbotOwnerAllowed: true,
    handler: languageCommand,
  },
]
