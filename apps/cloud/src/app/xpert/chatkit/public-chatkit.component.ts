import { Location } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { ActivatedRoute } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { ChatKit } from '@xpert-ai/chatkit-angular'
import { firstValueFrom, startWith } from 'rxjs'
import { environment } from '@cloud/environments/environment'
import { IXpert, Store, XpertAPIService } from '../../@core'
import { injectHostedAssistantChatkitControl, sanitizeAssistantFrameUrl } from '../../features/assistant/assistant-chatkit.runtime'

@Component({
  standalone: true,
  selector: 'xpert-public-chatkit',
  imports: [ChatKit, TranslateModule],
  host: {
    class: 'block h-dvh min-h-0 min-w-0 flex-1 bg-background-default'
  },
  template: `
    @if (control(); as chatkitControl) {
      <xpert-chatkit class="block h-full min-h-0 w-full" [control]="chatkitControl" />
    } @else {
      <div class="flex h-full min-h-0 items-center justify-center px-6 text-sm text-text-secondary">
        {{ 'PAC.Xpert.AssistantLoading' | translate: { Default: 'Preparing assistant...' } }}
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PublicChatkitComponent {
  readonly #route = inject(ActivatedRoute)
  readonly #location = inject(Location)
  readonly #store = inject(Store)
  readonly #xpertService = inject(XpertAPIService)

  readonly #routeData = toSignal(this.#route.data, { initialValue: this.#route.snapshot.data })
  readonly #paramMap = toSignal(this.#route.paramMap, { initialValue: this.#route.snapshot.paramMap })
  readonly #authToken = toSignal(this.#store.token$.pipe(startWith(this.#store.token)), {
    initialValue: this.#store.token
  })
  readonly #organizationId = toSignal(this.#store.selectOrganizationId(), {
    initialValue: this.#store.organizationId ?? null
  })

  readonly identifier = computed(() => this.#paramMap().get('name'))
  readonly threadId = computed(() => this.#paramMap().get('id'))
  readonly xpert = computed(() => {
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
    titleKey: 'PAC.Xpert.ChatApp',
    titleDefault: 'Chat App',
    startScreen: this.startScreen,
    onThreadChange: ({ threadId }) => {
      this.syncThreadUrl(threadId)
    }
  })

  private async getClientSecret(currentClientSecret: string | null) {
    const xpert = this.xpert()
    if (!xpert) {
      throw new Error('Missing xpert for public ChatKit session.')
    }

    if (xpert.app?.public) {
      const identifier = this.identifier() || xpert.slug || xpert.id
      const session = await firstValueFrom(this.#xpertService.createPublicChatkitSession(identifier, currentClientSecret))

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

    const baseUrl = `/x-chatkit/x/${encodeURIComponent(slug)}`
    const targetUrl = threadId ? `${baseUrl}/c/${encodeURIComponent(threadId)}` : baseUrl

    if (this.#location.path() !== targetUrl) {
      this.#location.replaceState(targetUrl)
    }
  }
}

function isRoutedXpert(value: unknown): value is IXpert {
  return !!value && typeof value === 'object' && 'id' in value && typeof value.id === 'string'
}

function normalizeOptionalString(value?: string | null) {
  const normalized = value?.trim()
  return normalized || undefined
}
