import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ChatKit } from '@xpert-ai/chatkit-angular'
import type { IChatConversation, IXpertProject } from '@xpert-ai/contracts'
import { Z_MODAL_DATA, ZardButtonComponent, ZardDialogRef } from '@xpert-ai/headless-ui'
import { environment } from '@cloud/environments/environment'
import { injectHostedAssistantChatkitControl, sanitizeAssistantFrameUrl } from '../assistant/assistant-chatkit.runtime'
import { isProjectAssistant } from './project-assistant.constants'

export type XpertProjectConversationDialogData = {
  projectId: string
  project?: IXpertProject | null
  conversation: IChatConversation
  executionId?: string | null
}

@Component({
  standalone: true,
  selector: 'xp-project-conversation-dialog',
  imports: [CommonModule, TranslateModule, ChatKit, ZardButtonComponent],
  template: `
    <section class="flex h-[min(82vh,760px)] max-h-[calc(100vh-32px)] min-h-0 min-w-0 flex-col">
      <header class="flex shrink-0 items-start justify-between gap-3 border-b border-divider-subtle pb-3">
        <div class="min-w-0">
          <p class="text-xs font-medium uppercase tracking-wide text-text-tertiary">
            {{ 'XP.XProject.ConversationDetail' | translate }}
          </p>
          <h2 class="mt-1 truncate text-base font-semibold text-text-primary">
            {{ conversation.title || ('XP.XProject.UntitledConversation' | translate) }}
          </h2>
          <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-tertiary">
            <span class="max-w-[18rem] truncate font-mono" [title]="conversation.id"
              >{{ 'XP.XProject.ConversationId' | translate }}: {{ shortId(conversation.id) }}</span
            >
            <span class="max-w-[18rem] truncate font-mono" [title]="conversation.threadId || ''"
              >{{ 'XP.XProject.Thread' | translate }}: {{ shortId(conversation.threadId) }}</span
            >
            @if (executionId()) {
              <span class="max-w-[18rem] truncate font-mono" [title]="executionId() || ''"
                >{{ 'XP.XProject.ExecutionId' | translate }}: {{ shortId(executionId()) }}</span
              >
            }
          </div>
        </div>
        <button
          z-button
          zType="ghost"
          zSize="icon"
          type="button"
          [attr.aria-label]="'XP.XProject.Close' | translate"
          [title]="'XP.XProject.Close' | translate"
          (click)="close()"
        >
          <i class="ri-close-line"></i>
        </button>
      </header>

      <div class="min-h-0 flex-1 pt-3">
        @if (!assistantId()) {
          <div class="flex h-full min-h-0 flex-col items-center justify-center px-6 text-center">
            <i class="ri-chat-off-line text-3xl text-text-tertiary"></i>
            <p class="mt-3 text-sm font-medium text-text-primary">
              {{ 'XP.XProject.ProjectChatUnavailable' | translate }}
            </p>
            <p class="mt-1 max-w-sm text-xs text-text-secondary">
              {{ 'XP.XProject.ProjectChatUnavailableDesc' | translate }}
            </p>
          </div>
        } @else if (control(); as chatkitControl) {
          <xpert-chatkit
            class="block h-full min-h-0 overflow-hidden rounded-lg border border-divider-subtle"
            [control]="chatkitControl"
          />
        } @else {
          <div class="flex h-full min-h-0 items-center justify-center text-sm text-text-secondary">
            {{ 'XP.XProject.ProjectChatLoading' | translate }}
          </div>
        }
      </div>
    </section>
  `,
  host: { class: 'block h-full min-h-0 min-w-0' },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertProjectConversationDialogComponent {
  readonly data = inject<XpertProjectConversationDialogData>(Z_MODAL_DATA)
  readonly #dialogRef = inject(ZardDialogRef)
  readonly conversation = this.data.conversation
  readonly executionId = signal(this.data.executionId?.trim() || this.conversation.executions?.[0]?.id || null)
  readonly projectId = this.data.projectId.trim()
  readonly assistantId = computed(() => {
    const conversationAssistantId = this.conversation.xpertId?.trim()
    if (conversationAssistantId) return conversationAssistantId

    const project = this.data.project
    const configuredId = project?.settings?.projectAssistantId?.trim()
    if (configuredId) return configuredId

    const assistants = project?.xperts ?? []
    return assistants.find((assistant) => isProjectAssistant(assistant))?.id ?? assistants[0]?.id ?? null
  })
  readonly identity = computed(() => {
    const conversationId = this.conversation.id.trim()
    const assistantId = this.assistantId()
    return conversationId && assistantId
      ? `project-conversation:${this.projectId}:${conversationId}:${assistantId}`
      : null
  })
  readonly initialThread = signal<string | null>(this.conversation.threadId?.trim() || null)
  readonly requestContext = computed(() => ({
    env: {
      projectId: this.projectId,
      conversationId: this.conversation.id,
      ...(this.conversation.threadId ? { threadId: this.conversation.threadId } : {}),
      ...(this.executionId() ? { executionId: this.executionId() } : {})
    }
  }))
  readonly chatkitFrameUrl = computed(() => sanitizeAssistantFrameUrl(environment.CHATKIT_FRAME_URL))
  readonly control = injectHostedAssistantChatkitControl({
    identity: this.identity,
    assistantId: this.assistantId,
    projectId: computed(() => this.projectId || null),
    frameUrl: this.chatkitFrameUrl,
    requestContext: this.requestContext,
    initialThread: this.initialThread,
    layout: { maxWidth: '100%' },
    titleKey: 'XP.XProject.ConversationDetail',
    titleDefault: 'Conversation detail'
  })

  close() {
    this.#dialogRef.close()
  }

  shortId(value?: string | null) {
    const normalized = value?.trim()
    return normalized && normalized.length > 16
      ? `${normalized.slice(0, 8)}...${normalized.slice(-6)}`
      : normalized || '-'
  }
}
