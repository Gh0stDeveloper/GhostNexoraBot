import { randomUUID } from 'node:crypto'
import type { PlatformId } from '@ghostnexora/platform-contracts'
import type { LocaleCode } from '../i18n/types.js'
import type {
  RequestContext,
  RequestPermissionSnapshot,
} from '../types.js'

export type CreateRequestContextInput = {
  platform: PlatformId
  botInstanceId: string
  instanceId?: number
  chatId: string
  userId: string
  locale: LocaleCode
  messageId: string
  correlationId?: string
  permissions: RequestPermissionSnapshot
}

function required(value: string, field: string) {
  const normalized = value.trim()
  if (!normalized) throw new TypeError(`RequestContext ${field} must not be empty.`)
  return normalized
}

function correlationId(value?: string) {
  const normalized = value?.trim()
  if (!normalized) return randomUUID()
  if (normalized.length > 160) throw new TypeError('RequestContext correlationId is too long.')
  return normalized
}

export function createRequestContext(input: CreateRequestContextInput): RequestContext {
  const permissions: RequestPermissionSnapshot = Object.freeze({
    isOwner: input.permissions.isOwner === true,
    isStaff: input.permissions.isStaff === true,
    isGroup: input.permissions.isGroup === true,
    isGroupAdmin: input.permissions.isGroupAdmin === true,
    isBotGroupAdmin: input.permissions.isBotGroupAdmin === true,
    isInstanceOwner: input.permissions.isInstanceOwner === true,
  })

  return Object.freeze({
    platform: input.platform,
    botInstanceId: required(input.botInstanceId, 'botInstanceId'),
    ...(input.instanceId !== undefined ? { instanceId: input.instanceId } : {}),
    chatId: required(input.chatId, 'chatId'),
    userId: required(input.userId, 'userId'),
    locale: input.locale,
    messageId: required(input.messageId, 'messageId'),
    correlationId: correlationId(input.correlationId),
    permissions,
  })
}

export function assertRequestContextBinding(
  request: RequestContext,
  input: {
    platform: PlatformId
    botInstanceId: string
    chatId: string
    userId: string
    messageId: string
  },
) {
  const mismatches: string[] = []
  if (request.platform !== input.platform) mismatches.push('platform')
  if (request.botInstanceId !== input.botInstanceId) mismatches.push('botInstanceId')
  if (request.chatId !== input.chatId) mismatches.push('chatId')
  if (request.userId !== input.userId) mismatches.push('userId')
  if (request.messageId !== input.messageId) mismatches.push('messageId')
  if (mismatches.length) {
    throw new Error(`RequestContext binding mismatch: ${mismatches.join(', ')}`)
  }
}
