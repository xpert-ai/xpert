import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import type { IXpertProject, IXpertTask, TXpertProjectAccessSummary, TXpertProjectMemberSummary } from '@xpert-ai/contracts'
import { ZardDialogService } from '@xpert-ai/headless-ui'
import { of } from 'rxjs'
import { Store, ToastrService, XpertTaskService } from '../../@core'
import { XpertAPIService } from '../../@core/services/xpert.service'
import { XpertWorkspaceService } from '../../@core/services/xpert-workspace.service'
import { XpertTaskDialogService } from '../../@shared/chat/task-dialog/task-dialog.service'
import { XpertProjectApiService } from './project-api.service'
import { XpertProjectConfigComponent } from './project-config.component'
import { XpertProjectFacade } from './project.facade'

describe('XpertProjectConfigComponent run-as transfer', () => {
  const project = signal<IXpertProject | null>(null)
  const projectAccess = signal<TXpertProjectAccessSummary | null>(null)
  const members: TXpertProjectMemberSummary[] = [
    { id: 'user-1', projectRole: 'member', username: 'Current runner' },
    { id: 'user-2', projectRole: 'editor', username: 'Next runner' }
  ]
  const facade = {
    project,
    projectAccess,
    scheduledTasks: signal<IXpertTask[]>([]),
    loadProject: jest.fn(),
    reloadScheduledTasks: jest.fn(),
    updateProject: jest.fn(),
    bindWorkspace: jest.fn(),
    bindXpert: jest.fn()
  }
  const taskService = {
    proposeRunAs: jest.fn(() => of({ id: 'task-1', pendingRunAsUserId: 'user-2' })),
    acceptRunAs: jest.fn(() => of({ id: 'task-1', runAsUserId: 'user-2' })),
    pause: jest.fn(),
    schedule: jest.fn()
  }
  const store = {
    userId: 'user-1'
  }

  beforeEach(() => {
    jest.clearAllMocks()
    store.userId = 'user-1'
    project.set(null)
    projectAccess.set({
      role: 'member',
      capabilities: { canRead: true, canEdit: false, canManage: false, canUse: true }
    })
    TestBed.configureTestingModule({
      imports: [XpertProjectConfigComponent],
      providers: [
        { provide: XpertProjectFacade, useValue: facade },
        { provide: XpertProjectApiService, useValue: { members: jest.fn(() => of(members)) } },
        { provide: XpertAPIService, useValue: { getAllByWorkspace: jest.fn(() => of({ items: [] })) } },
        {
          provide: XpertWorkspaceService,
          useValue: {
            getById: jest.fn(),
            getAllMy: jest.fn(() => of({ items: [] }))
          }
        },
        { provide: ZardDialogService, useValue: { open: jest.fn() } },
        { provide: XpertTaskDialogService, useValue: { openCreateTask: jest.fn() } },
        { provide: XpertTaskService, useValue: taskService },
        { provide: Store, useValue: store },
        { provide: ToastrService, useValue: { success: jest.fn(), error: jest.fn() } }
      ]
    }).overrideComponent(XpertProjectConfigComponent, { set: { imports: [], template: '' } })
  })

  afterEach(() => TestBed.resetTestingModule())

  it('lets the current run-as user propose another Project member', async () => {
    const component = TestBed.createComponent(XpertProjectConfigComponent).componentInstance
    project.set(projectFixture())
    component.projectMembers.set(members)
    const task = { id: 'task-1', projectId: 'project-1', runAsUserId: 'user-1' } satisfies IXpertTask
    component.selectRunAsTarget('task-1', 'user-2')

    await component.proposeTaskRunAs(task)

    expect(taskService.proposeRunAs).toHaveBeenCalledWith('task-1', 'user-2')
    expect(facade.reloadScheduledTasks).toHaveBeenCalledWith('project-1')
  })

  it('lets a Project manager propose a run-as transfer without being the current runner', async () => {
    projectAccess.set({
      role: 'manager',
      capabilities: { canRead: true, canEdit: true, canManage: true, canUse: true }
    })
    const component = TestBed.createComponent(XpertProjectConfigComponent).componentInstance
    project.set(projectFixture())
    component.projectMembers.set(members)
    const task = { id: 'task-1', projectId: 'project-1', runAsUserId: 'another-runner' } satisfies IXpertTask
    component.selectRunAsTarget('task-1', 'user-2')

    await component.proposeTaskRunAs(task)

    expect(taskService.proposeRunAs).toHaveBeenCalledWith('task-1', 'user-2')
  })

  it('only lets the pending target accept the proposal', async () => {
    const component = TestBed.createComponent(XpertProjectConfigComponent).componentInstance
    project.set(projectFixture())
    const task = { id: 'task-1', projectId: 'project-1', pendingRunAsUserId: 'user-2' } satisfies IXpertTask

    await component.acceptTaskRunAs(task)
    expect(taskService.acceptRunAs).not.toHaveBeenCalled()

    store.userId = 'user-2'
    await component.acceptTaskRunAs(task)
    expect(taskService.acceptRunAs).toHaveBeenCalledWith('task-1')
  })
})

function projectFixture(): IXpertProject {
  return {
    id: 'project-1',
    name: 'Project 1',
    status: 'active',
    ownerId: 'owner-1',
    settings: { instruction: '' }
  }
}
