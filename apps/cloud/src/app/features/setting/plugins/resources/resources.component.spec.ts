jest.mock('@cloud/app/@core', () => {
  const { inject } = jest.requireActual('@angular/core')

  class ToastrService {}
  class XpertAPIService {}
  class XpertWorkspaceService {}

  return {
    ToastrService,
    XpertAPIService,
    XpertWorkspaceService,
    OrderTypeEnum: {
      DESC: 'DESC'
    },
    getErrorMessage: jest.fn((error: unknown) =>
      error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error'
    ),
    injectToastr: jest.fn(() => inject(ToastrService)),
    injectXpertAPI: jest.fn(() => inject(XpertAPIService))
  }
})

import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { of } from 'rxjs'
import { ToastrService, XpertAPIService, XpertWorkspaceService } from '@cloud/app/@core'
import {
  IPluginComponentDefinition,
  IPluginResourceComponentState,
  IPluginResourceInstallResult,
  PLUGIN_COMPONENT_TYPE,
  PLUGIN_RESOURCE_INSTALLATION_STATUS,
  PLUGIN_RESOURCE_RUNTIME_TYPE,
  PluginAPIService
} from '@xpert-ai/cloud/state'
import { PLUGIN_LEVEL } from '@xpert-ai/contracts'
import { TInstalledPlugin } from '../types'
import { PluginResourcesComponent } from './resources.component'

const plugin: TInstalledPlugin = {
  name: '@xpert-ai/plugin-xpertai-browser-lab',
  packageName: '@xpert-ai/plugin-xpertai-browser-lab',
  meta: {
    name: '@xpert-ai/plugin-xpertai-browser-lab',
    version: '0.1.0',
    displayName: 'XpertAI Browser Lab',
    description: 'Browser lab plugin',
    category: 'integration'
  },
  currentVersion: '0.1.0',
  loadStatus: 'loaded',
  isGlobal: false,
  level: PLUGIN_LEVEL.ORGANIZATION,
  effectiveInCurrentScope: true
}

const components: IPluginComponentDefinition[] = [
  {
    componentType: PLUGIN_COMPONENT_TYPE.SKILL,
    componentKey: 'browser-research',
    definitionHash: 'skill-hash'
  },
  {
    componentType: PLUGIN_COMPONENT_TYPE.MCP_SERVER,
    componentKey: 'browser-lab-mcp',
    definitionHash: 'mcp-hash'
  },
  {
    componentType: PLUGIN_COMPONENT_TYPE.APP,
    componentKey: 'browser-lab',
    definitionHash: 'app-hash'
  },
  {
    componentType: PLUGIN_COMPONENT_TYPE.HOOK,
    componentKey: 'browser-safety-hooks',
    definitionHash: 'hook-hash'
  }
]

const installResult: IPluginResourceInstallResult = {
  installations: [],
  pendingAuth: []
}

async function createComponent(
  componentStates: IPluginResourceComponentState[] = [],
  dialogData: Record<string, unknown> = {}
) {
  const pluginAPI = {
    getPluginComponents: jest.fn(() => of({ items: components })),
    getPluginResourceStates: jest.fn(() => of({ items: componentStates })),
    installResourcesToWorkspace: jest.fn(() => of(installResult)),
    installResourcesToXpert: jest.fn(() => of(installResult))
  }
  const dialogRef = {
    close: jest.fn()
  }

  await TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot(), PluginResourcesComponent],
    providers: [
      {
        provide: DIALOG_DATA,
        useValue: {
          plugin,
          ...dialogData
        }
      },
      {
        provide: DialogRef,
        useValue: dialogRef
      },
      {
        provide: PluginAPIService,
        useValue: pluginAPI
      },
      {
        provide: XpertWorkspaceService,
        useValue: {
          getAllMy: jest.fn(() => of({ items: [{ id: 'workspace-1', name: 'Workspace 1' }] }))
        }
      },
      {
        provide: XpertAPIService,
        useValue: {
          getAllByWorkspace: jest.fn(() => of({ items: [] }))
        }
      },
      {
        provide: ToastrService,
        useValue: {
          success: jest.fn()
        }
      }
    ]
  }).compileComponents()

  const fixture = TestBed.createComponent(PluginResourcesComponent)
  fixture.detectChanges()
  await fixture.whenStable()
  fixture.detectChanges()

  return {
    component: fixture.componentInstance,
    fixture,
    dialogRef,
    pluginAPI
  }
}

