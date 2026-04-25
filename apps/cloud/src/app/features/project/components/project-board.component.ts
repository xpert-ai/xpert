import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { IProjectTask, ProjectTaskStatusEnum } from '@xpert-ai/contracts'
import { TranslatePipe } from '@xpert-ai/core'
import { ProjectBoardColumnViewModel, ProjectBoardTaskDropEvent } from '../project-page.utils'
import { ProjectSwimlaneColumnComponent } from './project-swimlane-column.component'

@Component({
  standalone: true,
  selector: 'xp-project-board',
  imports: [CommonModule, TranslatePipe, DragDropModule, ProjectSwimlaneColumnComponent],
  templateUrl: './project-board.component.html',
  styles: `:host {
    display: flex;
    min-height: 0;
    flex: 1 1 auto;
  }`,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProjectBoardComponent {
  readonly columns = input<ProjectBoardColumnViewModel[]>([])
  readonly hasTasks = input(false)
  readonly loading = input(false)
  readonly teamNames = input<Map<string, string>>(new Map())
  readonly taskDropped = output<ProjectBoardTaskDropEvent>()
  readonly taskCreateRequested = output<string>()
  readonly taskOpened = output<IProjectTask>()
  readonly taskStatusChanged = output<{ task: IProjectTask; status: ProjectTaskStatusEnum }>()
}
