import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core'
import { IProjectCore, IProjectSprint } from '@xpert-ai/contracts'
import { TranslatePipe } from '@xpert-ai/core'
import { formatProjectLabel } from '../project-page.utils'

@Component({
  standalone: true,
  selector: 'xp-project-board-header',
  imports: [CommonModule, TranslatePipe],
  templateUrl: './project-board-header.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProjectBoardHeaderComponent {
  readonly project = input.required<IProjectCore>()
  readonly sprints = input<IProjectSprint[]>([])
  readonly sprint = input<IProjectSprint | null>(null)
  readonly selectedSprintId = input<string | null>(null)
  readonly taskCount = input(0)
  readonly laneCount = input(0)
  readonly teamCount = input(0)
  readonly strategyLabel = input('')
  readonly sprintSelected = output<string>()
  readonly createSprintRequested = output<void>()
  readonly createTaskRequested = output<void>()

  readonly projectStatusLabel = computed(() => formatProjectLabel(this.project().status))
  readonly sprintStatusLabel = computed(() => formatProjectLabel(this.sprint()?.status))

  onSprintSelected(event: Event) {
    const sprintId = (event.target as HTMLSelectElement).value
    if (sprintId) {
      this.sprintSelected.emit(sprintId)
    }
  }

  requestCreateSprint() {
    this.createSprintRequested.emit()
  }

  requestCreateTask() {
    this.createTaskRequested.emit()
  }
}
