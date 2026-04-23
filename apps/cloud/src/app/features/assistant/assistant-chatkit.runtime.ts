import { DOCUMENT } from '@angular/common'
import { computed, effect, inject, signal, Signal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { TranslateService } from '@ngx-translate/core'
import { ChatKitControl, ChatKitEventHandlers, createChatKit } from '@xpert-ai/chatkit-angular'
import { catchError, map, of, startWith, switchMap } from 'rxjs'
import { environment } from '@cloud/environments/environment'
import {
  AssistantBindingService,
  AssistantBindingSourceScope,
  AssistantCode,
  Store,
  type IResolvedAssistantBinding,
  getErrorMessage,
  ToastrService
} from '../../@core'
import { AppService } from '../../app.service'
import { normalizeAssistantFrameUrl } from './assistant-chatkit-frame-url'

export type AssistantRuntimeStatus = 'idle' | 'loading' | 'ready' | 'missing' | 'disabled' | 'error'

type AssistantLocale = 'en' | 'zh-Hans' | 'zh-Hant'
type AssistantChatKitOptions = Parameters<typeof createChatKit>[0]
type AssistantTheme = NonNullable<AssistantChatKitOptions['theme']>
type AssistantChatKitEventHandlers = ChatKitEventHandlers
type AssistantRequestOptions = NonNullable<AssistantChatKitOptions['request']> & {
  projectId?: string | null
}
type AssistantHostedClientSecret =
  | string
  | {
      secret: string
      organizationId: string
    }
type AssistantHostedChatKitOptions = Omit<AssistantChatKitOptions, 'api' | 'request'> &
  AssistantChatKitEventHandlers & {
  api: {
    apiUrl: string
    xpertId?: string
    getClientSecret: (currentClientSecret: string | null) => Promise<AssistantHostedClientSecret>
  }
  request?: AssistantRequestOptions
}

type AssistantRuntimeInput = {
  assistantCode: Signal<AssistantCode | null>
  projectId?: Signal<string | null>
  requestContext?: Signal<Record<string, unknown> | null>
  history?: AssistantHostedChatKitOptions['history']
  initialThread?: Signal<string | null>
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
  frameUrl: Signal<string | null>
  projectId?: Signal<string | null>
  requestContext?: Signal<Record<string, unknown> | null>
  history?: AssistantHostedChatKitOptions['history']
  initialThread?: Signal<string | null>
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

/**
 * @deprecated Temporary ChatKit compatibility shim.
 * Migrate this into ChatKit once hosted submit forwards request.projectId
 * to the run payload instead of dropping custom top-level request fields.
 */
export function buildHostedAssistantRequestOptions(
  projectId: string | null,
  requestContext: Record<string, unknown> | null
): AssistantRequestOptions {
  const normalizedProjectId = projectId?.trim() || null

  return {
    ...(normalizedProjectId
      ? {
          // Deprecated bridge: mirror projectId into request.state so current
          // ChatKit submit normalization still carries project scope through.
          projectId: normalizedProjectId,
          state: {
            projectId: normalizedProjectId
          }
        }
      : {}),
    context: requestContext ?? {}
  }
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
    projectId: input.projectId,
    requestContext: input.requestContext,
    history: input.history,
    initialThread: input.initialThread,
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
                translate.instant('PAC.Assistant.LoadFailed', { Default: 'Failed to load assistant configuration.' })
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

  const authToken = toSignal(store.token$.pipe(startWith(store.token)), { initialValue: store.token })
  const organizationId = toSignal(store.selectOrganizationId(), { initialValue: store.organizationId ?? null })
  const fixedApiUrl = buildAssistantApiUrl(environment.API_BASE_URL)
  const theme = computed<AssistantTheme>(() => {
    const colorScheme = appService.theme$().primary === 'dark' ? ('dark' as const) : ('light' as const)
    const surfaceFallback = CHATKIT_SURFACE_COLOR_FALLBACKS[colorScheme]

    return {
      colorScheme,
      radius: 'soft',
      color: {
        surface: {
          background: resolveDocumentThemeColorHex(document, '--color-components-card-bg', surfaceFallback.background),
          foreground: resolveDocumentThemeColorHex(document, '--color-text-primary', surfaceFallback.foreground)
        }
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
    const projectId = input.projectId?.() ?? ''

    if (!identity || !assistantId || !frameUrl) {
      return null
    }

    return [identity, assistantId, projectId, frameUrl, fixedApiUrl, authToken() ?? '', organizationId() ?? ''].join(':')
  })

  effect(() => {
    const key = runtimeKey()
    const assistantId = input.assistantId()
    const frameUrl = input.frameUrl()
    const currentTheme = theme()
    const currentLocale = locale()
    const currentToken = authToken() ?? ''
    const currentOrganizationId = organizationId()
    const initialThread = input.initialThread?.() ?? null
    const projectId = input.projectId?.() ?? null
    const requestContext = input.requestContext?.() ?? null

    if (!key || !assistantId || !frameUrl) {
      activeRuntimeKey.set(null)
      control.set(null)
      return
    }

    const options = {
      frameUrl,
      api: {
        apiUrl: fixedApiUrl,
        xpertId: assistantId,
        getClientSecret: async () => buildAssistantClientSecret(currentToken, currentOrganizationId)
      },
      locale: currentLocale,
      theme: currentTheme,
      initialThread,
      header: {
        title: {
          text: translate.instant(input.titleKey, { Default: input.titleDefault })
        }
      },
      history: input.history,
      request: buildHostedAssistantRequestOptions(projectId, requestContext),
      onReady: input.onReady,
      onEffect: input.onEffect,
      onLog: input.onLog,
      onResponseStart: input.onResponseStart,
      onResponseEnd: input.onResponseEnd,
      onThreadChange: input.onThreadChange,
      onThreadLoadStart: input.onThreadLoadStart,
      onThreadLoadEnd: input.onThreadLoadEnd,
      onError: (event: { error?: { message?: string } }) => {
        toastr.error(event?.error?.message || translate.instant('PAC.KEY_WORDS.Error', { Default: 'Error' }))
      }
    } satisfies AssistantHostedChatKitOptions

    if (!control() || activeRuntimeKey() !== key) {
      control.set(createChatKit(options as AssistantChatKitOptions))
      activeRuntimeKey.set(key)
      return
    }

    control()?.setOptions(options as AssistantChatKitOptions)
  })

  return control
}

export function sanitizeAssistantFrameUrl(frameUrl?: string | null) {
  const normalized = frameUrl?.trim()
  if (!normalized || normalized.startsWith('DOCKER_')) {
    return null
  }

  return normalized
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
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  return normalizedBaseUrl ? `${normalizedBaseUrl}/api/ai` : '/api/ai'
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

function normalizeBaseUrl(baseUrl?: string | null) {
  if (!baseUrl) {
    return ''
  }

  const normalized = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
  if (normalized.startsWith('http')) {
    return normalized
  }

  if (normalized.startsWith('//')) {
    const protocol = typeof window === 'undefined' ? 'https:' : window.location.protocol
    return `${protocol}${normalized}`
  }

  return normalized
}
