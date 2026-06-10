import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { of } from 'rxjs'
import { XpertTypeEnum } from '@cloud/app/@core'
import { BlankXpertWizardResult, XpertNewBlankComponent } from '../../../xpert/xpert/blank/blank.component'
import { TPluginWithDownloads } from '../types'
import { PluginResourcesComponent } from '../resources/resources.component'
import { PluginMarketplaceDetailComponent } from './marketplace-detail.component'

function createPlugin(overrides: Partial<TPluginWithDownloads> = {}): TPluginWithDownloads {
  return {
    name: '@xpert-ai/plugin-salesclaw',
    packageName: '@xpert-ai/plugin-salesclaw',
    displayName: 'SalesClaw',
    description: 'SalesClaw plugin',
    version: '0.0.1',
    category: 'middleware',
    icon: {
      type: 'font',
      value: 'ri-puzzle-2-line'
    },
    author: {
      name: 'XpertAI',
      url: ''
    },
    installed: true,
    contributions: [
      {
        type: 'assistant-template',
        name: 'salesclaw-business-assistant',
        displayName: 'SalesClaw Business Assistant Template'
      }
    ],
    ...overrides
  } as TPluginWithDownloads
}

async function createComponent(plugin: TPluginWithDownloads) {
  const dialogRef = {
    close: jest.fn()
  }
  const dialog = {
    open: jest.fn(() => ({
      closed: of({
        xpert: {
          id: 'xpert-1'
        },
        status: 'created'
      } satisfies BlankXpertWizardResult)
    }))
  }
  const router = {
    navigate: jest.fn()
  }

  await TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot(), PluginMarketplaceDetailComponent],
    providers: [
      {
        provide: DIALOG_DATA,
        useValue: { plugin }
      },
      {
        provide: DialogRef,
        useValue: dialogRef
      },
      {
        provide: Dialog,
        useValue: dialog
      },
      {
        provide: Router,
        useValue: router
      }
    ]
  }).compileComponents()

  const fixture = TestBed.createComponent(PluginMarketplaceDetailComponent)
  fixture.detectChanges()
  await fixture.whenStable()

  return {
    component: fixture.componentInstance,
    dialog,
    dialogRef,
    fixture,
    router
  } satisfies {
    component: PluginMarketplaceDetailComponent
    dialog: typeof dialog
    dialogRef: typeof dialogRef
    fixture: ComponentFixture<PluginMarketplaceDetailComponent>
    router: typeof router
  }
}

describe('PluginMarketplaceDetailComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('identifies assistant template contributions', async () => {
    const { component } = await createComponent(createPlugin())
    const content = component.contents()[0]

    expect(component.isAssistantTemplate(content)).toBe(true)
    expect(component.contentTypeIcon(content.type)).toBe('ri-robot-2-line')
  })

  it('does not initialize assistant templates before the plugin is installed', async () => {
    const { component, dialog } = await createComponent(createPlugin({ installed: false }))

    component.initializeAssistantTemplate(component.contents()[0])

    expect(dialog.open).not.toHaveBeenCalled()
  })

  it('opens the Xpert wizard with the resolved namespaced template id', async () => {
    const { component, dialog, dialogRef, router } = await createComponent(createPlugin())

    component.initializeAssistantTemplate(component.contents()[0])

    expect(dialog.open).toHaveBeenCalledWith(
      XpertNewBlankComponent,
      expect.objectContaining({
        disableClose: true,
        data: expect.objectContaining({
          allowedModes: [XpertTypeEnum.Agent],
          allowWorkspaceSelection: true,
          completionMode: 'create',
          initialStartMode: 'template',
          initialTemplateId: '@xpert-ai/plugin-salesclaw:salesclaw-business-assistant',
          lockStartMode: true,
          lockType: true,
          type: XpertTypeEnum.Agent
        })
      })
    )
    expect(dialogRef.close).toHaveBeenCalled()
    expect(router.navigate).toHaveBeenCalledWith(['/xpert/x/', 'xpert-1'])
  })

  it('uses metadata.templateId when provided', async () => {
    const { component, dialog } = await createComponent(
      createPlugin({
        contributions: [
          {
            type: 'assistant-template',
            name: 'ignored-template-key',
            metadata: {
              templateId: '@acme/plugin-crm:crm-business-assistant'
            }
          }
        ]
      })
    )

    component.initializeAssistantTemplate(component.contents()[0])

    expect(dialog.open).toHaveBeenCalledWith(
      XpertNewBlankComponent,
      expect.objectContaining({
        data: expect.objectContaining({
          initialTemplateId: '@acme/plugin-crm:crm-business-assistant'
        })
      })
    )
  })

  it('opens plugin resource initialization for skill contributions', async () => {
    const { component, dialog } = await createComponent(
      createPlugin({
        contributions: [
          {
            type: 'skill',
            name: 'browser-research',
            displayName: 'Browser Research Skill'
          }
        ]
      })
    )

    const resource = component.resourceContribution(component.contents()[0])
    expect(resource?.componentType).toBe('skill')

    if (!resource) {
      throw new Error('Expected resource contribution')
    }
    component.initializeResource(resource)

    expect(dialog.open).toHaveBeenCalledWith(
      PluginResourcesComponent,
      expect.objectContaining({
        data: expect.objectContaining({
          plugin: expect.objectContaining({
            name: '@xpert-ai/plugin-salesclaw',
            loadStatus: 'loaded'
          }),
          initialComponents: [
            {
              componentType: 'skill',
              componentKey: 'browser-research'
            }
          ],
          initialInstallMode: 'workspace'
        })
      })
    )
  })

  it('opens plugin resource initialization in Xpert mode for hook contributions', async () => {
    const { component, dialog } = await createComponent(
      createPlugin({
        contributions: [
          {
            type: 'hook',
            name: 'hooks',
            displayName: 'Browser Safety Hooks'
          }
        ]
      })
    )

    const resource = component.resourceContribution(component.contents()[0])
    expect(resource?.componentType).toBe('hook')

    if (!resource) {
      throw new Error('Expected resource contribution')
    }
    component.initializeResource(resource)

    expect(dialog.open).toHaveBeenCalledWith(
      PluginResourcesComponent,
      expect.objectContaining({
        data: expect.objectContaining({
          initialComponents: [
            {
              componentType: 'hook',
              componentKey: 'hooks'
            }
          ],
          initialInstallMode: 'xpert'
        })
      })
    )
  })
})
