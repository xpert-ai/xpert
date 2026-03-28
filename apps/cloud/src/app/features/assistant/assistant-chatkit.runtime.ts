import { computed, effect, inject, signal, Signal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { TranslateService } from '@ngx-translate/core'
import { ChatKitControl, ChatKitEventHandlers, createChatKit } from '@xpert-ai/chatkit-angular'
import { catchError, map, of, startWith, switchMap } from 'rxjs'
import { environment } from '@cloud/environments/environment'
import {
  AssistantCode,
  AssistantConfigSourceScope,
  AssistantConfigService,
  Store,
  getErrorMessage,
  ToastrService
} from '../../@core'
import { AppService } from '../../app.service'

export type AssistantRuntimeStatus = 'idle' | 'loading' | 'ready' | 'missing' | 'disabled' | 'error'

type AssistantLocale = 'en' | 'zh-Hans' | 'zh-Hant'
type AssistantTheme = NonNullable<Parameters<typeof createChatKit>[0]['theme']>

type AssistantRuntimeInput = {
  assistantCode: Signal<AssistantCode | null>
  requestContext?: Signal<Record<string, unknown> | null>
  titleKey: string
  titleDefault: string
  onEffect?: NonNullable<ChatKitEventHandlers['onEffect']>
}

export function injectAssistantChatkitRuntime(input: AssistantRuntimeInput) {
  const assistantConfigService = inject(AssistantConfigService)
  const translate = inject(TranslateService)
  const toastr = inject(ToastrService)
  const appService = inject(AppService)
  const store = inject(Store)

  const refreshNonce = signal(0)
  const authToken = toSignal(store.token$.pipe(startWith(store.token)), { initialValue: store.token })
  const fixedApiUrl = buildAssistantApiUrl(environment.API_BASE_URL)
  const requestState = toSignal(
    toObservable(computed(() => ({ code: input.assistantCode(), refreshNonce: refreshNonce() }))).pipe(
      switchMap(({ code }) => {
        if (!code) {
          return of({
            loading: false,
            config: null,
            error: null
          })
        }

        return assistantConfigService.getEffective(code).pipe(
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
            toastr.error(getErrorMessage(error) || 'Failed to load assistant configuration.')
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
  const hasSource = computed(() => !!config()?.sourceScope && config()?.sourceScope !== AssistantConfigSourceScope.NONE)
  const hasCompleteOptions = computed(() => {
    const options = config()?.options
    return !!(options?.assistantId && options?.frameUrl)
  })
  const isConfigured = computed(() => !!config() && !!hasSource() && config()?.enabled && hasCompleteOptions())
  const status = computed<AssistantRuntimeStatus>(() => {
    if (loading()) {
      return 'loading'
    }
    if (requestState().error) {
      return 'error'
    }
    if (!hasSource()) {
      return 'missing'
    }
    if (!config()?.enabled) {
      return 'disabled'
    }
    if (!hasCompleteOptions()) {
      return 'missing'
    }
    return 'ready'
  })

  const locale = computed<AssistantLocale>(() => normalizeChatKitLocale(appService.lang() || translate.currentLang))
  const theme = computed<AssistantTheme>(() => ({
    colorScheme: appService.theme$().primary === 'dark' ? ('dark' as const) : ('light' as const),
    radius: 'soft'
  }))
  const control = signal<ChatKitControl | null>(null)
  const runtimeKey = computed(() => {
    const currentConfig = config()
    if (status() !== 'ready' || !currentConfig?.options) {
      return null
    }

    return [
      input.assistantCode(),
      currentConfig.options.assistantId,
      currentConfig.options.frameUrl,
      fixedApiUrl,
      authToken() ?? ''
    ].join(':')
  })
  const activeRuntimeKey = signal<string | null>(null)

  effect(() => {
    const key = runtimeKey()
    const currentConfig = config()
    const currentTheme = theme()
    const currentLocale = locale()
    const currentToken = authToken() ?? ''
    const requestContext = input.requestContext?.() ?? null

    if (!key || !currentConfig?.options) {
      activeRuntimeKey.set(null)
      control.set(null)
      return
    }

    const options = {
      frameUrl: currentConfig.options.frameUrl,
      api: {
        apiUrl: fixedApiUrl,
        xpertId: currentConfig.options.assistantId,
        getClientSecret: async () => currentToken
      },
      locale: currentLocale,
      theme: currentTheme,
      header: {
        title: {
          text: translate.instant(input.titleKey, { Default: input.titleDefault })
        }
      },
      request: {
        context: requestContext ?? {}
      },
      onEffect: input.onEffect,
      onError: (event: { error?: { message?: string } }) => {
        toastr.error(event?.error?.message || translate.instant('PAC.KEY_WORDS.Error', { Default: 'Error' }))
      }
    } satisfies Parameters<typeof createChatKit>[0]

    if (!control() || activeRuntimeKey() !== key) {
      control.set(createChatKit(options))
      activeRuntimeKey.set(key)
      return
    }

    control()?.setOptions(options)
  })

  return {
    config,
    control,
    hasSource,
    isConfigured,
    loading,
    refresh: () => refreshNonce.update((value) => value + 1),
    status
  }
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

function buildAssistantApiUrl(baseUrl?: string | null) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  return normalizedBaseUrl ? `${normalizedBaseUrl}/api/ai` : '/api/ai'
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
