// A saved intent survives loss of the POST response. Replaying it never creates a second Assistant.
// Scope this client to server + tenant + user + organization + workspace + template; dispose on scope changes.
import type { TemplateInstallation, TemplateInstallationInput } from '@xpert-ai/contracts'

export type InstallationIntent = Pick<
  TemplateInstallationInput,
  'templateId' | 'workspaceId' | 'publish' | 'locale' | 'capabilities'
> & {
  basic: Pick<
    NonNullable<TemplateInstallationInput['basic']>,
    'title' | 'prompt' | 'description' | 'workspaceDataScope' | 'realtimeVoice'
  > & {
    copilotModel?: { copilotId: string; model: string }
  }
}
export interface InstallationTransport {
  create(input: TemplateInstallationInput): Promise<TemplateInstallation>
  get(id: string): Promise<TemplateInstallation>
  retry(id: string): Promise<TemplateInstallation>
  list(workspaceId: string, skip: number): Promise<{ items: TemplateInstallation[]; total: number }>
}
export interface InstallationSnapshot {
  operation: TemplateInstallation | null
  history: TemplateInstallation[]
  hasMore: boolean
  busy: boolean
  uncertain: boolean
  error: string
}
type Saved =
  | { kind: 'operation'; id: string }
  | { kind: 'intent'; input: InstallationIntent & { idempotencyKey: string } }
const isObject = (value: unknown): value is object => !!value && typeof value === 'object' && !Array.isArray(value)
const optionalString = (value: unknown) => value === undefined || typeof value === 'string'
function readSaved(text: string | null): Saved | null {
  if (!text) return null
  const value: unknown = JSON.parse(text)
  if (!isObject(value) || !('kind' in value)) return null
  if (value.kind === 'operation' && 'id' in value && typeof value.id === 'string')
    return { kind: 'operation', id: value.id }
  if (value.kind !== 'intent' || !('input' in value) || !isObject(value.input)) return null
  const input = value.input
  if (
    !('templateId' in input) ||
    typeof input.templateId !== 'string' ||
    !('workspaceId' in input) ||
    typeof input.workspaceId !== 'string' ||
    !('idempotencyKey' in input) ||
    typeof input.idempotencyKey !== 'string' ||
    !('basic' in input) ||
    !isObject(input.basic)
  )
    return null
  const { basic } = input
  for (const key of ['title', 'description', 'prompt']) if (!optionalString(Reflect.get(basic, key))) return null
  if ('workspaceDataScope' in basic && !['shared', 'user'].includes(String(basic.workspaceDataScope))) return null
  if ('copilotModel' in basic && basic.copilotModel !== undefined) {
    const model = basic.copilotModel
    if (
      !isObject(model) ||
      !('copilotId' in model) ||
      typeof model.copilotId !== 'string' ||
      !('model' in model) ||
      typeof model.model !== 'string' ||
      ('modelType' in model && model.modelType !== 'llm')
    )
      return null
  }
  if ('realtimeVoice' in basic && basic.realtimeVoice !== undefined) {
    const voice = basic.realtimeVoice
    if (
      !isObject(voice) ||
      !('modelId' in voice) ||
      typeof voice.modelId !== 'string' ||
      !('voice' in voice) ||
      typeof voice.voice !== 'string'
    )
      return null
  }
  if (
    'capabilities' in input &&
    (!Array.isArray(input.capabilities) || input.capabilities.some((key) => typeof key !== 'string'))
  )
    return null
  if ('publish' in input && typeof input.publish !== 'boolean') return null
  if ('locale' in input && !optionalString(input.locale)) return null
  return value as Saved
}

