import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core'
import { TranslatePipe } from '@xpert-ai/core'
import { ProjectBoundTeamViewModel } from '../project-page.utils'

@Component({
  standalone: true,
  selector: 'xp-project-team-summary',
  imports: [CommonModule, TranslatePipe],
  templateUrl: './project-team-summary.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProjectTeamSummaryComponent {
  readonly boundTeams = input<ProjectBoundTeamViewModel[]>([])
  readonly manageRequested = output<void>()

  requestManage() {
    this.manageRequested.emit()
  }
}
