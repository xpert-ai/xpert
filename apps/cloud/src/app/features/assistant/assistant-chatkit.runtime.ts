import { DOCUMENT } from '@angular/common'
import { computed, effect, inject, signal, Signal, untracked } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { TranslateService } from '@ngx-translate/core'
import { ChatKitControl, ChatKitEventHandlers, createChatKit } from '@xpert-ai/chatkit-angular'
import type { ChatKitMessageNavigationOptions, ChatKitOptions } from '@xpert-ai/chatkit-types'
import { catchError, firstValueFrom, map, of, startWith, switchMap } from 'rxjs'
import { environment } from '@cloud/environments/environment'
import {
  AssistantBindingService,
  AssistantBindingSourceScope,
  AssistantCode,
  Store,
  type IResolvedAssistantBinding,
  getErrorMessage,
  resolveAbsoluteApiBaseUrl,
  ToastrService
} from '../../@core'
import { AppService } from '../../app.service'
import { ArtifactService } from '../../@core/services/artifact.service'
import { normalizeAssistantFrameUrl } from './assistant-chatkit-frame-url'

export type AssistantRuntimeStatus = 'idle' | 'loading' | 'ready' | 'missing' | 'disabled' | 'error'

type AssistantLocale = 'en' | 'zh-Hans' | 'zh-Hant'
type AssistantChatKitEventHandlers = ChatKitEventHandlers
type AssistantMcpAppsOptions = {
  sandboxProxyUrl?: string
  allowedDomains?: string[]
}
type AssistantChatKitOptions = ChatKitOptions & {
  messageNavigation?: ChatKitMessageNavigationOptions
  mcpApps?: AssistantMcpAppsOptions
} & AssistantChatKitEventHandlers
type AssistantTheme = NonNullable<AssistantChatKitOptions['theme']>
type AssistantHostedClientSecret =
  | string
  | {
      secret: string
      organizationId?: string
      xpertId?: string
      assistantId?: string
    }
type AssistantChatKitWorkbenchOptions = {
  enabled?: boolean
  onClientCommand?: (request: {
    commandKey: string
    payload?: unknown
    hostType: 'agent'
    hostId: string
    viewKey: string
  }) => unknown | Promise<unknown>
}
type AssistantHostedChatKitOptions = Omit<AssistantChatKitOptions, 'api' | 'workbench'> &
  AssistantChatKitEventHandlers & {
    api: {
      apiUrl: string
      xpertId?: string
      /** Pins every hosted ChatKit conversation and run to one Chat Project. */
      projectId?: string
      getClientSecret: (currentClientSecret: string | null) => Promise<AssistantHostedClientSecret>
    }
    workbench?: AssistantChatKitWorkbenchOptions
  }

type AssistantRuntimeInput = {
  assistantCode: Signal<AssistantCode | null>
  requestContext?: Signal<Record<string, unknown> | null>
  displayMode?: AssistantHostedChatKitOptions['displayMode']
  history?: AssistantHostedChatKitOptions['history']
  initialThread?: Signal<string | null>
  layout?: AssistantHostedChatKitOptions['layout']
  pet?: AssistantHostedChatKitOptions['pet']
  titleKey: string
  titleDefault: string
  onReady?: NonNullable<AssistantChatKitEventHandlers['onReady']>
  onEffect?: NonNullable<AssistantChatKitEventHandlers['onEffect']>
  onLog?: NonNullable<AssistantChatKitEventHandlers['onLog']>
  onResponseStart?: NonNullable<AssistantChatKitEventHandlers['onResponseStart']>
  onResponseEnd?: NonNullable<AssistantChatKitEventHandlers['onResponseEnd']>
  onThreadChange?: NonNullable<AssistantChatKitEventHandlers['onThreadChange']>
  onThreadLoadStart?: NonNullable<AssistantChatKitEventHandlers['onThreadLoadStart']>
  onThreadLoadEnd?: NonNullable<AssistantChatKitEventHandlers['onThreadLoadEnd']>
}

