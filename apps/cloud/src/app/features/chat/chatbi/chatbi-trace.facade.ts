import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core'
import { firstValueFrom } from 'rxjs'
import { AiThreadService, ChatConversationService, getErrorMessage } from '../../../@core'
import { ChatBiTraceItem, extractChatBiTraceItemFromLogEvent, extractChatBiTraceItems } from './chatbi-trace.utils'

type ChatBiTraceState = 'idle' | 'loading' | 'ready' | 'error'
type ChatBiTraceItemSource = 'hydrated' | 'live'

export type ChatBiTraceDisplayItem = ChatBiTraceItem & {
  source: ChatBiTraceItemSource
  pinned?: boolean
  replacesId?: string | null
  originalId?: string | null
}

@Injectable()
export class ChatBiTraceFacade {
  readonly #threadService = inject(AiThreadService)
  readonly #conversationService = inject(ChatConversationService)
  readonly #destroyRef = inject(DestroyRef)

  readonly threadId = signal<string | null>(null)
  readonly conversationId = signal<string | null>(null)
  readonly hydratedSteps = signal<ChatBiTraceDisplayItem[]>([])
  readonly liveSteps = signal<ChatBiTraceDisplayItem[]>([])
  readonly steps = computed(() => buildDisplayedSteps(this.hydratedSteps(), this.liveSteps()))
  readonly busy = signal(false)
  readonly loading = signal(false)
  readonly error = signal<string | null>(null)
  readonly state = computed<ChatBiTraceState>(() => {
    if (this.loading()) {
      return 'loading'
    }
    if (this.error()) {
      return 'error'
    }
    if (!this.threadId()) {
      return 'idle'
    }
    return 'ready'
  })
  readonly conversationStatus = computed(() => (this.busy() ? 'busy' : 'idle'))

  #pollTimer: ReturnType<typeof setInterval> | null = null
  #hydrating = false
  #pendingHydrate = false
  #requestVersion = 0

