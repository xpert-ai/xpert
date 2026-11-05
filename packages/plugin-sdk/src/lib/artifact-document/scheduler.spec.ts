import { createArtifactQueryScheduler } from './scheduler'

const input = (id: number, value = 0) => ({ bindingId: `binding${id}`, controls: { filter: value } })
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}
describe('Artifact query scheduler', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())
  it.each([8, 9, 16, 32, 64])(
    'queues %i bindings, dispatches 60 per rolling minute and never exceeds four executions',
    async (count) => {
      let active = 0,
        maximum = 0,
        calls = 0
      const queue = createArtifactQueryScheduler({
        execute: async () => {
          calls++
          maximum = Math.max(maximum, ++active)
          await new Promise((resolve) => setTimeout(resolve, 100))
          active--
          return calls
        }
      })
      const tasks = Array.from({ length: count }, (_, i) => queue.query(input(i), 'initial'))
      await jest.advanceTimersByTimeAsync(2000)
      expect(calls).toBe(Math.min(60, count))
      expect(maximum).toBe(4)
      await jest.advanceTimersByTimeAsync(60000)
      expect(await Promise.all(tasks)).toHaveLength(count)
      expect(queue.busy).toBe(false)
      queue.dispose()
    }
  )
  it('reuses identical requests, supersedes queued controls and prioritizes interactive requests', async () => {
    const releases: Array<() => void> = [],
      calls: number[] = []
    const queue = createArtifactQueryScheduler({
      concurrency: 1,
      execute: async (value) => {
        calls.push(Number(value.bindingId.slice(7)))
        await new Promise<void>((resolve) => releases.push(resolve))
        return value.controls.filter
      }
    })
    const first = queue.query(input(0)),
      same = queue.query(input(0))
    expect(same).toBe(first)
    const background = queue.query(input(1), 'refresh')
    const old = queue.query(input(2, 1)).catch((error) => error.code)
    const recent = queue.query(input(2, 2))
    expect(await old).toBe('DOCUMENT_QUERY_SUPERSEDED')
    await flush()
    releases.shift()!()
    await flush()
    expect(calls).toEqual([0, 2])
    releases.shift()!()
    await flush()
    releases.shift()!()
    expect(await Promise.all([first, same, recent, background])).toEqual([0, 0, 2, 0])
    queue.dispose()
  })
  it('keeps timed-out backend work in its slot, distinguishes queue timeout, and disposes pending work', async () => {
    const signals: AbortSignal[] = []
    const queue = createArtifactQueryScheduler({
      concurrency: 1,
      execute: async (_input, signal) => {
        signals.push(signal)
        return new Promise(() => {})
      }
    })
    const running = queue.query(input(0)).catch((error) => error.code)
    const queued = queue.query(input(1)).catch((error) => error.code)
    await jest.advanceTimersByTimeAsync(45000)
    expect(await running).toBe('DOCUMENT_QUERY_TIMEOUT')
    expect(signals).toHaveLength(1)
    expect(signals[0].aborted).toBe(true)
    await jest.advanceTimersByTimeAsync(135000)
    expect(await queued).toBe('DOCUMENT_QUEUE_TIMEOUT')
    const disposed = queue.query(input(2)).catch((error) => error.code)
    queue.dispose()
    expect(await disposed).toBe('DOCUMENT_DISPOSED')
    expect(signals).toHaveLength(1)
    expect(jest.getTimerCount()).toBe(0)
  })
  it('caps trusted concurrency at eight and recovers after failures', async () => {
    let active = 0,
      maximum = 0
    const queue = createArtifactQueryScheduler({
      concurrency: 100,
      execute: async (value) => {
        maximum = Math.max(maximum, ++active)
        await new Promise((resolve) => setTimeout(resolve, 100))
        active--
        if (value.bindingId === 'binding0') throw new Error('private details')
        return value.bindingId
      }
    })
    const tasks = Array.from({ length: 16 }, (_, id) => queue.query(input(id)).catch((error) => error.code))
    await jest.advanceTimersByTimeAsync(1000)
    const result = await Promise.all(tasks)
    expect(maximum).toBe(8)
    expect(result[0]).toBe('DOCUMENT_QUERY_FAILED')
    expect(result[15]).toBe('binding15')
    queue.dispose()
  })
})
