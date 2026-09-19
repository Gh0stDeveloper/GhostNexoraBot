import type { CommandAuditIdentity } from '../services/performance-audit.js'
import { performanceAudit } from '../services/performance-audit.js'
import { commandRuntimeDecision, markCommandCooldown } from '../services/command-runtime-config.js'
import type { BotCommand, CommandContext } from '../types.js'

export type CommandEngineCommand<C extends CommandContext = CommandContext> =
  Omit<BotCommand, 'handler'> & { handler: (ctx: C) => Promise<unknown> }

export type CommandEngineAuthorization<C extends CommandContext> = (
  command: CommandEngineCommand<C>,
  ctx: C,
) => Promise<string | null | undefined> | string | null | undefined

export type CommandEngineExecuteOptions<C extends CommandContext> = {
  authorize?: CommandEngineAuthorization<C>
  auditIdentity?: CommandAuditIdentity
  instanceKey?: string
}

export type CommandEngineResult<C extends CommandContext> =
  | { matched: false }
  | { matched: true; command: CommandEngineCommand<C>; allowed: false }
  | { matched: true; command: CommandEngineCommand<C>; allowed: true }

function runtimePolicyMessage(ctx: CommandContext, reason: string, category: string, remainingMs?: number) {
  if (reason === 'disabled') return ctx.t('router.commandDisabled')
  if (reason === 'category_disabled') return ctx.t('router.commandCategoryDisabled', { category })
  if (reason === 'platform_disabled') return ctx.t('router.commandPlatformDisabled', { platform: ctx.platform })
  if (reason === 'groups_disabled') return ctx.t('router.commandGroupsDisabled')
  if (reason === 'private_disabled') return ctx.t('router.commandPrivateDisabled')
  if (reason === 'permission') return ctx.t('router.commandPermission')
  return ctx.t('router.commandCooldown', { seconds: Math.max(1, Math.ceil(Number(remainingMs ?? 0) / 1000)) })
}

async function deny(ctx: CommandContext, message: string) {
  await ctx.reply(message)
  await ctx.react('🚫').catch(() => undefined)
}

export class CommandEngine<C extends CommandContext> {
  private readonly byName = new Map<string, CommandEngineCommand<C>>()

  constructor(commands: readonly CommandEngineCommand<C>[]) {
    for (const command of commands) {
      this.byName.set(command.name.toLowerCase(), command)
      for (const alias of command.aliases ?? []) this.byName.set(alias.toLowerCase(), command)
    }
  }

  resolve(token: string) {
    return this.byName.get(token.trim().toLowerCase())
  }

  has(token: string) {
    return this.byName.has(token.trim().toLowerCase())
  }

  async execute(
    command: CommandEngineCommand<C>,
    ctx: C,
    options: CommandEngineExecuteOptions<C> = {},
  ): Promise<CommandEngineResult<C>> {
    if (command.ownerOnly && !ctx.isOwner) {
      await deny(ctx, ctx.t('router.ownerOnly'))
      return { matched: true, command, allowed: false }
    }

    if (command.staffOnly && !ctx.isBotStaff && !(command.subbotOwnerAllowed && ctx.isSubbotOwner)) {
      await deny(ctx, ctx.t('router.staffOnly'))
      return { matched: true, command, allowed: false }
    }

    if (command.groupOnly && !ctx.isGroup) {
      await deny(ctx, ctx.t('router.groupOnly'))
      return { matched: true, command, allowed: false }
    }

    if (command.adminOnly || command.botAdminOnly) {
      if (!ctx.isGroup) {
        await deny(ctx, ctx.t('router.groupRequired'))
        return { matched: true, command, allowed: false }
      }

      const senderIsAdmin = Boolean(ctx.isOwner || ctx.isBotStaff || ctx.isSubbotOwner || ctx.isGroupAdmin)
      if (command.adminOnly && !senderIsAdmin) {
        await deny(ctx, ctx.t('router.adminOnly'))
        return { matched: true, command, allowed: false }
      }

      if (command.botAdminOnly && !ctx.isBotGroupAdmin) {
        await deny(ctx, ctx.t('router.botAdminOnly'))
        return { matched: true, command, allowed: false }
      }
    }

    const runtimeDecision = commandRuntimeDecision({
      commandName: command.name,
      category: command.category,
      platform: ctx.platform,
      isGroup: ctx.isGroup,
      userId: ctx.sender,
      isOwner: ctx.isOwner,
      isStaff: ctx.isBotStaff,
      isSubbotOwner: ctx.isSubbotOwner,
      instanceKey: options.instanceKey,
    })

    if (!runtimeDecision.allowed) {
      await deny(ctx, runtimePolicyMessage(
        ctx,
        runtimeDecision.reason,
        command.category,
        runtimeDecision.remainingMs,
      ))
      return { matched: true, command, allowed: false }
    }

    const authorizationError = await options.authorize?.(command, ctx)
    if (authorizationError) {
      await deny(ctx, authorizationError)
      return { matched: true, command, allowed: false }
    }

    if (!ctx.isOwner && !ctx.isBotStaff && !ctx.isSubbotOwner && runtimeDecision.config.cooldownMs > 0) {
      markCommandCooldown(ctx.platform, command.name, ctx.sender, options.instanceKey)
    }

    const started = performance.now()
    const heapBefore = process.memoryUsage().heapUsed
    try {
      await command.handler(ctx)
      const durationMs = performance.now() - started
      performanceAudit.recordStage('06', durationMs, options.instanceKey)
      performanceAudit.recordCommand(
        command,
        durationMs,
        true,
        process.memoryUsage().heapUsed - heapBefore,
        options.instanceKey,
        options.auditIdentity,
        ctx.platform,
      )
      return { matched: true, command, allowed: true }
    } catch (error) {
      const durationMs = performance.now() - started
      performanceAudit.recordStage('06', durationMs, options.instanceKey)
      performanceAudit.recordCommand(
        command,
        durationMs,
        false,
        process.memoryUsage().heapUsed - heapBefore,
        options.instanceKey,
        options.auditIdentity,
        ctx.platform,
      )
      throw error
    }
  }
}
