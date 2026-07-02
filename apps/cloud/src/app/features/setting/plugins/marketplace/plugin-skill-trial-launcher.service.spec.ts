jest.mock('../resources/resources.component', () => {
  class PluginResourcesComponent {}

  return { PluginResourcesComponent }
})

jest.mock('../../../chat/clawxpert/clawxpert-binding-target.service', () => {
  class ClawXpertBindingTargetService {}

  return { ClawXpertBindingTargetService }
})

jest.mock('../../../chat/clawxpert/clawxpert-skill-trial-intent.service', () => {
  class ClawXpertSkillTrialIntentService {}

  return { ClawXpertSkillTrialIntentService }
})

import { Dialog } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import { Router } from '@angular/router'
import { of } from 'rxjs'
import {
  IPluginResourceComponentState,
  IPluginResourceInstallResult,
  PLUGIN_COMPONENT_TYPE,
  PLUGIN_RESOURCE_INSTALLATION_STATUS,
  PLUGIN_RESOURCE_RUNTIME_TYPE,
  PluginAPIService
} from '@xpert-ai/cloud/state'
import { ClawXpertBindingTargetService } from '../../../chat/clawxpert/clawxpert-binding-target.service'
import { ClawXpertSkillTrialIntentService } from '../../../chat/clawxpert/clawxpert-skill-trial-intent.service'
import { TPluginWithDownloads } from '../types'
import { PluginResourcesComponent } from '../resources/resources.component'
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

const resource = {
  name: 'documents',
  componentType: PLUGIN_COMPONENT_TYPE.SKILL
}

const readySkillState: IPluginResourceComponentState = {
  componentType: PLUGIN_COMPONENT_TYPE.SKILL,
  componentKey: 'documents',
  installed: true,
  staleDefinition: false,
  runtimeType: PLUGIN_RESOURCE_RUNTIME_TYPE.SKILL_PACKAGE,
  runtimeId: 'skill-package-documents',
  status: PLUGIN_RESOURCE_INSTALLATION_STATUS.READY,
  installation: {
    workspaceId: 'workspace-clawxpert',
    runtimeId: 'skill-package-documents'
  }
} as IPluginResourceComponentState

const installResult: IPluginResourceInstallResult = {
  installations: [
    {
      componentType: PLUGIN_COMPONENT_TYPE.SKILL,
      componentKey: 'documents',
      workspaceId: 'workspace-clawxpert',
      runtimeType: PLUGIN_RESOURCE_RUNTIME_TYPE.SKILL_PACKAGE,
      runtimeId: 'skill-package-installed'
    } as IPluginResourceInstallResult['installations'][number]
  ],
  pendingAuth: []
}

async function createService(
  options: {
    states?: IPluginResourceComponentState[]
    installDialogResult?: IPluginResourceInstallResult | null
    workspaceId?: string | null
  } = {}
) {
  const dialog = {
    open: jest.fn(() => ({
      closed: of(options.installDialogResult === undefined ? installResult : options.installDialogResult)
    }))
  }
  const router = {
    navigate: jest.fn(() => Promise.resolve(true))
  }
  const pluginAPI = {
    getPluginResourceStates: jest.fn(() => of({ items: options.states ?? [] }))
  }
  const bindingTarget = {
    getCurrentUserTarget: jest.fn(() =>
      of(
        options.workspaceId === null
          ? null
          : {
              xpertId: 'clawxpert-xpert',
              workspaceId: options.workspaceId ?? 'workspace-clawxpert',
              label: 'ClawXpert'
            }
      )
    )
  }
  const intent = {
    set: jest.fn()
  }

  await TestBed.configureTestingModule({
    providers: [
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
      },
      {
        provide: ClawXpertBindingTargetService,
        useValue: bindingTarget
      },
      {
        provide: ClawXpertSkillTrialIntentService,
        useValue: intent
      }
    ]
  })

  return {
    service: TestBed.inject(PluginSkillTrialLauncherService),
    bindingTarget,
    dialog,
    intent,
    pluginAPI,
    router
  }
}

