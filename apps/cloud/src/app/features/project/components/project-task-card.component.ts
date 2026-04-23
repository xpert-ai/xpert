import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core'
import { IProjectTask, ProjectSwimlaneKindEnum, ProjectTaskStatusEnum } from '@xpert-ai/contracts'
import { TranslatePipe } from '@xpert-ai/core'
import { formatProjectLabel } from '../project-page.utils'

@Component({
  standalone: true,
  selector: 'xp-project-task-card',
  imports: [CommonModule, TranslatePipe],
  templateUrl: './project-task-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProjectTaskCardComponent {
  readonly task = input.required<IProjectTask>()
  readonly teamNames = input<Map<string, string>>(new Map())
  readonly laneKind = input<ProjectSwimlaneKindEnum>(ProjectSwimlaneKindEnum.Execution)
  readonly opened = output<IProjectTask>()
  readonly statusChanged = output<ProjectTaskStatusEnum>()
  readonly formatProjectLabel = formatProjectLabel

  readonly statusLabel = computed(() => formatProjectLabel(this.task().status))
  readonly teamLabel = computed(() => {
    const teamId = this.task().teamId
    return teamId ? this.teamNames().get(teamId) ?? '' : ''
  })
  readonly canUpdateStatus = computed(() => this.laneKind() !== ProjectSwimlaneKindEnum.Backlog)
  readonly statusOptions = Object.values(ProjectTaskStatusEnum)
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

  onStatusChange(event: Event) {
    event.stopPropagation()
    const status = (event.target as HTMLSelectElement).value as ProjectTaskStatusEnum
    if (status) {
      this.statusChanged.emit(status)
    }
  }
}