type AssistantBindingRuntimeInput = {
  assistantCode: Signal<AssistantCode | null>
}

type AssistantHostedRuntimeInput = {
  identity: Signal<string | null>
  assistantId: Signal<string | null>
  /** Reactive Project scope; changing it recreates the hosted ChatKit binding. */
  projectId?: Signal<string | null>
  frameUrl: Signal<string | null>
  getClientSecret?: AssistantHostedChatKitOptions['api']['getClientSecret']
  requestContext?: Signal<Record<string, unknown> | null>
  displayMode?: AssistantHostedChatKitOptions['displayMode']
  history?: AssistantHostedChatKitOptions['history']
  initialThread?: Signal<string | null>
  layout?: AssistantHostedChatKitOptions['layout']
  pet?: AssistantHostedChatKitOptions['pet']
  taskSummary?: AssistantHostedChatKitOptions['taskSummary']
  workbench?: AssistantHostedChatKitOptions['workbench']
  startScreen?: Signal<AssistantHostedChatKitOptions['startScreen'] | null>
  title?: Signal<string | null>
  titleKey: string
  titleDefault: string
  onReady?: NonNullable<AssistantChatKitEventHandlers['onReady']>
  onEffect?: NonNullable<AssistantChatKitEventHandlers['onEffect']>
  onLog?: NonNullable<AssistantChatKitEventHandlers['onLog']>
  onResponseStart?: NonNullable<AssistantChatKitEventHandlers['onResponseStart']>
  onResponseEnd?: NonNullable<AssistantChatKitEventHandlers['onResponseEnd']>
  onThreadChange?: NonNullable<AssistantChatKitEventHandlers['onThreadChange']>
  onThreadLoadStart?: NonNullable<AssistantChatKitEventHandlers['onThreadLoadStart']>
  onThreadLoadEnd?: NonNullable<AssistantChatKitEventHandlers['onThreadLoadEnd']>
}

export function injectAssistantChatkitRuntime(input: AssistantRuntimeInput) {
  const bindingRuntime = injectAssistantBindingRuntimeState({
    assistantCode: input.assistantCode
  })
  const { config, hasSource, isConfigured, loading, refresh, status } = bindingRuntime
  const frameUrl = computed(() => sanitizeAssistantFrameUrl(environment.CHATKIT_FRAME_URL))

  const control = injectHostedAssistantChatkitControl({
    identity: computed(() => (status() === 'ready' ? input.assistantCode() : null)),
    assistantId: computed(() => config()?.assistantId ?? null),
    frameUrl,
    requestContext: input.requestContext,
    displayMode: input.displayMode,
    history: input.history,
    initialThread: input.initialThread,
    layout: input.layout,
    pet: input.pet,
    titleKey: input.titleKey,
    titleDefault: input.titleDefault,
    onReady: input.onReady,
    onEffect: input.onEffect,
    onLog: input.onLog,
    onResponseStart: input.onResponseStart,
    onResponseEnd: input.onResponseEnd,
    onThreadChange: input.onThreadChange,
    onThreadLoadStart: input.onThreadLoadStart,
    onThreadLoadEnd: input.onThreadLoadEnd
  })

  return {
    config,
    control,
    hasSource,
    isConfigured,
    loading,
    refresh,
    status
  }
}

