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
    AssistantBindingScope: {
      USER: 'user'
    },
    AssistantBindingService: class AssistantBindingService {},
    AssistantCode: {
      CLAWXPERT: 'clawxpert'
    },
    CopilotServerService: class CopilotServerService {},
    EnvironmentService: class EnvironmentService {},
    getErrorMessage: (error: unknown) => String(error),
    letterStartSUID: (prefix: string) => `${prefix}primary`,
    Store: class Store {},
    ToastrService: class ToastrService {},
    uid10: jest.fn(() => 'abc123def0'),
    XpertAPIService: class XpertAPIService {},
    XpertAgentService: class XpertAgentService {},
    XpertTemplateService: class XpertTemplateService {},
    XpertToolsetService: class XpertToolsetService {},
    XpertWorkspaceService: class XpertWorkspaceService {},
    OrderTypeEnum: {
      DESC: 'DESC'
    },
    XpertToolsetCategoryEnum: contracts.XpertToolsetCategoryEnum,
    XpertTypeEnum: contracts.XpertTypeEnum
  }
})

let mockPluginAPI: {
  getPlugins: jest.Mock
  getMarketplace: jest.Mock
  install: jest.Mock
}
let xpertAgentService: {
  refresh: jest.Mock
}
let clawXpertBootstrap: {
  createClawXpert: jest.Mock
  createTemplateXpert: jest.Mock
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

jest.mock('../../setting/plugins/marketplace/marketplace-detail.component', () => ({
  PluginMarketplaceDetailComponent: class PluginMarketplaceDetailComponent {}
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

import { Dialog, DialogRef } from '@angular/cdk/dialog'
import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import type { TXpertTeamDraft } from '@xpert-ai/contracts'
import { BehaviorSubject, of, Subject } from 'rxjs'
import {
  CopilotServerService,
  EnvironmentService,
  AssistantBindingService,
  IXpert,
  IXpertToolset,
  Store,
  ToastrService,
  XpertAPIService,
  XpertAgentService,
  XpertTemplateService,
  XpertToolsetCategoryEnum,
  XpertToolsetService,
  XpertWorkspaceService,
  XpertTypeEnum
} from '../../../@core'
import { ClawXpertBootstrapService } from './clawxpert-bootstrap.service'
import { ClawXpertFacade } from './clawxpert.facade'
import { ClawXpertSetupWizardComponent } from './clawxpert-setup-wizard.component'
import { PluginMarketplaceDetailComponent } from '../../setting/plugins/marketplace/marketplace-detail.component'

async function flushPromises() {
  for (let index = 0; index < 8; index++) {
    await Promise.resolve()
  }
}

function createFacadeMock(options?: {
  availableXperts?: Partial<IXpert>[]
  resolvedPreference?: { assistantId: string } | null
}) {
  return {
    availableXperts: signal((options?.availableXperts ?? []) as IXpert[]),
    bindPublishedXpert: jest.fn().mockResolvedValue(undefined),
    cancelWizard: jest.fn(),
    getXpertLabel: jest.fn((xpert?: Partial<IXpert> | null) => xpert?.title || xpert?.name || xpert?.id || ''),
    navigateToOverview: jest.fn(),
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
            name: '@xpert-ai/plugin-salesclaw',
            packageName: '@xpert-ai/plugin-salesclaw',
            displayName: 'SalesClaw',
            description: 'SalesClaw plugin',
            version: '1.0.0',
            category: 'business-app',
            installed: false
          },
          {
            name: '@xpert-ai/plugin-bom-document-intake',
            packageName: '@xpert-ai/plugin-bom-document-intake',
            displayName: 'BOM Document Intake',
            description: 'BOM document intake plugin',
            version: '1.0.0',
            category: 'business-app',
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

type RecommendedTemplateMock = {
  id: string
  name: string
  title: string
  description: string
  category: string
  pluginDisplayName: string
  pluginName: string
  type: XpertTypeEnum
  dependencies?: {
    toolsets?: Array<{
      provider: string
      templateNodeKey: string
      instanceName?: string
      pluginName?: string
      targetAgentKey?: string
    }>
  }
  avatar: {
    emoji: {
      id: string
    }
  }
}

function createRecommendedTemplate(overrides?: Partial<RecommendedTemplateMock>): RecommendedTemplateMock {
  return {
    id: '@xpert-ai/plugin-canvas:canvas-assistant',
    name: 'canvas-assistant',
    title: 'Canvas Assistant',
    description: 'Create structured canvas documents.',
    category: 'Canvas',
    pluginDisplayName: 'Canvas',
    pluginName: '@xpert-ai/plugin-canvas',
    type: XpertTypeEnum.Agent,
    avatar: {
      emoji: {
        id: 'art'
      }
    },
    ...overrides
  }
}

function createToolset(overrides?: Partial<IXpertToolset>): IXpertToolset {
  return {
    id: 'seedream-runtime',
    name: 'Seedream AIGC',
    type: 'seedream_aigc',
    category: XpertToolsetCategoryEnum.BUILTIN,
    ...overrides
  } as IXpertToolset
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

function createXpertTemplateServiceMock(options?: {
  installedXpert?: Partial<IXpert>
  recommendedApps?: Array<ReturnType<typeof createRecommendedTemplate>>
  requiredPluginNames?: string[]
}) {
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
    getAll: jest.fn(() =>
      of({
        categories: ['Agent'],
        recommendedApps: options?.recommendedApps ?? [createRecommendedTemplate()]
      })
    ),
    getTemplate: jest.fn(() =>
      of({
        id: 'xpert-my-claw-xpert',
        dependencies: {
          plugins: options?.requiredPluginNames ?? ['@xpert-ai/plugin-file-memory']
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

function createXpertToolsetServiceMock(options?: { toolsets?: IXpertToolset[] }) {
  return {
    getAllByWorkspace: jest.fn(() =>
      of({
        items: options?.toolsets ?? []
      })
    )
  }
}

function createEnvironmentMock() {
  return {
    getDefaultByWorkspace: jest.fn(() => of(null))
  }
}

function createXpertAgentServiceMock() {
  return {
    refresh: jest.fn()
  }
}

function createClawXpertBootstrapMock() {
  return {
    createClawXpert: jest.fn(() =>
      Promise.resolve({
        id: 'created-clawxpert',
        name: 'clawxpert',
        title: 'ClawXpert',
        latest: true,
        type: XpertTypeEnum.Agent
      } as IXpert)
    ),
    createTemplateXpert: jest.fn(() =>
      Promise.resolve({
        id: 'created-template-xpert',
        name: 'canvas-assistant',
        title: 'Canvas Assistant',
        latest: true,
        type: XpertTypeEnum.Agent
      } as IXpert)
    )
  }
}

describe('ClawXpertSetupWizardComponent', () => {
  beforeEach(() => {
    mockPluginAPI = createPluginAPIMock()
    xpertAgentService = createXpertAgentServiceMock()
    clawXpertBootstrap = createClawXpertBootstrapMock()
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ClawXpertBootstrapService,
          useValue: clawXpertBootstrap
        },
        {
          provide: AssistantBindingService,
          useValue: {
            upsert: jest.fn(() => of({}))
          }
        },
        {
          provide: XpertAgentService,
          useValue: xpertAgentService
        },
        {
          provide: XpertToolsetService,
          useValue: createXpertToolsetServiceMock()
        }
      ]
    })
  })

  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('renders the default ClawXpert install step without exposing model selection', async () => {
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
    expect(fixture.nativeElement.querySelector('[data-onboarding-step="default-clawxpert"]')).not.toBeNull()
    expect(fixture.nativeElement.querySelector('[data-clawxpert-default-install]')).not.toBeNull()
    expect(fixture.nativeElement.querySelector('z-stepper')).toBeNull()
    expect(fixture.nativeElement.textContent).toContain('PAC.Chat.ClawXpert.DefaultInstallTitle')
    expect(fixture.nativeElement.textContent).toContain('PAC.Chat.ClawXpert.DefaultModelReady')
    expect(fixture.nativeElement.textContent).toContain('PAC.Chat.ClawXpert.CompleteInitialization')
    expect(fixture.nativeElement.textContent).not.toContain('PAC.Chat.ClawXpert.CreateFirst')
    expect(fixture.nativeElement.textContent).not.toContain('PAC.Chat.ClawXpert.ModelProviderStepTitle')
    expect(fixture.nativeElement.querySelector('copilot-model-select')).toBeNull()
    expect(fixture.nativeElement.querySelector('pac-copilot-config-form')).toBeNull()
    expect(fixture.nativeElement.textContent).not.toContain('PAC.ACTIONS.Next')
    expect(fixture.nativeElement.querySelector('a[href], [routerlink]')).toBeNull()
  })

  it('does not block the default ClawXpert install step while recommended templates are loading', async () => {
    const facade = createFacadeMock()
    const dialog = {
      open: jest.fn(() => ({
        closed: of(undefined)
      }))
    }
    const templateCatalog$ = new Subject<{
      categories: string[]
      recommendedApps: Array<ReturnType<typeof createRecommendedTemplate>>
    }>()
    const templateService = {
      ...createXpertTemplateServiceMock(),
      getAll: jest.fn(() => templateCatalog$)
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
    fixture.detectChanges()

    expect(fixture.componentInstance.recommendedTemplateItems()).toBeNull()
    expect(fixture.nativeElement.querySelector('[data-onboarding-step="default-clawxpert"]')).not.toBeNull()
    expect(fixture.nativeElement.querySelector('[data-clawxpert-default-install]')).not.toBeNull()
    expect(fixture.nativeElement.textContent).toContain('PAC.Chat.ClawXpert.LoadingRecommendedTemplates')
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
    expect(fixture.nativeElement.querySelector('[data-clawxpert-default-install]')).toBeNull()

    modelProviders$.next([])
    await fixture.whenStable()
    fixture.detectChanges()

    expect(copilotServer.enableCopilot).toHaveBeenCalledWith('primary')
  })

  it('shows model provider setup only when no usable model exists and initializes after saving', async () => {
    const facade = createFacadeMock()
    const dialog = {
      open: jest.fn(() => ({
        closed: of(undefined)
      }))
    }
    const dialogRef = {
      close: jest.fn()
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
          provide: DialogRef,
          useValue: dialogRef
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
    const component = fixture.componentInstance
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(component.canCreateXpert()).toBe(false)
    expect(fixture.nativeElement.querySelector('[data-model-provider-config-form]')).not.toBeNull()
    expect(fixture.nativeElement.querySelector('pac-copilot-config-form')).not.toBeNull()
    expect(fixture.nativeElement.querySelector('copilot-model-select')).toBeNull()
    expect(fixture.nativeElement.textContent).toContain('PAC.Chat.ClawXpert.SaveModelProvider')
    expect(fixture.nativeElement.textContent).not.toContain('PAC.Chat.ClawXpert.CompleteInitialization')

    await component.saveModelProvider()
    await flushPromises()
    fixture.detectChanges()

    expect(component.selectedCopilotModel()).toEqual({
      copilotId: 'copilot-primary',
      model: 'gpt-4.1',
      modelType: 'llm'
    })
    expect(component.canCreateXpert()).toBe(true)
    expect(fixture.nativeElement.querySelector('[data-model-provider-config-form]')).toBeNull()
    expect(fixture.nativeElement.textContent).toContain('PAC.Chat.ClawXpert.CompleteInitialization')

    component.completeInitialization()
    await flushPromises()
    await flushPromises()

    expect(clawXpertBootstrap.createClawXpert).toHaveBeenCalledWith(
      {
        copilotId: 'copilot-primary',
        model: 'gpt-4.1',
        modelType: 'llm'
      },
      {
        suppressAutoPublishWarning: true,
        suppressPluginPrepareWarning: true
      }
    )
    expect(facade.bindPublishedXpert).toHaveBeenCalled()
    expect(dialogRef.close).toHaveBeenCalled()
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

    expect(mockPluginAPI.getPlugins).not.toHaveBeenCalled()
    expect(mockPluginAPI.getMarketplace).not.toHaveBeenCalled()
    expect(fixture.nativeElement.textContent).not.toContain('Integration Plugin')
    expect(fixture.nativeElement.querySelector('[data-plugin-install-button="integration-plugin"]')).toBeNull()
    expect(fixture.nativeElement.querySelector('a[href], [routerlink]')).toBeNull()
  })

  it('uses configured ids only to select real templates returned by the template catalog', async () => {
    const facade = createFacadeMock()
    const dialog = {
      open: jest.fn(() => ({
        closed: of(undefined)
      }))
    }
    const templateService = createXpertTemplateServiceMock({
      recommendedApps: [
        createRecommendedTemplate(),
        createRecommendedTemplate({
          id: '@xpert-ai/plugin-demo:demo-assistant',
          name: 'demo-assistant',
          title: 'Demo Assistant'
        })
      ]
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
          useValue: createXpertAPIMock()
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
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(templateService.getAll).toHaveBeenCalled()
    expect(fixture.nativeElement.querySelector('[data-clawxpert-recommended-templates]')).not.toBeNull()
    expect(fixture.nativeElement.textContent).toContain('Canvas Assistant')
    expect(fixture.nativeElement.textContent).not.toContain('SalesClaw Business Assistant')
    expect(fixture.nativeElement.textContent).not.toContain('BOM Contract Intake')
    expect(fixture.nativeElement.textContent).not.toContain('Demo Assistant')
    const canvasTemplateSelect = fixture.nativeElement.querySelector(
      '[data-recommended-template-select="@xpert-ai/plugin-canvas:canvas-assistant"]'
    )
    expect(canvasTemplateSelect).not.toBeNull()
    expect(canvasTemplateSelect?.querySelector('label.sr-only')).not.toBeNull()
    expect(
      fixture.nativeElement.querySelector('[data-recommended-template-select="@xpert-ai/plugin-demo:demo-assistant"]')
    ).toBeNull()
    expect(fixture.nativeElement.querySelector('[data-recommended-template-install]')).toBeNull()
    expect(fixture.nativeElement.querySelector('[data-recommended-plugin-install]')).toBeNull()
    expect(fixture.nativeElement.querySelector('a[href], [routerlink]')).toBeNull()
    expect(fixture.nativeElement.querySelector('copilot-model-select')).toBeNull()
    expect(mockPluginAPI.getMarketplace).not.toHaveBeenCalled()

    mockPluginAPI.getPlugins.mockReturnValueOnce(
      of([
        {
          name: '@xpert-ai/plugin-canvas@0.1.0',
          packageName: '@xpert-ai/plugin-canvas',
          currentVersion: '0.1.0',
          isGlobal: false,
          level: 'organization',
          effectiveInCurrentScope: true,
          meta: {
            name: '@xpert-ai/plugin-canvas',
            displayName: 'Canvas',
            description: 'Canvas plugin',
            version: '0.1.0',
            category: 'creative',
            targetAppMeta: {
              xpert: {
                marketplace: {
                  contents: [
                    {
                      type: 'assistant-template',
                      name: 'canvas-assistant',
                      displayName: 'Canvas Assistant'
                    }
                  ]
                }
              }
            }
          }
        }
      ])
    )
    const detailsButton = fixture.nativeElement.querySelector(
      '[data-recommended-template-details="@xpert-ai/plugin-canvas:canvas-assistant"]'
    ) as HTMLButtonElement | null
    expect(detailsButton).not.toBeNull()
    expect(detailsButton?.classList.contains('inset-x-3')).toBe(true)
    expect(detailsButton?.classList.contains('opacity-0')).toBe(true)
    expect(detailsButton?.classList.contains('group-hover:opacity-100')).toBe(true)
    expect(detailsButton?.classList.contains('!bg-components-card-bg')).toBe(true)
    expect(detailsButton?.parentElement?.className).not.toContain('pb-12')

    detailsButton?.click()
    await flushPromises()

    expect(dialog.open).toHaveBeenCalledWith(PluginMarketplaceDetailComponent, {
      data: {
        plugin: expect.objectContaining({
          packageName: '@xpert-ai/plugin-canvas',
          contributions: [
            expect.objectContaining({
              type: 'assistant-template',
              name: 'canvas-assistant'
            })
          ]
        }),
        showActions: false
      },
      backdropClass: 'backdrop-blur-sm-black'
    })
  })

  it('does not initialize recommended templates when required workspace toolsets are missing', async () => {
    const facade = createFacadeMock()
    const dialog = {
      open: jest.fn(() => ({
        closed: of(undefined)
      }))
    }
    const dialogRef = {
      close: jest.fn()
    }
    const canvasTemplate = createRecommendedTemplate({
      dependencies: {
        toolsets: [
          {
            provider: 'seedream_aigc',
            templateNodeKey: 'toolset_seedream',
            instanceName: 'Seedream AIGC'
          }
        ]
      }
    })
    const templateService = createXpertTemplateServiceMock({
      recommendedApps: [canvasTemplate]
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
          provide: DialogRef,
          useValue: dialogRef
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
          useValue: templateService
        },
        {
          provide: XpertToolsetService,
          useValue: createXpertToolsetServiceMock()
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
    await flushPromises()
    fixture.detectChanges()

    expect(
      fixture.nativeElement.querySelector(
        '[data-recommended-template-unavailable="@xpert-ai/plugin-canvas:canvas-assistant"]'
      )
    ).not.toBeNull()
    expect(fixture.nativeElement.textContent).toContain('PAC.Chat.ClawXpert.RecommendedTemplateToolsetUnavailable')

    component.setRecommendedTemplateSelected(canvasTemplate, true)
    expect(component.selectedRecommendedTemplateCount()).toBe(0)

    component.completeInitialization()
    await flushPromises()
    await flushPromises()

    expect(clawXpertBootstrap.createClawXpert).toHaveBeenCalled()
    expect(clawXpertBootstrap.createTemplateXpert).not.toHaveBeenCalled()
    expect(facade.bindPublishedXpert).toHaveBeenCalled()
    expect(dialogRef.close).toHaveBeenCalled()
  })

  it('allows recommended templates when required workspace toolsets are configured', async () => {
    const facade = createFacadeMock()
    const dialog = {
      open: jest.fn(() => ({
        closed: of(undefined)
      }))
    }
    const dialogRef = {
      close: jest.fn()
    }
    const canvasTemplate = createRecommendedTemplate({
      dependencies: {
        toolsets: [
          {
            provider: 'seedream_aigc',
            templateNodeKey: 'toolset_seedream',
            instanceName: 'Seedream AIGC'
          }
        ]
      }
    })
    const templateService = createXpertTemplateServiceMock({
      recommendedApps: [canvasTemplate]
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
          provide: DialogRef,
          useValue: dialogRef
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
          useValue: templateService
        },
        {
          provide: XpertToolsetService,
          useValue: createXpertToolsetServiceMock({
            toolsets: [createToolset()]
          })
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
    await flushPromises()
    fixture.detectChanges()

    expect(
      fixture.nativeElement.querySelector(
        '[data-recommended-template-unavailable="@xpert-ai/plugin-canvas:canvas-assistant"]'
      )
    ).toBeNull()

    component.setRecommendedTemplateSelected(canvasTemplate, true)
    component.completeInitialization()
    await flushPromises()
    await flushPromises()

    expect(clawXpertBootstrap.createTemplateXpert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '@xpert-ai/plugin-canvas:canvas-assistant'
      }),
      expect.objectContaining({
        copilotId: 'copilot-primary',
        model: 'gpt-4.1'
      }),
      {
        suppressAutoPublishWarning: true,
        suppressPluginPrepareWarning: true
      }
    )
  })

  it('initializes selected recommended templates together with the default ClawXpert', async () => {
    const facade = createFacadeMock()
    const dialog = {
      open: jest.fn(() => ({
        closed: of(undefined)
      }))
    }
    const dialogRef = {
      close: jest.fn()
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
          provide: DialogRef,
          useValue: dialogRef
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
    const component = fixture.componentInstance
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    component.setRecommendedTemplateSelected(component.recommendedTemplateItems()?.[0]?.template ?? createRecommendedTemplate(), true)
    component.completeInitialization()
    await flushPromises()
    await flushPromises()

    expect(clawXpertBootstrap.createClawXpert).toHaveBeenCalledWith(
      {
        copilotId: 'copilot-primary',
        model: 'gpt-4.1',
        modelType: 'llm'
      },
      {
        suppressAutoPublishWarning: true,
        suppressPluginPrepareWarning: true
      }
    )
    expect(clawXpertBootstrap.createTemplateXpert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '@xpert-ai/plugin-canvas:canvas-assistant',
        title: 'Canvas Assistant'
      }),
      {
        copilotId: 'copilot-primary',
        model: 'gpt-4.1',
        modelType: 'llm'
      },
      {
        suppressAutoPublishWarning: true,
        suppressPluginPrepareWarning: true
      }
    )
    expect(dialog.open).not.toHaveBeenCalled()
    expect(facade.bindPublishedXpert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'created-clawxpert'
      }),
      {
        bindNextConversationToXpert: true,
        navigateToChat: true,
        notifySuccess: false,
        notifyError: false,
        rethrowOnError: true
      }
    )
    expect(dialogRef.close).toHaveBeenCalled()
  })

  it('continues binding default ClawXpert when a selected recommended template fails', async () => {
    const facade = createFacadeMock()
    const toastr = createToastrMock()
    const canvasTemplate = createRecommendedTemplate()
    const drawioTemplate = createRecommendedTemplate({
      id: '@xpert-ai/plugin-drawio:drawio-assistant',
      name: 'drawio-assistant',
      title: 'Drawio Assistant',
      category: 'Drawio',
      pluginDisplayName: 'Drawio',
      pluginName: '@xpert-ai/plugin-drawio'
    })
    clawXpertBootstrap.createTemplateXpert.mockImplementation((template: RecommendedTemplateMock) =>
      template.id === drawioTemplate.id
        ? Promise.reject(new Error('drawio failed'))
        : Promise.resolve({
            id: 'created-template-xpert',
            name: template.name,
            title: template.title,
            latest: true,
            type: XpertTypeEnum.Agent
          } as IXpert)
    )
    const dialog = {
      open: jest.fn(() => ({
        closed: of(undefined)
      }))
    }
    const dialogRef = {
      close: jest.fn()
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
          provide: DialogRef,
          useValue: dialogRef
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
          useValue: createXpertAPIMock()
        },
        {
          provide: XpertTemplateService,
          useValue: createXpertTemplateServiceMock({
            recommendedApps: [canvasTemplate, drawioTemplate]
          })
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
    fixture.detectChanges()

    component.setRecommendedTemplateSelected(canvasTemplate, true)
    component.setRecommendedTemplateSelected(drawioTemplate, true)
    component.completeInitialization()
    await flushPromises()
    await flushPromises()

    expect(clawXpertBootstrap.createTemplateXpert).toHaveBeenCalledTimes(2)
    expect(facade.bindPublishedXpert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'created-clawxpert'
      }),
      {
        bindNextConversationToXpert: true,
        navigateToChat: true,
        notifySuccess: false,
        notifyError: false,
        rethrowOnError: true
      }
    )
    expect(dialogRef.close).toHaveBeenCalled()
    expect(fixture.nativeElement.querySelector('[data-clawxpert-initialization-error]')).toBeNull()
    expect(toastr.error).toHaveBeenCalledWith('PAC.Chat.ClawXpert.RecommendedTemplatesInitializeFailed', '', {
      Default: 'ClawXpert was initialized, but {{names}} could not be initialized.',
      count: 1,
      names: 'Drawio Assistant'
    })
  })

  it('shows initialization progress inside the setup dialog while creating', async () => {
    const facade = createFacadeMock()
    const dialog = {
      open: jest.fn(() => ({
        closed: of(undefined)
      }))
    }
    const dialogRef = {
      close: jest.fn()
    }
    let resolveCreatedXpert: ((xpert: IXpert) => void) | null = null
    clawXpertBootstrap.createClawXpert.mockImplementation(
      () =>
        new Promise<IXpert>((resolve) => {
          resolveCreatedXpert = resolve
        })
    )

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
          provide: DialogRef,
          useValue: dialogRef
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
    const component = fixture.componentInstance

    fixture.detectChanges()
    await fixture.whenStable()

    component.completeInitialization()
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelector('[data-clawxpert-initialization-status]')?.textContent).toContain(
      'PAC.Chat.ClawXpert.InitializingDefault'
    )
    expect(fixture.nativeElement.textContent).toContain('PAC.Chat.ClawXpert.Initializing')

    resolveCreatedXpert?.({
      id: 'created-clawxpert',
      name: 'clawxpert',
      title: 'ClawXpert',
      latest: true,
      type: XpertTypeEnum.Agent
    } as IXpert)
    await flushPromises()

    expect(dialogRef.close).toHaveBeenCalled()
  })

  it('uses the default model without rendering a model selector', async () => {
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
    expect(fixture.componentInstance.selectedCopilotModel()).toEqual({
      copilotId: 'copilot-primary',
      model: 'gpt-4.1',
      modelType: 'llm'
    })
    expect(fixture.nativeElement.querySelector('[data-clawxpert-default-install]')).not.toBeNull()
    expect(fixture.nativeElement.querySelector('copilot-model-select')).toBeNull()
    expect(fixture.nativeElement.querySelector('pac-copilot-config-form')).toBeNull()
    expect(fixture.nativeElement.textContent).toContain('PAC.Chat.ClawXpert.DefaultModelReady')
    expect(fixture.nativeElement.textContent).not.toContain('PAC.Chat.ClawXpert.PreparingModelProvider')
  })

  it('initializes the default ClawXpert template directly with the selected model', async () => {
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

    component.completeInitialization()
    await flushPromises()

    expect(dialog.open).not.toHaveBeenCalled()
    expect(clawXpertBootstrap.createClawXpert).toHaveBeenCalledWith(
      {
        copilotId: 'copilot-primary',
        model: 'gpt-4.1',
        modelType: 'llm'
      },
      {
        suppressAutoPublishWarning: true,
        suppressPluginPrepareWarning: true
      }
    )
    expect(templateService.getTemplate).not.toHaveBeenCalled()
    expect(templateService.installTemplate).not.toHaveBeenCalled()
    expect(clawXpertBootstrap.createTemplateXpert).not.toHaveBeenCalled()
    expect(xpertService.getTeam).not.toHaveBeenCalled()
    expect(xpertService.saveDraft).not.toHaveBeenCalled()
    expect(xpertService.publish).not.toHaveBeenCalled()
    expect(facade.bindPublishedXpert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'created-clawxpert'
      }),
      {
        bindNextConversationToXpert: true,
        navigateToChat: true,
        notifySuccess: false,
        notifyError: false,
        rethrowOnError: true
      }
    )
  })

  it('binds the initialized ClawXpert for the next conversation and closes setup on the chat page', async () => {
    const facade = createFacadeMock()
    const createdXpert = {
      id: 'created-xpert',
      name: 'clawxpert',
      title: 'ClawXpert',
      latest: true,
      type: XpertTypeEnum.Agent
    } as IXpert
    clawXpertBootstrap.createClawXpert.mockResolvedValue(createdXpert)
    const dialog = {
      open: jest.fn(() => ({
        closed: of(undefined)
      }))
    }
    const dialogRef = {
      close: jest.fn()
    }
    const xpertService = createXpertAPIMock()
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
          provide: DialogRef,
          useValue: dialogRef
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

    component.completeInitialization()
    await flushPromises()

    expect(templateService.installTemplate).not.toHaveBeenCalled()
    expect(xpertService.publish).not.toHaveBeenCalled()
    expect(facade.bindPublishedXpert).toHaveBeenCalledWith(createdXpert, {
      bindNextConversationToXpert: true,
      navigateToChat: true,
      notifySuccess: false,
      notifyError: false,
      rethrowOnError: true
    })
    expect(facade.navigateToOverview).not.toHaveBeenCalled()
    expect(dialogRef.close).toHaveBeenCalled()
  })

  it('keeps setup open and shows inline error when binding the initialized ClawXpert fails', async () => {
    const facade = createFacadeMock()
    const toastr = createToastrMock()
    const createdXpert = {
      id: 'created-xpert',
      name: 'clawxpert',
      title: 'ClawXpert',
      latest: true,
      type: XpertTypeEnum.Agent
    } as IXpert
    clawXpertBootstrap.createClawXpert.mockResolvedValue(createdXpert)
    facade.bindPublishedXpert.mockRejectedValue(new Error('bind failed'))
    const dialog = {
      open: jest.fn(() => ({
        closed: of(undefined)
      }))
    }
    const dialogRef = {
      close: jest.fn()
    }
    const xpertService = createXpertAPIMock()
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
          provide: DialogRef,
          useValue: dialogRef
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

    component.completeInitialization()
    await flushPromises()
    fixture.detectChanges()

    expect(facade.bindPublishedXpert).toHaveBeenCalledWith(createdXpert, {
      bindNextConversationToXpert: true,
      navigateToChat: true,
      notifySuccess: false,
      notifyError: false,
      rethrowOnError: true
    })
    expect(facade.navigateToOverview).not.toHaveBeenCalled()
    expect(dialogRef.close).not.toHaveBeenCalled()
    expect(toastr.error).not.toHaveBeenCalled()
    expect(toastr.success).not.toHaveBeenCalled()
    expect(fixture.nativeElement.querySelector('[data-clawxpert-initialization-error]')?.textContent).toContain(
      'Error: bind failed'
    )
  })

  it('keeps setup open when default ClawXpert initialization fails', async () => {
    const facade = createFacadeMock()
    const toastr = createToastrMock()
    clawXpertBootstrap.createClawXpert.mockRejectedValue(new Error('create failed'))
    const dialog = {
      open: jest.fn(() => ({
        closed: of(undefined)
      }))
    }
    const dialogRef = {
      close: jest.fn()
    }
    const xpertService = createXpertAPIMock()
    const templateService = createXpertTemplateServiceMock()
    const workspaceService = createWorkspaceServiceMock()

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
          provide: DialogRef,
          useValue: dialogRef
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
          useValue: workspaceService
        }
      ]
    }).compileComponents()

    const fixture = TestBed.createComponent(ClawXpertSetupWizardComponent)
    const component = fixture.componentInstance

    fixture.detectChanges()
    await fixture.whenStable()

    component.completeInitialization()
    await flushPromises()

    expect(facade.bindPublishedXpert).not.toHaveBeenCalled()
    expect(dialogRef.close).not.toHaveBeenCalled()
    expect(templateService.installTemplate).not.toHaveBeenCalled()
    expect(workspaceService.getMyDefault).not.toHaveBeenCalled()
    expect(xpertService.create).not.toHaveBeenCalled()
    fixture.detectChanges()

    expect(toastr.error).not.toHaveBeenCalled()
    expect(fixture.nativeElement.querySelector('[data-clawxpert-initialization-error]')?.textContent).toContain(
      'Error: create failed'
    )
  })
})
