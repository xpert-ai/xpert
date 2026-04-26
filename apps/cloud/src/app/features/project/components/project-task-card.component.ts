import { CommonModule } from '@angular/common'
import { Dialog } from '@angular/cdk/dialog'
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core'
import { IProjectTask, ProjectTaskStatusEnum } from '@xpert-ai/contracts'
import { TranslatePipe } from '@xpert-ai/core'
import { ZardIconComponent } from '@xpert-ai/headless-ui'
import { getLatestTaskConversationId, openProjectTaskConversationDialog } from './project-task-conversation-dialog.component'
import { formatProjectLabel } from '../project-page.utils'

@Component({
  standalone: true,
  selector: 'xp-project-task-card',
  imports: [CommonModule, TranslatePipe, ZardIconComponent],
  templateUrl: './project-task-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProjectTaskCardComponent {
  readonly #dialog = inject(Dialog)
  readonly task = input.required<IProjectTask>()
  readonly teamNames = input<Map<string, string>>(new Map())
  readonly opened = output<IProjectTask>()
  readonly formatProjectLabel = formatProjectLabel

  readonly statusLabel = computed(() => formatProjectLabel(this.task().status))
  readonly latestConversationId = computed(() => getLatestTaskConversationId(this.task()))
  readonly failureMessage = computed(() => {
    const task = this.task()
    if (task.status !== ProjectTaskStatusEnum.Failed) {
      return ''
    }

    return task.latestExecution?.error?.trim() || task.latestExecution?.summary?.trim() || ''
  })
  readonly teamLabel = computed(() => {
    const teamId = this.task().teamId
    return teamId ? this.teamNames().get(teamId) ?? '' : ''
  })
  readonly statusDotClass = computed(() => {
    switch (this.task().status) {
      case ProjectTaskStatusEnum.Doing:
        return 'bg-primary'
      case ProjectTaskStatusEnum.Done:
        return 'bg-chart-2'
      case ProjectTaskStatusEnum.Failed:
        return 'bg-chart-5'
      default:
        return 'bg-chart-1'
    }
  })

  onOpen() {
    this.opened.emit(this.task())
  }

  openLatestConversation(event: Event) {
    event.stopPropagation()
    openProjectTaskConversationDialog(this.#dialog, this.task())
  }
}
