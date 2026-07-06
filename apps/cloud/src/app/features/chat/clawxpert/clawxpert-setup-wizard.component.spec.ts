jest.mock('../../../@core', () => {
  const contracts = jest.requireActual('@xpert-ai/contracts')

  return {
    AiFeatureEnum: {
      FEATURE_COPILOT: 'FEATURE_COPILOT'
    },
    AiModelTypeEnum: {
      LLM: 'llm'
    },
    AIPermissionsEnum: {
      COPILOT_EDIT: 'COPILOT_EDIT'
    },
    CopilotServerService: class CopilotServerService {},
    EnvironmentService: class EnvironmentService {},
    getErrorMessage: (error: unknown) => String(error),
    letterStartSUID: (prefix: string) => `${prefix}primary`,
    Store: class Store {},
    ToastrService: class ToastrService {},
    uid10: jest.fn(() => 'abc123def0'),
    XpertAPIService: class XpertAPIService {},
    XpertTemplateService: class XpertTemplateService {},
    XpertWorkspaceService: class XpertWorkspaceService {},
    XpertTypeEnum: contracts.XpertTypeEnum
  }
})

let mockPluginAPI: {
  getPlugins: jest.Mock
  getMarketplace: jest.Mock
  install: jest.Mock
}

jest.mock('@xpert-ai/cloud/state', () => ({
  injectPluginAPI: () => mockPluginAPI
}))

jest.mock('../../../@shared/copilot', () => {
  const { Component, EventEmitter, forwardRef, Input, Output } = jest.requireActual('@angular/core')
  const { NG_VALUE_ACCESSOR } = jest.requireActual('@angular/forms')

  @Component({
    standalone: true,
    selector: 'copilot-model-select',
    template: '',
    providers: [
      {
        provide: NG_VALUE_ACCESSOR,
        useExisting: forwardRef(() => CopilotModelSelectComponent),
        multi: true
      }
    ]
  })
  class CopilotModelSelectComponent {
    @Input() hiddenLabel = false
    @Input() label: unknown
    @Input() modelType: unknown
    @Input() readonly = false
    @Input() ngModel: unknown
    @Output() ngModelChange = new EventEmitter<unknown>()

    writeValue() {}
    registerOnChange() {}
    registerOnTouched() {}
  }

  @Component({
    standalone: true,
    selector: 'pac-copilot-config-form',
    template: ''
  })
  class CopilotConfigFormComponent {
    @Input() copilot: unknown
    @Output() saved = new EventEmitter<void>()
    formGroup = {
      value: {
        copilotModel: {
          copilotId: 'copilot-primary',
          model: 'gpt-4.1',
          modelType: 'llm'
        }
      },
      patchValue: jest.fn((value: { copilotModel?: unknown }) => {
        if (value.copilotModel) {
          this.formGroup.value.copilotModel = value.copilotModel as {
            copilotId: string
            model: string
            modelType: string
          }
        }
      })
    }
    canSubmit = jest.fn(() => true)
    hasSelectedModel = jest.fn(() => true)
    submit = jest.fn(async () => true)
  }

  return {
    CopilotConfigFormComponent,
    CopilotModelSelectComponent
  }
})

jest.mock('../../../@shared/avatar', () => {
  const { Component, Input } = jest.requireActual('@angular/core')

  @Component({
    standalone: true,
    selector: 'emoji-avatar',
    template: ''
  })
  class EmojiAvatarComponent {
    @Input() avatar: unknown
    @Input() alt = ''
    @Input() fallbackLabel = ''
  }

  return {
    EmojiAvatarComponent
  }
})

jest.mock('../../setting/plugins/install/install.component', () => ({
  PluginInstallComponent: class PluginInstallComponent {}
}))

jest.mock('../../xpert/xpert', () => {
  const { Component } = jest.requireActual('@angular/core')

  @Component({
    standalone: true,
    selector: 'pac-xpert-new-blank',
    template: ''
  })
  class XpertNewBlankComponent {}

  return {
    BLANK_XPERT_DIALOG_CATEGORY: {
      CLAW: 'claw'
    },
    XpertNewBlankComponent
  }
})

jest.mock('./clawxpert.facade', () => ({
  ClawXpertFacade: class ClawXpertFacade {}
}))

import { Dialog } from '@angular/cdk/dialog'
import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import type { TXpertTeamDraft } from '@xpert-ai/contracts'
import { BehaviorSubject, of, Subject, throwError } from 'rxjs'
import {
  CopilotServerService,
  EnvironmentService,
  IXpert,
  Store,
  ToastrService,
  XpertAPIService,
  XpertTemplateService,
  XpertWorkspaceService,
  XpertTypeEnum
} from '../../../@core'
import { PluginInstallComponent } from '../../setting/plugins/install/install.component'
import { XpertNewBlankComponent } from '../../xpert/xpert'
import { ClawXpertFacade } from './clawxpert.facade'
import { ClawXpertSetupWizardComponent } from './clawxpert-setup-wizard.component'

