import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, signal } from '@angular/core'
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ChatKit, ChatKitControl, createChatKit } from '@xpert-ai/chatkit-angular'
import { distinctUntilChanged, firstValueFrom, of, switchMap, tap } from 'rxjs'
import { calculateHash } from '../../../../@shared/utils'
import {
  AuthoringAssistantEffect,
  AuthoringAssistantProfile,
  AuthoringAssistantRequestContext,
  SupportedLocale,
  ToastrService,
  XpertAuthoringAssistantService,
  getErrorMessage
} from '../../../../@core'
import { AppService } from '../../../../app.service'
import { XpertStudioApiService } from '../domain'
import { environment } from '../../../../../environments/environment'

@Component({
  standalone: true,
  selector: 'xpert-studio-assistant',
  imports: [CommonModule, NgmCommonModule, TranslateModule, ChatKit],
  template: `
    @if (xpertId()) {
      @if (open()) {
        <section class="w-[380px] overflow-hidden rounded-2xl border border-divider-regular bg-components-card-bg shadow-xl">
          <div class="flex items-center justify-between gap-3 border-b border-divider-regular px-4 py-3">
            <div>
              <div class="text-sm font-semibold text-text-primary">
                {{ 'PAC.Xpert.Assistant' | translate: { Default: 'Assistant' } }}
              </div>
              <div class="text-xs text-text-secondary">
                {{
                  'PAC.Xpert.StudioAssistantHint'
                    | translate: { Default: 'Ask about the current draft, primary agent, or editing state.' }
                }}
              </div>
            </div>

            <div class="flex items-center gap-2">
              @if (loading()) {
                <ngm-spin class="shrink-0" />
              }
              <button
                type="button"
                class="flex h-8 w-8 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-hover-bg hover:text-text-primary"
                (click)="open.set(false)"
              >
                <i class="ri-close-line text-lg"></i>
              </button>
            </div>
          </div>

          @if (control()) {
            <div class="h-[520px]">
              <xpert-chatkit class="h-full" [control]="control()!" />
            </div>
          } @else {
            <div class="flex h-40 items-center justify-center px-6 text-sm text-text-secondary">
              {{ 'PAC.Xpert.AssistantLoading' | translate: { Default: 'Preparing assistant…' } }}
            </div>
          }
        </section>
      } @else {
        <button
          type="button"
          class="flex items-center gap-2 rounded-full border border-divider-regular bg-components-card-bg px-4 py-2 text-sm font-medium text-text-primary shadow-sm transition-colors hover:bg-hover-bg"
          (click)="open.set(true)"
        >
          <i class="ri-chat-1-line text-base"></i>
          <span>{{ 'PAC.Xpert.Assistant' | translate: { Default: 'Assistant' } }}</span>
        </button>
      }
    }
  `
})
export class XpertStudioAssistantComponent {
  readonly #assistantService = inject(XpertAuthoringAssistantService)
  readonly #studioService = inject(XpertStudioApiService)
  readonly #toastr = inject(ToastrService)
  readonly #translate = inject(TranslateService)
  readonly #appService = inject(AppService)

  readonly open = signal(false)
  readonly loading = signal(false)
  readonly profile = signal<AuthoringAssistantProfile | null>(null)
  readonly control = signal<ChatKitControl | null>(null)
  readonly xpertId = computed(() => this.#studioService.team()?.id ?? null)
  readonly workspaceId = computed(() => this.#studioService.workspaceId())
  readonly draft = computed(() => this.#studioService.viewModel())
  readonly primaryAgent = computed(() => this.#studioService.primaryAgent())
  readonly configuredAssistantId = environment.CHATKIT_XPERT_ID || null
  readonly assistantId = computed(() => this.configuredAssistantId || this.profile()?.assistantId || null)
  readonly frameUrl = computed(() => environment.CHATKIT_FRAME_URL || 'https://app.xpertai.cn/chatkit')
  readonly directApiUrl = computed(() => environment.CHATKIT_API_URL || environment.API_BASE_URL + '/api/ai')
  readonly directApiKey = computed(() => environment.CHATKIT_API_KEY || null)
  readonly locale = computed(() => this.normalizeChatKitLocale(this.#appService.lang() || this.#translate.currentLang))
  readonly theme = computed(() => ({
    colorScheme: this.#appService.theme$().primary === 'dark' ? ('dark' as const) : ('light' as const)
  }))

  constructor() {
    toObservable(this.xpertId)
      .pipe(
        distinctUntilChanged(),
        tap((xpertId) => this.loading.set(!!xpertId)),
        switchMap((xpertId) => {
          if (!xpertId) {
            return of(null)
          }
          if (this.configuredAssistantId) {
            return of({
              profileId: 'studio-agent-edit',
              assistantId: this.configuredAssistantId,
              capabilityFlags: []
            } satisfies AuthoringAssistantProfile)
          }
          return this.#assistantService.getProfile('studio-agent-edit')
        }),
        takeUntilDestroyed()
      )
      .subscribe({
        next: (profile) => {
          this.profile.set(profile)
          this.loading.set(false)
        },
        error: (error) => {
          this.loading.set(false)
          this.#toastr.error(getErrorMessage(error))
        }
      })

    effect(
      () => {
        const open = this.open()
        const xpertId = this.xpertId()
        const assistantId = this.assistantId()
        if (!open || !xpertId || !assistantId) {
          this.control.set(null)
          return
        }

        const control = createChatKit(this.buildChatKitOptions(assistantId))

        this.control.set(control)
      },
      { allowSignalWrites: true }
    )

    effect(() => {
      const open = this.open()
      const control = this.control()
      const assistantId = this.assistantId()
      if (!open || !control || !assistantId) {
        return
      }

      control.setOptions(this.buildChatKitOptions(assistantId))
    })

    effect(() => {
      const assistantId = this.assistantId()
      if (assistantId) {
        console.log('ChatKit xpertId:', assistantId)
      }
    })
  }

  private handleEffect(event: AuthoringAssistantEffect | { name: string; data?: Record<string, unknown> }) {
    if (event.name !== 'refresh_studio') {
      return
    }

    const xpertId = typeof event.data?.['xpertId'] === 'string' ? event.data['xpertId'] : null
    if (xpertId && xpertId !== this.xpertId()) {
      return
    }

    this.#studioService.refresh()
  }

  private currentDraftHash() {
    const draft = this.draft()
    return draft ? calculateHash(JSON.stringify(draft)) : null
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

  private buildChatKitOptions(assistantId: string): Parameters<typeof createChatKit>[0] {
    return {
      frameUrl: this.frameUrl(),
      api: {
        apiUrl: this.directApiUrl(),
        xpertId: assistantId,
        getClientSecret: async () => {
          if (this.directApiKey()) {
            const response = await fetch(this.directApiUrl() + '/v1/chatkit/sessions', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${this.directApiKey()}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({})
            })
            const session = await response.json()
            return session.client_secret
          }
          const session = await firstValueFrom(this.#assistantService.createChatkitSession())
          return session.client_secret
        }
      },
      locale: this.locale(),
      theme: this.theme(),
      header: {
        title: {
          text: this.#translate.instant('PAC.Xpert.Assistant', { Default: 'Assistant' })
        }
      },
      request: {
        context: {
          mode: 'studio-agent-edit',
          workspaceId: this.workspaceId(),
          targetXpertId: this.xpertId(),
          unsaved: this.#studioService.unsaved(),
          clientDraftHash: this.currentDraftHash()
        } satisfies AuthoringAssistantRequestContext
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
