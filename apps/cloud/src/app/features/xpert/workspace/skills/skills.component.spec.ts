import { Dialog } from '@angular/cdk/dialog'
import { Component, EventEmitter, Input, Output, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { FileWorkbenchComponent } from '@cloud/app/@shared/files'
import { XpertSkillIndexesComponent, XpertSkillRepositoriesComponent } from '@cloud/app/@shared/skills'
import { TranslateModule } from '@ngx-translate/core'
import { of } from 'rxjs'
import { ISkillPackage, SkillPackageService, ToastrService } from '../../../../@core'
import { XpertWorkspaceHomeComponent } from '../home/home.component'
import { XpertWorkspaceSkillsComponent } from './skills.component'

@Component({
  standalone: true,
  selector: 'pac-file-workbench',
  template: ''
})
class MockFileWorkbenchComponent {
  @Input() rootId: string | null = null
  @Input() rootLabel: string | null = null
  @Input() filesLoader?: unknown
  @Input() fileLoader?: unknown
  @Input() fileSaver?: unknown
  @Input() mobilePane: 'tree' | 'file' = 'tree'
  @Output() readonly mobilePaneChange = new EventEmitter<'tree' | 'file'>()

  readonly guardDirtyBefore = jest.fn(async (action: () => Promise<void> | void) => {
    await action()
    return true
  })
}

@Component({
  standalone: true,
  selector: 'xp-skill-repositories',
  template: ''
})
class MockSkillRepositoriesComponent {
  @Input() readonly?: boolean
  @Input() selectedRepository?: unknown
  @Output() readonly selectedRepositoryChange = new EventEmitter<unknown>()
}

@Component({
  standalone: true,
  selector: 'xp-skill-indexes',
  template: ''
})
class MockSkillIndexesComponent {
  @Input() selectedRepository?: unknown
  @Output() readonly installing = new EventEmitter<unknown>()
}

function createRepositorySkill(id = 'skill-1'): ISkillPackage {
  return {
    id,
    name: 'analyze-new-repo',
    visibility: 'private',
    packagePath: 'clawhub/analyze-new-repo',
    metadata: {
      name: 'analyze-new-repo',
      version: '1.0.0',
      summary: {
        en_US: 'Analyze unfamiliar repositories.'
      },
      displayName: {
        en_US: 'Analyze New Repo'
      },
      visibility: 'private',
      tags: ['analysis']
    },
    skillIndex: {
      id: 'index-1',
      name: 'Analyze New Repo',
      skillId: 'clawhub/analyze-new-repo',
      skillPath: 'clawhub/analyze-new-repo',
      stats: {
        stars: 42
      },
      publisher: {
        displayName: 'ClawHub'
      },
      repository: {
        id: 'repo-1',
        name: 'clawhub/skills',
        provider: 'github'
      }
    }
  } as ISkillPackage
}

function createLocalSkill(id = 'skill-2'): ISkillPackage {
  return {
    id,
    name: 'custom-skill',
    visibility: 'private',
    packagePath: 'custom-skill',
    metadata: {
      name: 'custom-skill',
      version: '1.0.0',
      displayName: {
        en_US: 'Custom Skill'
      },
      summary: {
        en_US: 'Uploaded manually'
      },
      author: {
        name: 'Workspace Owner'
      },
      visibility: 'private'
    }
  } as ISkillPackage
}

async function setup(skills: ISkillPackage[] = [createRepositorySkill(), createLocalSkill()]) {
  const skillPackageService = {
    getAllByWorkspace: jest.fn(() => of({ items: skills })),
    installPackage: jest.fn(() => of(createRepositorySkill('skill-3'))),
    delete: jest.fn(() => of(null)),
    uninstallPackages: jest.fn(() => of(null)),
    uninstallPackageInWorkspace: jest.fn(() => of(null)),
    getFiles: jest.fn(),
    getFile: jest.fn(),
    saveFile: jest.fn()
  }
  const dialog = {
    open: jest.fn(() => ({
      close: jest.fn(),
      closed: of(null)
    }))
  }
  const toastr = {
    success: jest.fn(),
    danger: jest.fn()
  }

  TestBed.resetTestingModule()
  TestBed.overrideComponent(XpertWorkspaceSkillsComponent, {
    remove: {
      imports: [FileWorkbenchComponent, XpertSkillRepositoriesComponent, XpertSkillIndexesComponent]
    },
    add: {
      imports: [MockFileWorkbenchComponent, MockSkillRepositoriesComponent, MockSkillIndexesComponent]
    }
  })
  await TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot(), XpertWorkspaceSkillsComponent],
    providers: [
      {
        provide: XpertWorkspaceHomeComponent,
        useValue: {
          workspace: signal({
            id: 'workspace-1'
          })
        }
      },
      {
        provide: SkillPackageService,
        useValue: skillPackageService
      },
      {
        provide: Dialog,
        useValue: dialog
      },
      {
        provide: ToastrService,
        useValue: toastr
      }
    ]
  }).compileComponents()

  const fixture = TestBed.createComponent(XpertWorkspaceSkillsComponent)
  fixture.detectChanges()
  await fixture.whenStable()
  fixture.detectChanges()

  const workbench = fixture.debugElement.query(By.directive(MockFileWorkbenchComponent)).componentInstance as MockFileWorkbenchComponent

  return {
    fixture,
    component: fixture.componentInstance,
    skillPackageService,
    workbench
  }
}

describe('XpertWorkspaceSkillsComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('loads installed skills and wires the active skill into the shared workbench', async () => {
    const { component, skillPackageService, workbench } = await setup()

    expect(component.activeSkill()?.id).toBe('skill-1')
    expect(skillPackageService.getAllByWorkspace).toHaveBeenCalledWith('workspace-1', {
      relations: ['skillIndex', 'skillIndex.repository']
    })
    expect(workbench.rootId).toBe('skill-1')
    expect(workbench.rootLabel).toBe('Analyze New Repo')
  })

  it('guards skill switches through the shared workbench', async () => {
    const { component, workbench } = await setup()

    await component.activateSkill(createLocalSkill())

    expect(workbench.guardDirtyBefore).toHaveBeenCalled()
    expect(component.activeSkill()?.id).toBe('skill-2')
  })

  it('renders local upload fallbacks when repository metadata is missing', async () => {
    const { component, fixture } = await setup()

    expect(component.publisherLabel(createLocalSkill())).toBe('Workspace Owner')
    expect(component.repositoryLabel(createLocalSkill())).toBeTruthy()
    expect(fixture.nativeElement.textContent).toContain('Custom Skill')
  })
})