describe('PluginSkillTrialLauncherService', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('uses an already installed ClawXpert workspace skill without opening the install dialog', async () => {
    const { service, dialog, intent, pluginAPI, router } = await createService({
      states: [readySkillState]
    })

    const started = await service.tryInClawXpert({
      plugin,
      resource,
      label: 'Documents',
      prompt: 'Draft a project memo'
    })

    expect(started).toBe(true)
    expect(pluginAPI.getPluginResourceStates).toHaveBeenCalledWith('@xpert-ai/plugin-documents', {
      target: 'workspace',
      workspaceId: 'workspace-clawxpert'
    })
    expect(dialog.open).not.toHaveBeenCalled()
    expect(intent.set).toHaveBeenCalledWith({
      workspaceId: 'workspace-clawxpert',
      skillPackageId: 'skill-package-documents',
      label: 'Documents',
      prompt: 'Draft a project memo'
    })
    expect(router.navigate).toHaveBeenCalledWith(['/chat/clawxpert', 'c'])
  })

  it('installs a missing skill into the ClawXpert workspace before starting a trial', async () => {
    const { service, dialog, intent, router } = await createService({
      states: []
    })

    const started = await service.tryInClawXpert({
      plugin,
      resource,
      label: 'Documents',
      prompt: 'Create a document from this outline'
    })

    expect(started).toBe(true)
    expect(dialog.open).toHaveBeenCalledWith(
      PluginResourcesComponent,
      expect.objectContaining({
        data: expect.objectContaining({
          initialComponents: [
            {
              componentType: PLUGIN_COMPONENT_TYPE.SKILL,
              componentKey: 'documents'
            }
          ],
          initialWorkspaceId: 'workspace-clawxpert',
          initialInstallMode: 'workspace',
          closeOnSuccess: true
        })
      })
    )
    expect(intent.set).toHaveBeenCalledWith({
      workspaceId: 'workspace-clawxpert',
      skillPackageId: 'skill-package-installed',
      label: 'Documents',
      prompt: 'Create a document from this outline'
    })
    expect(router.navigate).toHaveBeenCalledWith(['/chat/clawxpert', 'c'])
  })

  it('does not start when the install dialog is cancelled', async () => {
    const { service, intent, router } = await createService({
      states: [],
      installDialogResult: null
    })

    const started = await service.tryInClawXpert({
      plugin,
      resource,
      label: 'Documents'
    })

    expect(started).toBe(false)
    expect(intent.set).not.toHaveBeenCalled()
    expect(router.navigate).not.toHaveBeenCalled()
  })

  it('opens the ClawXpert setup entry when no bound workspace is available', async () => {
    const { service, dialog, intent, pluginAPI, router } = await createService({
      workspaceId: null
    })

    const started = await service.tryInClawXpert({
      plugin,
      resource,
      label: 'Documents',
      prompt: 'Draft a project memo'
    })

    expect(started).toBe(true)
    expect(pluginAPI.getPluginResourceStates).not.toHaveBeenCalled()
    expect(dialog.open).not.toHaveBeenCalled()
    expect(intent.set).not.toHaveBeenCalled()
    expect(router.navigate).toHaveBeenCalledWith(['/chat/clawxpert'], {
      queryParams: {
        onboarding: 'clawxpert'
      }
    })
  })

  it('preselects the ClawXpert workspace when opening the install dialog directly', async () => {
    const { service, dialog } = await createService()

    const result = await service.openInstallDialog({
      plugin,
      resource,
      closeOnSuccess: false
    })

    expect(result).toBe(installResult)
    expect(dialog.open).toHaveBeenCalledWith(
      PluginResourcesComponent,
      expect.objectContaining({
        data: expect.objectContaining({
          initialWorkspaceId: 'workspace-clawxpert',
          initialInstallMode: 'workspace',
          closeOnSuccess: false
        })
      })
    )
  })
})
