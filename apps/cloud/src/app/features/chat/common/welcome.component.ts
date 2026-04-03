import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { Router, RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { startWith } from 'rxjs'
import { AssistantCode, Store } from '../../../@core'
import { UserPipe } from '../../../@shared/pipes'
import { getAssistantRegistryItem } from '../../assistant/assistant.registry'
import { injectAssistantChatkitRuntime } from '../../assistant/assistant-chatkit.runtime'
import { ChatXpertsComponent } from '../xperts/xperts.component'

@Component({
  standalone: true,
  selector: 'pac-chat-common-welcome',
  imports: [CommonModule, ReactiveFormsModule, RouterModule, TranslateModule, ChatXpertsComponent, UserPipe],
  template: `<section class="flex min-h-0 flex-1 flex-col overflow-auto bg-background-default">
    <div class="flex min-h-0 flex-1 items-center justify-center px-4 pb-12 pt-10">
      <div class="flex w-full max-w-5xl flex-col items-center gap-8">
        <div class="max-w-4xl text-center">
          <h1
            class="text-balance text-3xl font-medium leading-tight tracking-tight text-text-primary sm:text-4xl lg:text-6xl"
          >
            {{ 'PAC.Chat.Greeting_' + greeting() | translate: { Default: greeting() } }}, {{ user() | user }}.
            <span class="block text-text-secondary">
              {{ 'PAC.Chat.HowCanHelpYouToday' | translate: { Default: 'How can I help you today?' } }}
            </span>
          </h1>
        </div>

        <pac-chat-xperts class="w-full max-w-5xl" />

        <div
          class="flex w-full max-w-4xl flex-col gap-4 rounded-[28px] border border-dashed border-divider-regular bg-background-default-subtle px-6 py-5"
        >
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div class="min-w-0 flex-1">
              <div class="text-xs uppercase tracking-[0.24em] text-text-tertiary">
                {{ 'PAC.Assistant.ChatCommon.Label' | translate: { Default: definition.defaultLabel } }}
              </div>
              <div class="mt-2 text-lg font-semibold text-text-primary">
                {{ definition.titleKey | translate: { Default: definition.defaultTitle } }}
              </div>
              <div class="mt-2 max-w-2xl text-sm text-text-secondary">
                @switch (status()) {
                  @case ('loading') {
                    {{ 'PAC.Xpert.AssistantLoading' | translate: { Default: 'Preparing assistant…' } }}
                  }
                  @case ('disabled') {
                    {{
                      'PAC.Assistant.DisabledDesc'
                        | translate
                          : { Default: 'This assistant is configured but currently disabled for the active organization.' }
                    }}
                  }
                  @case ('error') {
                    {{
                      'PAC.Assistant.ErrorDesc'
                        | translate
                          : { Default: 'Check the assistant configuration and try again from the common chat page.' }
                    }}
                  }
                  @case ('missing') {
                    {{
                      'PAC.Assistant.MissingDesc'
                        | translate
                          : {
                              Default:
                                'Configure the Common assistant in Settings / Assistants before starting a conversation here.'
                            }
                    }}
                  }
                  @default {
                    {{
                      definition.descriptionKey
                        | translate
                          : {
                              Default: definition.defaultDescription
                            }
                    }}
                  }
                }
              </div>
            </div>

            <a
              class="inline-flex items-center rounded-full border border-divider-regular px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-hover-bg"
              [routerLink]="assistantsRoute"
            >
              {{ 'PAC.Assistant.OpenSettings' | translate: { Default: 'Open Assistant Settings' } }}
            </a>
          </div>

          @if (showStatusTitle()) {
            <div
              class="inline-flex items-center gap-2 self-start rounded-full border border-divider-regular bg-components-card-bg px-3 py-1.5 text-xs font-medium text-text-secondary"
            >
              <i [class]="statusIcon()"></i>
              <span>{{ statusTitleKey() | translate: { Default: statusTitleDefault() } }}</span>
            </div>
          }
        </div>
      </div>
    </div>

    @if (showComposer()) {
      <div class="w-full px-2 pb-3 md:px-4 lg:px-8">
        <div class="mx-auto w-full max-w-[800px]">
          <form
            class="overflow-hidden rounded-[28px] border border-divider-regular bg-components-card-bg shadow-sm sm:shadow-md"
            (submit)="submitFromForm($event)"
          >
            <div class="px-6 pt-6 text-2xl text-text-secondary sm:text-3xl">
              {{ 'PAC.Chat.HowCanHelp' | translate: { Default: 'How can Xpert help?' } }}
            </div>

            <div class="px-4 pb-4 pt-4 sm:px-6 sm:pb-6">
              <textarea
                [formControl]="promptControl"
                rows="4"
                dir="auto"
                class="w-full resize-none rounded-[24px] border border-divider-regular bg-background-default px-4 py-3 text-base text-text-primary outline-none transition-colors focus:border-components-input-border-active"
                [placeholder]="'PAC.Chat.HowCanHelp' | translate: { Default: 'How can Xpert help?' }"
                (keydown)="triggerFun($event)"
                (compositionstart)="onCompositionStart()"
                (compositionend)="onCompositionEnd()"
              ></textarea>

              <div class="mt-4 flex justify-end">
                <button
                  type="submit"
                  class="flex h-10 w-10 items-center justify-center rounded-full border border-divider-regular bg-components-card-bg text-text-primary transition-transform enabled:hover:scale-110 enabled:hover:bg-hover-bg disabled:cursor-default disabled:opacity-20"
                  [disabled]="!canSubmit()"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M7 11L12 6L17 11M12 18V7"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    ></path>
                  </svg>
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    }
  </section>`,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatCommonWelcomeComponent {
  readonly #router = inject(Router)
  readonly #store = inject(Store)

  readonly definition = getAssistantRegistryItem(AssistantCode.CHAT_COMMON) ?? {
    code: AssistantCode.CHAT_COMMON,
    featureKeys: [],
    management: 'system',
    labelKey: 'PAC.Assistant.ChatCommon.Label',
    defaultLabel: 'Common Assistant',
    titleKey: 'PAC.Chat.Common',
    defaultTitle: 'Common',
    descriptionKey: 'PAC.Assistant.ChatCommon.Description',
    defaultDescription: 'Embedded assistant used by the common chat page.'
  }
  readonly assistantCode = signal(AssistantCode.CHAT_COMMON)
  readonly assistantsRoute = ['/settings/assistants']
  readonly user = toSignal(this.#store.user$, { initialValue: null })
  readonly promptControl = new FormControl('', { nonNullable: true })
  readonly prompt = toSignal(this.promptControl.valueChanges.pipe(startWith(this.promptControl.getRawValue())), {
    initialValue: this.promptControl.getRawValue()
  })
  readonly isComposing = signal(false)

  readonly runtime = injectAssistantChatkitRuntime({
    assistantCode: this.assistantCode.asReadonly(),
    titleKey: this.definition.titleKey,
    titleDefault: this.definition.defaultTitle,
    history: {
      enabled: false,
      showDelete: false,
      showRename: false
    }
  })

  readonly status = this.runtime.status
  readonly showComposer = computed(() => this.status() === 'ready')
  readonly canSubmit = computed(() => this.status() === 'ready' && !!this.prompt().trim())
  readonly showStatusTitle = computed(() => this.status() !== 'ready')
  readonly statusTitleKey = computed(() => {
    switch (this.status()) {
      case 'loading':
        return 'PAC.Xpert.AssistantLoading'
      case 'disabled':
        return 'PAC.Assistant.DisabledTitle'
      case 'error':
        return 'PAC.Assistant.LoadFailed'
      case 'missing':
        return 'PAC.Assistant.MissingTitle'
      default:
        return ''
    }
  })
  readonly statusTitleDefault = computed(() => {
    switch (this.status()) {
      case 'loading':
        return 'Preparing assistant…'
      case 'disabled':
        return 'Assistant disabled'
      case 'error':
        return 'Failed to load assistant configuration.'
      case 'missing':
        return 'Assistant not configured'
      default:
        return ''
    }
  })
  readonly statusIcon = computed(() => {
    switch (this.status()) {
      case 'loading':
        return 'ri-loader-4-line animate-spin'
      case 'disabled':
        return 'ri-pause-circle-line'
      case 'error':
        return 'ri-error-warning-line'
      case 'missing':
        return 'ri-settings-3-line'
      default:
        return 'ri-robot-line'
    }
  })
  readonly greeting = computed(() => {
    const now = new Date()
    const hours = now.getHours()

    if (hours >= 5 && hours < 12) {
      return 'Good morning'
    }
    if (hours >= 12 && hours < 18) {
      return 'Good afternoon'
    }
    if (hours >= 18 && hours < 22) {
      return 'Good evening'
    }

    return 'Good'
  })

  newConv() {
    this.promptControl.setValue('')
  }

  async submit() {
    const input = this.prompt().trim()
    if (!input || this.status() !== 'ready') {
      return
    }

    this.promptControl.setValue('')
    await this.#router.navigate(['/chat/x/common'], { state: { input } })
  }

  submitFromForm(event: Event) {
    event.preventDefault()
    void this.submit()
  }

  triggerFun(event: KeyboardEvent) {
    if (this.isComposing() || (event.isComposing && event.key === 'Enter') || event.shiftKey) {
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      void this.submit()
    }
  }

  onCompositionStart() {
    this.isComposing.set(true)
  }

  onCompositionEnd() {
    this.isComposing.set(false)
  }
}
