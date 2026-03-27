import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, input, signal } from '@angular/core'
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop'
import { Router } from '@angular/router'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ChatKit, ChatKitControl, createChatKit } from '@xpert-ai/chatkit-angular'
import { distinctUntilChanged, firstValueFrom, of, switchMap, tap } from 'rxjs'
import { environment } from '../../../../../environments/environment'
import {
  AuthoringAssistantEffect,
  AuthoringAssistantRequestContext,
  SupportedLocale,
  ToastrService,
  XpertAuthoringAssistantService,
  getErrorMessage
} from '../../../../@core'
import { AppService } from '../../../../app.service'

@Component({
  standalone: true,
  selector: 'xpert-workspace-assistant',
  imports: [CommonModule, NgmCommonModule, TranslateModule, ChatKit],
  template: `
    @if (workspaceId()) {
      <div
        class="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex justify-end p-3 sm:inset-x-auto sm:inset-y-0 sm:right-4 sm:items-start sm:pb-4 sm:pt-24"
      >
        @if (open()) {
          <section
            class="pointer-events-auto flex h-[70vh] w-full max-w-[420px] flex-col overflow-hidden rounded-2xl border border-divider-regular bg-components-card-bg shadow-xl sm:h-full"
          >
            <div class="flex items-start justify-between gap-3 border-b border-divider-regular px-4 py-3">
              <div class="min-w-0">
                <div class="flex items-center gap-2 text-sm font-semibold text-text-primary">
                  <span
                    class="flex h-8 w-8 items-center justify-center rounded-full bg-background-default-subtle text-primary-600"
                  >
                    <i class="ri-chat-1-line text-base"></i>
                  </span>
                  <span>{{ 'PAC.Xpert.Assistant' | translate: { Default: 'Assistant' } }}</span>
                </div>
                <div class="mt-1 text-xs leading-5 text-text-secondary">
                  {{
                    'PAC.Xpert.WorkspaceCreateAssistantHint'
                      | translate
                        : { Default: 'Describe the expert you want, and the assistant will create a draft and open Studio.' }
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
                  <i class="ri-layout-right-line text-lg"></i>
                </button>
              </div>
            </div>

            @if (control()) {
              <div class="min-h-0 flex-1">
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
            class="pointer-events-auto flex items-center gap-2 rounded-full border border-divider-regular bg-components-card-bg px-3 py-2 text-sm font-medium text-text-primary shadow-lg transition-colors hover:bg-hover-bg"
            (click)="open.set(true)"
          >
            <span
              class="flex h-8 w-8 items-center justify-center rounded-full bg-background-default-subtle text-primary-600"
            >
              <i class="ri-chat-1-line text-base"></i>
            </span>
            @if (!isMobile()) {
              <span>{{ 'PAC.Xpert.Assistant' | translate: { Default: 'Assistant' } }}</span>
            }
          </button>
        }
      </div>
    }
  `
})
export class XpertWorkspaceAssistantComponent {
  readonly workspaceId = input<string | null>(null)

  readonly #assistantService = inject(XpertAuthoringAssistantService)
  readonly #router = inject(Router)
  readonly #toastr = inject(ToastrService)
  readonly #translate = inject(TranslateService)
  readonly #appService = inject(AppService)

  readonly profile = signal<{ assistantId: string } | null>(null)
  readonly control = signal<ChatKitControl | null>(null)
  readonly loading = signal(false)
  readonly open = signal(true)
  readonly isMobile = this.#appService.isMobile
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
    toObservable(this.workspaceId)
      .pipe(
        distinctUntilChanged(),
        tap(() => this.loading.set(!!this.workspaceId())),
        switchMap((workspaceId) => {
          if (!workspaceId) {
            return of(null)
          }
          if (this.configuredAssistantId) {
            return of({ assistantId: this.configuredAssistantId })
          }
          return this.#assistantService.getProfile('workspace-create')
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
        const workspaceId = this.workspaceId()
        const assistantId = this.assistantId()
        if (!open || !workspaceId || !assistantId) {
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
    if (event.name !== 'navigate_to_studio') {
      return
    }

    const xpertId = typeof event.data?.['xpertId'] === 'string' ? event.data['xpertId'] : null
    if (!xpertId) {
      return
    }

    void this.#router.navigate(['/xpert/x', xpertId, 'agents'])
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
          mode: 'workspace-create',
          workspaceId: this.workspaceId(),
          targetXpertId: null,
          unsaved: false,
          clientDraftHash: null
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
