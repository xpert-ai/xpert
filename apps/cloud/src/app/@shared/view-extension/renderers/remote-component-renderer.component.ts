import { CommonModule, DOCUMENT } from '@angular/common'
import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild
} from '@angular/core'
import { firstValueFrom } from 'rxjs'
import {
  XPERT_REMOTE_COMPONENT_INVOKE_CLIENT_COMMAND_MESSAGE_TYPE,
  XpertExtensionViewManifest,
  XpertViewActionDefinition,
  XpertViewFileAccessPurpose,
  XpertViewFileAccessSessionResult,
  XpertViewHostEventSubscription,
  XpertViewParameterDefinition,
  XpertViewQuery
} from '@xpert-ai/contracts'
import { SafePipe } from '@xpert-ai/core'
import { getErrorMessage, injectToastr, injectViewExtensionApi } from '@cloud/app/@core'
import { environment } from '@cloud/environments/environment'
import { NgmThemeService } from '@xpert-ai/ocap-angular/core'
import { ViewClientCommandRegistry } from '../view-client-command-registry.service'
import {
  ViewHostEventBus,
  type XpertRemoteViewHostEventMessage,
  type XpertViewHostEventMessage
} from '../view-host-event-bus.service'

const REMOTE_COMPONENT_CHANNEL = 'xpertai.remote_component'
const REMOTE_COMPONENT_PROTOCOL_VERSION = 1

type RemoteComponentThemeMode = 'light' | 'dark'

type RemoteComponentTheme = {
  mode: RemoteComponentThemeMode
  tokens: Record<string, string>
}

type RemoteComponentDebugState = {
  enabled: boolean
  production: boolean
}

type RemoteComponentMessage = {
  channel?: string
  protocolVersion?: number
  instanceId?: string | null
  type?: string
  requestId?: string
  [key: string]: unknown
}

@Component({
  standalone: true,
  selector: 'xp-remote-component-renderer',
  imports: [CommonModule, SafePipe],
  template: `
    @if (error()) {
      <div class="rounded-2xl border border-divider-regular bg-components-card-bg px-4 py-5 text-sm text-text-tertiary">
        {{ error() }}
      </div>
    } @else {
      @if (entryUrl()) {
        <iframe
          #frame
          class="block w-full border-0"
          [class.h-full]="fillAvailableHeight()"
          [class.min-h-full]="!fillAvailableHeight()"
          [style.height.px]="fillAvailableHeight() ? null : height()"
          [attr.title]="manifest().title.en_US"
          [src]="entryUrl() | safe: 'resourceUrl'"
          allow="autoplay"
          sandbox="allow-downloads allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
          (load)="handleFrameLoad()"
        ></iframe>
      }
    }
  `
})
export class RemoteComponentRendererComponent {
  readonly hostType = input.required<string>()
  readonly hostId = input.required<string>()
  readonly manifest = input.required<XpertExtensionViewManifest>()
  readonly query = input<XpertViewQuery>({})
  readonly active = input<boolean>(true)
  readonly fillAvailableHeight = input(false)

  readonly #api = injectViewExtensionApi()
  readonly #toastr = injectToastr()
  readonly #clientCommands = inject(ViewClientCommandRegistry)
  readonly #destroyRef = inject(DestroyRef)
  readonly #document = inject(DOCUMENT)
  readonly #themeService = inject(NgmThemeService)
  readonly #hostEvents = inject(ViewHostEventBus)
  readonly frame = viewChild('frame', { read: ElementRef<HTMLIFrameElement> })

  readonly entryUrl = signal<string | null>(null)
  readonly error = signal<string | null>(null)
  readonly requestedHeight = signal(520)
  readonly viewportBound = signal(false)
  readonly viewportHeight = signal(720)
  readonly height = computed(() => {
    const requested = Math.max(this.requestedHeight(), 520)
    if (this.fillAvailableHeight()) {
      return this.viewportHeight()
    }
    return this.viewportBound() ? Math.min(requested, this.viewportHeight()) : requested
  })
  readonly #instanceNonce = signal(createInstanceNonce())
  readonly instanceId = computed(() => `${this.manifest().key}:${this.#instanceNonce()}`)
  readonly remoteThemeMode = computed<RemoteComponentThemeMode>(() =>
    this.#themeService.themeClass() === 'dark' ? 'dark' : 'light'
  )

