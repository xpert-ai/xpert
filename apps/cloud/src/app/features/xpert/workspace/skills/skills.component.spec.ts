import { Dialog } from '@angular/cdk/dialog'
import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { TranslateModule } from '@ngx-translate/core'
import { of } from 'rxjs'

jest.mock('@cloud/app/@shared/files', () => {
  const { Component, EventEmitter } = require('@angular/core')

  class FileWorkbenchComponent {
    rootId: string | null = null
    rootLabel: string | null = null
    filesLoader?: unknown
    fileLoader?: unknown
    fileSaver?: unknown
    fileUploader?: unknown
    fileDeleter?: unknown
    fileDownloader?: unknown
    mobilePane: 'tree' | 'file' = 'tree'
    readonly mobilePaneChange = new EventEmitter()
    readonly guardDirtyBefore = jest.fn(async (action: () => Promise<void> | void) => {
      await action()
      return true
    })
  }

  Component({
    standalone: true,
    selector: 'pac-file-workbench',
    template: '',
    inputs: [
      'rootId',
      'rootLabel',
      'filesLoader',
      'fileLoader',
      'fileSaver',
      'fileUploader',
      'fileDeleter',
      'fileDownloader',
      'mobilePane'
    ],
    outputs: ['mobilePaneChange']
  })(FileWorkbenchComponent)

  return {
    FileWorkbenchComponent
  }
})

jest.mock('@cloud/app/@shared/skills', () => {
  const { Component, EventEmitter } = require('@angular/core')

  class XpertGithubSkillInstallComponent {
    workspaceId: string | null = null
    showTitle = true
    readonly installed = new EventEmitter()
  }

  class XpertSkillRepositoriesComponent {
    readonly = false
    selectedRepository?: unknown
    readonly selectedRepositoryChange = new EventEmitter()
  }

  class XpertSkillIndexesComponent {
    selectedRepository?: unknown
    readonly installing = new EventEmitter()
  }

  Component({
    standalone: true,
    selector: 'xp-github-skill-install',
    template: '',
    inputs: ['workspaceId', 'showTitle'],
    outputs: ['installed']
  })(XpertGithubSkillInstallComponent)

  Component({
    standalone: true,
    selector: 'xp-skill-repositories',
    template: '',
    inputs: ['readonly', 'selectedRepository'],
    outputs: ['selectedRepositoryChange']
  })(XpertSkillRepositoriesComponent)

  Component({
    standalone: true,
    selector: 'xp-skill-indexes',
    template: '',
    inputs: ['selectedRepository'],
    outputs: ['installing']
  })(XpertSkillIndexesComponent)

  return {
    XpertGithubSkillInstallComponent,
    XpertSkillIndexesComponent,
    XpertSkillRepositoriesComponent
  }
})

jest.mock('@cloud/app/@shared/avatar', () => {
  const { Component } = require('@angular/core')

  class IconComponent {
    icon?: unknown
    size?: number | string | null
  }

  Component({
    standalone: true,
    selector: 'xp-icon',
    template: '',
    inputs: ['icon', 'size']
  })(IconComponent)

  return {
    IconComponent
  }
})

jest.mock('../../../../@core', () => {
  const { inject } = require('@angular/core')

  class SkillPackageService {}
  class ToastrService {}

  return {
    getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : `${error}`),
    injectSkillPackageAPI: () => inject(SkillPackageService),
    injectToastr: () => inject(ToastrService),
    SkillPackageService,
    ToastrService
  }
})

jest.mock('../../assistant-shell/assistant.facade', () => {
  class XpertAssistantFacade {
    workspaceSkillRefresh = () => null
  }

  return {
    XpertAssistantFacade
  }
})

jest.mock('../home/home.component', () => {
  class XpertWorkspaceHomeComponent {}

  return {
    XpertWorkspaceHomeComponent
  }
})

import { FileWorkbenchComponent } from '@cloud/app/@shared/files'
import { SkillPackageService, ToastrService } from '../../../../@core'
import type { ISkillPackage } from '../../../../@core'
import { XpertAssistantFacade } from '../../assistant-shell/assistant.facade'
import { XpertWorkspaceHomeComponent } from '../home/home.component'
import { XpertWorkspaceSkillsComponent } from './skills.component'

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