function createFacadeMock(options?: {
  availableXperts?: Partial<IXpert>[]
  resolvedPreference?: { assistantId: string } | null
}) {
  return {
    availableXperts: signal((options?.availableXperts ?? []) as IXpert[]),
    bindPublishedXpert: jest.fn().mockResolvedValue(undefined),
    cancelWizard: jest.fn(),
    getXpertLabel: jest.fn((xpert?: Partial<IXpert> | null) => xpert?.title || xpert?.name || xpert?.id || ''),
    organizationId: signal('org-1'),
    orphanedPreference: signal(false),
    resolvedPreference: signal(options?.resolvedPreference ?? null),
    savePreference: jest.fn().mockResolvedValue(undefined),
    saving: signal(false)
  }
}

function createStoreMock() {
  return {
    featureContextHydrated: true,
    hasFeatureEnabled: jest.fn(() => true),
    hasPermission: jest.fn(() => true)
  }
}

function createCopilotServerMock() {
  const refresh$ = new BehaviorSubject(false)

  return {
    enableCopilot: jest.fn(() => of({})),
    refresh: jest.fn(() => refresh$.next(true)),
    refresh$,
    getAllInOrg: jest.fn(() =>
      of({
        items: [
          {
            id: 'copilot-primary',
            enabled: true,
            role: 'primary'
          }
        ]
      })
    ),
    getCopilotModels: jest.fn(() =>
      of([
        {
          id: 'copilot-primary',
          name: 'Primary',
          providerWithModels: {
            label: {
              zh_Hans: 'OpenAI Compatible',
              en_US: 'OpenAI Compatible'
            },
            provider: 'openai-compatible',
            models: [{ model: 'gpt-4.1', model_type: 'llm' }]
          }
        }
      ])
    )
  }
}

function createPluginAPIMock() {
  return {
    getPlugins: jest.fn(() =>
      of([
        {
          name: 'openai-compatible',
          packageName: '@xpert/openai-compatible',
          currentVersion: '1.0.0',
          isGlobal: false,
          level: 'organization',
          effectiveInCurrentScope: true,
          meta: {
            name: 'openai-compatible',
            displayName: 'OpenAI Compatible',
            description: 'Installed model plugin',
            version: '1.0.0',
            category: 'model'
          }
        },
        {
          name: '@xpert-ai/plugin-model-retry@0.0.5',
          packageName: '@xpert-ai/plugin-model-retry',
          currentVersion: '0.0.5',
          isGlobal: false,
          level: 'organization',
          effectiveInCurrentScope: true,
          meta: {
            name: '@xpert-ai/plugin-model-retry',
            displayName: 'Model Retry',
            description: 'Installed middleware plugin',
            version: '0.0.5',
            category: 'middleware'
          }
        }
      ])
    ),
    install: jest.fn(({ pluginName }: { pluginName: string }) =>
      of({
        success: true,
        name: pluginName,
        packageName: pluginName,
        organizationId: 'org-1'
      })
    ),
    getMarketplace: jest.fn(() =>
      of({
        items: [
          {
            name: 'integration-plugin',
            packageName: '@xpert/integration-plugin',
            displayName: 'Integration Plugin',
            description: 'Installable integration plugin',
            version: '1.0.0',
            category: 'integration',
            installed: false
          },
          {
            name: 'openai-compatible',
            packageName: '@xpert/openai-compatible',
            displayName: 'OpenAI Compatible',
            description: 'Installed model plugin',
            version: '1.0.0',
            category: 'model',
            installed: true
          },
          {
            name: 'siliconflow',
            packageName: '@xpert/siliconflow',
            displayName: 'SiliconFlow',
            description: 'Uninitialized model plugin',
            version: '1.0.0',
            category: 'model',
            installed: false
          }
        ],
        sources: [],
        errors: []
      })
    )
  }
}

function createToastrMock() {
  return {
    error: jest.fn(),
    success: jest.fn(),
    warning: jest.fn()
  }
}

