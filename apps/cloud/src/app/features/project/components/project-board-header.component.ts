import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'
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
  readonly sprint = input<IProjectSprint | null>(null)
  readonly taskCount = input(0)
  readonly laneCount = input(0)
  readonly strategyLabel = input('')

  readonly projectStatusLabel = computed(() => formatProjectLabel(this.project().status))
  readonly sprintStatusLabel = computed(() => formatProjectLabel(this.sprint()?.status))
}
