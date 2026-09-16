import {
  supportsCapabilities,
  type CapabilityName,
  type PlatformCapabilities,
  type PlatformId,
} from '@ghostnexora/platform-contracts'

export type CommandScope = 'shared' | 'capability-gated' | 'platform-specific' | 'runtime-only'

export interface PermissionSnapshot {
  isOwner: boolean
  isStaff: boolean
  isGroup: boolean
  isGroupAdmin: boolean
  isBotGroupAdmin: boolean
  isInstanceOwner: boolean
}

export interface CommandDescriptorLike {
  name: string
  aliases?: readonly string[]
  category: string
  description: string
  usage?: string
  ownerOnly?: boolean
  staffOnly?: boolean
  groupOnly?: boolean
  adminOnly?: boolean
  botAdminOnly?: boolean
  subbotOwnerAllowed?: boolean
}

export interface CoreCommandDescriptor extends CommandDescriptorLike {
  scope?: CommandScope
  platforms?: readonly PlatformId[]
  requiresCapabilities?: readonly CapabilityName[]
}

export interface CommandInventoryRow {
  name: string
  aliases: string[]
  category: string
  description: string
  usage?: string
  access: {
    ownerOnly: boolean
    staffOnly: boolean
    groupOnly: boolean
    adminOnly: boolean
    botAdminOnly: boolean
    subbotOwnerAllowed: boolean
  }
}

export function createCommandInventory(commands: readonly CommandDescriptorLike[]): CommandInventoryRow[] {
  return commands
    .map((command) => ({
      name: command.name.trim().toLowerCase(),
      aliases: [...new Set((command.aliases ?? []).map((alias) => alias.trim().toLowerCase()).filter(Boolean))].sort(),
      category: command.category,
      description: command.description,
      ...(command.usage ? { usage: command.usage } : {}),
      access: {
        ownerOnly: command.ownerOnly === true,
        staffOnly: command.staffOnly === true,
        groupOnly: command.groupOnly === true,
        adminOnly: command.adminOnly === true,
        botAdminOnly: command.botAdminOnly === true,
        subbotOwnerAllowed: command.subbotOwnerAllowed === true,
      },
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function findCommandCollisions(commands: readonly CommandDescriptorLike[]): string[] {
  const owners = new Map<string, string>()
  const collisions = new Set<string>()
  for (const command of commands) {
    const canonical = command.name.trim().toLowerCase()
    for (const token of [canonical, ...(command.aliases ?? []).map((alias) => alias.trim().toLowerCase())].filter(Boolean)) {
      const previous = owners.get(token)
      if (previous && previous !== canonical) collisions.add(`${token}:${previous}:${canonical}`)
      else owners.set(token, canonical)
    }
  }
  return [...collisions].sort()
}

export function isCommandAvailable(
  command: CoreCommandDescriptor,
  platform: PlatformId,
  capabilities: Readonly<PlatformCapabilities>,
): boolean {
  if (command.scope === 'runtime-only') return false
  if (command.platforms?.length && !command.platforms.includes(platform)) return false
  return supportsCapabilities(capabilities, command.requiresCapabilities ?? [])
}
