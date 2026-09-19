import type { BotCommand, CommandContext } from '../types.js'
import { effectiveCommands } from '../services/menu-registry.js'
import { isGroupCommandCategoryAllowed } from '../services/group-command-policy.js'
import { isGroupAdministrator } from '../utils/target.js'

type SearchHit = {
  command: BotCommand
  tokens: string[]
  score: number
}

function normalize(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function permissions(command: BotCommand) {
  const rows: string[] = []
  if (command.ownerOnly) rows.push('owner')
  if (command.staffOnly) rows.push('staff')
  if (command.groupOnly) rows.push('solo grupos')
  if (command.adminOnly) rows.push('admin')
  if (command.botAdminOnly) rows.push('bot admin')
  if (command.subbotOwnerAllowed) rows.push('owner de subbot')
  return rows.length ? rows.join(', ') : 'todos'
}

function scoreCommand(command: BotCommand, tokens: string[], query: string) {
  const name = normalize(command.name)
  const aliases = (command.aliases ?? []).map(normalize)
  const category = normalize(command.category)
  const description = normalize(command.description)
  const usage = normalize(command.usage ?? '')
  const normalizedTokens = tokens.map(normalize)

  if (name === query) return 1000
  if (aliases.includes(query)) return 950
  if (normalizedTokens.includes(query)) return 925
  if (name.startsWith(query)) return 800
  if (aliases.some((alias) => alias.startsWith(query))) return 760
  if (normalizedTokens.some((token) => token.startsWith(query))) return 740
  if (name.includes(query)) return 650
  if (aliases.some((alias) => alias.includes(query))) return 620
  if (category === query) return 580
  if (description.includes(query)) return 420
  if (usage.includes(query)) return 380
  if (category.includes(query)) return 340
  return 0
}

function visibleTo(ctx: CommandContext, command: BotCommand, groupAdmin: boolean) {
  if (command.ownerOnly && !ctx.isOwner) return false
  if (command.staffOnly && !ctx.isBotStaff && !(command.subbotOwnerAllowed && ctx.isSubbotOwner) && !ctx.isOwner) return false
  if (ctx.isGroup && !ctx.isOwner && !ctx.isBotStaff && !ctx.isSubbotOwner && !groupAdmin) {
    if (!isGroupCommandCategoryAllowed(ctx.chatId, command.category)) return false
  }
  return true
}

function searchCommands(query: string): SearchHit[] {
  return effectiveCommands()
    .map(({ command, tokens }) => ({ command, tokens, score: scoreCommand(command, tokens, query) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.command.name.localeCompare(b.command.name))
    .slice(0, 12)
}

export const commandSearchCommands: BotCommand[] = [
  {
    name: 'buscarcomando',
    aliases: ['buscarcmd', 'findcmd', 'comandobuscar'],
    category: 'tools',
    description: 'Busca comandos activos por nombre, alias, categoría, descripción o uso.',
    usage: '.buscarcomando <texto>',
    async handler(ctx) {
      const query = normalize(ctx.argText)
      if (!query) {
        await ctx.reply([
          '*BUSCADOR DE COMANDOS*',
          '',
          `Uso: ${ctx.prefix}buscarcomando <texto>`,
          '',
          `Ejemplos:`,
          `${ctx.prefix}buscarcomando instagram`,
          `${ctx.prefix}buscarcomando admin`,
          `${ctx.prefix}buscarcomando descargas`,
        ].join('\n'))
        return
      }

      const groupAdmin = ctx.isGroup ? await isGroupAdministrator(ctx).catch(() => false) : false
      const hits = searchCommands(query).filter((hit) => visibleTo(ctx, hit.command, groupAdmin))
      if (!hits.length) {
        await ctx.reply(`No encontré comandos activos relacionados con *${ctx.argText.trim()}*.`)
        return
      }

      const lines = [
        '*BUSCADOR DE COMANDOS*',
        `Consulta: *${ctx.argText.trim()}*`,
        `Resultados: *${hits.length}*`,
        '',
      ]

      for (const [index, hit] of hits.entries()) {
        const aliases = (hit.command.aliases ?? []).filter((alias) => normalize(alias) !== normalize(hit.command.name))
        lines.push(
          `*${index + 1}. ${ctx.prefix}${hit.command.name}*`,
          `Categoría: ${hit.command.category}`,
          `Descripción: ${hit.command.description}`,
          `Uso: ${hit.command.usage || `${ctx.prefix}${hit.command.name}`}`,
          `Permisos: ${permissions(hit.command)}`,
          ...(aliases.length ? [`Alias: ${aliases.map((alias) => `${ctx.prefix}${alias}`).join(', ')}`] : []),
          '',
        )
      }

      await ctx.reply(lines.join('\n').trim())
    },
  },
]
