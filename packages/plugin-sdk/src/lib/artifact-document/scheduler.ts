import type { ArtifactDocumentControls } from './protocol'

export type ArtifactQueryPriority = 'interactive' | 'initial' | 'refresh'
export interface ArtifactQueryInput {
  bindingId: string
  controls: ArtifactDocumentControls
}
export interface ArtifactQueryState {
  bindingId: string
  controls: ArtifactDocumentControls
  state: 'queued' | 'running' | 'succeeded' | 'failed' | 'superseded'
  queuedAt: number
  startedAt?: number
  finishedAt?: number
  code?: string
}
export interface ArtifactQuerySchedulerOptions<T> {
  execute(input: ArtifactQueryInput, signal: AbortSignal): Promise<T>
  concurrency?: number
  /** Trusted executor budget. Live integrations should retain 60; bounded snapshot replay may use up to 1024. */
  dispatchesPerMinute?: number
  onState?(state: ArtifactQueryState): void
  onBusy?(busy: boolean): void
}
type Task<T> = {
  input: ArtifactQueryInput
  key: string
  priority: number
  controller: AbortController
  state: ArtifactQueryState
  promise: Promise<T>
  resolve(value: T): void
  reject(error: Error): void
  timer?: ReturnType<typeof setTimeout>
  settled: boolean
}
const failure = (code: string) => Object.assign(new Error(code), { code })
const keyOf = (input: ArtifactQueryInput) =>
  JSON.stringify([
    input.bindingId,
    Object.keys(input.controls)
      .sort()
      .map((key) => [key, input.controls[key]])
  ])
const priorities = { interactive: 0, initial: 1, refresh: 2 }
const QUEUE_TIMEOUT = 180_000,
  EXECUTION_TIMEOUT = 45_000,
  WINDOW = 60_000

/** One trusted Artifact/version/actor generation. Queue time never consumes execution time.
 * Slots remain occupied until the underlying execution settles, even after timeout/abort.
 * Callers must propagate the signal when supported; disposal alone cannot cancel database work. */
export function createArtifactQueryScheduler<T>(options: ArtifactQuerySchedulerOptions<T>) {
  const bounded = (value: number | undefined, fallback: number, max: number) =>
    Number.isFinite(value) ? Math.max(1, Math.min(max, Math.floor(value!))) : fallback
  const concurrency = bounded(options.concurrency, 4, 8)
  const dispatchLimit = bounded(options.dispatchesPerMinute, 60, 1024)
  const queued: Task<T>[] = [],
    running = new Set<Task<T>>(),
    latest = new Map<string, Task<T>>()
  const dispatches: number[] = []
  let disposed = false,
    wake: ReturnType<typeof setTimeout> | undefined
  const observe = <V>(fn: ((value: V) => void) | undefined, value: V) => {
    try {
      fn?.(value)
    } catch {
      /* observer only */
    }
  }
  const busy = () => observe(options.onBusy, !disposed && (queued.length > 0 || running.size > 0))
  const transition = (task: Task<T>, state: ArtifactQueryState['state'], code?: string) => {
    task.state = {
      ...task.state,
      state,
      ...(state === 'running' ? { startedAt: Date.now() } : state !== 'queued' ? { finishedAt: Date.now() } : {}),
      ...(code ? { code } : {})
    }
    observe(options.onState, { ...task.state })
  }
  const reject = (task: Task<T>, code: string) => {
    if (task.settled) return
    task.settled = true
    clearTimeout(task.timer)
    task.controller.abort()
    transition(task, code === 'DOCUMENT_QUERY_SUPERSEDED' ? 'superseded' : 'failed', code)
    task.reject(failure(code))
    if (latest.get(task.input.bindingId) === task) latest.delete(task.input.bindingId)
  }
  const pump = () => {
    clearTimeout(wake)
    if (disposed) return
    const now = Date.now()
    while (dispatches.length && dispatches[0] <= now - WINDOW) dispatches.shift()
    while (queued.length && running.size < concurrency && dispatches.length < dispatchLimit) {
      queued.sort((a, b) => a.priority - b.priority || a.state.queuedAt - b.state.queuedAt)
      const task = queued.shift()!
      clearTimeout(task.timer)
      running.add(task)
      dispatches.push(Date.now())
      transition(task, 'running')
      task.timer = setTimeout(() => reject(task, 'DOCUMENT_QUERY_TIMEOUT'), EXECUTION_TIMEOUT)
      Promise.resolve()
        .then(() => options.execute(task.input, task.controller.signal))
        .then(
          (result) => {
            if (disposed || task.settled) return
            task.settled = true
            transition(task, 'succeeded')
            task.resolve(result)
          },
          () => reject(task, 'DOCUMENT_QUERY_FAILED')
        )
        .finally(() => {
          clearTimeout(task.timer)
          running.delete(task)
          if (latest.get(task.input.bindingId) === task) latest.delete(task.input.bindingId)
          pump()
        })
    }
    if (queued.length && dispatches.length >= dispatchLimit)
      wake = setTimeout(pump, Math.max(1, dispatches[0] + WINDOW - Date.now()))
    busy()
  }
  return {
    query(input: ArtifactQueryInput, priority: ArtifactQueryPriority = 'interactive'): Promise<T> {
      if (disposed) return Promise.reject(failure('DOCUMENT_DISPOSED'))
      const key = keyOf(input),
        previous = latest.get(input.bindingId)
      if (previous?.key === key && !previous.settled) {
        previous.priority = Math.min(previous.priority, priorities[priority])
        return previous.promise
      }
      if (previous) {
        const index = queued.indexOf(previous)
        if (index >= 0) queued.splice(index, 1)
        reject(previous, 'DOCUMENT_QUERY_SUPERSEDED')
      }
      if (queued.length >= 64) return Promise.reject(failure('DOCUMENT_QUEUE_LIMIT'))
      let resolve!: (value: T) => void, rejectPromise!: (error: Error) => void
      const promise = new Promise<T>((yes, no) => {
        resolve = yes
        rejectPromise = no
      })
      const task: Task<T> = {
        input: { bindingId: input.bindingId, controls: { ...input.controls } },
        key,
        priority: priorities[priority],
        controller: new AbortController(),
        promise,
        resolve,
        reject: rejectPromise,
        state: { ...input, controls: { ...input.controls }, state: 'queued', queuedAt: Date.now() },
        settled: false
      }
      task.timer = setTimeout(() => {
        const index = queued.indexOf(task)
        if (index >= 0) queued.splice(index, 1)
        reject(task, 'DOCUMENT_QUEUE_TIMEOUT')
        pump()
      }, QUEUE_TIMEOUT)
      latest.set(input.bindingId, task)
      queued.push(task)
      transition(task, 'queued')
      pump()
      return promise
    },
    get busy() {
      return queued.length > 0 || running.size > 0
    },
    dispose() {
      if (disposed) return
      disposed = true
      clearTimeout(wake)
      for (const task of [...queued, ...running]) reject(task, 'DOCUMENT_DISPOSED')
      queued.length = 0
      latest.clear()
      busy()
    }
  }
}
