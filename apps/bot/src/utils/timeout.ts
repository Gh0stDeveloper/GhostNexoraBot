export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`⏱️ Timeout (${label}, ${ms}ms)`)), ms),
    ),
  ])
}
