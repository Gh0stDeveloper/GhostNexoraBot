export type ExecutionLane = 'default' | 'downloads' | 'ai' | 'subbots'

export type ExecutionQueueLimits = {
  global: number
  perGroup: number
  perUser: number
  downloads: number
  ai: number
  subbots: number
}

export const DEFAULT_EXECUTION_QUEUE_LIMITS: Readonly<ExecutionQueueLimits> = Object.freeze({
  global: 20,
  perGroup: 3,
  perUser: 2,
  downloads: 4,
  ai: 3,
  subbots: 3,
})

class Semaphore {
  active = 0
  private readonly waiters: Array<{
    resolve: (release: () => void) => void
    reject: (error: Error) => void
    timer?: NodeJS.Timeout
  }> = []

  constructor(readonly limit: number) {
    if (!Number.isSafeInteger(limit) || limit < 1) throw new TypeError('Semaphore limit must be >= 1')
  }

  acquire(timeoutMs = 5 * 60_000): Promise<() => void> {
    if (this.active < this.limit) {
      this.active += 1
      return Promise.resolve(this.releaseFactory())
    }
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, timer: undefined as NodeJS.Timeout | undefined }
      if (timeoutMs > 0) {
        waiter.timer = setTimeout(() => {
          const index = this.waiters.indexOf(waiter)
          if (index >= 0) this.waiters.splice(index, 1)
          reject(new Error('execution_queue_timeout'))
        }, timeoutMs)
        waiter.timer.unref?.()
      }
      this.waiters.push(waiter)
    })
  }

  private releaseFactory() {
    let released = false
    return () => {
      if (released) return
      released = true
      const next = this.waiters.shift()
      if (next) {
        if (next.timer) clearTimeout(next.timer)
        next.resolve(this.releaseFactory())
        return
      }
      this.active = Math.max(0, this.active - 1)
    }
  }

  stats() {
    return { active: this.active, waiting: this.waiters.length, limit: this.limit }
  }
}

type KeyedEntry = {
  semaphore: Semaphore
  touchedAt: number
}

export class ExecutionQueueManager {
  private readonly global: Semaphore
  private readonly downloads: Semaphore
  private readonly ai: Semaphore
  private readonly subbots: Semaphore
  private readonly groups = new Map<string, KeyedEntry>()
  private readonly users = new Map<string, KeyedEntry>()

  constructor(readonly limits: ExecutionQueueLimits = { ...DEFAULT_EXECUTION_QUEUE_LIMITS }) {
    this.global = new Semaphore(limits.global)
    this.downloads = new Semaphore(limits.downloads)
    this.ai = new Semaphore(limits.ai)
    this.subbots = new Semaphore(limits.subbots)
  }

  private keyed(map: Map<string, KeyedEntry>, id: string, limit: number) {
    let row = map.get(id)
    if (!row) {
      row = { semaphore: new Semaphore(limit), touchedAt: Date.now() }
      map.set(id, row)
    }
    row.touchedAt = Date.now()
    return row.semaphore
  }

  private laneSemaphore(lane: ExecutionLane) {
    if (lane === 'downloads') return this.downloads
    if (lane === 'ai') return this.ai
    if (lane === 'subbots') return this.subbots
    return undefined
  }

  async run<T>(input: {
    chatId: string
    userId: string
    isGroup: boolean
    lane?: ExecutionLane
    timeoutMs?: number
  }, task: () => Promise<T>): Promise<T> {
    const semaphores: Semaphore[] = [this.global]
    if (input.isGroup) semaphores.push(this.keyed(this.groups, input.chatId, this.limits.perGroup))
    semaphores.push(this.keyed(this.users, input.userId, this.limits.perUser))
    const lane = this.laneSemaphore(input.lane ?? 'default')
    if (lane) semaphores.push(lane)

    const releases: Array<() => void> = []
    try {
      for (const semaphore of semaphores) releases.push(await semaphore.acquire(input.timeoutMs))
      return await task()
    } finally {
      for (const release of releases.reverse()) release()
      this.prune()
    }
  }

  prune(now = Date.now()) {
    const cutoff = now - 10 * 60_000
    for (const [id, row] of this.groups) {
      const stats = row.semaphore.stats()
      if (row.touchedAt < cutoff && stats.active === 0 && stats.waiting === 0) this.groups.delete(id)
    }
    for (const [id, row] of this.users) {
      const stats = row.semaphore.stats()
      if (row.touchedAt < cutoff && stats.active === 0 && stats.waiting === 0) this.users.delete(id)
    }
  }

  snapshot() {
    return {
      global: this.global.stats(),
      downloads: this.downloads.stats(),
      ai: this.ai.stats(),
      subbots: this.subbots.stats(),
      groups: this.groups.size,
      users: this.users.size,
    }
  }
}

export const executionQueues = new ExecutionQueueManager()

export function executionLaneForCommand(command: { name: string; category: string }): ExecutionLane {
  if (command.category === 'downloads') return 'downloads'
  if (command.category === 'subbots') return 'subbots'
  if (/^(?:ai|gpt|llm|minillm|localai|ollama|openrouter|chatgpt)/i.test(command.name)) return 'ai'
  return 'default'
}
