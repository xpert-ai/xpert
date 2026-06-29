jest.mock('../../../xpert/xpert/blank/blank.component', () => {
  const { Component } = jest.requireActual('@angular/core')

  @Component({
    standalone: true,
    selector: 'xpert-new-blank',
    template: ''
  })
  class XpertNewBlankComponent {}

  return { XpertNewBlankComponent }
})

jest.mock('../resources/resources.component', () => {
  const { Component } = jest.requireActual('@angular/core')

  @Component({
    standalone: true,
    selector: 'xp-plugin-resources',
    template: ''
  })
  class PluginResourcesComponent {}

  return { PluginResourcesComponent }
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

import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { of } from 'rxjs'
import { XpertTypeEnum } from '@xpert-ai/contracts'
import { IPluginComponentDefinition, PLUGIN_COMPONENT_TYPE, PluginAPIService } from '@xpert-ai/cloud/state'
import { XpertNewBlankComponent } from '../../../xpert/xpert/blank/blank.component'
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

const defaultComponents: IPluginComponentDefinition[] = [
  {
    componentType: PLUGIN_COMPONENT_TYPE.SKILL,
    componentKey: 'browser-research',
    definitionHash: 'skill-hash'
  },
  {
    componentType: PLUGIN_COMPONENT_TYPE.HOOK,
    componentKey: 'hooks',
    definitionHash: 'hook-hash'
  }
]

async function createComponent(
  plugin: TPluginWithDownloads,
  components: IPluginComponentDefinition[] = defaultComponents
) {
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
      })
    }))
  }
  const router = {
    navigate: jest.fn()
  }
  const pluginAPI = {
    getPluginComponents: jest.fn(() => of({ items: components }))
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
      },
      {
        provide: PluginAPIService,
        useValue: pluginAPI
      }
    ]
  }).compileComponents()

  const fixture = TestBed.createComponent(PluginMarketplaceDetailComponent)
  fixture.detectChanges()
  await fixture.whenStable()
  fixture.detectChanges()
  await fixture.whenStable()

  return {
    component: fixture.componentInstance,
    dialog,
    dialogRef,
    fixture,
    pluginAPI,
    router
  } satisfies {
    component: PluginMarketplaceDetailComponent
    dialog: typeof dialog
    dialogRef: typeof dialogRef
    fixture: ComponentFixture<PluginMarketplaceDetailComponent>
    pluginAPI: typeof pluginAPI
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

  it('styles content type badges by contribution type', async () => {
    const { fixture } = await createComponent(
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

    const badges = Array.from(fixture.nativeElement.querySelectorAll<HTMLElement>('z-badge'))

    expect(badges.some((badge) => badge.className.includes('bg-state-success-hover/20'))).toBe(true)
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

  it('does not expose install action for app contributions without a real app component', async () => {
    const { component, fixture } = await createComponent(
      createPlugin({
        contributions: [
          {
            type: 'app',
            name: 'canvas',
            displayName: 'Canvas'
          }
        ]
      }),
      []
    )

    const app = component.appContents()[0]

    expect(app.type).toBe('app')
    expect(component.contents()).toHaveLength(0)
    expect(component.resourceContribution(app)).toBeNull()
    expect(component.appSetupAction(app).type).toBe('details')
    expect(fixture.nativeElement.textContent).not.toContain('Install app')
    expect(fixture.nativeElement.textContent).not.toContain('PAC.Plugin.InstallApp')
  })

  it('initializes the associated assistant template from an app without a real app component', async () => {
    const { component, dialog } = await createComponent(
      createPlugin({
        contributions: [
          {
            type: 'app',
            name: 'canvas',
            displayName: 'Canvas'
          },
          {
            type: 'assistant-template',
            name: 'canvas-assistant',
            displayName: 'Canvas Assistant',
            metadata: {
              app: 'canvas'
            }
          }
        ]
      }),
      []
    )

    const app = component.appContents()[0]

    expect(component.appSetupAction(app).type).toBe('initialize-template')

    component.handleAppAction(app)

    expect(dialog.open).toHaveBeenCalledWith(
      XpertNewBlankComponent,
      expect.objectContaining({
        data: expect.objectContaining({
          initialTemplateId: '@xpert-ai/plugin-salesclaw:canvas-assistant'
        })
      })
    )
  })

  it('falls back to the only assistant template when there is one app and one template', async () => {
    const { component } = await createComponent(
      createPlugin({
        contributions: [
          {
            type: 'app',
            name: 'canvas',
            displayName: 'Canvas'
          },
          {
            type: 'assistant-template',
            name: 'canvas-assistant',
            displayName: 'Canvas Assistant'
          }
        ]
      }),
      []
    )

    expect(component.appTemplates(component.appContents()[0]).map((template) => template.name)).toEqual([
      'canvas-assistant'
    ])
  })

  it('requires template selection when an app has multiple associated assistant templates', async () => {
    const { component, dialog } = await createComponent(
      createPlugin({
        contributions: [
          {
            type: 'app',
            name: 'canvas',
            displayName: 'Canvas'
          },
          {
            type: 'assistant-template',
            name: 'canvas-assistant',
            displayName: 'Canvas Assistant',
            metadata: {
              app: 'canvas'
            }
          },
          {
            type: 'assistant-template',
            name: 'canvas-reviewer',
            displayName: 'Canvas Reviewer',
            metadata: {
              app: 'canvas'
            }
          }
        ]
      }),
      []
    )

    const app = component.appContents()[0]

    expect(component.appSetupAction(app).type).toBe('select-template')

    component.handleAppAction(app)

    expect(component.selectedApp()).toBe(app)
    expect(dialog.open).not.toHaveBeenCalled()
  })

  it('opens plugin resource initialization for app contributions backed by a real app component', async () => {
    const { component, dialog } = await createComponent(
      createPlugin({
        contributions: [
          {
            type: 'app',
            name: 'browser-lab',
            displayName: 'Browser Lab'
          }
        ]
      }),
      [
        {
          componentType: PLUGIN_COMPONENT_TYPE.APP,
          componentKey: 'browser-lab',
          definitionHash: 'app-hash'
        }
      ]
    )

    const app = component.appContents()[0]
    const resource = component.resourceContribution(app)
    expect(resource?.componentType).toBe('app')
    expect(component.appSetupAction(app).type).toBe('install-app')

    if (!resource) {
      throw new Error('Expected app resource contribution')
    }
    component.handleAppAction(app)

    expect(dialog.open).toHaveBeenCalledWith(
      PluginResourcesComponent,
      expect.objectContaining({
        data: expect.objectContaining({
          initialComponents: [
            {
              componentType: 'app',
              componentKey: 'browser-lab'
            }
          ],
          initialInstallMode: 'workspace'
        })
      })
    )
  })

  it('does not expose install action for tool contributions without a real MCP server component', async () => {
    const { component } = await createComponent(
      createPlugin({
        contributions: [
          {
            type: 'tool',
            name: 'CanvasMiddleware',
            displayName: 'Canvas Agent Tools'
          }
        ]
      }),
      []
    )

    expect(component.marketplaceContents()).toHaveLength(1)
    expect(component.contents()).toHaveLength(0)
    expect(component.resourceContribution(component.marketplaceContents()[0])).toBeNull()
  })

  it('keeps install action for tool contributions backed by a real MCP server component', async () => {
    const { component, dialog } = await createComponent(
      createPlugin({
        contributions: [
          {
            type: 'tool',
            name: 'browser-lab-mcp',
            displayName: 'Browser Lab MCP'
          }
        ]
      }),
      [
        {
          componentType: PLUGIN_COMPONENT_TYPE.MCP_SERVER,
          componentKey: 'browser-lab-mcp',
          definitionHash: 'mcp-hash'
        }
      ]
    )

    const resource = component.resourceContribution(component.contents()[0])
    expect(resource?.componentType).toBe('mcp_server')

    if (!resource) {
      throw new Error('Expected MCP resource contribution')
    }
    component.initializeResource(resource)

    expect(dialog.open).toHaveBeenCalledWith(
      PluginResourcesComponent,
      expect.objectContaining({
        data: expect.objectContaining({
          initialComponents: [
            {
              componentType: 'mcp_server',
              componentKey: 'browser-lab-mcp'
            }
          ],
          initialInstallMode: 'workspace'
        })
      })
    )
  })

  it('folds view and middleware content into the selected app capabilities', async () => {
    const { component, fixture } = await createComponent(
      createPlugin({
        contributions: [
          {
            type: 'app',
            name: 'canvas',
            displayName: 'Canvas'
          },
          {
            type: 'view',
            name: 'canvas-workbench',
            displayName: 'Canvas Workbench',
            metadata: {
              app: 'canvas'
            }
          },
          {
            type: 'middleware',
            name: 'CanvasMiddleware',
            displayName: 'Canvas Agent Tools',
            metadata: {
              app: 'canvas'
            }
          },
          {
            type: 'tool',
            name: 'CanvasMiddleware',
            displayName: 'Legacy Canvas Agent Tools',
            metadata: {
              app: 'canvas'
            }
          }
        ]
      }),
      []
    )

    const app = component.appContents()[0]
    const capabilities = component.appCapabilities(app)

    expect(component.contents()).toHaveLength(0)
    expect(component.appContents().map((content) => content.type)).toEqual(['app'])
    expect(capabilities.map((content) => content.type)).toEqual(['view', 'middleware'])
    expect(capabilities.map((content) => content.displayName)).toEqual(['Canvas Workbench', 'Canvas Agent Tools'])
    expect(fixture.nativeElement.textContent).toContain('Canvas Workbench')
    expect(fixture.nativeElement.textContent).toContain('Canvas Agent Tools')
    expect(fixture.nativeElement.textContent).not.toContain('Legacy Canvas Agent Tools')
  })

  it('does not render app operation groups in the detail view', async () => {
    const { fixture } = await createComponent(
      createPlugin({
        contributions: [
          {
            type: 'app',
            name: 'canvas',
            displayName: 'Canvas',
            operations: [
              {
                name: 'create-canvas-documents',
                displayName: 'Create Canvas documents',
                access: 'write'
              },
              {
                name: 'review-canvas-workbench',
                displayName: 'Review Canvas Workbench',
                access: 'read'
              }
            ]
          }
        ]
      }),
      []
    )

    const text = fixture.nativeElement.textContent

    expect(text).not.toContain('create-canvas-documents')
    expect(text).not.toContain('review-canvas-workbench')
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
