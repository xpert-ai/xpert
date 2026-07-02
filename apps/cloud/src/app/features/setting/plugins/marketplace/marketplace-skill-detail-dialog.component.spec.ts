jest.mock('@cloud/app/@core', () => {
  return {
    getErrorMessage: jest.fn((error: unknown) =>
      error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error'
    ),
    injectToastr: jest.fn(() => ({
      error: jest.fn()
    }))
  }
})

jest.mock('@cloud/app/@shared/avatar/icon/icon.component', () => {
  const { Component, Input } = jest.requireActual('@angular/core')

  @Component({
    standalone: true,
    selector: 'xp-icon',
    template: ''
  })
  class IconComponent {
    @Input() icon?: unknown
    @Input() size?: string | number
  }

  return { IconComponent }
})

jest.mock('ngx-markdown', () => {
  const { Component, EventEmitter, Input, NgModule, Output } = jest.requireActual('@angular/core')

  @Component({
    standalone: true,
    selector: 'markdown',
    template: '<div class="mock-markdown">{{ data }}</div>'
  })
  class MarkdownComponent {
    @Input() data?: string
    @Output() ready = new EventEmitter<void>()
  }

  @NgModule({
    imports: [MarkdownComponent],
    exports: [MarkdownComponent]
  })
  class MarkdownModule {}

  return {
    MarkdownModule,
    MarkdownComponent
  }
})

import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { of } from 'rxjs'
import { PLUGIN_COMPONENT_TYPE, PluginAPIService } from '@xpert-ai/cloud/state'
import { TPluginWithDownloads } from '../types'
import { PluginMarketplaceSkillDetailDialogComponent } from './marketplace-skill-detail-dialog.component'
import { PluginSkillTrialLauncherService } from './plugin-skill-trial-launcher.service'

const plugin: TPluginWithDownloads = {
  name: '@xpert-ai/plugin-documents',
  packageName: '@xpert-ai/plugin-documents',
  displayName: 'Documents',
  description: 'Create and edit documents',
  version: '0.1.0',
  category: 'integration',
  icon: {
    type: 'font',
    value: 'ri-file-text-line'
  },
  author: {
    name: 'XpertAI',
    url: ''
  },
  installed: true,
  contributions: []
}

async function createComponent(options: { trialStarted?: boolean } = {}) {
  const pluginAPI = {
    getPluginSkillDocument: jest.fn(() =>
      of({
        pluginName: '@xpert-ai/plugin-documents',
        componentType: PLUGIN_COMPONENT_TYPE.SKILL,
        componentKey: 'documents',
        sourcePath: './skills/documents/SKILL.md',
        fileName: 'SKILL.md',
        content: '# Documents\n\nCreate docs.'
      })
    )
  }
  const dialogRef = {
    close: jest.fn()
  }
  const trialLauncher = {
    openInstallDialog: jest.fn(() => Promise.resolve(null)),
    tryInClawXpert: jest.fn(() => Promise.resolve(options.trialStarted ?? true))
  }

  await TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot(), PluginMarketplaceSkillDetailDialogComponent],
    providers: [
      {
        provide: DIALOG_DATA,
        useValue: {
          plugin,
          content: {
            type: 'skill',
            name: 'documents',
            displayName: 'Documents Skill',
            description: 'Create and edit docs'
          },
          resource: {
            type: 'skill',
            name: 'documents',
            componentType: PLUGIN_COMPONENT_TYPE.SKILL
          },
          component: {
            componentType: PLUGIN_COMPONENT_TYPE.SKILL,
            componentKey: 'documents',
            sourcePath: './skills/documents/SKILL.md',
            definitionHash: 'skill-hash'
          }
        }
      },
      {
        provide: PluginAPIService,
        useValue: pluginAPI
      },
      {
        provide: PluginSkillTrialLauncherService,
        useValue: trialLauncher
      },
      {
        provide: DialogRef,
        useValue: dialogRef
      }
    ]
  }).compileComponents()

  const fixture = TestBed.createComponent(PluginMarketplaceSkillDetailDialogComponent)
  fixture.detectChanges()
  await fixture.whenStable()
  fixture.detectChanges()

  return {
    component: fixture.componentInstance,
    dialogRef,
    fixture,
    pluginAPI,
    trialLauncher
  }
}

describe('PluginMarketplaceSkillDetailDialogComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('loads and renders the skill markdown document', async () => {
    const { component, fixture, pluginAPI } = await createComponent()

    expect(pluginAPI.getPluginSkillDocument).toHaveBeenCalledWith('@xpert-ai/plugin-documents', 'documents')
    expect(component.document()?.content).toContain('# Documents')
    expect(fixture.nativeElement.textContent).toContain('Create docs.')
  })

  it('opens the resources dialog preselected for the current skill', async () => {
    const { component, trialLauncher } = await createComponent()

    component.installToWorkspace()

    expect(trialLauncher.openInstallDialog).toHaveBeenCalledWith({
      plugin,
      resource: expect.objectContaining({
        name: 'documents',
        componentType: PLUGIN_COMPONENT_TYPE.SKILL
      }),
      closeOnSuccess: false
    })
  })

  it('starts a ClawXpert trial with an already installed skill package', async () => {
    const { component, dialogRef, trialLauncher } = await createComponent()

    await component.tryInClawXpert()

    expect(trialLauncher.tryInClawXpert).toHaveBeenCalledWith({
      plugin,
      resource: expect.objectContaining({
        name: 'documents',
        componentType: PLUGIN_COMPONENT_TYPE.SKILL
      }),
      label: 'Documents Skill'
    })
    expect(dialogRef.close).toHaveBeenCalledWith({ action: 'trial-started' })
  })

  it('does not close the dialog when the trial launcher does not start', async () => {
    const { component, dialogRef, trialLauncher } = await createComponent({ trialStarted: false })

    await component.tryInClawXpert()

    expect(trialLauncher.tryInClawXpert).toHaveBeenCalled()
    expect(dialogRef.close).not.toHaveBeenCalled()
  })
})