  #entryRequestId = 0
  #entryObjectUrl: string | null = null
  // Keep the fetched HTML so the renderer can reuse the exact same payload if a blob iframe stays blank.
  #entryHtml: string | null = null
  // Debounces the blank-frame check across both entry assignment and iframe load events.
  #srcdocFallbackTimer: number | null = null
  #viewportUpdateFrame: number | null = null
  readonly #hostEventDebounces = new Map<string, number>()
  #fileAccessSession: XpertViewFileAccessSessionResult | null = null
  #fileAccessSessionPromise: Promise<XpertViewFileAccessSessionResult> | null = null
  #fileAccessEpoch = 0

  constructor() {
    const onMessage = (event: MessageEvent) => this.handleMessage(event)
    const onViewportChange = () => this.scheduleViewportHeightUpdate()
    const hostEventSubscription = this.#hostEvents.events$.subscribe((event) => this.handleHostEvent(event))
    window.addEventListener('message', onMessage)
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('scroll', onViewportChange, true)
    this.#destroyRef.onDestroy(() => {
      hostEventSubscription.unsubscribe()
      window.removeEventListener('message', onMessage)
      window.removeEventListener('resize', onViewportChange)
      window.removeEventListener('scroll', onViewportChange, true)
      this.#hostEventDebounces.clear()
      this.resetFileAccessSession()
      this.cancelViewportHeightUpdate()
      this.clearEntryUrl()
    })

    effect(() => {
      const active = this.active()
      const manifest = this.manifest()
      const hostType = this.hostType()
      const hostId = this.hostId()
      if (!active || manifest.view.type !== 'remote_component') {
        return
      }

      void untracked(() => this.loadEntry(++this.#entryRequestId, hostType, hostId, manifest.key))
    })

    effect(() => {
      const entryUrl = this.entryUrl()
      this.remoteThemeMode()
      if (!entryUrl || !this.frame()?.nativeElement.contentWindow) {
        return
      }

      this.sendInitToFrame()
    })
  }

  private async loadEntry(requestId: number, hostType: string, hostId: string, viewKey: string) {
    this.error.set(null)
    this.clearEntryUrl()
    this.requestedHeight.set(520)
    this.viewportBound.set(false)
    this.updateViewportHeight()
    this.#instanceNonce.set(createInstanceNonce())
    this.resetFileAccessSession()

    try {
      const html = await firstValueFrom(this.#api.getRemoteComponentEntry(hostType, hostId, viewKey))
      if (requestId !== this.#entryRequestId) {
        return
      }
      this.setEntryHtml(html)
    } catch (error) {
      if (requestId !== this.#entryRequestId) {
        return
      }
      this.error.set(getErrorMessage(error))
    }
  }

  private setEntryHtml(html: string) {
    this.clearEntryUrl()
    this.#entryHtml = html
    // Blob URLs remain the primary load path; srcdoc is only used later if this iframe renders blank.
    const objectUrl = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
    this.#entryObjectUrl = objectUrl
    this.entryUrl.set(objectUrl)
    this.scheduleSrcdocFallbackCheck()
  }

  private clearEntryUrl() {
    this.cancelSrcdocFallbackCheck()
    const objectUrl = this.#entryObjectUrl
    this.#entryObjectUrl = null
    this.#entryHtml = null
    this.entryUrl.set(null)
    // Remove a previous fallback document before the next remote component entry is mounted.
    this.frame()?.nativeElement.removeAttribute('srcdoc')
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl)
    }
  }

  private handleMessage(event: MessageEvent) {
    const message = event.data as RemoteComponentMessage
    if (!isRemoteComponentMessage(message)) {
      return
    }
    if (event.source !== this.frame()?.nativeElement.contentWindow) {
      return
    }

    if (message.type === 'ready') {
      this.sendInitToFrame()
      return
    }

    if (message.instanceId !== this.instanceId()) {
      return
    }

    switch (message.type) {
      case 'resize':
        this.requestedHeight.set(Math.max(Number(message.height) || 0, 520))
        this.viewportBound.set(message.viewportBound === true)
        this.updateViewportHeight()
        this.scheduleViewportHeightUpdate()
        return
      case 'notify':
        this.notify(message)
        return
      case 'requestData':
        void this.handleRequest(message, 'data', () =>
          firstValueFrom(
            this.#api.getViewData(this.hostType(), this.hostId(), this.manifest().key, toQuery(message.query))
          )
        )
        return
      case 'requestParameterOptions':
        void this.handleRequest(message, 'parameterOptions', () => this.handleParameterOptionsRequest(message))
        return
      case 'executeAction':
        void this.handleRequest(message, 'actionResult', () => this.handleActionRequest(message))
        return
      case 'executeFileAction':
        void this.handleRequest(message, 'fileActionResult', () => this.handleFileActionRequest(message))
        return
      case 'requestFileAccess':
        void this.handleRequest(message, 'fileAccessResult', () => this.handleFileAccessRequest(message))
        return
      case XPERT_REMOTE_COMPONENT_INVOKE_CLIENT_COMMAND_MESSAGE_TYPE:
        void this.handleRequest(message, 'clientCommandResult', () => this.handleClientCommandRequest(message))
        return
      default:
        return
    }
  }

  private async handleRequest(message: RemoteComponentMessage, responseType: string, run: () => Promise<unknown>) {
    const requestId = typeof message.requestId === 'string' ? message.requestId : undefined
    try {
      const result = await run()
      this.sendToFrame(responseType, { requestId, [responseType === 'data' ? 'data' : 'result']: result })
    } catch (error) {
      this.sendToFrame('error', {
        requestId,
        message: getErrorMessage(error)
      })
    }
  }

  private async handleParameterOptionsRequest(message: RemoteComponentMessage) {
    const parameterKey = getString(message.parameterKey)
    if (!parameterKey || !this.findParameter(parameterKey)?.optionSource) {
      throw new Error(`Parameter '${parameterKey || ''}' is not available`)
    }
    return firstValueFrom(
      this.#api.getViewParameterOptions(
        this.hostType(),
        this.hostId(),
        this.manifest().key,
        parameterKey,
        toParameterOptionsQuery(message.query)
      )
    )
  }

  private async handleActionRequest(message: RemoteComponentMessage) {
    const actionKey = getString(message.actionKey)
    const action = this.findAction(actionKey)
    if (!action || (action.transport ?? 'json') !== 'json') {
      throw new Error(`Action '${actionKey || ''}' is not available`)
    }
    return firstValueFrom(
      this.#api.executeAction(this.hostType(), this.hostId(), this.manifest().key, action.key, {
        targetId: getString(message.targetId),
        input: toRecordOrNull(message.input),
        parameters: toRecord(message.parameters)
      })
    )
  }

  private async handleFileActionRequest(message: RemoteComponentMessage) {
    const actionKey = getString(message.actionKey)
    const action = this.findAction(actionKey)
    const file = toRemoteFile(message.file)
    if (!action || (action.transport ?? 'json') !== 'file') {
      throw new Error(`File action '${actionKey || ''}' is not available`)
    }
    if (!file) {
      throw new Error('file is required')
    }
    return firstValueFrom(
      this.#api.executeFileAction(this.hostType(), this.hostId(), this.manifest().key, action.key, {
        targetId: getString(message.targetId),
        input: toRecordOrNull(message.input),
        parameters: toRecord(message.parameters),
        file
      })
    )
  }

  private async handleFileAccessRequest(message: RemoteComponentMessage) {
    const fileKey = getString(message.fileKey)
    const purpose = toFileAccessPurpose(message.purpose)
    if (!fileKey) {
      throw new Error('fileKey is required')
    }
    if (!purpose || !this.manifest().fileAccess?.purposes.includes(purpose)) {
      throw new Error(`File access purpose '${getString(message.purpose) || ''}' is not available`)
    }

    const session = await this.ensureFileAccessSession()
    return firstValueFrom(
      this.#api.createViewFileAccessGrant(session.sessionId, {
        fileKey,
        targetId: getString(message.targetId) ?? undefined,
        purpose
      })
    )
  }

  private async ensureFileAccessSession(): Promise<XpertViewFileAccessSessionResult> {
    const current = this.#fileAccessSession
    if (current && new Date(current.expiresAt).getTime() > Date.now() + 60_000) {
      return current
    }
    if (this.#fileAccessSessionPromise) {
      return this.#fileAccessSessionPromise
    }

    const epoch = this.#fileAccessEpoch
    const promise = firstValueFrom(
      this.#api.createViewFileAccessSession(this.hostType(), this.hostId(), this.manifest().key)
    ).then(async (session) => {
      if (epoch !== this.#fileAccessEpoch) {
        await firstValueFrom(this.#api.revokeViewFileAccessSession(session.sessionId)).catch(() => undefined)
        throw new Error('Remote view file access session is no longer active')
      }
      this.#fileAccessSession = session
      return session
    })
    this.#fileAccessSessionPromise = promise
    try {
      return await promise
    } finally {
      if (this.#fileAccessSessionPromise === promise) {
        this.#fileAccessSessionPromise = null
      }
    }
  }

  private resetFileAccessSession() {
    this.#fileAccessEpoch += 1
    const session = this.#fileAccessSession
    this.#fileAccessSession = null
    this.#fileAccessSessionPromise = null
    if (session) {
      void firstValueFrom(this.#api.revokeViewFileAccessSession(session.sessionId)).catch(() => undefined)
    }
  }

  private async handleClientCommandRequest(message: RemoteComponentMessage) {
    const commandKey = getString(message.commandKey)
    if (!commandKey || !this.manifest().clientCommands?.some((command) => command.key === commandKey)) {
      throw new Error(`Client command '${commandKey || ''}' is not available`)
    }

    return this.#clientCommands.execute(commandKey, message.payload, {
      hostType: this.hostType(),
      hostId: this.hostId(),
      viewKey: this.manifest().key,
      manifest: this.manifest()
    })
  }

  private findAction(actionKey?: string | null): XpertViewActionDefinition | null {
    return this.manifest().actions?.find((action) => action.key === actionKey) ?? null
  }

  private findParameter(parameterKey?: string | null): XpertViewParameterDefinition | null {
    return this.manifest().parameters?.find((parameter) => parameter.key === parameterKey) ?? null
  }

  private notify(message: RemoteComponentMessage) {
    const text = getString(message.message)
    if (!text) {
      return
    }
    if (message.level === 'error') {
      this.#toastr.error(text)
      return
    }
    this.#toastr.success(text)
  }

  private handleHostEvent(event: XpertViewHostEventMessage) {
    if (!this.active() || !matchesHost(event, this.hostType(), this.hostId())) {
      return
    }

    // Host events are page-wide; the manifest subscription is the only routing contract for remote views.
    const subscriptions = this.manifest().hostEvents?.subscriptions ?? []
    for (const subscription of subscriptions) {
      if (!matchesSubscription(event, subscription)) {
        continue
      }

      const actionType = subscription.action?.type ?? 'refresh'
      if (actionType !== 'forward' && actionType !== 'refresh-and-forward') {
        continue
      }

      const debounceMs = Math.max(0, subscription.action?.debounceMs ?? 0)
      // Match the existing workbench behavior: forward the first event immediately, then suppress duplicates.
      const debounceKey = [
        subscription.key,
        event.type,
        event.toolName ?? event.toolCallId ?? event.runId ?? event.id ?? ''
      ].join(':')
      const previousAt = this.#hostEventDebounces.get(debounceKey)
      const now = Date.now()
      if (debounceMs > 0 && previousAt !== undefined && now - previousAt < debounceMs) {
        continue
      }
      this.#hostEventDebounces.set(debounceKey, now)
      this.forwardHostEvent(subscription, event)
    }
  }

  private forwardHostEvent(subscription: XpertViewHostEventSubscription, event: XpertViewHostEventMessage) {
    console.info('[view-extension] forwarding host event to remote component', {
      event: event.type,
      source: event.source,
      toolName: event.toolName,
      hostType: event.hostType,
      hostId: event.hostId,
      viewKey: this.manifest().key,
      subscriptionKey: subscription.key
    })
    this.sendToFrame('hostEvent', {
      event: createRemoteHostEvent(event)
    })
  }

  private sendToFrame(type: string, body: Record<string, unknown> = {}) {
    this.frame()?.nativeElement.contentWindow?.postMessage(
      {
        channel: REMOTE_COMPONENT_CHANNEL,
        protocolVersion: REMOTE_COMPONENT_PROTOCOL_VERSION,
        instanceId: this.instanceId(),
        type,
        ...body
      },
      '*'
    )
  }

  private updateViewportHeight() {
    this.viewportHeight.set(getAvailableFrameHeight(this.frame()?.nativeElement, this.fillAvailableHeight()))
  }

  handleFrameLoad() {
    this.updateViewportHeight()
    this.scheduleViewportHeightUpdate()
    this.sendInitToFrame()
    this.scheduleSrcdocFallbackCheck()
  }

  private scheduleSrcdocFallbackCheck() {
    if (typeof window === 'undefined') {
      return
    }
    this.cancelSrcdocFallbackCheck()
    // Give the blob document a short chance to render before treating the iframe as blank.
    this.#srcdocFallbackTimer = window.setTimeout(() => {
      this.#srcdocFallbackTimer = null
      this.applySrcdocFallbackIfBlank()
    }, 250)
  }

  private cancelSrcdocFallbackCheck() {
    if (this.#srcdocFallbackTimer === null || typeof window === 'undefined') {
      return
    }
    window.clearTimeout(this.#srcdocFallbackTimer)
    this.#srcdocFallbackTimer = null
  }

  private applySrcdocFallbackIfBlank() {
    const html = this.#entryHtml
    const frame = this.frame()?.nativeElement
    if (!html || !frame || frame.getAttribute('srcdoc')) {
      return
    }

    try {
      const doc = frame.contentDocument
      // Either the remote root or any body content means the blob load succeeded.
      const hasRemoteDocument = Boolean(doc?.getElementById('root')) || Boolean(doc?.body?.childElementCount)
      if (hasRemoteDocument) {
        return
      }
    } catch {
      // If the blob document cannot be inspected, leave the original iframe source untouched.
      return
    }

    // Some Chromium/WebView sessions can leave a blob-backed iframe at an empty about:blank
    // document. srcdoc preserves the same iframe sandbox and postMessage bridge while ensuring
    // the already-fetched remote component HTML is actually loaded.
    frame.setAttribute('srcdoc', html)
  }

  private scheduleViewportHeightUpdate() {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      this.updateViewportHeight()
      return
    }

    this.cancelViewportHeightUpdate()
    this.#viewportUpdateFrame = window.requestAnimationFrame(() => {
      this.#viewportUpdateFrame = null
      this.updateViewportHeight()

      if (this.fillAvailableHeight()) {
        this.#viewportUpdateFrame = window.requestAnimationFrame(() => {
          this.#viewportUpdateFrame = null
          this.updateViewportHeight()
        })
      }
    })
  }

  private cancelViewportHeightUpdate() {
    if (this.#viewportUpdateFrame === null || typeof window === 'undefined') {
      return
    }

    window.cancelAnimationFrame(this.#viewportUpdateFrame)
    this.#viewportUpdateFrame = null
  }

  private sendInitToFrame() {
    this.sendToFrame('init', {
      manifest: this.manifest(),
      payload: {},
      initialQuery: this.query(),
      locale: this.#document.documentElement.lang,
      theme: this.getRemoteTheme(),
      debug: this.getRemoteDebugState()
    })
  }

  private getRemoteTheme(): RemoteComponentTheme {
    return createRemoteTheme(this.#document, this.remoteThemeMode())
  }

  private getRemoteDebugState(): RemoteComponentDebugState {
    return {
      enabled: !environment.production,
      production: environment.production
    }
  }
}

function isRemoteComponentMessage(value: unknown): value is RemoteComponentMessage {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as RemoteComponentMessage).channel === REMOTE_COMPONENT_CHANNEL &&
    (value as RemoteComponentMessage).protocolVersion === REMOTE_COMPONENT_PROTOCOL_VERSION
  )
}

