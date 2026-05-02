import { Dialog } from '@angular/cdk/dialog'
import { By } from '@angular/platform-browser'
import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import {
  createProjectId,
  createSprintId,
  createTeamId,
  createXpertId,
  IProjectTask,
  IProjectTaskExecutionArtifact,
  ProjectTaskExecutionArtifactTypeEnum,
  ProjectTaskExecutionStatusEnum,
  ProjectTaskStatusEnum
} from '@xpert-ai/contracts'

jest.mock('./project-task-conversation-dialog.component', () => ({
  getLatestTaskConversationId: (task?: { latestExecution?: { conversationId?: string | null } } | null) =>
    task?.latestExecution?.conversationId?.trim() || '',
  openProjectTaskConversationDialog: jest.fn()
}))

import { ProjectTaskCardComponent } from './project-task-card.component'

describe('ProjectTaskCardComponent', () => {
  async function setup(task: IProjectTask) {
    const dialog = {
      open: jest.fn()
    }

    TestBed.resetTestingModule()
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ProjectTaskCardComponent],
      providers: [
        {
          provide: Dialog,
          useValue: dialog
        }
      ]
    }).compileComponents()

    const fixture = TestBed.createComponent(ProjectTaskCardComponent)
    fixture.componentRef.setInput('task', task)
    fixture.detectChanges()

    return {
      fixture,
      component: fixture.componentInstance,
      dialog
    }
  }

  it('renders a single artifact count chip without listing artifact names', async () => {
    const firstArtifact = {
      type: ProjectTaskExecutionArtifactTypeEnum.ProjectFile,
      name: 'Implementation notes',
      path: 'deliverables/task-1/notes.md'
    } satisfies IProjectTaskExecutionArtifact
    const secondArtifact = {
      type: ProjectTaskExecutionArtifactTypeEnum.ProjectDirectory,
      name: 'Build output',
      path: 'deliverables/task-1/dist'
    } satisfies IProjectTaskExecutionArtifact
    const { fixture } = await setup(
      createTask({
        latestExecution: {
          id: 'execution-1',
          projectId: createProjectId('project-1'),
          sprintId: createSprintId('sprint-1'),
          taskId: 'task-1',
          teamId: createTeamId('team-1'),
          xpertId: createXpertId('xpert-1'),
          dispatchId: 'dispatch-1',
          status: ProjectTaskExecutionStatusEnum.Success,
          artifacts: [firstArtifact, secondArtifact]
        }
      })
    )

    const artifactChip = fixture.debugElement.query(By.css('[data-testid="project-task-artifacts"]'))
      .nativeElement as HTMLElement
    const content = fixture.nativeElement.textContent

    expect(artifactChip.textContent).toContain('Artifacts')
    expect(artifactChip.textContent).toContain('2')
    expect(fixture.debugElement.query(By.css('[data-testid="project-task-artifact"]'))).toBeNull()
    expect(content).not.toContain('Implementation notes')
    expect(content).not.toContain('Build output')
  })

  it('does not render the assigned agent id on the card', async () => {
    const { fixture } = await setup(
      createTask({
        assignedAgentId: createXpertId('86ecb1d3-571c-44d5-9168-9cc7709ceaea')
      })
    )

    expect(fixture.nativeElement.textContent).not.toContain('86ecb1d3-571c-44d5-9168-9cc7709ceaea')
  })

  it('hides the artifact area when the task has no artifacts', async () => {
    const { fixture } = await setup(createTask())

    expect(fixture.debugElement.query(By.css('[data-testid="project-task-artifacts"]'))).toBeNull()
  })
})

function createTask(patch: Partial<IProjectTask> = {}): IProjectTask {
  return {
    id: 'task-1',
    projectId: createProjectId('project-1'),
    sprintId: createSprintId('sprint-1'),
    swimlaneId: 'lane-coding',
    title: 'Implement feature',
    sortOrder: 0,
    status: ProjectTaskStatusEnum.Done,
    dependencies: [],
    ...patch
  }
}
