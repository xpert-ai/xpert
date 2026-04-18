import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'
import { IProjectTask, ProjectTaskStatusEnum } from '@xpert-ai/contracts'
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

  readonly statusLabel = computed(() => formatProjectLabel(this.task().status))
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
}
