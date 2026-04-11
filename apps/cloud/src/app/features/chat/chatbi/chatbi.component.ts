import { CommonModule } from '@angular/common'
import { Component, Injectable, computed, effect, inject, signal } from '@angular/core'
import { RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { provideOcapCore } from '@xpert-ai/ocap-angular/core'
import { ChatKit } from '@xpert-ai/chatkit-angular'
import { firstValueFrom } from 'rxjs'
import { AssistantCode, IXpert, XpertAPIService } from '../../../@core'
import { provideOcap } from '../../../@core/providers/ocap'
import { ChatToolCallChunkComponent } from '../../../@shared/chat'
import { ChatService, XpertOcapService } from '../../../xpert'
import { ChatMessageDashboardComponent } from '../../../xpert/ai-message/dashboard/dashboard.component'
import { getAssistantRegistryItem } from '../../assistant/assistant.registry'
import { injectAssistantChatkitRuntime } from '../../assistant/assistant-chatkit.runtime'
import { ChatBiTraceFacade } from './chatbi-trace.facade'

@Injectable()
class ChatBiDashboardChatService {
  readonly conversation = signal(null)
  readonly xpert = signal(null)

  isPublic() {
    return false
  }
}

@Component({
  standalone: true,
  selector: 'pac-chat-bi',
  imports: [
    CommonModule,
    RouterModule,
    TranslateModule,
    ChatKit,
    ChatToolCallChunkComponent,
    ChatMessageDashboardComponent
  ],
  providers: [
    ChatBiTraceFacade,
    ChatBiDashboardChatService,
    { provide: ChatService, useExisting: ChatBiDashboardChatService },
    provideOcapCore(),
    provideOcap(),
    XpertOcapService
  ],
  template: `
    <div class="flex h-full flex-col gap-4 overflow-hidden p-4 lg:grid lg:grid-cols-[minmax(0,1fr)_420px]">
      <section class="order-2 flex min-h-0 flex-col overflow-hidden rounded-3xl lg:order-1">
        <div class="border-b border-divider-regular px-5 py-4">
          <div class="text-xl font-semibold text-text-primary">
            {{ displayTitle() || (definition.labelKey | translate: { Default: definition.defaultLabel }) }}
          </div>
          <p class="mt-2 max-w-2xl text-sm text-text-secondary">
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

        <div class="flex flex-1 min-h-0 flex-col overflow-hidden px-5 py-4">
          <div class="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-text-tertiary">
            <i class="ri-terminal-window-line text-base"></i>
            <span>{{ 'PAC.ChatBI.ComputerTrace' | translate: { Default: 'Thread Activity' } }}</span>
          </div>

          <div class="mt-4 min-h-0 flex-1 overflow-auto pr-1">
            @if (traceSteps().length) {
              <div class="space-y-3">
                @for (step of traceSteps(); track step.id) {
                  @switch (step.data.category) {
                    @case ('Dashboard') {
                      <div class="overflow-hidden rounded-2xl border border-divider-regular bg-background-default p-2">
                        <div class="mb-2 flex items-center justify-end">
                          <button
                            type="button"
                            class="inline-flex items-center gap-2 rounded-full border border-divider-regular px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-primary"
                            [attr.data-step-pin]="step.id"
                            (click)="toggleDashboardPin(step.id)"
                          >
                            <i [class]="step.pinned ? 'ri-pushpin-2-fill' : 'ri-pushpin-2-line'"></i>
                            <span>
                              {{
                                (step.pinned ? 'PAC.ChatBI.UnpinDashboard' : 'PAC.ChatBI.PinDashboard')
                                  | translate
                                    : {
                                        Default: step.pinned ? 'Unpin snapshot' : 'Pin snapshot'
                                      }
                              }}
                            </span>
                          </button>
                        </div>
                        <chat-message-dashboard class="block w-full" [message]="step" [inline]="false" />
                      </div>
                    }
                    @default {
                      <chat-tool-call-chunk [chunk]="$any(step.data)" [conversationStatus]="traceConversationStatus()" />
                    }
                  }
                }
              </div>
            } @else {
              @switch (traceState()) {
                @case ('loading') {
                  <div class="flex h-full min-h-[18rem] items-center justify-center rounded-2xl bg-background-default-subtle px-6 text-sm text-text-secondary">
                    {{ 'PAC.ChatBI.TraceLoading' | translate: { Default: 'Loading thread activity...' } }}
                  </div>
                }
                @case ('error') {
                  <div class="flex h-full min-h-[18rem] flex-col items-center justify-center rounded-2xl border border-divider-regular bg-background-default-subtle px-6 text-center">
                    <i class="ri-error-warning-line text-3xl text-text-tertiary"></i>
                    <div class="mt-4 text-base font-medium text-text-primary">
                      {{ 'PAC.ChatBI.TraceLoadFailed' | translate: { Default: 'Failed to load thread activity' } }}
                    </div>
                    <div class="mt-2 max-w-md text-sm text-text-secondary">
                      {{ traceError() }}
                    </div>
                  </div>
                }
                @default {
                  <div class="flex h-full min-h-[18rem] flex-col items-center justify-center rounded-2xl border border-dashed border-divider-regular bg-background-default-subtle px-6 text-center">
                    <i class="ri-computer-line text-3xl text-text-tertiary"></i>
                    <div class="mt-4 text-base font-medium text-text-primary">
                      {{ 'PAC.ChatBI.TraceEmpty' | translate: { Default: 'No thread activity yet' } }}
                    </div>
                    <div class="mt-2 max-w-md text-sm text-text-secondary">
                      {{
                        'PAC.ChatBI.TraceEmptyDesc'
                          | translate
                            : {
                                Default:
                                  'Dashboard outputs and computer-side steps from this ChatBI thread will appear here as the assistant builds charts, explores files, runs programs, and emits structured actions.'
                              }
                      }}
                    </div>
                  </div>
                }
              }
            }
          </div>
        </div>
      </section>

      <section
        class="order-1 flex min-h-0 flex-col overflow-hidden rounded-3xl border border-divider-regular bg-components-card-bg shadow-sm lg:order-2"
      >
        <div class="border-b border-divider-regular px-5 py-4">
          <div class="text-xs uppercase tracking-[0.24em] text-text-tertiary">
            {{ 'PAC.ChatBI.AssistantShell' | translate: { Default: 'Assistant Shell' } }}
          </div>
        </div>

        <div class="min-h-0 flex-1 p-3">
          @switch (status()) {
            @case ('ready') {
              <xpert-chatkit class="h-full min-h-[26rem]" [control]="control()!" />
            }
            @case ('loading') {
              <div class="flex h-full min-h-[26rem] items-center justify-center rounded-2xl bg-background-default-subtle px-6 text-sm text-text-secondary">
                {{ 'PAC.Xpert.AssistantLoading' | translate: { Default: 'Preparing assistant…' } }}
              </div>
            }
            @case ('disabled') {
              <div class="flex h-full min-h-[26rem] flex-col items-center justify-center rounded-2xl border border-divider-regular bg-background-default-subtle px-6 text-center">
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
            @default {
              <div class="flex h-full min-h-[26rem] flex-col items-center justify-center rounded-2xl border border-dashed border-divider-regular bg-background-default-subtle px-6 text-center">
                <i class="ri-settings-3-line text-3xl text-text-tertiary"></i>
                <div class="mt-4 text-base font-medium text-text-primary">
                  {{ 'PAC.Assistant.MissingTitle' | translate: { Default: 'Assistant not configured' } }}
                </div>
                <div class="mt-2 max-w-sm text-sm text-text-secondary">
                  {{
                    'PAC.Assistant.MissingDesc'
                      | translate
                        : {
                            Default: 'Configure the ChatBI assistant in Settings / Assistants before starting a conversation here.'
                          }
                  }}
                </div>
                <a
                  class="mt-4 inline-flex items-center rounded-full border border-divider-regular px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-hover-bg"
                  [routerLink]="assistantsRoute"
                >
                  {{ 'PAC.Assistant.OpenSettings' | translate: { Default: 'Open Assistant Settings' } }}
                </a>
              </div>
            }
          }
        </div>
      </section>
    </div>
  `
})
export class ChatBiComponent {
  readonly #xpertService = inject(XpertAPIService)
  #xpertRequestId = 0

  readonly traceFacade = inject(ChatBiTraceFacade)
  readonly definition = getAssistantRegistryItem(AssistantCode.CHATBI)!
  readonly assistantCode = signal(AssistantCode.CHATBI)
  readonly assistantsRoute = ['/settings/assistants']
  readonly runtime = injectAssistantChatkitRuntime({
    assistantCode: this.assistantCode.asReadonly(),
    titleKey: this.definition.titleKey,
    titleDefault: this.definition.defaultTitle,
    onLog: (event) => {
      this.traceFacade.handleLog(event)
    },
    onResponseStart: () => {
      this.traceFacade.handleResponseStart()
    },
    onResponseEnd: () => {
      this.traceFacade.handleResponseEnd()
    },
    onThreadChange: ({ threadId }) => {
      this.traceFacade.handleThreadChange(threadId)
    },
    onThreadLoadStart: ({ threadId }) => {
      this.traceFacade.handleThreadLoadStart(threadId)
    },
    onThreadLoadEnd: ({ threadId }) => {
      this.traceFacade.handleThreadLoadEnd(threadId)
    }
  })

  readonly control = this.runtime.control
  readonly status = this.runtime.status
  readonly traceSteps = this.traceFacade.steps
  readonly traceState = this.traceFacade.state
  readonly traceError = this.traceFacade.error
  readonly traceConversationStatus = this.traceFacade.conversationStatus
  readonly xpert = signal<IXpert | null>(null)
  readonly displayTitle = computed(() => this.xpert()?.title || this.xpert()?.name || null)
  readonly displayDescription = computed(() => this.xpert()?.description || null)

  toggleDashboardPin(stepId: string) {
    this.traceFacade.toggleDashboardPin(stepId)
  }

  constructor() {
    effect(() => {
      void this.loadXpert(this.runtime.config()?.assistantId ?? null)
    })

    effect(() => {
      const status = this.status()
      const title = this.displayTitle() || this.definition.defaultLabel
      if (status === 'ready') {
        document.title = `${title} - ChatBI - Power BI Copilot`
      } else {
        document.title = `ChatBI - Power BI Copilot`
      }
    })
  }

  private async loadXpert(assistantId: string | null) {
    const requestId = ++this.#xpertRequestId

    if (!assistantId) {
      this.xpert.set(null)
      return
    }

    try {
      const xpert = (await firstValueFrom(this.#xpertService.getById(assistantId))) as IXpert
      if (requestId === this.#xpertRequestId) {
        this.xpert.set(xpert)
      }
    } catch {
      if (requestId === this.#xpertRequestId) {
        this.xpert.set(null)
      }
    }
  }
}
