import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { NavigationEnd, Router } from '@angular/router'
import { ChatKitTheme, injectWorkspace } from '@metad/cloud/state'
import { TranslateService } from '@ngx-translate/core'
import { ChatKitControl, createChatKit } from '@xpert-ai/chatkit-angular'
import { SupportedLocale, ToastrService, XpertAPIService } from 'apps/cloud/src/app/@core'
import { AppService } from 'apps/cloud/src/app/app.service'
import { distinctUntilChanged, EMPTY, filter, map, startWith, switchMap } from 'rxjs'
import { environment } from 'apps/cloud/src/environments/environment'
import { ChatKitEffectEvent, getChatKitEffectXpertId } from '../utils'

type AssistantRouteState = {
  workspaceRouteId: string | null
  xpertRouteId: string | null
}

export type AssistantContext = {
  workspaceId: string | null
  xpertId: string | null
}

type ChatKitVisualOptions = {
  locale: SupportedLocale
  theme: ChatKitTheme
}

type StudioRefreshEvent = {
  xpertId: string | null
  nonce: number
}

@Injectable()
export class XpertAssistantFacade {
  readonly #router = inject(Router)
  readonly #translate = inject(TranslateService)
  readonly #toastr = inject(ToastrService)
  readonly #appService = inject(AppService)
  readonly #xpertService = inject(XpertAPIService)
  readonly #selectedWorkspace = injectWorkspace()

  readonly open = signal(false)
  readonly control = signal<ChatKitControl | null>(null)
  readonly isMobile = this.#appService.isMobile
  readonly configuredAssistantId = environment.CHATKIT_XPERT_ID || null
  readonly frameUrl = computed(() => environment.CHATKIT_FRAME_URL || 'https://app.xpertai.cn/chatkit')
  readonly directApiUrl = computed(() => environment.CHATKIT_API_URL || environment.API_BASE_URL + '/api/ai')
  readonly directApiKey = computed(() => environment.CHATKIT_API_KEY || null)
  readonly locale = computed(() => this.normalizeChatKitLocale(this.#appService.lang() || this.#translate.currentLang))
  readonly theme = computed<ChatKitTheme>(() => ({
    colorScheme: this.#appService.theme$().primary === 'dark' ? ('dark' as const) : ('light' as const),
    radius: 'soft'
  }))
  readonly assistantId = computed(() => this.configuredAssistantId || null)

  readonly #routeState = toSignal(
    this.#router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      startWith(null),
      map(() => this.readRouteState())
    ),
    { initialValue: this.readRouteState() }
  )
  readonly #xpertWorkspaceCache = signal<Record<string, string | null>>({})
  readonly #studioRefresh = signal<StudioRefreshEvent | null>(null)
  readonly xpertId = computed(() => this.#routeState().xpertRouteId)
  readonly workspaceId = computed(() => {
    const routeState = this.#routeState()
    const selectedWorkspaceId = this.#selectedWorkspace()?.id ?? null
    const cachedWorkspaceId = routeState.xpertRouteId ? this.#xpertWorkspaceCache()[routeState.xpertRouteId] ?? null : null

    return routeState.workspaceRouteId ?? cachedWorkspaceId ?? (!routeState.xpertRouteId ? selectedWorkspaceId : null)
  })

  readonly context = computed<AssistantContext>(() => {
    return {
      workspaceId: this.workspaceId(),
      xpertId: this.xpertId()
    }
  })

  readonly studioRefresh = this.#studioRefresh.asReadonly()

  constructor() {
    effect(
      () => {
        const assistantId = this.assistantId()
        const workspaceId = this.workspaceId()

        if (!assistantId) {
          this.control.set(null)
          return
        }

        const context = untracked<AssistantContext>(() => ({
          workspaceId,
          xpertId: this.xpertId()
        }))
        this.control.set(
          createChatKit(untracked(() => this.buildChatKitOptions(assistantId, context)))
        )
      },
      { allowSignalWrites: true }
    )

    effect(() => {
      const control = this.control()
      const assistantId = this.assistantId()
      const locale = this.locale()
      const theme = this.theme()

      if (!control || !assistantId) {
        return
      }

      const context = untracked<AssistantContext>(() => ({
        workspaceId: this.workspaceId(),
        xpertId: this.xpertId()
      }))

      control.setOptions(
        untracked(() => this.buildChatKitOptions(assistantId, context, { locale, theme }))
      )
    })

    this.watchXpertWorkspace()
  }

  setOpen(open: boolean) {
    this.open.set(open)
  }

  emitStudioRefresh(xpertId: string | null) {
    this.#studioRefresh.set({
      xpertId,
      nonce: Date.now()
    })
  }

  handleEffect(event: ChatKitEffectEvent) {
    switch (event.name) {
      case 'navigate_to_studio': {
        const xpertId = getChatKitEffectXpertId(event)
        if (!xpertId) {
          return
        }

        this.setOpen(false)
        void this.#router.navigate(['/xpert/x', xpertId, 'agents'])
        return
      }
      case 'refresh_studio': {
        this.emitStudioRefresh(getChatKitEffectXpertId(event) ?? this.context().xpertId)
        return
      }
      default: {
        return
      }
    }
  }

  private watchXpertWorkspace() {
    this.#router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        startWith(null),
        map(() => this.readRouteState().xpertRouteId),
        distinctUntilChanged(),
        switchMap((xpertId) => {
          if (!xpertId || this.#xpertWorkspaceCache()[xpertId] !== undefined) {
            return EMPTY
          }

          return this.#xpertService.getTeam(xpertId).pipe(
            map((team) => ({
              xpertId,
              workspaceId: team.workspaceId ?? null
            }))
          )
        }),
        takeUntilDestroyed()
      )
      .subscribe({
        next: ({ xpertId, workspaceId }) => {
          this.#xpertWorkspaceCache.update((cache) => ({
            ...cache,
            [xpertId]: workspaceId
          }))
        }
      })
  }

  private readRouteState(): AssistantRouteState {
    const url = this.#router.url.split('?')[0]
    const workspaceMatch = url.match(/^\/xpert\/w\/([^/]+)/)
    const xpertMatch = url.match(/^\/xpert\/x\/([^/]+)/)

    return {
      workspaceRouteId: workspaceMatch?.[1] ?? null,
      xpertRouteId: xpertMatch?.[1] ?? null
    }
  }

  private normalizeChatKitLocale(locale?: string | null): SupportedLocale {
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
        return 'en'
      default:
        return 'en'
    }
  }

  private buildChatKitOptions(
    assistantId: string,
    context: AssistantContext,
    visualOptions?: ChatKitVisualOptions
  ): Parameters<typeof createChatKit>[0] {
    return {
      frameUrl: this.frameUrl(),
      api: {
        apiUrl: this.directApiUrl(),
        xpertId: assistantId,
        getClientSecret: async () => this.directApiKey() || ''
      },
      locale: visualOptions?.locale ?? this.locale(),
      theme: visualOptions?.theme ?? this.theme(),
      header: {
        title: {
          text: this.#translate.instant('PAC.Xpert.Assistant', { Default: 'Assistant' })
        }
      },
      request: {
        context: {
          env: {
            workspaceId: context.workspaceId,
            xpertId: context.xpertId
          }
        }
      },
      onEffect: (event) => {
        this.handleEffect(event)
      },
      onError: (event) => {
        const message = event?.error?.message || this.#translate.instant('PAC.KEY_WORDS.Error', { Default: 'Error' })
        this.#toastr.error(message)
      }
    }
  }
}
