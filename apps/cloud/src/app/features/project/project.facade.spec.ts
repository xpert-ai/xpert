import { HttpErrorResponse } from '@angular/common/http'
import { TestBed } from '@angular/core/testing'
import type { IXpertProject } from '@xpert-ai/contracts'
import { of, Subject, throwError } from 'rxjs'
import { XpertTaskService } from '../../@core'
import { XpertProjectApiService, type XpertProjectOverview } from './project-api.service'
import { XpertProjectFacade } from './project.facade'

describe('XpertProjectFacade', () => {
  let api: {
    list: jest.Mock
    create: jest.Mock
    get: jest.Mock
    overview: jest.Mock
    instructions: jest.Mock
    skills: jest.Mock
    access: jest.Mock
  }
  let taskService: { getAll: jest.Mock }

  beforeEach(() => {
    api = {
      list: jest.fn(),
      create: jest.fn(),
      get: jest.fn(),
      overview: jest.fn(),
      instructions: jest.fn(),
      skills: jest.fn(),
      access: jest.fn()
    }
    taskService = { getAll: jest.fn() }

    TestBed.configureTestingModule({
      providers: [
        XpertProjectFacade,
        {
          provide: XpertProjectApiService,
          useValue: api
        },
        {
          provide: XpertTaskService,
          useValue: taskService
        }
      ]
    })
  })

  afterEach(() => {
    TestBed.resetTestingModule()
  })

  it('preserves the server error when loading projects fails', async () => {
    api.list.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 403,
            error: { message: 'Project permission is required' }
          })
      )
    )

    const facade = TestBed.inject(XpertProjectFacade)

    await facade.loadProjects()

    expect(facade.projects()).toEqual([])
    expect(facade.error()).toBe('Project permission is required')
  })

  it('does not let an older list response remove a newly created project', async () => {
    const pendingList = new Subject<{ items: IXpertProject[]; total: number }>()
    const project = { id: 'project-new', name: 'New project', status: 'active' } as IXpertProject
    api.list.mockReturnValue(pendingList)
    api.create.mockReturnValue(of(project))
    const facade = TestBed.inject(XpertProjectFacade)

    const loadPromise = facade.loadProjects()
    await facade.createProject({ name: project.name })
    pendingList.next({ items: [], total: 0 })
    pendingList.complete()
    await loadPromise

    expect(facade.projects()).toEqual([project])
    expect(facade.loading()).toBe(false)
  })

  it('stops blocking the project shell as soon as the project record loads', async () => {
    const project = { id: 'project-1', name: 'Project one', status: 'active' } as IXpertProject
    const pendingOverview = new Subject<XpertProjectOverview>()
    api.get.mockReturnValue(of(project))
    api.overview.mockReturnValue(pendingOverview)
    api.instructions.mockReturnValue(of({ content: '' }))
    api.skills.mockReturnValue(of({ items: [] }))
    api.access.mockReturnValue(
      of({ role: 'member', capabilities: { canRead: true, canEdit: false, canManage: false, canUse: true } })
    )
    taskService.getAll.mockReturnValue(of({ items: [], total: 0 }))
    const facade = TestBed.inject(XpertProjectFacade)

    const result = await facade.loadProject(project.id)

    expect(result).toBe(project)
    expect(facade.project()).toBe(project)
    expect(facade.projectLoading()).toBe(false)
    expect(facade.error()).toBeNull()

    pendingOverview.next(emptyOverview(project))
    pendingOverview.complete()
  })
})

function emptyOverview(project: IXpertProject): XpertProjectOverview {
  return {
    project,
    plans: [],
    tasks: [],
    assets: [],
    activities: [],
    automations: []
  }
}
