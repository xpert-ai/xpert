import { CommonModule } from '@angular/common'
import { NO_ERRORS_SCHEMA, Pipe, PipeTransform } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import {
  IProjectTask,
  ProjectTaskExecutionStatusEnum,
  ProjectTaskStatusEnum,
  createProjectId,
  createSprintId,
  createTeamId,
  createXpertId
} from '@xpert-ai/contracts'
import { ProjectTaskCardComponent } from './project-task-card.component'

@Pipe({
  standalone: true,
  name: 'translate'
})
class TranslateStubPipe implements PipeTransform {
  transform(value: string, options?: { Default?: string }) {
    return options?.Default ?? value
  }
}

describe('ProjectTaskCardComponent', () => {
  function createTask(conversationId: string | null): IProjectTask {
    const projectId = createProjectId('project-1')
    const sprintId = createSprintId('sprint-1')

    return {
      id: 'task-1',
      projectId,
      sprintId,
      swimlaneId: 'lane-1',
      title: 'Review side panel',
      description: 'Open task chat in the assistant rail.',
      sortOrder: 0,
      status: ProjectTaskStatusEnum.Done,
      dependencies: [],
      latestExecution: {
        id: 'execution-1',
        projectId,
        sprintId,
        taskId: 'task-1',
        teamId: createTeamId('team-1'),
        xpertId: createXpertId('xpert-1'),
        dispatchId: 'dispatch-1',
        status: ProjectTaskExecutionStatusEnum.Success,
        conversationId
      }
    }
  }

  function createComponent(task: IProjectTask) {
    TestBed.resetTestingModule()
    TestBed.configureTestingModule({
      imports: [ProjectTaskCardComponent]
    })
    TestBed.overrideComponent(ProjectTaskCardComponent, {
      set: {
        imports: [CommonModule, TranslateStubPipe],
        schemas: [NO_ERRORS_SCHEMA]
      }
    })

    const fixture = TestBed.createComponent(ProjectTaskCardComponent)
    fixture.componentRef.setInput('task', task)
    fixture.detectChanges()

    return fixture
  }

  it('emits conversationRequested from the conversation button without opening the card', () => {
    const task = createTask('conversation-1')
    const fixture = createComponent(task)
    const component = fixture.componentInstance
    const opened = jest.fn()
    const conversationRequested = jest.fn()
    component.opened.subscribe(opened)
    component.conversationRequested.subscribe(conversationRequested)

    const button = fixture.debugElement.query(By.css('button'))
    button.nativeElement.click()

    expect(conversationRequested).toHaveBeenCalledWith(task)
    expect(opened).not.toHaveBeenCalled()
  })

  it('does not render a conversation button without a latest conversation', () => {
    const fixture = createComponent(createTask(null))

    expect(fixture.debugElement.query(By.css('button'))).toBeNull()
  })
})