function matchesHost(event: XpertViewHostEventMessage, hostType: string, hostId: string) {
  if (event.hostType && event.hostType !== hostType) {
    return false
  }
  if (event.hostId && event.hostId !== hostId) {
    return false
  }
  return true
}

function matchesSubscription(event: XpertViewHostEventMessage, subscription: XpertViewHostEventSubscription) {
  if (event.type !== subscription.event) {
    return false
  }

  const filter = subscription.filter
  if (!filter) {
    return true
  }

  return (
    matchesOptionalFilter(filter.sources, event.source) &&
    matchesOptionalFilter(filter.toolNames, event.toolName) &&
    matchesOptionalFilter(filter.viewKeys, event.visualization?.viewKey) &&
    matchesOptionalFilter(filter.visualizationTypes, event.visualization?.type)
  )
}

function matchesOptionalFilter(values: string[] | undefined, actual: string | undefined) {
  return !values?.length || (Boolean(actual) && values.includes(actual))
}

function createRemoteHostEvent(event: XpertViewHostEventMessage): XpertRemoteViewHostEventMessage {
  const { hostType: _hostType, hostId: _hostId, ...remoteEvent } = event
  return remoteEvent
}

function toQuery(value: unknown): XpertViewQuery {
  return isRecord(value) ? (value as XpertViewQuery) : {}
}

