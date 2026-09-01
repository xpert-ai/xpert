import { HttpErrorResponse } from '@angular/common/http'
import { TestBed } from '@angular/core/testing'
import type { IXpertProject, TXpertProjectSkillSummary } from '@xpert-ai/contracts'
import { of, throwError } from 'rxjs'
import { XpertTaskService } from '../../@core'
import { XpertProjectApiService } from './project-api.service'
import { XpertProjectFacade } from './project.facade'

describe('XpertProjectFacade', () => {
  let api: {
    list: jest.Mock
    access: jest.Mock
    instructions: jest.Mock
    skills: jest.Mock
    updateInstructions: jest.Mock
  }

  beforeEach(() => {
    api = {
      list: jest.fn(),
      access: jest.fn(),
      instructions: jest.fn(),
      skills: jest.fn(),
      updateInstructions: jest.fn()
    }

    TestBed.configureTestingModule({
      providers: [
        XpertProjectFacade,
        {
          provide: XpertProjectApiService,
          useValue: api
        },
        {
          provide: XpertTaskService,
          useValue: { getAll: jest.fn() }
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

  it('loads Project instructions and skills independently of the overview', async () => {
    const project = { id: 'project-1' } as IXpertProject
    const skill: TXpertProjectSkillSummary = {
      id: 'pdf',
      name: 'PDF',
      path: 'skills/pdf/SKILL.md',
      enabled: true,
      source: 'repository'
    }
    api.instructions.mockReturnValue(of({ content: 'Use the project terminology.' }))
    api.skills.mockReturnValue(of({ items: [skill], total: 1 }))
    const facade = TestBed.inject(XpertProjectFacade)
    facade.project.set(project)

    await facade.reloadProjectContent()

    expect(api.instructions).toHaveBeenCalledWith('project-1')
    expect(api.skills).toHaveBeenCalledWith('project-1')
    expect(facade.projectInstruction()).toBe('Use the project terminology.')
    expect(facade.projectSkills()).toEqual([skill])
    expect(facade.projectContentError()).toBeNull()
  })

  it('keeps available skills when Project instructions fail to load', async () => {
    const skill: TXpertProjectSkillSummary = {
      id: 'pdf',
      name: 'PDF',
      path: 'skills/pdf/SKILL.md',
      enabled: true,
      source: 'repository'
    }
    api.instructions.mockReturnValue(throwError(() => new Error('Instructions unavailable')))
    api.skills.mockReturnValue(of({ items: [skill], total: 1 }))
    const facade = TestBed.inject(XpertProjectFacade)
    facade.project.set({ id: 'project-1' } as IXpertProject)

    await facade.reloadProjectContent()

    expect(facade.projectInstruction()).toBe('')
    expect(facade.projectSkills()).toEqual([skill])
    expect(facade.projectContentError()).toBe('Instructions unavailable')
  })

  it('persists Project instructions through the Content API', async () => {
    api.updateInstructions.mockReturnValue(of({ content: 'Updated instructions' }))
    const facade = TestBed.inject(XpertProjectFacade)
    facade.project.set({ id: 'project-1' } as IXpertProject)

    const result = await facade.saveProjectInstructions('Updated instructions')

    expect(api.updateInstructions).toHaveBeenCalledWith('project-1', 'Updated instructions')
    expect(result).toEqual({ content: 'Updated instructions' })
    expect(facade.projectInstruction()).toBe('Updated instructions')
  })
})
