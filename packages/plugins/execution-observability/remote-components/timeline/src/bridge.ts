import { z } from 'zod/v3'
import { installShadcnThemeVars } from '@xpert-ai/shadcn-ui'
import { executionObservationQuerySchema } from '@xpert-ai/contracts'

const querySchema = z.object({
  selectionId: z.string().optional(),
  page: z.number().optional(),
  pageSize: z.number().optional(),
  parameters: z
    .record(
      z.union([
        z.string(),
        z.number(),
        z.boolean(),
        z.null(),
        z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))
      ])
    )
    .optional()
})
const envelope = z.object({
  channel: z.literal('xpertai.remote_component'),
  protocolVersion: z.literal(1),
  type: z.string(),
  instanceId: z.string().nullish(),
  manifest: z.object({ key: z.string() }).optional(),
  payload: z.object({ synthetic: z.boolean().optional() }).passthrough().optional(),
  scopeRevision: z.number().int().nonnegative().optional(),
  requestId: z.string().optional(),
  data: z.unknown().optional(),
  result: z.unknown().optional(),
  message: z.string().optional(),
  initialQuery: querySchema.optional(),
  locale: z.string().optional(),
  theme: z
    .object({
      mode: z.string().optional(),
      density: z.enum(['compact', 'default']).optional(),
      tokens: z.record(z.union([z.string(), z.number()])).optional()
    })
    .optional(),
  debug: z.object({ enabled: z.boolean().optional() }).optional(),
  event: z
    .object({ type: z.string(), data: z.object({ revision: z.number() }).passthrough() })
    .passthrough()
    .optional()
})
type Init = {
  locale: string
  query: z.infer<typeof querySchema>
  revision: number
  viewKey: string
  synthetic: boolean
}
let instanceId: string | null = null,
  scopeRevision: number | undefined,
  debug = false
const pending = new Map<
  string,
  { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: number; revision: number | undefined }
>()
const send = (type: string, body: object = {}) =>
  window.parent.postMessage(
    { channel: 'xpertai.remote_component', protocolVersion: 1, type, instanceId, scopeRevision, ...body },
    '*'
  )
function clearPending() {
  pending.forEach((call) => {
    window.clearTimeout(call.timer)
    call.reject(Error('View context changed'))
  })
  pending.clear()
}
export function connect(init: (context: Init) => void, reset: () => void) {
  const receive = (event: MessageEvent<unknown>) => {
    if (event.source !== window.parent) return
    const parsed = envelope.safeParse(event.data)
    if (!parsed.success) return
    const value = parsed.data
    if (value.type === 'init' && value.instanceId) {
      if (instanceId !== value.instanceId || scopeRevision !== value.scopeRevision) clearPending()
      instanceId = value.instanceId
      scopeRevision = value.scopeRevision
      debug = value.debug?.enabled === true
      for (const [key, token] of Object.entries(value.theme?.tokens ?? {}))
        document.documentElement.style.setProperty(
          `--xui-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
          String(token)
        )
      installShadcnThemeVars({ density: value.theme?.density ?? 'default' })
      document.documentElement.classList.toggle('dark', value.theme?.mode === 'dark')
      if (debug) console.debug('[execution-observability] initialized')
      init({
        locale: value.locale ?? 'en-US',
        query: value.initialQuery ?? {},
        revision: scopeRevision ?? 0,
        viewKey: value.manifest?.key ?? 'timeline',
        synthetic: value.payload?.synthetic === true
      })
      return
    }
    if (value.instanceId !== instanceId || !instanceId) return
    if (
      value.type === 'hostEvent' &&
      value.event?.type === 'view.context.changed' &&
      value.event.data.revision > (scopeRevision ?? -1)
    ) {
      scopeRevision = value.event.data.revision
      clearPending()
      reset()
      send('ready')
      return
    }
    if (!value.requestId) return
    const call = pending.get(value.requestId)
    if (!call || call.revision !== scopeRevision) return
    pending.delete(value.requestId)
    window.clearTimeout(call.timer)
    if (value.type === 'error') call.reject(Error(value.message ?? 'Request failed'))
    else call.resolve(value.data ?? value.result)
  }
  window.addEventListener('message', receive)
  send('ready')
  return () => {
    window.removeEventListener('message', receive)
    clearPending()
    instanceId = null
  }
}
export function request(type: 'requestData' | 'executeAction' | 'invokeClientCommand', body: object): Promise<unknown> {
  if (!instanceId) return Promise.reject(Error('View has not initialized'))
  const requestId = crypto.randomUUID()
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      pending.delete(requestId)
      reject(Error('Request timed out'))
    }, 30000)
    pending.set(requestId, { resolve, reject, timer, revision: scopeRevision })
    send(type, { requestId, ...body })
  })
}
export const actionSchema = z.object({ success: z.boolean(), data: z.unknown().optional() })
export const analysisActionSchema = z.object({
  success: z.literal(true),
  data: z.object({ query: executionObservationQuerySchema, observedAt: z.string() })
})
export const navigationActionSchema = z.object({
  success: z.literal(true),
  data: z.object({
    target: z.literal('assistant.conversation'),
    conversationId: z.string(),
    xpertId: z.string(),
    threadId: z.string().optional(),
    executionId: z.string(),
    preserveView: z.literal(true)
  })
})