function toParameterOptionsQuery(value: unknown) {
  return isRecord(value) ? (value as { search?: string; parameters?: Record<string, unknown> }) : {}
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined
}

function toRecordOrNull(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null
}

function toRemoteFile(value: unknown): { name?: string; type?: string; size?: number; buffer: ArrayBuffer } | null {
  if (!isRecord(value) || !(value.buffer instanceof ArrayBuffer)) {
    return null
  }
  return {
    name: getString(value.name) ?? undefined,
    type: getString(value.type) ?? undefined,
    size: typeof value.size === 'number' ? value.size : undefined,
    buffer: value.buffer
  }
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function toFileAccessPurpose(value: unknown): XpertViewFileAccessPurpose | null {
  return value === 'preview' || value === 'download' ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function createInstanceNonce() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function getAvailableFrameHeight(frame?: HTMLIFrameElement, fillAvailableHeight = false) {
  if (typeof window === 'undefined') {
    return 720
  }
  const viewportHeight = Math.floor(window.visualViewport?.height ?? window.innerHeight ?? 720)
  const frameTop = frame ? Math.max(0, frame.getBoundingClientRect().top) : 0
  if (fillAvailableHeight && frame) {
    const hostOutletBottom = frame.closest('xp-extension-host-outlet')?.getBoundingClientRect().bottom
    const boundaryBottom =
      typeof hostOutletBottom === 'number' && Number.isFinite(hostOutletBottom)
        ? Math.min(viewportHeight, Math.max(frameTop, hostOutletBottom))
        : viewportHeight - 24

    return Math.max(520, Math.floor(boundaryBottom - frameTop))
  }

  return Math.max(520, viewportHeight - frameTop - 24)
}

function createRemoteTheme(document: Document, mode: RemoteComponentThemeMode): RemoteComponentTheme {
  const rootStyle = document.defaultView?.getComputedStyle(document.documentElement)
  const bodyStyle = document.defaultView?.getComputedStyle(document.body)
  const background = readThemeColor(document, rootStyle, '--background', mode === 'dark' ? '#16181c' : '#fff')
  const foreground = readThemeColor(document, rootStyle, '--foreground', mode === 'dark' ? '#e3e3e3' : '#18181b')
  const card = readThemeColor(document, rootStyle, '--card', background)
  const cardForeground = readThemeColor(document, rootStyle, '--card-foreground', foreground)
  const muted = readThemeColor(document, rootStyle, '--muted', mode === 'dark' ? '#26272b' : '#f4f4f5')
  const mutedForeground = readThemeColor(
    document,
    rootStyle,
    '--muted-foreground',
    mode === 'dark' ? '#a3a3a3' : '#71717a'
  )
  const destructive = readThemeColor(document, rootStyle, '--destructive', mode === 'dark' ? '#f87171' : '#dc2626')
  const radius = readThemeValue(rootStyle, '--radius', '0.625rem')

  return {
    mode,
    tokens: {
      fontFamily:
        readThemeValue(rootStyle, '--font-sans') ||
        bodyStyle?.fontFamily ||
        'Inter, ui-sans-serif, system-ui, sans-serif',
      colorBackground: background,
      colorForeground: foreground,
      colorCard: card,
      colorCardForeground: cardForeground,
      colorMuted: muted,
      colorMutedForeground: mutedForeground,
      colorBorder: readThemeColor(document, rootStyle, '--border', mode === 'dark' ? '#27272a' : '#e4e4e7'),
      colorInput: readThemeColor(document, rootStyle, '--input', mode === 'dark' ? '#52525b' : '#d4d4d8'),
      colorPrimary: readThemeColor(document, rootStyle, '--primary', mode === 'dark' ? '#3b82f6' : '#18181b'),
      colorPrimaryForeground: readThemeColor(document, rootStyle, '--primary-foreground', '#fff'),
      colorDestructive: destructive,
      colorDestructiveBackground:
        mode === 'dark'
          ? 'color-mix(in srgb, var(--xui-color-destructive) 18%, var(--xui-color-background))'
          : 'color-mix(in srgb, var(--xui-color-destructive) 9%, var(--xui-color-background))',
      colorSuccess: '#047857',
      colorSuccessBackground:
        mode === 'dark'
          ? 'color-mix(in srgb, var(--xui-color-success) 18%, var(--xui-color-background))'
          : 'color-mix(in srgb, var(--xui-color-success) 9%, var(--xui-color-background))',
      radiusSm: `calc(${radius} - 4px)`,
      radiusMd: `calc(${radius} - 2px)`,
      radiusLg: radius,
      fontSizeXs: readThemeValue(rootStyle, '--workbench-extension-font-size-xs', '0.75rem'),
      fontSizeSm: readThemeValue(rootStyle, '--workbench-extension-font-size-sm', '0.8125rem'),
      fontSizeMd: readThemeValue(rootStyle, '--workbench-extension-font-size-md', '0.875rem'),
      fontSizeLg: readThemeValue(rootStyle, '--workbench-extension-font-size-lg', '1rem'),
      fontSizeControl: readThemeValue(rootStyle, '--workbench-extension-font-size-control', '0.8125rem'),
      fontSizeButton: readThemeValue(rootStyle, '--workbench-extension-font-size-button', '0.8125rem'),
      fontSizeTable: readThemeValue(rootStyle, '--workbench-extension-font-size-table', '0.8125rem'),
      controlHeight: readThemeValue(rootStyle, '--workbench-extension-control-height', '2rem'),
      buttonHeight: readThemeValue(rootStyle, '--workbench-extension-button-height', '2rem'),
      buttonHeightSm: readThemeValue(rootStyle, '--workbench-extension-button-height-sm', '1.75rem')
    }
  }
}

function readThemeValue(style: CSSStyleDeclaration | null | undefined, name: string, fallback = '') {
  return style?.getPropertyValue(name).trim() || fallback
}

function readThemeColor(
  document: Document,
  style: CSSStyleDeclaration | null | undefined,
  name: string,
  fallback: string
) {
  const value = readThemeValue(style, name)
  if (!value) {
    return fallback
  }
  if (value.startsWith('var(')) {
    return resolveCssColor(document, value) ?? fallback
  }
  if (/^(#|rgb|hsl|oklch|color-mix)/i.test(value)) {
    return value
  }
  return resolveCssColor(document, value) ?? `hsl(${value})`
}

function resolveCssColor(document: Document, value: string) {
  const view = document.defaultView
  if (!view) {
    return null
  }
  const probe = document.createElement('span')
  const probeHost = document.body ?? document.documentElement
  probe.style.color = value
  if (!probe.style.color) {
    return null
  }
  probeHost.appendChild(probe)
  const computedColor = view.getComputedStyle(probe).color
  probe.remove()
  return computedColor && computedColor !== value ? computedColor : null
}
