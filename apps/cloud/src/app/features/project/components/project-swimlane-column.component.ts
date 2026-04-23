import { CommonModule } from '@angular/common'
import { CdkDragDrop, DragDropModule, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop'
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core'
import { IProjectTask, ProjectSwimlaneKindEnum, ProjectTaskStatusEnum } from '@xpert-ai/contracts'
import { TranslatePipe } from '@xpert-ai/core'
import { ZardButtonComponent, ZardIconComponent } from '@xpert-ai/headless-ui'
import { ProjectBoardColumnViewModel, ProjectBoardTaskDropEvent, formatProjectLabel } from '../project-page.utils'
import { ProjectTaskCardComponent } from './project-task-card.component'

@Component({
  standalone: true,
  selector: 'xp-project-swimlane-column',
  imports: [CommonModule, TranslatePipe, DragDropModule, ZardButtonComponent, ZardIconComponent, ProjectTaskCardComponent],
  templateUrl: './project-swimlane-column.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProjectSwimlaneColumnComponent {
  readonly column = input.required<ProjectBoardColumnViewModel>()
  readonly teamNames = input<Map<string, string>>(new Map())
  readonly createTaskRequested = output<string>()
  readonly taskDropped = output<ProjectBoardTaskDropEvent>()
  readonly taskOpened = output<IProjectTask>()
  readonly taskStatusChanged = output<{ task: IProjectTask; status: ProjectTaskStatusEnum }>()

  readonly laneKeyLabel = computed(() => formatProjectLabel(this.column().lane.key))
  readonly laneKindLabel = computed(() => formatProjectLabel(this.column().lane.kind))
  readonly agentRoleLabel = computed(() => formatProjectLabel(this.column().lane.agentRole))
  readonly environmentLabel = computed(() => formatProjectLabel(this.column().lane.environmentType))
  readonly isBacklogLane = computed(
    () => (this.column().lane.kind ?? ProjectSwimlaneKindEnum.Execution) === ProjectSwimlaneKindEnum.Backlog
  )
  readonly laneDotClass = computed(() => {
    if (this.isBacklogLane()) {
      return 'bg-chart-4'
    }

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

  requestCreateTask() {
    if (this.column().lane.id) {
      this.createTaskRequested.emit(this.column().lane.id)
    }
  }

  onDrop(event: CdkDragDrop<IProjectTask[]>) {
    if (!event.container.id || !event.previousContainer.id) {
      return
    }

    const sourceTasks = [...event.previousContainer.data]
    const targetTasks =
      event.previousContainer === event.container ? sourceTasks : [...event.container.data]

    if (event.previousContainer === event.container) {
      moveItemInArray(targetTasks, event.previousIndex, event.currentIndex)
    } else {
      transferArrayItem(sourceTasks, targetTasks, event.previousIndex, event.currentIndex)
    }

    const movedTask = targetTasks[event.currentIndex]
    if (!movedTask?.id) {
      return
    }

    this.taskDropped.emit({
      taskId: movedTask.id,
      sourceSwimlaneId: event.previousContainer.id,
      targetSwimlaneId: event.container.id,
      targetOrderedTaskIds: targetTasks.map((task) => task.id).filter((taskId): taskId is string => !!taskId)
    })
  }
}