  constructor() {
    this.#destroyRef.onDestroy(() => {
      this.stopPolling()
    })
  }

  handleThreadChange(threadId: string | null) {
    const previousThreadId = this.threadId()
    if (threadId === previousThreadId) {
      return
    }

    const wasBusy = this.busy()
    const preserveLiveSteps = wasBusy && !previousThreadId && !!threadId && this.steps().length > 0
    if (!wasBusy) {
      this.stopPolling()
    }
    this.threadId.set(threadId)
    this.conversationId.set(null)
    this.hydratedSteps.set([])
    if (!preserveLiveSteps) {
      this.liveSteps.set([])
    }
    this.error.set(null)
    this.loading.set(!!threadId && !preserveLiveSteps)

    if (!threadId) {
      return
    }

    if (wasBusy) {
      this.startPolling()
    }

    void this.hydrateCurrentThread({ showLoading: true })
  }

  handleThreadLoadStart(threadId: string) {
    if (threadId && threadId !== this.threadId()) {
      this.threadId.set(threadId)
      this.conversationId.set(null)
      this.error.set(null)
    }

    this.hydratedSteps.set([])
    this.liveSteps.set([])
    this.stopPolling()
    this.busy.set(false)
    this.loading.set(true)
  }

  handleThreadLoadEnd(threadId: string) {
    if (threadId && threadId !== this.threadId()) {
      this.threadId.set(threadId)
    }

    void this.hydrateCurrentThread({ showLoading: true })
  }

  handleResponseStart() {
    this.busy.set(true)
    this.startPolling()
  }

  handleResponseEnd() {
    this.busy.set(false)
    this.stopPolling()
    void this.hydrateCurrentThread({ showLoading: false })
  }

  toggleDashboardPin(stepId: string) {
    const step = this.steps().find((item) => item.id === stepId)
    if (!step || !isDashboardTraceItem(step)) {
      return
    }

    const pinned = !step.pinned
    this.hydratedSteps.update((items) => updatePinnedState(items, stepId, pinned))
    this.liveSteps.update((items) => updatePinnedState(items, stepId, pinned))
  }

  handleLog(event: unknown) {
    const traceItem = extractChatBiTraceItemFromLogEvent(event)
    if (traceItem) {
      this.loading.set(false)
      this.error.set(null)
      this.liveSteps.update((items) =>
        isDashboardTraceItem(traceItem)
          ? this.applyLiveDashboardTraceItem(items, traceItem)
          : upsertLiveTraceItem(items, createTraceDisplayItem(traceItem, 'live'))
      )
      return
    }

    if (!this.threadId()) {
      return
    }

    const eventName = resolveLogEventName(event)
    if (eventName?.startsWith('thread.item.') || eventName === 'event.thread.change') {
      void this.hydrateCurrentThread({ showLoading: false })
    }
  }

  async hydrateCurrentThread(options?: { showLoading?: boolean }) {
    const threadId = this.threadId()
    if (!threadId) {
      return
    }

    if (this.#hydrating) {
      this.#pendingHydrate = true
      return
    }

    this.#hydrating = true
    const requestVersion = ++this.#requestVersion
    const showLoading = options?.showLoading ?? false

    if (showLoading) {
      this.loading.set(true)
    }

    try {
      const thread = await firstValueFrom(this.#threadService.getThread(threadId))
      const conversationId = resolveConversationId(thread?.metadata)
      if (!conversationId) {
        throw new Error('Failed to resolve conversation id from thread metadata.')
      }

      const conversation = await firstValueFrom(
        this.#conversationService.getById(conversationId, {
          relations: ['messages']
        })
      )

      if (!this.isCurrentRequest(requestVersion, threadId)) {
        return
      }

      const pinnedById = buildPinnedLookup(this.steps())
      const hydratedSteps = extractChatBiTraceItems(conversation).map((item) =>
        createTraceDisplayItem(item, 'hydrated', {
          pinned: pinnedById.get(item.id) ?? false
        })
      )
      const hydratedOriginalIds = new Set(hydratedSteps.map(getTraceOriginalId))

      this.conversationId.set(conversation?.id ?? conversationId)
      this.hydratedSteps.set(hydratedSteps)
      this.liveSteps.update((items) =>
        items.filter((item) => item.pinned || !hydratedOriginalIds.has(getTraceOriginalId(item)))
      )
      this.error.set(null)
    } catch (error) {
      if (!this.isCurrentRequest(requestVersion, threadId)) {
        return
      }

      this.error.set(getErrorMessage(error) || 'Failed to load thread activity.')
      if (showLoading || !this.steps().length) {
        this.hydratedSteps.set([])
      }
    } finally {
      if (this.isCurrentRequest(requestVersion, threadId)) {
        this.loading.set(false)
      }

      this.#hydrating = false

      if (this.#pendingHydrate) {
        this.#pendingHydrate = false
        void this.hydrateCurrentThread({ showLoading: false })
      }
    }
  }

  private applyLiveDashboardTraceItem(items: ChatBiTraceDisplayItem[], traceItem: ChatBiTraceItem) {
    const displayedSteps = buildDisplayedSteps(this.hydratedSteps(), items)
    const lastStep = displayedSteps[displayedSteps.length - 1] ?? null

    if (!isDashboardTraceItem(lastStep) || lastStep.pinned) {
      return [
        ...items,
        ensureUniqueTraceDisplayId(createTraceDisplayItem(traceItem, 'live'), displayedSteps)
      ]
    }

    if (lastStep.source === 'live') {
      const replacement = ensureUniqueTraceDisplayId(
        createTraceDisplayItem(traceItem, 'live', {
          replacesId: lastStep.replacesId ?? null
        }),
        displayedSteps.filter((item) => item.id !== lastStep.id)
      )

      return items.map((item) => (item.id === lastStep.id ? replacement : item))
    }

    return [
      ...items,
      ensureUniqueTraceDisplayId(
        createTraceDisplayItem(traceItem, 'live', {
          replacesId: lastStep.id
        }),
        displayedSteps
      )
    ]
  }

  private isCurrentRequest(requestVersion: number, threadId: string) {
    return requestVersion === this.#requestVersion && threadId === this.threadId()
  }

  private startPolling() {
    if (this.#pollTimer) {
      return
    }

    this.#pollTimer = setInterval(() => {
      void this.hydrateCurrentThread({ showLoading: false })
    }, 800)
  }

  private stopPolling() {
    if (!this.#pollTimer) {
      return
    }

    clearInterval(this.#pollTimer)
    this.#pollTimer = null
  }
}

