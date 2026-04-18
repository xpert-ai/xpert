import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'
import { TranslatePipe } from '@xpert-ai/core'
import { ProjectBoardColumnViewModel, formatProjectLabel } from '../project-page.utils'
import { ProjectTaskCardComponent } from './project-task-card.component'

@Component({
  standalone: true,
  selector: 'xp-project-swimlane-column',
  imports: [CommonModule, TranslatePipe, ProjectTaskCardComponent],
  templateUrl: './project-swimlane-column.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProjectSwimlaneColumnComponent {
  readonly column = input.required<ProjectBoardColumnViewModel>()
  readonly showCreateTask = input(false)

  readonly laneKeyLabel = computed(() => formatProjectLabel(this.column().lane.key))
  readonly laneDotClass = computed(() => {
    switch (this.column().lane.key) {
      case 'coding':
      case 'analysis':
      case 'in-progress':
        return 'bg-primary'
      case 'review':
      case 'visualization':
        return 'bg-chart-2'
      case 'release':
        return 'bg-chart-5'
      default:
        return 'bg-chart-1'
    }
  })
}