export function injectAssistantBindingRuntimeState(input: AssistantBindingRuntimeInput) {
  const assistantBindingService = inject(AssistantBindingService)
  const translate = inject(TranslateService)
  const toastr = inject(ToastrService)
  const frameUrl = computed(() => sanitizeAssistantFrameUrl(environment.CHATKIT_FRAME_URL))

  const refreshNonce = signal(0)
  const requestState = toSignal(
    toObservable(
      computed(() => ({
        code: input.assistantCode(),
        refreshNonce: refreshNonce()
      }))
    ).pipe(
      switchMap(({ code }) => {
        if (!code) {
          return of({
            loading: false,
            config: null,
            error: null
          })
        }

        return assistantBindingService.getEffective(code).pipe(
          map((config) => ({
            loading: false,
            config,
            error: null
          })),
          startWith({
            loading: true,
            config: null,
            error: null
          }),
          catchError((error) => {
            toastr.error(
              getErrorMessage(error) ||
                translate.instant('XP.Assistant.LoadFailed', { Default: 'Failed to load assistant configuration.' })
            )
            return of({
              loading: false,
              config: null,
              error
            })
          })
        )
      })
    ),
    {
      initialValue: {
        loading: false,
        config: null,
        error: null
      }
    }
  )

  const config = computed(() => requestState().config)
  const loading = computed(() => requestState().loading)
  const hasSource = computed(() => hasAssistantBindingSource(config()))
  const hasCompleteConfiguration = computed(() => hasCompleteAssistantBinding(config(), frameUrl()))
  const isConfigured = computed(() => !!config() && !!hasSource() && config()?.enabled && hasCompleteConfiguration())
  const status = computed<AssistantRuntimeStatus>(() => {
    if (loading()) {
      return 'loading'
    }
    if (requestState().error) {
      return 'error'
    }
    if (!frameUrl()) {
      return 'error'
    }
    if (!hasSource()) {
      return 'missing'
    }
    if (!config()?.enabled) {
      return 'disabled'
    }
    if (!hasCompleteConfiguration()) {
      return 'missing'
    }
    return 'ready'
  })

  return {
    config,
    hasSource,
    isConfigured,
    loading,
    refresh: () => refreshNonce.update((value) => value + 1),
    status
  }
}

