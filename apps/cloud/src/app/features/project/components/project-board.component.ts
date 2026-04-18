import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { TranslatePipe } from '@xpert-ai/core'
import { ProjectBoardColumnViewModel } from '../project-page.utils'
import { ProjectSwimlaneColumnComponent } from './project-swimlane-column.component'

@Component({
  standalone: true,
  selector: 'xp-project-board',
  imports: [CommonModule, TranslatePipe, ProjectSwimlaneColumnComponent],
  templateUrl: './project-board.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProjectBoardComponent {
  readonly columns = input<ProjectBoardColumnViewModel[]>([])
  readonly hasTasks = input(false)
}
