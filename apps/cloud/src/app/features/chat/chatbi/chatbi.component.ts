import { CommonModule } from '@angular/common'
import { Component, computed, signal } from '@angular/core'
import { RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { ChatKit } from '@xpert-ai/chatkit-angular'
import { AssistantCode } from '../../../@core'
import { getAssistantRegistryItem } from '../../assistant/assistant.registry'
import { injectAssistantChatkitRuntime } from '../../assistant/assistant-chatkit.runtime'

@Component({
  standalone: true,
  selector: 'pac-chat-bi',
  imports: [CommonModule, RouterModule, TranslateModule, ChatKit],
  template: `
    <div class="flex h-full flex-col gap-4 overflow-hidden p-4 lg:grid lg:grid-cols-[minmax(0,1fr)_420px]">
      <section
        class="order-2 flex min-h-0 flex-col overflow-hidden rounded-3xl lg:order-1"
      >
        <div class="border-b border-divider-regular px-5 py-4">
          <div class="text-xs uppercase tracking-[0.24em] text-text-tertiary">
            {{ 'PAC.ChatBI.EventCanvas' | translate: { Default: 'Event Canvas' } }}
          </div>
          <div class="mt-2 text-xl font-semibold text-text-primary">
            {{ definition.labelKey | translate: { Default: definition.defaultLabel } }}
          </div>
          <p class="mt-2 max-w-2xl text-sm text-text-secondary">
            {{
              'PAC.ChatBI.EventCanvasDesc'
                | translate
                  : {
                      Default:
                        'This area is reserved for the structured events, tool traces, and business signals generated during the conversation.'
                    }
            }}
          </p>
        </div>

        <div class="grid flex-1 gap-4 overflow-auto p-4 md:grid-cols-2">
          <article
            class="rounded-2xl border border-divider-regular bg-components-card-bg p-4 shadow-sm"
          >
            <div class="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-text-tertiary">
              <i class="ri-pulse-line text-base"></i>
              <span>{{ 'PAC.ChatBI.LiveSignals' | translate: { Default: 'Live Signals' } }}</span>
            </div>
            <div class="mt-4 space-y-3">
              @for (item of placeholderSignals(); track item.titleKey) {
                <div class="rounded-2xl border border-divider-regular bg-background-default-subtle px-4 py-3">
                  <div class="text-sm font-medium text-text-primary">
                    {{ item.titleKey | translate: { Default: item.defaultTitle } }}
                  </div>
                  <div class="mt-1 text-xs text-text-secondary">
                    {{ item.descriptionKey | translate: { Default: item.defaultDescription } }}
                  </div>
                </div>
              }
            </div>
          </article>

          <article
            class="rounded-2xl border border-dashed border-divider-regular bg-components-card-bg p-4 shadow-sm"
          >
            <div class="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-text-tertiary">
              <i class="ri-terminal-box-line text-base"></i>
              <span>{{ 'PAC.ChatBI.PendingEvents' | translate: { Default: 'Pending Event Stream' } }}</span>
            </div>
            <div class="mt-4 rounded-2xl bg-background-default-subtle p-4 font-mono text-xs text-text-secondary">
              <div>&gt; conversation.started</div>
              <div class="mt-2">&gt; tool.answer_question.waiting</div>
              <div class="mt-2">&gt; visualization.render.placeholder</div>
              <div class="mt-2">&gt; event.timeline.coming_soon</div>
            </div>
          </article>
        </div>
      </section>

      <section
        class="order-1 flex min-h-0 flex-col overflow-hidden rounded-3xl border border-divider-regular bg-components-card-bg shadow-sm lg:order-2"
      >
        <div class="border-b border-divider-regular px-5 py-4">
          <div class="text-xs uppercase tracking-[0.24em] text-text-tertiary">
            {{ 'PAC.ChatBI.AssistantShell' | translate: { Default: 'Assistant Shell' } }}
          </div>
          <div class="mt-2 text-lg font-semibold text-text-primary">
            {{ definition.titleKey | translate: { Default: definition.defaultTitle } }}
          </div>
          <p class="mt-2 text-sm text-text-secondary">
            {{ definition.descriptionKey | translate: { Default: definition.defaultDescription } }}
          </p>
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
  readonly definition = getAssistantRegistryItem(AssistantCode.CHATBI)!
  readonly assistantCode = signal(AssistantCode.CHATBI)
  readonly assistantsRoute = ['/settings/assistants']
  readonly runtime = injectAssistantChatkitRuntime({
    assistantCode: this.assistantCode.asReadonly(),
    titleKey: this.definition.titleKey,
    titleDefault: this.definition.defaultTitle
  })

  readonly control = this.runtime.control
  readonly status = this.runtime.status
  readonly placeholderSignals = computed(() => [
    {
      titleKey: 'PAC.ChatBI.QuestionTimeline',
      defaultTitle: 'Question Timeline',
      descriptionKey: 'PAC.ChatBI.QuestionTimelineDesc',
      defaultDescription: 'Track prompt milestones, model actions, and event nodes emitted during the analysis flow.'
    },
    {
      titleKey: 'PAC.ChatBI.ToolInvocations',
      defaultTitle: 'Tool Invocations',
      descriptionKey: 'PAC.ChatBI.ToolInvocationsDesc',
      defaultDescription: 'Reserve space for model queries, chart generation, and semantic model lookups.'
    },
    {
      titleKey: 'PAC.ChatBI.BusinessAlerts',
      defaultTitle: 'Business Alerts',
      descriptionKey: 'PAC.ChatBI.BusinessAlertsDesc',
      defaultDescription: 'Highlight KPI movements, anomalies, and decision points surfaced by the assistant.'
    }
  ])
}
