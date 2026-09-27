// A command starts navigation immediately; only a host-verified completion resolves as connected.
import type { WorkspaceConnectorConnectRequest, WorkspaceConnectorConnectResult } from '@xpert-ai/chatkit-types'
import type { HostMethods } from './types'

type ConnectionTarget = HostMethods['pluginConnection']['output']['target']
export type ConnectionProgress = 'opening' | 'waiting' | 'retrying' | null

type Dependencies = {
  assistantId: string
  start: (request: WorkspaceConnectorConnectRequest) => Promise<HostMethods['startPluginConnection']['output']>
  check: (attemptId: string) => Promise<HostMethods['checkPluginConnection']['output']>
  cancel: (attemptId: string) => Promise<unknown>
  open: (target: ConnectionTarget) => Promise<void>
  onProgress: (progress: ConnectionProgress) => void
  isFatal: (error: unknown) => boolean
  invalidRequest: () => Error
}

type PendingConnection = {
  request: WorkspaceConnectorConnectRequest
  promise: Promise<WorkspaceConnectorConnectResult>
  resolve: (result: WorkspaceConnectorConnectResult) => void
  reject: (error: unknown) => void
  attemptId?: string
  timer?: ReturnType<typeof setTimeout>
  checking: boolean
}

export function createWorkspaceConnectionFlow(deps: Dependencies) {
  let active: PendingConnection | undefined
  const release = (pending: PendingConnection) => {
    if (pending.timer) clearTimeout(pending.timer)
    if (pending.attemptId) void deps.cancel(pending.attemptId).catch(() => {})
  }
  const finish = (pending: PendingConnection, error?: unknown) => {
    if (active !== pending) return
    active = undefined
    release(pending)
    deps.onProgress(null)
    if (error) pending.reject(error)
    else pending.resolve({ status: 'connected' })
  }
  const check = async () => {
    const pending = active
    if (!pending?.attemptId || pending.checking) return
    pending.checking = true
    if (pending.timer) clearTimeout(pending.timer)
    try {
      const result = await deps.check(pending.attemptId)
      if (active !== pending) return
      if (result.status === 'connected') {
        pending.attemptId = undefined
        finish(pending)
        return
      }
      deps.onProgress('waiting')
    } catch (error) {
      if (active !== pending) return
      if (deps.isFatal(error)) {
        finish(pending, error)
        return
      }
      deps.onProgress('retrying')
    } finally {
      pending.checking = false
    }
    if (active === pending) pending.timer = setTimeout(() => void check(), 2500)
  }
  const start = async (pending: PendingConnection) => {
    try {
      const result = await deps.start(pending.request)
      if (active !== pending) {
        if (result.status === 'pending') void deps.cancel(result.attemptId).catch(() => {})
        return
      }
      if (result.status === 'connected') {
        finish(pending)
        return
      }
      pending.attemptId = result.attemptId
      await deps.open(result.target)
      if (active !== pending) return
      deps.onProgress('waiting')
      void check()
    } catch (error) {
      finish(pending, error)
    }
  }
  return {
    connect(request: WorkspaceConnectorConnectRequest): Promise<WorkspaceConnectorConnectResult> {
      if (request.assistantId !== deps.assistantId) return Promise.reject(deps.invalidRequest())
      if (active) {
        return active.request.bindingId === request.bindingId ? active.promise : Promise.reject(deps.invalidRequest())
      }
      let resolve!: PendingConnection['resolve']
      let reject!: PendingConnection['reject']
      const promise = new Promise<WorkspaceConnectorConnectResult>((done, fail) => {
        resolve = done
        reject = fail
      })
      const pending: PendingConnection = { request, promise, resolve, reject, checking: false }
      active = pending
      deps.onProgress('opening')
      void start(pending)
      return promise
    },
    check,
    cancel() {
      const pending = active
      if (!pending) return
      active = undefined
      release(pending)
      deps.onProgress(null)
      pending.resolve({ status: 'cancelled' })
    }
  }
}