export function injectHostedAssistantChatkitControl(input: AssistantHostedRuntimeInput) {
  const document = inject(DOCUMENT)
  const translate = inject(TranslateService)
  const toastr = inject(ToastrService)
  const appService = inject(AppService)
  const store = inject(Store)
  const artifactService = inject(ArtifactService, { optional: true })

  const authToken = toSignal(store.token$.pipe(startWith(store.token)), { initialValue: store.token })
  const organizationId = toSignal(store.selectOrganizationId(), { initialValue: store.organizationId ?? null })
  const fixedApiUrl = buildAssistantApiUrl(environment.API_BASE_URL)
  const theme = computed<AssistantTheme>(() => {
    const colorScheme = appService.theme$().primary === 'dark' ? ('dark' as const) : ('light' as const)
    const surfaceFallback = CHATKIT_SURFACE_COLOR_FALLBACKS[colorScheme]

    return {
      colorScheme,
      radius: 'soft',
      density: 'compact',
      color: {
        surface: {
          background: resolveDocumentThemeColorHex(document, '--color-components-card-bg', surfaceFallback.background),
          foreground: resolveDocumentThemeColorHex(document, '--color-text-primary', surfaceFallback.foreground)
        }
      },
      typography: {
        baseSize: 14
      }
    }
  })
  const locale = computed<AssistantLocale>(() => normalizeChatKitLocale(appService.lang() || translate.currentLang))
  const control = signal<ChatKitControl | null>(null)
  const activeRuntimeKey = signal<string | null>(null)
  const runtimeKey = computed(() => {
    const identity = input.identity()
    const assistantId = input.assistantId()
    const frameUrl = input.frameUrl()
    const projectId = input.projectId?.() ?? null

    if (!identity || !assistantId || !frameUrl) {
      return null
    }

    // Project identity participates in the binding key so switching projects
    // cannot reuse a ChatKit instance, client secret, or conversation history.
    return [
      identity,
      assistantId,
      projectId ?? '',
      frameUrl,
      fixedApiUrl,
      authToken() ?? '',
      organizationId() ?? ''
    ].join(':')
  })

  effect(() => {
    const key = runtimeKey()
    const assistantId = input.assistantId()
    const frameUrl = input.frameUrl()
    const currentTheme = theme()
    const currentLocale = locale()
    const currentToken = authToken() ?? ''
    const currentOrganizationId = organizationId()
    // A route-level thread change is applied through ChatKitControl.setThreadId by the host.
    // Keep initialThread non-reactive here so switching conversations does not rebuild all ChatKit options.
    const initialThread = untracked(() => input.initialThread?.() ?? null)
    const requestContext = input.requestContext?.() ?? null
    const projectId = input.projectId?.() ?? null
    const startScreen = input.startScreen?.() ?? undefined
    const title = input.title?.()?.trim() || translate.instant(input.titleKey, { Default: input.titleDefault })
    const currentControl = untracked(() => control())
    const currentRuntimeKey = untracked(() => activeRuntimeKey())
    const mcpApps = resolveAssistantMcpAppsOptions(
      environment.MCP_APP_SANDBOX_PROXY_URL,
      environment.MCP_APP_SANDBOX_ALLOWED_DOMAINS
    )

    if (!key || !assistantId || !frameUrl) {
      if (currentRuntimeKey !== null) activeRuntimeKey.set(null)
      if (currentControl !== null) control.set(null)
      return
    }

    const options = {
      frameUrl,
      api: {
        apiUrl: fixedApiUrl,
        xpertId: assistantId,
        ...(projectId ? { projectId } : {}),
        getClientSecret: async (currentClientSecret) =>
          input.getClientSecret
            ? input.getClientSecret(currentClientSecret)
            : buildAssistantClientSecret(currentToken, currentOrganizationId)
      },
      locale: currentLocale,
      theme: currentTheme,
      displayMode: input.displayMode,
      layout: input.layout,
      pet: input.pet,
      taskSummary: input.taskSummary,
      workbench: input.workbench,
      ...(mcpApps ? { mcpApps } : {}),
      toolOutputAttachments: {
        onRequestPreview: async ({ attachment }) => {
          if (!artifactService) {
            throw new Error('Artifact previews are unavailable in this host')
          }
          const link = await firstValueFrom(
            artifactService.createSignedVersionPreviewLink(attachment.artifactId, attachment.artifactVersionId)
          )
          const version = link.version
          if (link.artifactId !== attachment.artifactId || version?.id !== attachment.artifactVersionId) {
            throw new Error('The Artifact preview did not resolve the requested immutable version')
          }
          if (version.sha256 && version.sha256 !== attachment.sha256) {
            throw new Error('The Artifact preview checksum does not match the tool output')
          }
          return {
            previewUrl: link.publicUrl,
            ...(link.expiresAt ? { expiresAt: toIsoDate(link.expiresAt) } : {})
          }
        }
      },
      messageNavigation: {
        enabled: true
      },
      initialThread,
      header: {
        title: {
          text: title
        }
      },
      history: input.history,
      startScreen,
      composer: {
        attachments: {
          enabled: true,
          maxCount: 5,
          maxSize: 10 * 1024 * 1024
        },
        tools: []
      },
      request: {
        context: requestContext ?? {}
      },
      onReady: input.onReady,
      onEffect: input.onEffect,
      onLog: input.onLog,
      onResponseStart: input.onResponseStart,
      onResponseEnd: input.onResponseEnd,
      onThreadChange: input.onThreadChange,
      onThreadLoadStart: input.onThreadLoadStart,
      onThreadLoadEnd: input.onThreadLoadEnd,
      onError: (event: { error?: { message?: string } }) => {
        toastr.error(event?.error?.message || translate.instant('XP.KEY_WORDS.Error', { Default: 'Error' }))
      }
    } satisfies AssistantHostedChatKitOptions

    if (!currentControl || currentRuntimeKey !== key) {
      control.set(createChatKit(options as AssistantChatKitOptions))
      activeRuntimeKey.set(key)
      return
    }

    currentControl.setOptions(options as AssistantChatKitOptions)
  })

  return control
}