describe('PluginResourcesComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('separates installable resources by target', async () => {
    const { component, fixture } = await createComponent()

    expect(component.installMode()).toBe('workspace')
    expect(component.installableComponents().map((item) => item.componentType)).toEqual([
      PLUGIN_COMPONENT_TYPE.SKILL,
      PLUGIN_COMPONENT_TYPE.MCP_SERVER,
      PLUGIN_COMPONENT_TYPE.APP
    ])

    component.selectAllInstallable()
    expect(component.selectedComponents().map((item) => item.componentKey)).toEqual([
      'browser-research',
      'browser-lab-mcp',
      'browser-lab'
    ])

    component.installMode.set('xpert')
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(component.installableComponents().map((item) => item.componentType)).toEqual([PLUGIN_COMPONENT_TYPE.HOOK])
    expect(component.selectedComponents()).toEqual([])

    component.selectAllInstallable()
    expect(component.selectedComponents().map((item) => item.componentKey)).toEqual(['browser-safety-hooks'])
  })

  it('keeps already installed resources visible but not installable', async () => {
    const { component } = await createComponent([
      {
        componentType: PLUGIN_COMPONENT_TYPE.SKILL,
        componentKey: 'browser-research',
        installed: true,
        staleDefinition: false,
        runtimeType: PLUGIN_RESOURCE_RUNTIME_TYPE.SKILL_PACKAGE,
        runtimeId: 'skill-package-1',
        status: PLUGIN_RESOURCE_INSTALLATION_STATUS.READY,
        installation: null
      }
    ])

    expect(component.targetComponents().map((item) => item.componentKey)).toEqual([
      'browser-research',
      'browser-lab-mcp',
      'browser-lab'
    ])
    expect(component.installableComponents().map((item) => item.componentKey)).toEqual([
      'browser-lab-mcp',
      'browser-lab'
    ])

    component.selectAllInstallable()
    expect(component.selectedComponents().map((item) => item.componentKey)).toEqual(['browser-lab-mcp', 'browser-lab'])

    const installedSkill = component.targetComponents().find((item) => item.componentKey === 'browser-research')
    if (!installedSkill) {
      throw new Error('Expected installed skill')
    }

    component.toggleComponent(installedSkill, true)
    expect(component.selectedComponents().map((item) => item.componentKey)).toEqual(['browser-lab-mcp', 'browser-lab'])
  })

  it('uses the provided initial workspace instead of defaulting to the first workspace', async () => {
    const { component, pluginAPI } = await createComponent([], {
      initialWorkspaceId: 'workspace-2',
      initialInstallMode: 'workspace'
    })

    expect(component.selectedWorkspaceId()).toBe('workspace-2')
    expect(pluginAPI.getPluginResourceStates).toHaveBeenCalledWith('@xpert-ai/plugin-xpertai-browser-lab', {
      pluginName: '@xpert-ai/plugin-xpertai-browser-lab',
      target: 'workspace',
      workspaceId: 'workspace-2'
    })
  })

  it('closes with the install result when closeOnSuccess is enabled', async () => {
    const { component, dialogRef } = await createComponent([], {
      closeOnSuccess: true,
      initialComponents: [
        {
          componentType: PLUGIN_COMPONENT_TYPE.SKILL,
          componentKey: 'browser-research'
        }
      ],
      initialInstallMode: 'workspace'
    })

    expect(component.canSubmit()).toBe(true)

    await component.submit()

    expect(dialogRef.close).toHaveBeenCalledWith(installResult)
  })
})
