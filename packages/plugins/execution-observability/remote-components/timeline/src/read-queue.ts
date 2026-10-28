/** Per-mounted View queue: expanding a page never floods the host with parallel reads. */
export function createReadQueue(limit = 3) {
  let running = 0
  const waiting: Array<() => void> = []
  return async <T>(read: () => Promise<T>): Promise<T> => {
    if (running >= limit) await new Promise<void>((resolve) => waiting.push(resolve))
    else running++
    try {
      return await read()
    } finally {
      const next = waiting.shift()
      if (next) next()
      else running--
    }
  }
}
export type ReadQueue = ReturnType<typeof createReadQueue>