function toIsoDate(value: string | Date) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

export function sanitizeAssistantFrameUrl(frameUrl?: string | null) {
  const normalized = frameUrl?.trim()
  if (!normalized || normalized.startsWith('DOCKER_')) {
    return null
  }

  return normalized
}

export function resolveAssistantMcpAppsOptions(
  sandboxProxyUrl?: string | null,
  allowedDomains?: string | null
): AssistantMcpAppsOptions | null {
  const normalizedUrl = sandboxProxyUrl?.trim()
  if (!normalizedUrl || normalizedUrl.startsWith('DOCKER_')) {
    return null
  }

  const domains = (allowedDomains ?? '')
    .split(',')
    .map((domain) => domain.trim().toLowerCase())
    .filter((domain, index, values) => !!domain && !domain.startsWith('DOCKER_') && values.indexOf(domain) === index)

  return {
    sandboxProxyUrl: normalizedUrl,
    ...(domains.length ? { allowedDomains: domains } : {})
  }
}

export function hasAssistantBindingSource(config?: IResolvedAssistantBinding | null) {
  return !!config?.sourceScope && config.sourceScope !== AssistantBindingSourceScope.NONE
}

export function hasCompleteAssistantBinding(config?: IResolvedAssistantBinding | null, frameUrl?: string | null) {
  return !!(config?.assistantId && normalizeAssistantFrameUrl(frameUrl))
}

function normalizeChatKitLocale(locale?: string | null): AssistantLocale {
  switch (locale) {
    case 'zh':
    case 'zh-CN':
    case 'zh-Hans':
      return 'zh-Hans'
    case 'zh-HK':
    case 'zh-TW':
    case 'zh-Hant':
      return 'zh-Hant'
    case 'en-US':
    case 'en':
    default:
      return 'en'
  }
}

const CHATKIT_SURFACE_COLOR_FALLBACKS = {
  light: {
    background: '#ffffff',
    foreground: '#1f1f1f'
  },
  dark: {
    background: '#16181c',
    foreground: '#e3e3e3'
  }
} as const

function resolveDocumentThemeColorHex(document: Document, cssVariableName: string, fallback: string) {
  const rootStyle = document.defaultView?.getComputedStyle(document.documentElement)
  const rawValue = rootStyle?.getPropertyValue(cssVariableName).trim()

  return normalizeColorToHex(document, rawValue || fallback) ?? fallback
}

function normalizeColorToHex(document: Document, value?: string | null) {
  const normalizedValue = value?.trim()

  if (!normalizedValue) {
    return null
  }

  const hexColor = normalizeHexColor(normalizedValue)

  if (hexColor) {
    return hexColor
  }

  const view = document.defaultView

  if (!view) {
    return null
  }

  const probe = document.createElement('span')
  const probeHost = document.body ?? document.documentElement

  probe.style.color = normalizedValue
  probeHost.appendChild(probe)

  const computedColor = view.getComputedStyle(probe).color
  probe.remove()

  return normalizeRgbColor(computedColor)
}

function normalizeHexColor(value: string) {
  const match = value.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)

  if (!match) {
    return null
  }

  const [, hex] = match
  const expandedHex = hex.length === 3 ? [...hex].map((character) => character + character).join('') : hex

  return `#${expandedHex.toLowerCase()}`
}

function normalizeRgbColor(value: string) {
  const match = value.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i)

  if (!match) {
    return null
  }

  const channels = match.slice(1, 4).map((channel) => Number(channel).toString(16).padStart(2, '0'))

  return `#${channels.join('')}`
}

function buildAssistantApiUrl(baseUrl?: string | null) {
  return `${resolveAbsoluteApiBaseUrl(baseUrl)}/api/ai`
}

function buildAssistantClientSecret(secret: string, organizationId?: string | null): AssistantHostedClientSecret {
  if (!organizationId) {
    return secret
  }

  return {
    secret,
    organizationId
  }
}