function createXpertAPIMock() {
  const staleAgentUpdatedAt = new Date('2026-07-01T00:00:00.000Z')
  const latestAgentUpdatedAt = new Date('2026-07-01T00:00:01.000Z')
  const latestAgent = {
    id: 'agent-primary',
    key: 'Agent_primary',
    updatedAt: latestAgentUpdatedAt,
    copilotModel: {
      copilotId: 'copilot-primary',
      model: 'gpt-4.1',
      modelType: 'llm'
    }
  } as NonNullable<IXpert['agent']>
  const createdXpert = {
    id: 'created-xpert',
    name: 'clawxpert',
    title: 'ClawXpert',
    latest: true,
    type: XpertTypeEnum.Agent,
    agent: latestAgent,
    copilotModel: {
      copilotId: 'copilot-primary',
      model: 'gpt-4.1',
      modelType: 'llm'
    }
  } as IXpert
  const staleDraft = {
    team: {
      ...createdXpert,
      agent: {
        ...latestAgent,
        updatedAt: staleAgentUpdatedAt
      }
    },
    nodes: [
      {
        type: 'agent',
        key: 'Agent_primary',
        position: {
          x: 0,
          y: 0
        },
        entity: {
          ...latestAgent,
          updatedAt: staleAgentUpdatedAt
        }
      }
    ],
    connections: []
  } as TXpertTeamDraft
  const latestTeam = {
    ...createdXpert,
    agent: latestAgent,
    draft: staleDraft
  } as IXpert
  const publishedXpert = {
    ...createdXpert,
    version: '1.0.0'
  } as IXpert

  return {
    create: jest.fn(() => of(createdXpert)),
    getTeam: jest.fn(() => of(latestTeam)),
    saveDraft: jest.fn((_id: string, draft: unknown) => of(draft)),
    publish: jest.fn(() => of(publishedXpert)),
    latestAgent,
    latestTeam,
    publishedXpert
  }
}

function createXpertTemplateServiceMock(options?: { installedXpert?: Partial<IXpert>; requiredPluginNames?: string[] }) {
  const installedXpert = {
    id: 'created-xpert',
    name: 'clawxpert',
    title: 'ClawXpert',
    latest: true,
    type: XpertTypeEnum.Agent,
    workspaceId: 'workspace-default',
    agent: {
      key: 'Agent_primary',
      copilotModel: {
        copilotId: 'copilot-primary',
        model: 'gpt-4.1',
        modelType: 'llm'
      }
    },
    copilotModel: {
      copilotId: 'copilot-primary',
      model: 'gpt-4.1',
      modelType: 'llm'
    },
    ...options?.installedXpert
  } as IXpert

  return {
    getTemplate: jest.fn(() =>
      of({
        id: 'xpert-my-claw-xpert',
        dependencies: {
          plugins: options?.requiredPluginNames ?? []
        }
      })
    ),
    installTemplate: jest.fn(() => of({ xpert: installedXpert })),
    installedXpert
  }
}

function createWorkspaceServiceMock(options?: { defaultWorkspace?: { id: string; name: string } | null }) {
  const defaultWorkspace =
    options && 'defaultWorkspace' in options
      ? options.defaultWorkspace
      : { id: 'workspace-default', name: 'Default Workspace' }
  const createdWorkspace = { id: 'workspace-created', name: 'Default Workspace' }

  return {
    getMyDefault: jest.fn(() => of(defaultWorkspace)),
    create: jest.fn(() => of(createdWorkspace)),
    setMyDefault: jest.fn(() => of(createdWorkspace)),
    refresh: jest.fn(),
    createdWorkspace
  }
}

function createEnvironmentMock() {
  return {
    getDefaultByWorkspace: jest.fn(() => of(null))
  }
}

