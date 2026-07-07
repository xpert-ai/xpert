import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { of } from 'rxjs'

jest.mock('@cloud/app/@core', () => {
  class SkillPackageService {}
  class ToastrService {}

  return {
    getErrorMessage: (error: unknown) => (error instanceof Error ? error.message : `${error}`),
    SkillPackageService,
    ToastrService
  }
})

import { SkillPackageService, ToastrService } from '@cloud/app/@core'
import { XpertGithubSkillInstallComponent } from './github-install.component'

describe('XpertGithubSkillInstallComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  async function setup() {
    const skillPackageService = {
      installGithubPackages: jest.fn(() => of([{ id: 'skill-1' }]))
    }
    const toastr = {
      success: jest.fn(),
      error: jest.fn()
    }

    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), XpertGithubSkillInstallComponent],
      providers: [
        {
          provide: SkillPackageService,
          useValue: skillPackageService
        },
        {
          provide: ToastrService,
          useValue: toastr
        }
      ]
    }).compileComponents()

    const fixture = TestBed.createComponent(XpertGithubSkillInstallComponent)
    fixture.componentRef.setInput('workspaceId', 'workspace-1')
    fixture.detectChanges()

    return {
      fixture,
      component: fixture.componentInstance,
      skillPackageService,
      toastr
    }
  }

  it('submits npx skills add commands as command input', async () => {
    const { component, skillPackageService } = await setup()
    const command = 'npx skills add Leonxlnx/taste-skill --skill "design-taste-frontend"'

    component.commandControl.setValue(command)
    await component.install()

    expect(skillPackageService.installGithubPackages).toHaveBeenCalledWith('workspace-1', { command })
  })

  it('submits bare owner/repo sources as command input', async () => {
    const { component, skillPackageService } = await setup()

    component.commandControl.setValue('Leonxlnx/taste-skill')
    await component.install()

    expect(skillPackageService.installGithubPackages).toHaveBeenCalledWith('workspace-1', {
      command: 'Leonxlnx/taste-skill'
    })
  })

  it('blocks malformed and non-GitHub commands', async () => {
    const { component, skillPackageService } = await setup()

    component.commandControl.setValue('https://gitlab.com/Leonxlnx/taste-skill')
    await component.install()

    expect(component.commandControl.hasError('githubSkillInstallCommand')).toBe(true)
    expect(skillPackageService.installGithubPackages).not.toHaveBeenCalled()
  })
})
