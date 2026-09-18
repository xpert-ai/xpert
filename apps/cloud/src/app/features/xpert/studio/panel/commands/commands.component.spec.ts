import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { IPromptWorkflow } from '@xpert-ai/contracts'
import { BehaviorSubject, of } from 'rxjs'
import { PromptWorkflowAPIService, ToastrService, XpertAPIService } from '../../../../../@core'
import { SkillPackageService } from '../../../../../@core/services/skill-package.service'
import { XpertStudioApiService } from '../../domain'
import { XpertStudioPanelComponent } from '../panel.component'
import { XpertStudioPanelCommandsComponent } from './commands.component'

jest.mock('../panel.component', () => ({ XpertStudioPanelComponent: class {} }))
jest.mock('../../domain', () => ({ XpertStudioApiService: class {} }))

jest.mock('@milkdown/crepe', () => ({
  Crepe: class {
    static Feature = {}
  }
}))

const workflows: IPromptWorkflow[] = [
  { id: 'shared', name: 'shared', template: 'Shared', associatedXpertIds: [] },
  { id: 'own', name: 'own', template: 'Own', associatedXpertIds: ['expert-1'] },
  { id: 'other', name: 'other', template: 'Other', associatedXpertIds: ['expert-2'] }
]

describe('Expert command configuration scope', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        {
          provide: XpertStudioApiService,
          useValue: { team: signal({ id: 'expert-1' }), workspaceId: signal('workspace-1') }
        },
        { provide: XpertStudioPanelComponent, useValue: { sidePanel: signal(null) } },
        {
          provide: XpertAPIService,
          useValue: { getCommandProfile: () => of({ profile: { version: 1, enabled: true, commands: [] } }) }
        },
        {
          provide: PromptWorkflowAPIService,
          useValue: { getAllByWorkspace: () => new BehaviorSubject({ items: workflows }) }
        },
        { provide: SkillPackageService, useValue: { getAllByWorkspace: () => new BehaviorSubject({ items: [] }) } },
        { provide: ToastrService, useValue: { error: jest.fn(), success: jest.fn() } }
      ]
    })
  })
  afterEach(() => TestBed.resetTestingModule())

  it('loads from live workspace streams and defaults to the eligible workspace prompts', async () => {
    const component = TestBed.runInInjectionContext(() => new XpertStudioPanelCommandsComponent())
    await Promise.resolve()
    expect(component.loading()).toBe(false)
    expect(component.activeWorkflows().map((item) => item.id)).toEqual(['shared', 'own'])
    expect(component.isWorkspaceEnabled(workflows[0])).toBe(true)
    expect(component.isWorkspaceEnabled(workflows[2])).toBe(false)
    component.toggleWorkspace(workflows[2], true)
    expect(component.entries()).toEqual([])
    component.toggleWorkspace(workflows[0], false)
    expect(component.isWorkspaceEnabled(workflows[0])).toBe(false)
    expect(component.entries()).toEqual([expect.objectContaining({ workflowId: 'shared', enabled: false })])
  })
})