function resolveConversationId(metadata?: { id?: string }) {
  const conversationId = metadata?.id
  return typeof conversationId === 'string' && conversationId.trim() ? conversationId : null
}

function resolveLogEventName(event: unknown) {
  if (!event || typeof event !== 'object') {
    return null
  }

  const name = (event as { name?: unknown; event?: unknown }).name ?? (event as { event?: unknown }).event
  return typeof name === 'string' && name.trim() ? name : null
}

function buildDisplayedSteps(hydrated: ChatBiTraceDisplayItem[], live: ChatBiTraceDisplayItem[]) {
  return [...hydrated, ...live].reduce((items, item) => {
    const existingIndex = items.findIndex((current) => current.id === item.id)
    if (existingIndex > -1) {
      items[existingIndex] = mergeTraceDisplayItem(items[existingIndex], item)
      return items
    }

    const lastItem = items[items.length - 1] ?? null
    if (isDashboardTraceItem(item) && isDashboardTraceItem(lastItem) && !lastItem.pinned) {
      items[items.length - 1] = item
      return items
    }

    items.push(item)
    return items
  }, [] as ChatBiTraceDisplayItem[])
}

function createTraceDisplayItem(
  item: ChatBiTraceItem,
  source: ChatBiTraceItemSource,
  options?: Partial<Pick<ChatBiTraceDisplayItem, 'pinned' | 'replacesId' | 'originalId'>>
): ChatBiTraceDisplayItem {
  return {
    ...item,
    source,
    pinned: options?.pinned ?? false,
    replacesId: options?.replacesId ?? null,
    originalId: options?.originalId ?? item.id
  }
}

function upsertLiveTraceItem(items: ChatBiTraceDisplayItem[], item: ChatBiTraceDisplayItem) {
  const index = items.findIndex((current) => current.id === item.id)
  if (index === -1) {
    return [...items, item]
  }

  return items.map((current, currentIndex) => (currentIndex === index ? mergeTraceDisplayItem(current, item) : current))
}

function mergeTraceDisplayItem(previous: ChatBiTraceDisplayItem, incoming: ChatBiTraceDisplayItem): ChatBiTraceDisplayItem {
  const mergedIncomingData = Object.entries(incoming.data ?? {}).reduce(
    (acc, [key, value]) => {
      if (value !== null && value !== undefined) {
        acc[key] = value
      }
      return acc
    },
    {} as Record<string, unknown>
  )

  return {
    ...previous,
    ...incoming,
    pinned: incoming.pinned ?? previous.pinned ?? false,
    replacesId: incoming.replacesId ?? previous.replacesId ?? null,
    originalId: incoming.originalId ?? previous.originalId ?? previous.id,
    data: {
      ...(previous.data ?? {}),
      ...mergedIncomingData,
      created_date: previous.data?.created_date || incoming.data?.created_date
    }
  }
}

function updatePinnedState(items: ChatBiTraceDisplayItem[], stepId: string, pinned: boolean) {
  return items.map((item) => (item.id === stepId ? { ...item, pinned } : item))
}

function isDashboardTraceItem(item?: Pick<ChatBiTraceItem, 'data'> | null): item is ChatBiTraceItem {
  return item?.data?.category === 'Dashboard'
}

function buildPinnedLookup(items: ChatBiTraceDisplayItem[]) {
  return items.reduce((lookup, item) => {
    if (item.pinned) {
      lookup.set(item.id, true)
    }
    return lookup
  }, new Map<string, boolean>())
}

function getTraceOriginalId(item: ChatBiTraceDisplayItem) {
  return item.originalId ?? item.id
}

function ensureUniqueTraceDisplayId(item: ChatBiTraceDisplayItem, existingItems: ChatBiTraceDisplayItem[]) {
  const existingIds = new Set(existingItems.map((current) => current.id))
  if (!existingIds.has(item.id)) {
    return item
  }

  const baseId = item.originalId ?? item.id
  let version = 1
  let nextId = `${baseId}:snapshot:${version}`

  while (existingIds.has(nextId)) {
    version++
    nextId = `${baseId}:snapshot:${version}`
  }

  return {
    ...item,
    id: nextId,
    data: {
      ...item.data,
      id: nextId
    }
  }
}