describe('ClawXpertSetupWizardComponent', () => {
  beforeEach(() => {
    mockPluginAPI = createPluginAPIMock()
  })

  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('renders a single model-provider step without the plugin install step', async () => {
    const facade = createFacadeMock()
    const dialog = {
      open: jest.fn(() => ({
        closed: of(undefined)
      }))
    }

    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ClawXpertSetupWizardComponent],
      providers: [
        provideRouter([]),
        {
          provide: ClawXpertFacade,
          useValue: facade
        },
        {
          provide: Dialog,
          useValue: dialog
        },
        {
          provide: Store,
          useValue: createStoreMock()
        },
        {
          provide: CopilotServerService,
          useValue: createCopilotServerMock()
        },
        {
          provide: ToastrService,
          useValue: createToastrMock()
        },
        {
          provide: XpertAPIService,
          useValue: createXpertAPIMock()
        },
        {
          provide: XpertTemplateService,
          useValue: createXpertTemplateServiceMock()
        },
        {
          provide: EnvironmentService,
          useValue: createEnvironmentMock()
        },
        {
          provide: XpertWorkspaceService,
          useValue: createWorkspaceServiceMock()
        }
      ]
    }).compileComponents()

    const fixture = TestBed.createComponent(ClawXpertSetupWizardComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelector('[data-onboarding-step="plugins"]')).toBeNull()
    expect(fixture.nativeElement.querySelector('[data-onboarding-step="model-provider"]')).not.toBeNull()
    expect(fixture.nativeElement.querySelector('z-stepper')).toBeNull()
    expect(fixture.nativeElement.textContent).toContain('PAC.Chat.ClawXpert.ModelProviderStepTitle')
    expect(fixture.nativeElement.textContent).not.toContain('PAC.ACTIONS.Next')
    expect(fixture.nativeElement.querySelector('a[href], [routerlink]')).toBeNull()
  })

  it('does not block the model-provider step while marketplace plugins are loading', async () => {
    const facade = createFacadeMock()
    const dialog = {
      open: jest.fn(() => ({
        closed: of(undefined)
      }))
    }
    const marketplace$ = new Subject<unknown>()
    mockPluginAPI = {
      getPlugins: jest.fn(() => of([])),
      getMarketplace: jest.fn(() => marketplace$),
      install: jest.fn(({ pluginName }: { pluginName: string }) =>
        of({
          success: true,
          name: pluginName,
          packageName: pluginName,
          organizationId: 'org-1'
        })
      )
    }

    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ClawXpertSetupWizardComponent],
      providers: [
        provideRouter([]),
        {
          provide: ClawXpertFacade,
          useValue: facade
        },
        {
          provide: Dialog,
          useValue: dialog
        },
        {
          provide: Store,
          useValue: createStoreMock()
        },
        {
          provide: CopilotServerService,
          useValue: createCopilotServerMock()
        },
        {
          provide: ToastrService,
          useValue: createToastrMock()
        },
        {
          provide: XpertAPIService,
          useValue: createXpertAPIMock()
        },
        {
          provide: XpertTemplateService,
          useValue: createXpertTemplateServiceMock()
        },
        {
          provide: EnvironmentService,
          useValue: createEnvironmentMock()
        },
        {
          provide: XpertWorkspaceService,
          useValue: createWorkspaceServiceMock()
        }
      ]
    }).compileComponents()

    const fixture = TestBed.createComponent(ClawXpertSetupWizardComponent)
    fixture.detectChanges()

    expect(fixture.componentInstance.marketplacePlugins()).toBeNull()
    expect(fixture.nativeElement.querySelector('[data-clawxpert-setup-next]')).toBeNull()
    expect(fixture.nativeElement.querySelector('[data-onboarding-step="model-provider"]')).not.toBeNull()
  })

  it('waits for the model provider lookup before preparing the primary copilot', async () => {
    const facade = createFacadeMock()
    const dialog = {
      open: jest.fn(() => ({
        closed: of(undefined)
      }))
    }
    const modelProviders$ = new Subject<unknown[]>()
    const copilotServer = {
      ...createCopilotServerMock(),
      getAllInOrg: jest.fn(() => of({ items: [] })),
      getCopilotModels: jest.fn(() => modelProviders$)
    }

    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ClawXpertSetupWizardComponent],
      providers: [
        provideRouter([]),
        {
          provide: ClawXpertFacade,
          useValue: facade
        },
        {
          provide: Dialog,
          useValue: dialog
        },
        {
          provide: Store,
          useValue: createStoreMock()
        },
        {
          provide: CopilotServerService,
          useValue: copilotServer
        },
        {
          provide: ToastrService,
          useValue: createToastrMock()
        },
        {
          provide: XpertAPIService,
          useValue: createXpertAPIMock()
        },
        {
          provide: XpertTemplateService,
          useValue: createXpertTemplateServiceMock()
        },
        {
          provide: EnvironmentService,
          useValue: createEnvironmentMock()
        },
        {
          provide: XpertWorkspaceService,
          useValue: createWorkspaceServiceMock()
        }
      ]
    }).compileComponents()

    const fixture = TestBed.createComponent(ClawXpertSetupWizardComponent)
    fixture.detectChanges()

    expect(fixture.componentInstance.llmCopilots()).toBeNull()
    expect(copilotServer.enableCopilot).not.toHaveBeenCalled()
    expect(fixture.nativeElement.textContent).toContain('PAC.Chat.ClawXpert.CheckingModelProviders')
    expect(fixture.nativeElement.querySelector('[data-model-provider-config-form]')).toBeNull()

    modelProviders$.next([])
    await fixture.whenStable()
    fixture.detectChanges()

    expect(copilotServer.enableCopilot).toHaveBeenCalledWith('primary')
  })

  it('does not expose close or cancel actions because setup must finish by creating ClawXpert', async () => {
    const facade = createFacadeMock({
      resolvedPreference: {
        assistantId: 'existing-xpert'
      }
    })
    const dialog = {
      open: jest.fn(() => ({
        closed: of(undefined)
      }))
    }

    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ClawXpertSetupWizardComponent],
      providers: [
        provideRouter([]),
        {
          provide: ClawXpertFacade,
          useValue: facade
        },
        {
          provide: Dialog,
          useValue: dialog
        },
        {
          provide: Store,
          useValue: createStoreMock()
        },
        {
          provide: CopilotServerService,
          useValue: createCopilotServerMock()
        },
        {
          provide: ToastrService,
          useValue: createToastrMock()
        },
        {
          provide: XpertAPIService,
          useValue: createXpertAPIMock()
        },
        {
          provide: XpertTemplateService,
          useValue: createXpertTemplateServiceMock()
        },
        {
          provide: EnvironmentService,
          useValue: createEnvironmentMock()
        },
        {
          provide: XpertWorkspaceService,
          useValue: createWorkspaceServiceMock()
        }
      ]
    }).compileComponents()

    const fixture = TestBed.createComponent(ClawXpertSetupWizardComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelector('button[aria-label="PAC.ACTIONS.Close"]')).toBeNull()
    expect(fixture.nativeElement.textContent).not.toContain('PAC.ACTIONS.Cancel')
  })

  it('does not render the general plugin marketplace list in the setup wizard', async () => {
    const facade = createFacadeMock()
    const dialog = {
      open: jest.fn(() => ({
        closed: of(undefined)
      }))
    }

    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ClawXpertSetupWizardComponent],
      providers: [
        provideRouter([]),
        {
          provide: ClawXpertFacade,
          useValue: facade
        },
        {
          provide: Dialog,
          useValue: dialog
        },
        {
          provide: Store,
          useValue: createStoreMock()
        },
        {
          provide: CopilotServerService,
          useValue: createCopilotServerMock()
        },
        {
          provide: ToastrService,
          useValue: createToastrMock()
        },
        {
          provide: XpertAPIService,
          useValue: createXpertAPIMock()
        },
        {
          provide: XpertTemplateService,
          useValue: createXpertTemplateServiceMock()
        },
        {
          provide: EnvironmentService,
          useValue: createEnvironmentMock()
        },
        {
          provide: XpertWorkspaceService,
          useValue: createWorkspaceServiceMock()
        }
      ]
    }).compileComponents()

    const fixture = TestBed.createComponent(ClawXpertSetupWizardComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(mockPluginAPI.getPlugins).toHaveBeenCalled()
    expect(mockPluginAPI.getMarketplace).not.toHaveBeenCalled()
    expect(fixture.nativeElement.textContent).not.toContain('Integration Plugin')
    expect(fixture.nativeElement.querySelector('[data-plugin-install-button="integration-plugin"]')).toBeNull()
    expect(fixture.nativeElement.querySelector('a[href], [routerlink]')).toBeNull()
  })

  it('shows default model configuration before installed model plugins and hides uninitialized plugins behind More', async () => {
    const facade = createFacadeMock()
    const dialog = {
      open: jest.fn(() => ({
        closed: of(undefined)
      }))
    }
    const copilotServer = {
      ...createCopilotServerMock(),
      getCopilotModels: jest.fn(() => of([]))
    }

    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ClawXpertSetupWizardComponent],
      providers: [
        provideRouter([]),
        {
          provide: ClawXpertFacade,
          useValue: facade
        },
        {
          provide: Dialog,
          useValue: dialog
        },
        {
          provide: Store,
          useValue: createStoreMock()
        },
        {
          provide: CopilotServerService,
          useValue: copilotServer
        },
        {
          provide: ToastrService,
          useValue: createToastrMock()
        },
        {
          provide: XpertAPIService,
          useValue: createXpertAPIMock()
        },
        {
          provide: XpertTemplateService,
          useValue: createXpertTemplateServiceMock()
        },
        {
          provide: EnvironmentService,
          useValue: createEnvironmentMock()
        },
        {
          provide: XpertWorkspaceService,
          useValue: createWorkspaceServiceMock()
        }
      ]
    }).compileComponents()

    const fixture = TestBed.createComponent(ClawXpertSetupWizardComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelector('[data-model-plugin-section="initialized"]')).not.toBeNull()
    expect(fixture.nativeElement.querySelector('[data-model-plugin-section="uninitialized"]')).toBeNull()
    expect(fixture.nativeElement.querySelector('[data-model-provider-config-form]')).not.toBeNull()
    expect(fixture.nativeElement.querySelector('pac-copilot-config-form')).not.toBeNull()
    expect(fixture.nativeElement.querySelector('a[href], [routerlink]')).toBeNull()
    expect(fixture.nativeElement.textContent).toContain('OpenAI Compatible')
    expect(fixture.nativeElement.textContent).not.toContain('SiliconFlow')
    expect(
      fixture.nativeElement.querySelector(
        '[data-onboarding-step="model-provider"] > .mt-4.rounded-2xl.bg-background-default-subtle.p-4'
      )
    ).toBeNull()
    expect(fixture.nativeElement.querySelector('copilot-model-select')).toBeNull()
    expect(mockPluginAPI.getMarketplace).not.toHaveBeenCalled()

    const modelForm = fixture.nativeElement.querySelector('[data-model-provider-config-form]') as HTMLElement
    const installedPlugins = fixture.nativeElement.querySelector(
      '[data-model-plugin-section="initialized"]'
    ) as HTMLElement
    expect(modelForm.compareDocumentPosition(installedPlugins) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    fixture.nativeElement.querySelector('[data-model-plugin-more]').click()
    fixture.detectChanges()

    expect(mockPluginAPI.getMarketplace).toHaveBeenCalledWith({ targetApp: 'xpert' })
    expect(fixture.nativeElement.querySelector('[data-model-plugin-section="uninitialized"]')).not.toBeNull()
    expect(fixture.nativeElement.textContent).toContain('SiliconFlow')

    fixture.nativeElement.querySelector('[data-plugin-install-button="siliconflow"]').click()

    expect(dialog.open).toHaveBeenCalledWith(
      PluginInstallComponent,
      expect.objectContaining({
        disableClose: true,
        data: expect.objectContaining({
          plugin: expect.objectContaining({
            name: 'siliconflow'
          }),
          reload: expect.any(Function)
        })
      })
    )
  })

  it('shows the same model selector as the new xpert flow when LLM models are available', async () => {
    const facade = createFacadeMock()
    const dialog = {
      open: jest.fn(() => ({
        closed: of(undefined)
      }))
    }

    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ClawXpertSetupWizardComponent],
      providers: [
        provideRouter([]),
        {
          provide: ClawXpertFacade,
          useValue: facade
        },
        {
          provide: Dialog,
          useValue: dialog
        },
        {
          provide: Store,
          useValue: createStoreMock()
        },
        {
          provide: CopilotServerService,
          useValue: createCopilotServerMock()
        },
        {
          provide: ToastrService,
          useValue: createToastrMock()
        },
        {
          provide: XpertAPIService,
          useValue: createXpertAPIMock()
        },
        {
          provide: XpertTemplateService,
          useValue: createXpertTemplateServiceMock()
        },
        {
          provide: EnvironmentService,
          useValue: createEnvironmentMock()
        },
        {
          provide: XpertWorkspaceService,
          useValue: createWorkspaceServiceMock()
        }
      ]
    }).compileComponents()

    const fixture = TestBed.createComponent(ClawXpertSetupWizardComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelector('copilot-model-select')).not.toBeNull()
    expect(fixture.nativeElement.querySelector('[data-model-plugin-section="initialized"]')).toBeNull()
    expect(fixture.nativeElement.querySelector('pac-copilot-config-form')).toBeNull()
    expect(fixture.nativeElement.textContent).toContain('PAC.KEY_WORDS.Model')
    expect(fixture.nativeElement.textContent).not.toContain('[object Object]')
  })

  it('shows a ready state when an LLM model is available but the primary copilot form is disabled', async () => {
    const facade = createFacadeMock()
    const dialog = {
      open: jest.fn(() => ({
        closed: of(undefined)
      }))
    }
    const copilotServer = {
      ...createCopilotServerMock(),
      getAllInOrg: jest.fn(() =>
        of({
          items: [
            {
              id: 'copilot-primary',
              enabled: false,
              role: 'primary'
            }
          ]
        })
      )
    }

    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ClawXpertSetupWizardComponent],
      providers: [
        provideRouter([]),
        {
          provide: ClawXpertFacade,
          useValue: facade
        },
        {
          provide: Dialog,
          useValue: dialog
        },
        {
          provide: Store,
          useValue: createStoreMock()
        },
        {
          provide: CopilotServerService,
          useValue: copilotServer
        },
        {
          provide: ToastrService,
          useValue: createToastrMock()
        },
        {
          provide: XpertAPIService,
          useValue: createXpertAPIMock()
        },
        {
          provide: XpertTemplateService,
          useValue: createXpertTemplateServiceMock()
        },
        {
          provide: EnvironmentService,
          useValue: createEnvironmentMock()
        },
        {
          provide: XpertWorkspaceService,
          useValue: createWorkspaceServiceMock()
        }
      ]
    }).compileComponents()

    const fixture = TestBed.createComponent(ClawXpertSetupWizardComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(fixture.componentInstance.hasLlmModelProvider()).toBe(true)
    expect(fixture.componentInstance.hasSelectedCopilotModel()).toBe(true)
    expect(fixture.componentInstance.showModelProviderForm()).toBe(false)
    expect(fixture.nativeElement.querySelector('[data-model-provider-ready]')).not.toBeNull()
    expect(fixture.nativeElement.querySelector('copilot-model-select')).not.toBeNull()

    fixture.componentInstance.onSelectedCopilotModelChange({
      copilotId: 'copilot-primary',
      model: 'deepseek-chat'
    })

    expect(fixture.componentInstance.selectedCopilotModel()).toEqual({
      copilotId: 'copilot-primary',
      model: 'deepseek-chat',
      modelType: 'llm'
    })
    expect(fixture.nativeElement.textContent).toContain('PAC.Chat.ClawXpert.ModelProvidersReady')
    expect(fixture.nativeElement.textContent).not.toContain('PAC.Chat.ClawXpert.PreparingModelProvider')
  })

  it('installs the ClawXpert template, publishes, binds, and navigates without opening the blank wizard', async () => {
    const facade = createFacadeMock({
      availableXperts: [
        {
          id: 'xpert-old',
          name: 'Existing',
          latest: true,
          type: XpertTypeEnum.Agent
        }
      ]
    })
    const dialog = {
      open: jest.fn(() => ({
        closed: of(undefined)
      }))
    }
    const xpertService = createXpertAPIMock()
    const templateRequiredPlugins = ['@xpert-ai/plugin-template-required', '@xpert-ai/plugin-model-retry']
    const templateService = createXpertTemplateServiceMock({
      requiredPluginNames: templateRequiredPlugins
    })

    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ClawXpertSetupWizardComponent],
      providers: [
        provideRouter([]),
        {
          provide: ClawXpertFacade,
          useValue: facade
        },
        {
          provide: Dialog,
          useValue: dialog
        },
        {
          provide: Store,
          useValue: createStoreMock()
        },
        {
          provide: CopilotServerService,
          useValue: createCopilotServerMock()
        },
        {
          provide: ToastrService,
          useValue: createToastrMock()
        },
        {
          provide: XpertAPIService,
          useValue: xpertService
        },
        {
          provide: XpertTemplateService,
          useValue: templateService
        },
        {
          provide: EnvironmentService,
          useValue: createEnvironmentMock()
        },
        {
          provide: XpertWorkspaceService,
          useValue: createWorkspaceServiceMock()
        }
      ]
    }).compileComponents()

    const fixture = TestBed.createComponent(ClawXpertSetupWizardComponent)
    const component = fixture.componentInstance

    fixture.detectChanges()
    await fixture.whenStable()

    await component.createAndBindClawXpert()

    expect(dialog.open).not.toHaveBeenCalledWith(XpertNewBlankComponent, expect.anything())
    expect(templateService.getTemplate).toHaveBeenCalledWith('xpert-my-claw-xpert')
    const expectedMissingMiddlewarePlugins = templateRequiredPlugins.filter(
      (pluginName) => pluginName !== '@xpert-ai/plugin-model-retry'
    )
    expect(mockPluginAPI.install.mock.calls.map(([input]) => input)).toEqual(
      expectedMissingMiddlewarePlugins.map((pluginName) => ({
        pluginName
      }))
    )
    const installCallOrder = mockPluginAPI.install.mock.invocationCallOrder
    expect(installCallOrder[installCallOrder.length - 1]).toBeLessThan(
      templateService.installTemplate.mock.invocationCallOrder[0]
    )
    const installPayload = templateService.installTemplate.mock.calls[0][1]
    const installName = installPayload.basic.name
    expect(installName).toMatch(/^clawxpert-[a-z0-9]{6}$/)
    expect(templateService.installTemplate).toHaveBeenCalledWith('xpert-my-claw-xpert', {
      workspaceId: 'workspace-default',
      basic: {
        name: installName,
        title: installName,
        copilotModel: {
          copilotId: 'copilot-primary',
          model: 'gpt-4.1',
          modelType: 'llm'
        }
      }
    })
    expect(xpertService.create).not.toHaveBeenCalled()
    expect(xpertService.getTeam).toHaveBeenCalledWith('created-xpert', {
      relations: ['agent']
    })
    expect(xpertService.saveDraft).toHaveBeenCalledWith('created-xpert', expect.any(Object))
    const savedDraft = xpertService.saveDraft.mock.calls[0][1] as TXpertTeamDraft
    expect(savedDraft.team.agent?.updatedAt).toEqual(xpertService.latestAgent.updatedAt)
    expect(savedDraft.nodes[0]).toMatchObject({
      type: 'agent',
      key: 'Agent_primary',
      entity: {
        key: 'Agent_primary',
        updatedAt: xpertService.latestAgent.updatedAt
      }
    })
    expect(xpertService.getTeam.mock.invocationCallOrder[0]).toBeLessThan(
      xpertService.saveDraft.mock.invocationCallOrder[0]
    )
    expect(xpertService.saveDraft.mock.invocationCallOrder[0]).toBeLessThan(
      xpertService.publish.mock.invocationCallOrder[0]
    )
    expect(xpertService.publish).toHaveBeenCalledWith('created-xpert', false, {
      environmentId: null,
      releaseNotes: 'Initial ClawXpert bootstrap release.'
    })
    expect(facade.bindPublishedXpert).toHaveBeenCalledWith(xpertService.publishedXpert, {
      navigateToChat: true,
      bindNextConversationToXpert: true
    })
  })

  it('binds the installed ClawXpert when automatic publish fails after template installation', async () => {
    const facade = createFacadeMock()
    const dialog = {
      open: jest.fn(() => ({
        closed: of(undefined)
      }))
    }
    const toastr = createToastrMock()
    const xpertService = createXpertAPIMock()
    xpertService.publish.mockImplementation(() => throwError(() => new Error('publish failed')))
    const templateService = createXpertTemplateServiceMock()

    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ClawXpertSetupWizardComponent],
      providers: [
        provideRouter([]),
        {
          provide: ClawXpertFacade,
          useValue: facade
        },
        {
          provide: Dialog,
          useValue: dialog
        },
        {
          provide: Store,
          useValue: createStoreMock()
        },
        {
          provide: CopilotServerService,
          useValue: createCopilotServerMock()
        },
        {
          provide: ToastrService,
          useValue: toastr
        },
        {
          provide: XpertAPIService,
          useValue: xpertService
        },
        {
          provide: XpertTemplateService,
          useValue: templateService
        },
        {
          provide: EnvironmentService,
          useValue: createEnvironmentMock()
        },
        {
          provide: XpertWorkspaceService,
          useValue: createWorkspaceServiceMock()
        }
      ]
    }).compileComponents()

    const fixture = TestBed.createComponent(ClawXpertSetupWizardComponent)
    const component = fixture.componentInstance

    fixture.detectChanges()
    await fixture.whenStable()

    await component.createAndBindClawXpert()

    expect(templateService.installTemplate).toHaveBeenCalled()
    expect(xpertService.publish).toHaveBeenCalled()
    expect(facade.bindPublishedXpert).toHaveBeenCalledWith(templateService.installedXpert, {
      navigateToChat: true,
      bindNextConversationToXpert: true
    })
    expect(toastr.warning).toHaveBeenCalledWith('PAC.Xpert.AutoPublishFailed', {
      Default: 'Expert created, but auto publish was not completed. You can continue in Studio.'
    })
  })

  it('creates a default workspace before installing the ClawXpert template when the user has none', async () => {
    const facade = createFacadeMock()
    const dialog = {
      open: jest.fn(() => ({
        closed: of(undefined)
      }))
    }
    const xpertService = createXpertAPIMock()
    const templateService = createXpertTemplateServiceMock({
      installedXpert: {
        workspaceId: 'workspace-created'
      }
    })
    const workspaceService = createWorkspaceServiceMock({ defaultWorkspace: null })

    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ClawXpertSetupWizardComponent],
      providers: [
        provideRouter([]),
        {
          provide: ClawXpertFacade,
          useValue: facade
        },
        {
          provide: Dialog,
          useValue: dialog
        },
        {
          provide: Store,
          useValue: createStoreMock()
        },
        {
          provide: CopilotServerService,
          useValue: createCopilotServerMock()
        },
        {
          provide: ToastrService,
          useValue: createToastrMock()
        },
        {
          provide: XpertAPIService,
          useValue: xpertService
        },
        {
          provide: XpertTemplateService,
          useValue: templateService
        },
        {
          provide: EnvironmentService,
          useValue: createEnvironmentMock()
        },
        {
          provide: XpertWorkspaceService,
          useValue: workspaceService
        }
      ]
    }).compileComponents()

    const fixture = TestBed.createComponent(ClawXpertSetupWizardComponent)
    const component = fixture.componentInstance

    fixture.detectChanges()
    await fixture.whenStable()

    await component.createAndBindClawXpert()

    expect(workspaceService.getMyDefault).toHaveBeenCalledWith({ purpose: 'authoring' })
    expect(workspaceService.create).toHaveBeenCalledWith({
      name: 'Default Workspace'
    })
    expect(workspaceService.setMyDefault).toHaveBeenCalledWith('workspace-created')
    expect(workspaceService.refresh).toHaveBeenCalled()
    const installPayload = templateService.installTemplate.mock.calls[0][1]
    const installName = installPayload.basic.name
    expect(installName).toMatch(/^clawxpert-[a-z0-9]{6}$/)
    expect(templateService.installTemplate).toHaveBeenCalledWith('xpert-my-claw-xpert', {
      workspaceId: 'workspace-created',
      basic: {
        name: installName,
        title: installName,
        copilotModel: {
          copilotId: 'copilot-primary',
          model: 'gpt-4.1',
          modelType: 'llm'
        }
      }
    })
    expect(xpertService.create).not.toHaveBeenCalled()
  })
})
