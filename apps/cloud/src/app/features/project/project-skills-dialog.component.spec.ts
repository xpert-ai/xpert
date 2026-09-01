import { TestBed } from '@angular/core/testing'
import type { TXpertProjectSkillSummary } from '@xpert-ai/contracts'
import { Z_MODAL_DATA, ZardDialogRef } from '@xpert-ai/headless-ui'
import { of } from 'rxjs'
import { ToastrService } from '../../@core'
import { XpertProjectApiService } from './project-api.service'
import { XpertProjectSkillsDialogComponent } from './project-skills-dialog.component'

describe('XpertProjectSkillsDialogComponent', () => {
  const skill: TXpertProjectSkillSummary = {
    id: 'pdf',
    name: 'PDF',
    path: 'skills/pdf/SKILL.md',
    enabled: true,
    source: 'repository'
  }
  const api = {
    setSkillEnabled: jest.fn(),
    uninstallSkill: jest.fn()
  }
  const dialogRef = { close: jest.fn() }
  const toastr = {
    error: jest.fn(),
    confirm: jest.fn(() => of(true))
  }

  beforeEach(() => {
    jest.clearAllMocks()
    api.setSkillEnabled.mockReturnValue(of({ ...skill, enabled: false }))
    api.uninstallSkill.mockReturnValue(of(undefined))
    TestBed.configureTestingModule({
      imports: [XpertProjectSkillsDialogComponent],
      providers: [
        { provide: ZardDialogRef, useValue: dialogRef },
        { provide: Z_MODAL_DATA, useValue: { projectId: 'project-1', skills: [skill], canEdit: true } },
        { provide: XpertProjectApiService, useValue: api },
        { provide: ToastrService, useValue: toastr }
      ]
    }).overrideComponent(XpertProjectSkillsDialogComponent, { set: { imports: [], template: '' } })
  })

  it('persists a Project skill enabled-state change', async () => {
    const component = TestBed.createComponent(XpertProjectSkillsDialogComponent).componentInstance

    await component.setEnabled(skill, false)

    expect(api.setSkillEnabled).toHaveBeenCalledWith('project-1', 'pdf', false)
    expect(component.skills()).toEqual([{ ...skill, enabled: false }])
    expect(component.changed()).toBe(true)
  })

  it('uninstalls a confirmed Project skill', async () => {
    const component = TestBed.createComponent(XpertProjectSkillsDialogComponent).componentInstance

    await component.uninstall(skill)

    expect(toastr.confirm).toHaveBeenCalledWith({
      code: 'XP.XProject.UninstallProjectSkillConfirmation',
      params: { name: 'PDF' }
    })
    expect(api.uninstallSkill).toHaveBeenCalledWith('project-1', 'pdf')
    expect(component.skills()).toEqual([])
    expect(component.changed()).toBe(true)
  })
})
