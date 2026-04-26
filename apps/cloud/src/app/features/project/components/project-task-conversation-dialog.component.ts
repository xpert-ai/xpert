import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { IProjectTask } from '@xpert-ai/contracts'
import { ChatConversationPreviewComponent } from '../../../@shared/chat'

type ProjectTaskConversationDialogData = {
  conversationId: string
  organizationId?: string | null
  taskTitle?: string | null
}

@Component({
  standalone: true,
  selector: 'xp-project-task-conversation-dialog',
  imports: [CommonModule, TranslateModule, ChatConversationPreviewComponent],
  template: `
    <section class="flex h-[min(80vh,52rem)] w-[min(44rem,calc(100vw-2rem))] min-h-0 flex-col overflow-hidden rounded-2xl border border-divider-regular bg-components-panel-bg shadow-xl">
      <div class="border-b border-divider-regular px-4 py-3">
        <div class="text-xs font-semibold uppercase tracking-[0.18em] text-text-tertiary">
          {{ 'PAC.Project.TaskConversation' | translate: { Default: 'Task conversation' } }}
        </div>
        @if (taskTitle()) {
          <div class="mt-1 truncate text-base font-semibold text-text-primary">{{ taskTitle() }}</div>
        }
      </div>

      <xp-chat-conversation-preview
        class="min-h-0 flex-1 overflow-auto bg-components-panel-bg"
        readonly
        [conversationId]="conversationId()"
        [organizationId]="organizationId()"
        (close)="close()"
      />
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProjectTaskConversationDialogComponent {
  readonly #dialogRef = inject(DialogRef)
  readonly #data = inject<ProjectTaskConversationDialogData>(DIALOG_DATA)

  readonly conversationId = signal(this.#data.conversationId)
  readonly organizationId = signal(this.#data.organizationId ?? null)
  readonly taskTitle = signal(this.#data.taskTitle ?? null)

  close() {
    this.#dialogRef.close()
  }
}

export function getLatestTaskConversationId(task?: IProjectTask | null) {
  return task?.latestExecution?.conversationId?.trim() || ''
}

export function openProjectTaskConversationDialog(dialog: Dialog, task?: IProjectTask | null) {
  const conversationId = getLatestTaskConversationId(task)
  if (!conversationId) {
    return null
  }

  return dialog.open(ProjectTaskConversationDialogComponent, {
    backdropClass: 'xp-overlay-share-sheet',
    panelClass: 'xp-overlay-pane-share-sheet',
    data: {
      conversationId,
      organizationId: task?.latestExecution?.organizationId ?? task?.organizationId ?? null,
      taskTitle: task?.title ?? null
    } satisfies ProjectTaskConversationDialogData
  })
}
