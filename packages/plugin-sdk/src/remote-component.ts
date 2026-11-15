/** Workbench iframe transport. Each frame owns one connection to its parent. */
import { viewContextEventSchema } from '@xpert-ai/contracts/context-event'
import { z } from 'zod/v3'

const channel = 'xpertai.remote_component'
const envelope = z.object({
  channel: z.literal(channel),
  protocolVersion: z.literal(1),
  type: z.string(),
  instanceId: z.string().min(1),
  scopeRevision: z.number().int().nonnegative().optional(),
  event: z.unknown().optional(),
  requestId: z.string().optional(),
  data: z.unknown().optional(),
  result: z.unknown().optional(),
  message: z.string().optional(),
  locale: z.string().optional(),
  theme: z
    .object({
      mode: z.string().optional(),
      density: z.enum(['default', 'compact']).optional(),
      tokens: z.record(z.union([z.string(), z.number()])).optional()
    })
    .optional()
})

export interface RemoteComponentInit {
  locale: string
  theme?: { mode?: string; density?: 'default' | 'compact'; tokens?: Record<string, string | number> }
}

type Scope = { instanceId: string; revision?: number }
let scope: Scope | undefined
let disconnect: (() => void) | undefined
const pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: number }>()

function invalidate(message: string) {
  for (const call of pending.values()) {
    window.clearTimeout(call.timer)
    call.reject(new Error(message))
  }
  pending.clear()
}

/** Subscribe before rendering. The returned cleanup releases the listener and all outstanding requests. */
export function connect(init: (context: RemoteComponentInit, changed: boolean) => void, contextChanged: () => void) {
  disconnect?.()
  const receive = (event: MessageEvent<unknown>) => {
    if (event.source !== window.parent) return
    const parsed = envelope.safeParse(event.data)
    if (!parsed.success) return
    const message = parsed.data
    if (message.type === 'init') {
      if (scope?.instanceId === message.instanceId && (message.scopeRevision ?? -1) < (scope.revision ?? -1)) return
      const changed = scope?.instanceId !== message.instanceId || scope?.revision !== message.scopeRevision
      if (changed) {
        invalidate('View context changed')
        scope = { instanceId: message.instanceId, revision: message.scopeRevision }
      }
      init({ locale: message.locale ?? 'en-US', theme: message.theme }, changed)
      return
    }
    if (!scope || message.instanceId !== scope.instanceId) return
    if (message.type === 'hostEvent') {
      const context = viewContextEventSchema.safeParse(message.event)
      if (context.success && context.data.data.revision > (scope.revision ?? -1)) {
        invalidate('View context changed')
        scope = { instanceId: scope.instanceId, revision: context.data.data.revision }
        contextChanged()
      }
      return
    }
    if (!message.requestId || (message.scopeRevision !== undefined && message.scopeRevision !== scope.revision)) return
    const call = pending.get(message.requestId)
    if (!call) return
    pending.delete(message.requestId)
    window.clearTimeout(call.timer)
    if (message.type === 'error') call.reject(new Error(message.message ?? 'Request failed'))
    else call.resolve('data' in message ? message.data : message.result)
  }
  window.addEventListener('message', receive)
  window.parent.postMessage({ channel, protocolVersion: 1, type: 'ready' }, '*')
  const close = () => {
    if (disconnect !== close) return
    disconnect = undefined
    window.removeEventListener('message', receive)
    scope = undefined
    invalidate('View closed')
  }
  disconnect = close
  return close
}

export function request(type: string, body: object = {}): Promise<unknown> {
  if (!scope) return Promise.reject(new Error('View is not connected'))
  const { instanceId, revision } = scope
  const requestId = crypto.randomUUID()
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      pending.delete(requestId)
      reject(new Error('Request timed out'))
    }, 30000)
    pending.set(requestId, { resolve, reject, timer })
    try {
      window.parent.postMessage(
        { ...body, channel, protocolVersion: 1, instanceId, scopeRevision: revision, type, requestId },
        '*'
      )
    } catch (error) {
      window.clearTimeout(timer)
      pending.delete(requestId)
      reject(error)
    }
  })
}

/** Bind a request before asynchronous preparation, so a context switch cannot redirect it. */
export function scopedRequest(): typeof request {
  const captured = scope
  return (type, body) =>
    captured && captured === scope ? request(type, body) : Promise.reject(new Error('View context changed'))
}
