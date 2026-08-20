import { Location } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { ActivatedRoute } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ChatKit } from '@xpert-ai/chatkit-angular'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'
import { firstValueFrom, startWith } from 'rxjs'
import { environment } from '@cloud/environments/environment'
import {
  IXpert,
  Store,
  TEnterpriseH5AccountBindingRequired,
  TEnterpriseH5ChatkitSession,
  TEnterpriseH5Platform,
  TPublicChatkitSession,
  XpertAPIService
} from '../../@core'
import {
  injectHostedAssistantChatkitControl,
  sanitizeAssistantFrameUrl
} from '../../features/assistant/assistant-chatkit.runtime'
import {
  ENTERPRISE_H5_CLIENT_ADAPTERS,
  provideEnterpriseH5ClientAdapters,
  resolveEnterpriseH5Platform
} from './enterprise-h5-adapter'

@Component({
  standalone: true,
  selector: 'xpert-public-chatkit',
  imports: [ChatKit, TranslateModule, ZardButtonComponent],
  host: {
    class: 'block h-dvh min-h-0 min-w-0 flex-1 bg-background-default'
  },
  template: `
    @if (error(); as message) {
      <div
        class="flex h-full min-h-0 flex-col items-center justify-center gap-4 px-6 text-center text-sm text-text-secondary"
      >
        <div>
          {{ message }}
        </div>
        @if (channel() === 'enterprise-h5') {
          <button z-button zType="secondary" type="button" (click)="retryEnterpriseH5Bootstrap()">
            {{ 'XP.ACTIONS.Refresh' | translate: { Default: 'Try again' } }}
          </button>
        }
      </div>
    } @else if (control(); as chatkitControl) {
      <xpert-chatkit class="block h-full min-h-0 w-full" [control]="chatkitControl" />
    } @else {
      <div class="flex h-full min-h-0 items-center justify-center px-6 text-sm text-text-secondary">
        {{ 'XP.Xpert.AssistantLoading' | translate: { Default: 'Preparing assistant...' } }}
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: provideEnterpriseH5ClientAdapters()
})
export class PublicChatkitComponent {
  readonly #route = inject(ActivatedRoute)
  readonly #location = inject(Location)
  readonly #store = inject(Store)
  readonly #xpertService = inject(XpertAPIService)
  readonly #enterpriseH5Adapters = inject(ENTERPRISE_H5_CLIENT_ADAPTERS)
  readonly #translate = inject(TranslateService)

  readonly #routeData = toSignal(this.#route.data, { initialValue: this.#route.snapshot.data })
  readonly #paramMap = toSignal(this.#route.paramMap, { initialValue: this.#route.snapshot.paramMap })
  readonly #authToken = toSignal(this.#store.token$.pipe(startWith(this.#store.token)), {
    initialValue: this.#store.token
  })
  readonly #organizationId = toSignal(this.#store.selectOrganizationId(), {
    initialValue: this.#store.organizationId ?? null
  })
  readonly #enterpriseH5Bootstrap = signal<{
    xpert: IXpert
    platform: TEnterpriseH5Platform
    clientConfig: Record<string, unknown>
  } | null>(null)
  readonly #enterpriseH5Session = signal<TPublicChatkitSession | null>(null)
  #loadedEnterpriseH5Route: string | null = null

  readonly error = signal<string | null>(null)

  readonly identifier = computed(() => this.#paramMap().get('name'))
  readonly threadId = computed(() => this.#paramMap().get('id'))
  readonly channel = computed(() => (this.#routeData()?.['channel'] === 'enterprise-h5' ? 'enterprise-h5' : 'web'))
  readonly platform = computed(() =>
    this.channel() === 'enterprise-h5' ? resolveEnterpriseH5Platform(this.#paramMap().get('platform')) : null
  )
  readonly xpert = computed(() => {
    if (this.channel() === 'enterprise-h5') {
      return this.#enterpriseH5Bootstrap()?.xpert ?? null
    }
    const value = this.#routeData()?.['xpert']
    return isRoutedXpert(value) ? value : null
  })
  readonly title = computed(() => {
    const xpert = this.xpert()
    return xpert?.title || xpert?.titleCN || xpert?.name || xpert?.slug || 'Assistant'
  })
  readonly startScreen = computed(() => {
    const xpert = this.xpert()
    if (!xpert) {
      return null
    }

    const opener = xpert.features?.opener
    const questions = opener?.enabled ? opener.questions : xpert.starters
    const prompts = (questions ?? [])
      .filter((question): question is string => typeof question === 'string' && !!question.trim())
      .map((question) => ({
        label: question,
        prompt: question
      }))

    return {
      greeting: (opener?.enabled ? opener.message : null) || xpert.description || this.title(),
      prompts
    }
  })

  readonly control = injectHostedAssistantChatkitControl({
    identity: computed(() => {
      const xpert = this.xpert()
      if (!xpert?.id) {
        return null
      }

      if (this.channel() === 'enterprise-h5') {
        const platform = this.platform()
        const session = this.#enterpriseH5Session()
        return platform && session?.client_secret ? `enterprise-h5:${platform}:${xpert.id}` : null
      }

      if (!xpert.app?.public && !this.#authToken()?.trim()) {
        return null
      }

      return `public-chatkit:${xpert.id}:${xpert.app?.public ? 'public' : 'account'}`
    }),
    assistantId: computed(() => this.xpert()?.id ?? null),
    frameUrl: computed(() => sanitizeAssistantFrameUrl(environment.CHATKIT_FRAME_URL)),
    initialThread: this.threadId,
    getClientSecret: (currentClientSecret) => this.getClientSecret(currentClientSecret),
    title: this.title,
    titleKey: 'XP.Xpert.ChatApp',
    titleDefault: 'Chat App',
    startScreen: this.startScreen,
    layout: {
      maxWidth: '960px'
    },
    workbench: {
      enabled: true
    },
    onThreadChange: ({ threadId }) => {
      this.syncThreadUrl(threadId)
    }
  })

  constructor() {
    effect(() => {
      const channel = this.channel()
      const identifier = this.identifier()
      const platform = this.platform()
      const routeKey = platform && identifier ? `${platform}:${identifier}` : null
      if (channel !== 'enterprise-h5' || !routeKey || this.#loadedEnterpriseH5Route === routeKey) {
        return
      }
      this.#loadedEnterpriseH5Route = routeKey
      untracked(() => void this.loadEnterpriseH5Bootstrap(identifier, platform))
    })
  }

  private async getClientSecret(currentClientSecret: string | null) {
    const xpert = this.xpert()
    if (!xpert) {
      throw new Error('Missing xpert for public ChatKit session.')
    }

    if (this.channel() === 'enterprise-h5') {
      const bootstrap = this.#enterpriseH5Bootstrap()
      const platform = this.platform()
      if (!bootstrap || !platform || bootstrap.platform !== platform) {
        throw new Error('Missing enterprise H5 ChatKit bootstrap.')
      }
      const identifier = this.identifier() || xpert.slug || xpert.id
      const existingSession = this.#enterpriseH5Session()
      if (!currentClientSecret && existingSession?.client_secret) {
        return toHostedClientSecret(existingSession, xpert.id)
      }
      const session = await this.createEnterpriseH5Session(identifier, platform, bootstrap.clientConfig)
      this.#enterpriseH5Session.set(session)
      return toHostedClientSecret(session, xpert.id)
    }

    if (xpert.app?.public) {
      const identifier = this.identifier() || xpert.slug || xpert.id
      const session = await firstValueFrom(
        this.#xpertService.createPublicChatkitSession(identifier, currentClientSecret)
      )

      if (!session.client_secret) {
        throw new Error('Missing client_secret in public ChatKit session response.')
      }

      return {
        secret: session.client_secret,
        organizationId: normalizeOptionalString(session.organizationId),
        xpertId: session.xpertId || xpert.id,
        assistantId: session.assistantId || xpert.id
      }
    }

    const token = this.#authToken()?.trim()
    if (!token) {
      throw new Error('User token is required to open this ChatKit app.')
    }

    return {
      secret: token,
      organizationId: normalizeOptionalString(this.#organizationId() || xpert.organizationId),
      xpertId: xpert.id,
      assistantId: xpert.id
    }
  }

  private syncThreadUrl(threadId: string | null) {
    const slug = this.xpert()?.slug || this.identifier()
    if (!slug) {
      return
    }

    const platform = this.platform()
    const baseUrl =
      this.channel() === 'enterprise-h5' && platform
        ? `/x-chatkit/h5/${encodeURIComponent(platform)}/${encodeURIComponent(slug)}`
        : `/x-chatkit/x/${encodeURIComponent(slug)}`
    const targetUrl = threadId ? `${baseUrl}/c/${encodeURIComponent(threadId)}` : baseUrl

    if (this.#location.path() !== targetUrl) {
      this.#location.replaceState(targetUrl)
    }
  }

  async retryEnterpriseH5Bootstrap() {
    const identifier = this.identifier()
    const platform = this.platform()
    if (!identifier || !platform) {
      return
    }
    const routeKey = `${platform}:${identifier}`
    this.#loadedEnterpriseH5Route = routeKey
    await this.loadEnterpriseH5Bootstrap(identifier, platform, routeKey)
  }

  protected redirectToLocation(location: string) {
    window.location.assign(location)
  }

  private async startAccountBinding(providerId: string) {
    const startUrl = await this.resolveAccountBindingStartUrl(providerId)
    const returnTo = this.#location.path()
    if (returnTo.startsWith('/') && !returnTo.startsWith('//')) {
      startUrl.searchParams.set('returnTo', returnTo)
    }
    this.redirectToLocation(startUrl.toString())
  }

  private async resolveAccountBindingStartUrl(providerId: string) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const discovery = await firstValueFrom(this.#xpertService.getSsoProviders())
        const provider = discovery.providers.find((item) => item.provider === providerId)
        if (provider?.startUrl) {
          return new URL(provider.startUrl, window.location.origin)
        }
      } catch {
        // Retry once because plugin provider registration can be briefly unavailable during startup.
      }
    }

    throw new Error(`SSO provider '${providerId}' is unavailable.`)
  }

  private async loadEnterpriseH5Bootstrap(
    identifier: string,
    platform: TEnterpriseH5Platform,
    routeKey = `${platform}:${identifier}`
  ) {
    this.error.set(null)
    this.#enterpriseH5Bootstrap.set(null)
    this.#enterpriseH5Session.set(null)
    let bootstrap
    try {
      bootstrap = await firstValueFrom(this.#xpertService.getEnterpriseH5Bootstrap(identifier, platform))
    } catch {
      if (this.currentEnterpriseH5RouteKey() === routeKey) {
        this.#loadedEnterpriseH5Route = null
        this.error.set(
          this.#translate.instant('XP.Xpert.EnterpriseH5AppUnavailable', {
            Default: 'This enterprise digital expert is unavailable or not configured.'
          })
        )
      }
      return
    }

    if (this.currentEnterpriseH5RouteKey() !== routeKey) {
      return
    }
    this.#enterpriseH5Bootstrap.set(bootstrap)

    try {
      const session = await this.createEnterpriseH5Session(identifier, platform, bootstrap.clientConfig)
      if (this.currentEnterpriseH5RouteKey() === routeKey) {
        this.#enterpriseH5Session.set(session)
      }
    } catch {
      if (this.currentEnterpriseH5RouteKey() === routeKey) {
        this.#loadedEnterpriseH5Route = null
        this.#enterpriseH5Session.set(null)
        this.error.set(
          this.#translate.instant('XP.Xpert.EnterpriseH5SessionUnavailable', {
            Default: 'Unable to verify your enterprise identity for this digital expert.'
          })
        )
      }
    }
  }

  private async createEnterpriseH5Session(
    identifier: string,
    platform: TEnterpriseH5Platform,
    clientConfig: Record<string, unknown>
  ) {
    const adapter = this.#enterpriseH5Adapters.find((item) => item.platform === platform)
    if (!adapter) {
      throw new Error(`Enterprise H5 platform '${platform}' is not supported.`)
    }
    const grant = await adapter.requestIdentityGrant(clientConfig)
    const session = await firstValueFrom(this.#xpertService.createEnterpriseH5Session(identifier, platform, grant))
    if (requiresEnterpriseH5AccountBinding(session)) {
      await this.startAccountBinding(session.accountBindingProvider)
      throw new Error('Enterprise H5 account binding is required.')
    }
    if (!session.client_secret) {
      throw new Error('Missing client_secret in enterprise H5 ChatKit session response.')
    }
    return session
  }

  private currentEnterpriseH5RouteKey() {
    const identifier = this.identifier()
    const platform = this.platform()
    return identifier && platform ? `${platform}:${identifier}` : null
  }
}

function isRoutedXpert(value: unknown): value is IXpert {
  return !!value && typeof value === 'object' && 'id' in value && typeof value.id === 'string'
}

function requiresEnterpriseH5AccountBinding(
  session: TEnterpriseH5ChatkitSession
): session is TEnterpriseH5AccountBindingRequired {
  return 'status' in session && session.status === 'account_binding_required'
}

function normalizeOptionalString(value?: string | null) {
  const normalized = value?.trim()
  return normalized || undefined
}

function toHostedClientSecret(session: TPublicChatkitSession, fallbackXpertId: string) {
  return {
    secret: session.client_secret,
    organizationId: normalizeOptionalString(session.organizationId),
    xpertId: session.xpertId || fallbackXpertId,
    assistantId: session.assistantId || fallbackXpertId
  }
}
