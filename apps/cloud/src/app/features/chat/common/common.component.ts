import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core'
import { Router, RouterModule } from '@angular/router'
import { AssistantCode, type IXpert } from '../../../@core'
import { EmojiAvatarComponent } from '../../../@shared/avatar'
import { TranslateModule } from '@ngx-translate/core'
import { ChatKit, type ChatKitControl } from '@xpert-ai/chatkit-angular'
import { getAssistantRegistryItem } from '../../assistant/assistant.registry'
import { injectAssistantChatkitRuntime } from '../../assistant/assistant-chatkit.runtime'
import { ChatHomeService } from '../home.service'

type PendingCommonConversation = {
  id: number
  text: string
  attempts: number
}

@Component({
  standalone: true,
  selector: 'pac-chat-common-assistant',
  imports: [CommonModule, RouterModule, TranslateModule, ChatKit, EmojiAvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex h-full flex-col gap-4 overflow-hidden p-4">
      <section class="rounded-3xl border border-divider-regular bg-components-card-bg shadow-sm">
        <div class="flex flex-col gap-5 border-b border-divider-regular px-5 py-5 xl:flex-row xl:items-start xl:justify-between">
          <div class="min-w-0 flex-1">
            <div class="text-xs uppercase tracking-[0.24em] text-text-tertiary">
              {{ definition.labelKey | translate: { Default: definition.defaultLabel } }}
            </div>

            <div class="mt-3 flex items-start gap-4">
              @if (activeAssistant()) {
                <emoji-avatar
                  [avatar]="activeAssistant()?.avatar"
                  class="mt-1 h-12 w-12 shrink-0 overflow-hidden rounded-2xl border border-divider-regular shadow-sm"
                />
              } @else {
                <div
                  class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-divider-regular bg-background-default-subtle text-text-secondary"
                >
                  <i class="ri-robot-line text-xl"></i>
                </div>
              }

              <div class="min-w-0">
                <div class="text-2xl font-semibold text-text-primary sm:text-3xl">
                  {{ displayTitle() || (definition.titleKey | translate: { Default: definition.defaultTitle }) }}
                </div>
                <p class="mt-2 max-w-3xl text-sm text-text-secondary">
                  {{
                    displayDescription()
                      || (definition.descriptionKey
                        | translate
                          : {
                              Default: definition.defaultDescription
                            })
                  }}
                </p>
              </div>
            </div>
          </div>

          <div class="flex shrink-0 items-center gap-3">
            <button
              type="button"
              class="inline-flex items-center rounded-full border border-divider-regular px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-hover-bg"
              (click)="newConv()"
            >
              {{ 'PAC.Chat.NewChat' | translate: { Default: 'New Chat' } }}
            </button>

            <a
              class="inline-flex items-center rounded-full border border-divider-regular px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-hover-bg"
              [routerLink]="assistantsRoute"
            >
              {{ 'PAC.Assistant.OpenSettings' | translate: { Default: 'Open Assistant Settings' } }}
            </a>
          </div>
        </div>

        <div class="grid gap-3 px-5 py-5 md:grid-cols-3">
          <div class="rounded-2xl border border-divider-regular bg-background-default-subtle p-4">
            <div class="text-xs uppercase tracking-[0.18em] text-text-tertiary">
              {{ 'PAC.Assistant.EffectiveSource' | translate: { Default: 'Effective Source' } }}
            </div>
            <div class="mt-2 text-sm font-medium text-text-primary">
              {{ sourceLabel() | translate: { Default: sourceLabelDefault() } }}
            </div>
          </div>

          <div class="rounded-2xl border border-divider-regular bg-background-default-subtle p-4">
            <div class="text-xs uppercase tracking-[0.18em] text-text-tertiary">
              {{ 'PAC.Assistant.EffectiveStatus' | translate: { Default: 'Effective Status' } }}
            </div>
            <div class="mt-2 text-sm font-medium text-text-primary">
              {{ statusLabel() | translate: { Default: statusLabelDefault() } }}
            </div>
          </div>

          <div class="rounded-2xl border border-divider-regular bg-background-default-subtle p-4">
            <div class="text-xs uppercase tracking-[0.18em] text-text-tertiary">
              {{ 'PAC.Assistant.ActiveAssistant' | translate: { Default: 'Active Assistant' } }}
            </div>
            <div class="mt-2 text-sm font-medium text-text-primary">
              {{ assistantIdentity() || ('PAC.Assistant.NotConfigured' | translate: { Default: 'Not Configured' }) }}
            </div>
          </div>
        </div>
      </section>

      <section
        class="min-h-0 flex-1 overflow-hidden rounded-3xl border border-divider-regular bg-components-card-bg shadow-sm"
      >
        @switch (status()) {
          @case ('ready') {
            <xpert-chatkit class="h-full min-h-[32rem]" [control]="control()!" />
          }
          @case ('loading') {
            <div class="flex h-full min-h-[32rem] items-center justify-center px-6 text-sm text-text-secondary">
              {{ 'PAC.Xpert.AssistantLoading' | translate: { Default: 'Preparing assistant…' } }}
            </div>
          }
          @case ('disabled') {
            <div class="flex h-full min-h-[32rem] flex-col items-center justify-center px-6 text-center">
              <i class="ri-pause-circle-line text-3xl text-text-tertiary"></i>
              <div class="mt-4 text-base font-medium text-text-primary">
                {{ 'PAC.Assistant.DisabledTitle' | translate: { Default: 'Assistant disabled' } }}
              </div>
              <div class="mt-2 max-w-sm text-sm text-text-secondary">
                {{
                  'PAC.Assistant.DisabledDesc'
                    | translate
                      : { Default: 'This assistant is configured but currently disabled for the active organization.' }
                }}
              </div>
            </div>
          }
          @case ('error') {
            <div class="flex h-full min-h-[32rem] flex-col items-center justify-center px-6 text-center">
              <i class="ri-error-warning-line text-3xl text-text-tertiary"></i>
              <div class="mt-4 text-base font-medium text-text-primary">
                {{ 'PAC.Assistant.LoadFailed' | translate: { Default: 'Failed to load assistant configuration.' } }}
              </div>
              <div class="mt-2 max-w-sm text-sm text-text-secondary">
                {{
                  'PAC.Assistant.ErrorDesc'
                    | translate
                      : { Default: 'Check the assistant configuration and try again from the common chat page.' }
                }}
              </div>
            </div>
          }
          @default {
            <div class="flex h-full min-h-[32rem] flex-col items-center justify-center px-6 text-center">
              <i class="ri-settings-3-line text-3xl text-text-tertiary"></i>
              <div class="mt-4 text-base font-medium text-text-primary">
                {{ 'PAC.Assistant.MissingTitle' | translate: { Default: 'Assistant not configured' } }}
              </div>
              <div class="mt-2 max-w-sm text-sm text-text-secondary">
                {{
                  'PAC.Assistant.MissingDesc'
                    | translate
                      : {
                          Default: 'Configure the Common assistant in Settings / Assistants before starting a conversation here.'
                        }
                }}
              </div>
            </div>
          }
        }
      </section>
    </div>
  `
})
export class ChatCommonAssistantComponent {
  readonly #router = inject(Router)
  readonly #homeService = inject(ChatHomeService)

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
  readonly assistantsRoute = ['/settings/assistants']
  readonly assistantCode = signal(AssistantCode.CHAT_COMMON)
  readonly pendingConversation = signal<PendingCommonConversation | null>(this.readPendingConversation())
  readonly startingConversationId = signal<number | null>(null)
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

  readonly control = this.runtime.control
  readonly config = this.runtime.config
  readonly status = this.runtime.status
  readonly xperts = this.#homeService.sortedXperts
  readonly activeAssistant = computed<IXpert | null>(() => {
    const assistantId = this.config()?.assistantId
    return assistantId ? this.xperts()?.find((xpert) => xpert.id === assistantId) ?? null : null
  })
  readonly displayTitle = computed(() => this.activeAssistant()?.title || this.activeAssistant()?.name || null)
  readonly displayDescription = computed(() => this.activeAssistant()?.description || null)
  readonly assistantIdentity = computed(
    () => this.activeAssistant()?.title || this.activeAssistant()?.name || this.config()?.assistantId || null
  )
  readonly sourceLabel = computed(() => {
    switch (this.config()?.sourceScope) {
      case 'organization':
        return 'PAC.Assistant.OrganizationOverride'
      case 'tenant':
        return 'PAC.Assistant.TenantDefault'
      default:
        return 'PAC.Assistant.NotConfigured'
    }
  })
  readonly sourceLabelDefault = computed(() => {
    switch (this.config()?.sourceScope) {
      case 'organization':
        return 'Organization Override'
      case 'tenant':
        return 'Tenant Default'
      default:
        return 'Not Configured'
    }
  })
  readonly statusLabel = computed(() => {
    switch (this.status()) {
      case 'ready':
        return 'PAC.Assistant.Enabled'
      case 'disabled':
        return 'PAC.KEY_WORDS.Disabled'
      case 'loading':
        return 'PAC.Xpert.AssistantLoading'
      case 'error':
        return 'PAC.Assistant.LoadFailed'
      default:
        return 'PAC.Assistant.NotConfigured'
    }
  })
  readonly statusLabelDefault = computed(() => {
    switch (this.status()) {
      case 'ready':
        return 'Enabled'
      case 'disabled':
        return 'Disabled'
      case 'loading':
        return 'Preparing assistant…'
      case 'error':
        return 'Failed to load assistant configuration.'
      default:
        return 'Not Configured'
    }
  })

  constructor() {
    effect((onCleanup) => {
      const pendingConversation = this.pendingConversation()
      const control = this.control()

      if (
        !pendingConversation ||
        this.status() !== 'ready' ||
        !control ||
        this.startingConversationId() === pendingConversation.id
      ) {
        return
      }

      let cancelled = false
      const timer = setTimeout(() => {
        if (cancelled) {
          return
        }

        void this.beginPendingConversation(pendingConversation, control)
      })

      onCleanup(() => {
        cancelled = true
        clearTimeout(timer)
      })
    })
  }

  async newConv() {
    this.pendingConversation.set(null)

    const control = this.control()
    if (!control) {
      return
    }

    await control.setThreadId(null)
    await control.focusComposer()
  }

  private readPendingConversation(): PendingCommonConversation | null {
    const input = this.#router.getCurrentNavigation()?.extras.state?.['input']
    if (typeof input !== 'string' || !input.trim()) {
      return null
    }

    return {
      id: Date.now(),
      text: input.trim(),
      attempts: 0
    }
  }

  private async beginPendingConversation(pendingConversation: PendingCommonConversation, control: ChatKitControl) {
    if (this.pendingConversation()?.id !== pendingConversation.id) {
      return
    }

    if (pendingConversation.attempts >= 3) {
      this.pendingConversation.set(null)
      return
    }

    this.startingConversationId.set(pendingConversation.id)

    try {
      await this.waitForChatkitMount(control)
      await control.setThreadId(null)
      await control.sendUserMessage({
        text: pendingConversation.text,
        newThread: true
      })

      if (this.pendingConversation()?.id === pendingConversation.id) {
        this.pendingConversation.set(null)
      }
    } catch {
      if (this.pendingConversation()?.id === pendingConversation.id) {
        this.pendingConversation.update((state) =>
          state && state.id === pendingConversation.id ? { ...state, attempts: state.attempts + 1 } : state
        )
      }
    } finally {
      if (this.startingConversationId() === pendingConversation.id) {
        this.startingConversationId.set(null)
      }
    }
  }

  private async waitForChatkitMount(control: ChatKitControl) {
    for (let index = 0; index < 12; index++) {
      if (control.element) {
        return
      }

      await new Promise<void>((resolve) => setTimeout(resolve, 16))
    }
  }
}
