import { AsyncLocalStorage } from 'node:async_hooks'

export type TracePlatform = 'whatsapp' | 'discord' | 'telegram'

export type TraceContext = Readonly<{
  correlationId: string
  platform?: TracePlatform
  botInstanceId?: string
  command?: string
  provider?: string
}>

const traceStorage = new AsyncLocalStorage<TraceContext>()

function clean(value: unknown, max = 120) {
  return String(value ?? '').replace(/[^a-zA-Z0-9_.:@/-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max)
}

export function normalizeTraceContext(input: TraceContext): TraceContext {
  const correlationId = clean(input.correlationId, 180)
  if (!correlationId) throw new Error('trace_correlation_id_required')
  return Object.freeze({
    correlationId,
    ...(input.platform ? { platform: input.platform } : {}),
    ...(input.botInstanceId ? { botInstanceId: clean(input.botInstanceId, 120) } : {}),
    ...(input.command ? { command: clean(input.command, 120) } : {}),
    ...(input.provider ? { provider: clean(input.provider, 120) } : {}),
  })
}

export function currentTraceContext() {
  return traceStorage.getStore()
}

export function currentCorrelationId() {
  return traceStorage.getStore()?.correlationId
}

export function withTraceContext<T>(context: TraceContext, task: () => T): T {
  return traceStorage.run(normalizeTraceContext(context), task)
}

export function withTraceFields<T>(fields: Partial<Omit<TraceContext, 'correlationId'>>, task: () => T): T {
  const current = traceStorage.getStore()
  if (!current) return task()
  return traceStorage.run(normalizeTraceContext({ ...current, ...fields }), task)
}
