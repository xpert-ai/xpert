import { CommonModule } from '@angular/common'
import { Component, EventEmitter, Input, NO_ERRORS_SCHEMA, Output, Pipe, PipeTransform } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import {
  IProjectTask,
  ProjectAgentRole,
  ProjectExecutionEnvironmentType,
  ProjectSprintStrategyEnum,
  ProjectSwimlaneKindEnum,
  ProjectTaskStatusEnum,
  createProjectId,
  createSprintId
} from '@xpert-ai/contracts'
import { ProjectBoardColumnViewModel } from '../project-page.utils'
import { ProjectBoardComponent } from './project-board.component'

@Pipe({
  standalone: true,
  name: 'translate'
})
class TranslateStubPipe implements PipeTransform {
  transform(value: string, options?: { Default?: string }) {
    return options?.Default ?? value
  }
}

@Component({
  standalone: true,
  selector: 'xp-project-swimlane-column',
  template: ''
})
class ProjectSwimlaneColumnStubComponent {
  @Input() column?: ProjectBoardColumnViewModel
  @Input() teamNames?: Map<string, string>
  @Output() createTaskRequested = new EventEmitter<string>()
  @Output() taskDropped = new EventEmitter<unknown>()
  @Output() taskOpened = new EventEmitter<IProjectTask>()
  @Output() taskConversationRequested = new EventEmitter<IProjectTask>()
  @Output() taskStatusChanged = new EventEmitter<unknown>()
}

describe('ProjectBoardComponent', () => {
  function createTask(): IProjectTask {
    return {
      id: 'task-1',
      projectId: createProjectId('project-1'),
      sprintId: createSprintId('sprint-1'),
      swimlaneId: 'lane-1',
      title: 'Task chat',
      sortOrder: 0,
      status: ProjectTaskStatusEnum.Done,
      dependencies: []
    }
  }

  function createColumn(task: IProjectTask): ProjectBoardColumnViewModel {
    return {
      lane: {
        id: 'lane-1',
        projectId: createProjectId('project-1'),
        sprintId: createSprintId('sprint-1'),
        key: 'coding',
        name: 'Coding',
        kind: ProjectSwimlaneKindEnum.Execution,
        sortOrder: 0,
        priority: 1,
        weight: 1,
        concurrencyLimit: 1,
        wipLimit: 1,
        agentRole: ProjectAgentRole.Coder,
        environmentType: ProjectExecutionEnvironmentType.Container,
        sourceStrategyType: ProjectSprintStrategyEnum.SoftwareDelivery
      },
      tasks: [task],
      total: 1,
      todo: 0,
      doing: 0,
      done: 1
    }
  }

  it('forwards task conversation requests from swimlane columns', () => {
    const task = createTask()
    TestBed.resetTestingModule()
    TestBed.configureTestingModule({
      imports: [ProjectBoardComponent]
    })
    TestBed.overrideComponent(ProjectBoardComponent, {
      set: {
        imports: [CommonModule, TranslateStubPipe, ProjectSwimlaneColumnStubComponent],
        schemas: [NO_ERRORS_SCHEMA]
      }
    })

    const fixture = TestBed.createComponent(ProjectBoardComponent)
    const conversationRequested = jest.fn()
    fixture.componentInstance.taskConversationRequested.subscribe(conversationRequested)
    fixture.componentRef.setInput('columns', [createColumn(task)])
    fixture.detectChanges()

    const column = fixture.debugElement.query(By.directive(ProjectSwimlaneColumnStubComponent))
      .componentInstance as ProjectSwimlaneColumnStubComponent
    column.taskConversationRequested.emit(task)

    expect(conversationRequested).toHaveBeenCalledWith(task)
  })
})