async function setup(
  skills: ISkillPackage[] = [createRepositorySkill(), createLocalSkill()],
  options?: {
    assistantFacade?: Partial<XpertAssistantFacade>
  }
) {
  const workspace = signal({
    id: 'workspace-1'
  })
  const skillPackageService = {
    getAllByWorkspace: jest.fn(() => of({ items: skills })),
    installPackage: jest.fn(() => of(createRepositorySkill('skill-3'))),
    delete: jest.fn(() => of(null)),
    uninstallPackages: jest.fn(() => of(null)),
    uninstallPackageInWorkspace: jest.fn(() => of(null)),
    getFiles: jest.fn(),
    getFile: jest.fn(),
    downloadPackage: jest.fn(() => of(new Blob(['skill package'], { type: 'application/zip' }))),
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
  await TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot(), XpertWorkspaceSkillsComponent],
    providers: [
      {
        provide: XpertWorkspaceHomeComponent,
        useValue: {
          workspace
        }
      },
      ...(options?.assistantFacade
        ? [
            {
              provide: XpertAssistantFacade,
              useValue: options.assistantFacade
            }
          ]
        : []),
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

  const workbench = fixture.debugElement.query(By.directive(FileWorkbenchComponent))
    .componentInstance as FileWorkbenchComponent

  return {
    fixture,
    component: fixture.componentInstance,
    skillPackageService,
    workspace,
    workbench
  }
}

describe('XpertWorkspaceSkillsComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
    jest.restoreAllMocks()
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

  it('downloads a skill package zip from the card action', async () => {
    const originalCreateObjectURL = URL.createObjectURL
    const originalRevokeObjectURL = URL.revokeObjectURL
    const createObjectURL = jest.fn(() => 'blob:skill-package')
    const revokeObjectURL = jest.fn()
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL
    })
    const click = jest.fn()
    const appendChild = jest.spyOn(document.body, 'appendChild')
    const removeChild = jest.spyOn(document.body, 'removeChild')
    const originalCreateElement = document.createElement.bind(document)
    const createElement = jest.spyOn(document, 'createElement')
    createElement.mockImplementation((tagName: string, options?: ElementCreationOptions) => {
      const element = originalCreateElement(tagName, options)
      if (tagName.toLowerCase() === 'a') {
        Object.defineProperty(element, 'click', {
          configurable: true,
          value: click
        })
      }
      return element
    })

    try {
      const { component, skillPackageService } = await setup()

      await component.downloadSkillPackage(createRepositorySkill())

      expect(skillPackageService.downloadPackage).toHaveBeenCalledWith('workspace-1', 'skill-1')
      expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
      expect(click).toHaveBeenCalled()
      expect(appendChild).toHaveBeenCalledWith(expect.any(HTMLAnchorElement))
      expect(removeChild).toHaveBeenCalledWith(expect.any(HTMLAnchorElement))
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:skill-package')
    } finally {
      createElement.mockRestore()
      appendChild.mockRestore()
      removeChild.mockRestore()
      if (typeof originalCreateObjectURL === 'function') {
        Object.defineProperty(URL, 'createObjectURL', {
          configurable: true,
          value: originalCreateObjectURL
        })
      } else {
        Reflect.deleteProperty(URL, 'createObjectURL')
      }
      if (typeof originalRevokeObjectURL === 'function') {
        Object.defineProperty(URL, 'revokeObjectURL', {
          configurable: true,
          value: originalRevokeObjectURL
        })
      } else {
        Reflect.deleteProperty(URL, 'revokeObjectURL')
      }
    }
  })

  it('processes each assistant skill refresh event once', async () => {
    const workspaceSkillRefresh = signal<ReturnType<XpertAssistantFacade['workspaceSkillRefresh']>>(null)
    const { fixture, skillPackageService, workspace } = await setup(undefined, {
      assistantFacade: {
        workspaceSkillRefresh: workspaceSkillRefresh.asReadonly()
      } as Partial<XpertAssistantFacade>
    })

    expect(skillPackageService.getAllByWorkspace).toHaveBeenCalledTimes(1)

    workspaceSkillRefresh.set({
      workspaceId: 'workspace-1',
      skillId: 'skill-1',
      operation: 'created',
      nonce: 1
    })
    fixture.detectChanges()
    await fixture.whenStable()

    expect(skillPackageService.getAllByWorkspace).toHaveBeenCalledTimes(2)

    workspace.set({ id: 'workspace-1' })
    fixture.detectChanges()
    await fixture.whenStable()

    expect(skillPackageService.getAllByWorkspace).toHaveBeenCalledTimes(2)

    workspaceSkillRefresh.set({
      workspaceId: 'workspace-1',
      skillId: 'skill-1',
      operation: 'created',
      nonce: 2
    })
    fixture.detectChanges()
    await fixture.whenStable()

    expect(skillPackageService.getAllByWorkspace).toHaveBeenCalledTimes(3)
  })
})
