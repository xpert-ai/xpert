import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import type { IXpertProject, TXpertProjectAccessSummary, TXpertProjectSkillSummary } from '@xpert-ai/contracts'
import { ZardDialogService } from '@xpert-ai/headless-ui'
import { of } from 'rxjs'
import { Store, ToastrService, XpertTaskService } from '../../@core'
import { XpertAPIService } from '../../@core/services/xpert.service'
import { XpertWorkspaceService } from '../../@core/services/xpert-workspace.service'
import { XpertSkillInstallDialogComponent } from '../../@shared/skills'
import { XpertTaskDialogService } from '../../@shared/chat/task-dialog/task-dialog.service'
import { XpertProjectApiService } from './project-api.service'
import { XpertProjectConfigComponent } from './project-config.component'
import { XpertProjectFacade } from './project.facade'
import { XpertProjectSkillsDialogComponent } from './project-skills-dialog.component'

describe('XpertProjectConfigComponent Project Content', () => {
  const project = signal<IXpertProject | null>(null)
  const projectAccess = signal<TXpertProjectAccessSummary | null>(null)
  const projectInstruction = signal('')
  const projectSkills = signal<TXpertProjectSkillSummary[]>([])
  const facade = {
    project,
    projectAccess,
    projectInstruction,
    projectSkills,
    scheduledTasks: signal([]),
    saveProjectInstructions: jest.fn(),
    reloadProjectContent: jest.fn(),
    bindWorkspace: jest.fn(),
    bindXpert: jest.fn(),
    loadProject: jest.fn()
  }
  const api = {
    installSkill: jest.fn(),
    members: jest.fn(() => of([])),
    uploadSkills: jest.fn()
  }
  const dialog = { open: jest.fn() }
  const toastr = { success: jest.fn(), error: jest.fn() }

  beforeEach(() => {
    jest.clearAllMocks()
    project.set(null)
    projectInstruction.set('')
    projectSkills.set([])
    projectAccess.set({
      role: 'member',
      capabilities: { canRead: true, canEdit: false, canManage: false, canUse: true }
    })
    facade.saveProjectInstructions.mockResolvedValue({ content: 'Updated instructions' })
    facade.reloadProjectContent.mockResolvedValue([])
    api.installSkill.mockReturnValue(
      of({ id: 'pdf', name: 'PDF', path: 'skills/pdf/SKILL.md', enabled: true, source: 'repository' })
    )

    TestBed.configureTestingModule({
      imports: [XpertProjectConfigComponent],
      providers: [
        { provide: XpertProjectFacade, useValue: facade },
        { provide: XpertProjectApiService, useValue: api },
        { provide: ZardDialogService, useValue: dialog },
        { provide: XpertTaskDialogService, useValue: { openCreateTask: jest.fn() } },
        { provide: XpertTaskService, useValue: {} },
        { provide: Store, useValue: { userId: 'user-1' } },
        { provide: ToastrService, useValue: toastr },
        {
          provide: XpertAPIService,
          useValue: { getAllByWorkspace: jest.fn(() => of({ items: [], total: 0 })) }
        },
        {
          provide: XpertWorkspaceService,
          useValue: {
            getById: jest.fn(() => of(null)),
            getAllMy: jest.fn(() => of({ items: [], total: 0 }))
          }
        }
      ]
    }).overrideComponent(XpertProjectConfigComponent, { set: { imports: [], template: '' } })
  })

  afterEach(() => TestBed.resetTestingModule())

  it('does not persist instructions when the Project is read-only', async () => {
    const component = TestBed.createComponent(XpertProjectConfigComponent).componentInstance
    project.set({ id: 'project-1' } as IXpertProject)
    component.instruction.set('Updated instructions')

    await component.saveInstructions()

    expect(facade.saveProjectInstructions).not.toHaveBeenCalled()
  })

  it('persists instructions through the Project Content facade for an editor', async () => {
    projectAccess.set({
      role: 'editor',
      capabilities: { canRead: true, canEdit: true, canManage: false, canUse: true }
    })
    const component = TestBed.createComponent(XpertProjectConfigComponent).componentInstance
    project.set({ id: 'project-1' } as IXpertProject)
    component.instruction.set('Updated instructions')

    await component.saveInstructions()

    expect(facade.saveProjectInstructions).toHaveBeenCalledWith('Updated instructions')
    expect(toastr.success).toHaveBeenCalled()
  })

  it('installs a repository skill into the current Project scope', async () => {
    projectAccess.set({
      role: 'editor',
      capabilities: { canRead: true, canEdit: true, canManage: false, canUse: true }
    })
    dialog.open.mockReturnValue({
      closed: of({ kind: 'repository-index', skillIndex: { id: 'index-1' } })
    })
    const component = TestBed.createComponent(XpertProjectConfigComponent).componentInstance
    project.set({ id: 'project-1' } as IXpertProject)

    await component.installProjectSkillFromRepository()

    expect(dialog.open).toHaveBeenCalledWith(
      XpertSkillInstallDialogComponent,
      expect.objectContaining({ data: { scope: 'project' } })
    )
    expect(api.installSkill).toHaveBeenCalledWith('project-1', 'index-1')
    expect(facade.reloadProjectContent).toHaveBeenCalledWith('project-1')
  })

  it('opens Project skill management in read-only mode for a member', async () => {
    dialog.open.mockReturnValue({ closed: of(false) })
    const component = TestBed.createComponent(XpertProjectConfigComponent).componentInstance
    project.set({ id: 'project-1' } as IXpertProject)

    await component.openProjectSkills()

    expect(dialog.open).toHaveBeenCalledWith(
      XpertProjectSkillsDialogComponent,
      expect.objectContaining({
        data: { projectId: 'project-1', skills: [], canEdit: false }
      })
    )
  })
})
