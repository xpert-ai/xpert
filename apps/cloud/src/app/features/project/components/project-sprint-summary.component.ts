import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'
import { IProjectCore, IProjectSprint } from '@xpert-ai/contracts'
import { TranslatePipe } from '@xpert-ai/core'
import { formatProjectLabel } from '../project-page.utils'

@Component({
  standalone: true,
  selector: 'xp-project-sprint-summary',
  imports: [CommonModule, TranslatePipe],
  templateUrl: './project-sprint-summary.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProjectSprintSummaryComponent {
  readonly project = input.required<IProjectCore>()
  readonly sprint = input.required<IProjectSprint>()
  readonly laneCount = input(0)
  readonly taskCount = input(0)
  readonly teamCount = input(0)

  readonly sprintLabel = computed(() => formatProjectLabel(this.sprint().status))
  readonly dateRange = computed(() => {
    const startAt = this.sprint().startAt
    const endAt = this.sprint().endAt
    if (!startAt && !endAt) {
      return ''
    }

    return [startAt, endAt]
      .filter(Boolean)
      .map((value) => new Date(value).toLocaleDateString())
      .join(' - ')
  })
}