export function createInstallationClient(options: {
  transport: InstallationTransport
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
  scope: string
  workspaceId: string
  templateId: string
  changed: (snapshot: InstallationSnapshot) => void
  errorMessage: (error: unknown) => string
  interval?: number
}) {
  const { transport, storage, workspaceId, templateId } = options
  const key = 'xpert.template-installation.v1:' + JSON.stringify([options.scope, workspaceId, templateId])
  let state: InstallationSnapshot = {
    operation: null,
    history: [],
    hasMore: false,
    busy: false,
    uncertain: false,
    error: ''
  }
  let saved: Saved | null = null
  let disposed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let generation = 0
  let offset = 0
  const update = (patch: Partial<InstallationSnapshot>) => {
    if (!disposed) {
      state = { ...state, ...patch }
      options.changed(state)
    }
  }
  const persist = (value: Saved) => {
    storage.setItem(key, JSON.stringify(value))
    saved = value
  }
  const stop = () => {
    clearTimeout(timer)
    generation++
  }
  const accept = (operation: TemplateInstallation) => {
    if (operation.workspaceId !== workspaceId || operation.templateId !== templateId)
      throw Error('Installation scope changed.')
    persist({ kind: 'operation', id: operation.id })
    update({
      operation,
      uncertain: false,
      error: '',
      history: [operation, ...state.history.filter((item) => item.id !== operation.id)]
    })
    if (operation.status === 'running') timer = setTimeout(() => void refresh(), options.interval ?? 1500)
  }
  const run = async (action: () => Promise<TemplateInstallation>) => {
    if (state.busy || disposed) return
    stop()
    const version = generation
    update({ busy: true, error: '' })
    try {
      const operation = await action()
      if (!disposed && version === generation) accept(operation)
    } catch (error) {
      if (!disposed && version === generation)
        update({ error: options.errorMessage(error), uncertain: saved?.kind === 'intent' })
    } finally {
      if (!disposed && version === generation) update({ busy: false })
    }
  }
  const refresh = async () => {
    if (saved?.kind === 'operation') {
      const id = saved.id
      await run(() => transport.get(id))
    } else if (saved?.kind === 'intent') {
      const input = saved.input
      await run(() => transport.create(input))
    }
  }
  return {
    async restore() {
      try {
        saved = readSaved(storage.getItem(key))
        if (
          saved?.kind === 'intent' &&
          (saved.input.workspaceId !== workspaceId || saved.input.templateId !== templateId)
        )
          saved = null
        await refresh()
      } catch (error) {
        update({ error: options.errorMessage(error), uncertain: true })
      }
    },
    async start(input: InstallationIntent) {
      if (state.busy || saved || disposed) return
      try {
        if (input.workspaceId !== workspaceId || input.templateId !== templateId)
          throw Error('Installation scope changed.')
        const intent = { ...input, idempotencyKey: crypto.randomUUID() }
        // Persist before sending; storage failures must not dispatch an unrecoverable installation.
        persist({ kind: 'intent', input: intent })
        await refresh()
      } catch (error) {
        update({ error: options.errorMessage(error) })
      }
    },
    refresh,
    async select(operation: TemplateInstallation) {
      if (state.busy || state.uncertain || disposed) return
      stop()
      accept(operation)
      await refresh()
    },
    async retry() {
      const operation = state.operation
      if (operation?.retryable) await run(() => transport.retry(operation.id))
    },
    async history(more = false) {
      const version = generation
      try {
        const page = await transport.list(workspaceId, more ? offset : 0)
        if (disposed || version !== generation) return
        offset = (more ? offset : 0) + page.items.length
        const items = page.items.filter((item) => item.templateId === templateId)
        const merged = more ? [...state.history, ...items] : items
        update({ history: [...new Map(merged.map((item) => [item.id, item])).values()], hasMore: offset < page.total })
      } catch (error) {
        if (!disposed && version === generation) update({ error: options.errorMessage(error) })
      }
    },
    newInstance() {
      if (state.busy || state.uncertain || state.operation?.status === 'running' || disposed) return
      stop()
      try {
        storage.removeItem(key)
        saved = null
        update({ operation: null, error: '' })
      } catch (error) {
        update({ error: options.errorMessage(error) })
      }
    },
    dispose() {
      disposed = true
      stop()
    }
  }
}

export const installationStageLabels: Record<TemplateInstallation['stage'], string> = {
  importing: 'Importing assistant',
  dependencies: 'Installing dependencies',
  publishing: 'Publishing assistant',
  initializing: 'Initializing workspace',
  completed: 'Installation complete'
}
export function installationStatusLabel(operation: TemplateInstallation): string {
  if (operation.status === 'succeeded')
    return operation.pendingAuthInstallationIds.length ? 'Configuration required' : 'Installation complete'
  return { running: 'Installing', interrupted: 'Installation interrupted', failed: 'Installation failed' }[
    operation.status
  ]
}
