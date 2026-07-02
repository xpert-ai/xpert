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
    XpertAPIService: class XpertAPIService {},
    XpertWorkspaceService: class XpertWorkspaceService {},
    XpertTypeEnum: contracts.XpertTypeEnum
  }
})

let mockPluginAPI: {
  getMarketplace: jest.Mock
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
      }
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
import { BehaviorSubject, of, Subject } from 'rxjs'
import {
  CopilotServerService,
  EnvironmentService,
  IXpert,
  Store,
  ToastrService,
  XpertAPIService,
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
    success: jest.fn()
  }
}

function createXpertAPIMock() {
  const createdXpert = {
    id: 'created-xpert',
    name: 'clawxpert',
    title: 'ClawXpert',
    latest: true,
    type: XpertTypeEnum.Agent,
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
    }
  } as IXpert
  const publishedXpert = {
    ...createdXpert,
    version: '1.0.0'
  } as IXpert

  return {
    create: jest.fn(() => of(createdXpert)),
    saveDraft: jest.fn((_id: string, draft: unknown) => of(draft)),
    publish: jest.fn(() => of(publishedXpert)),
    publishedXpert
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

  it('renders a two-step Zard stepper for plugins and model providers', async () => {
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

    expect(fixture.nativeElement.querySelector('[data-onboarding-step="plugins"]')).not.toBeNull()
    expect(fixture.nativeElement.querySelector('z-stepper')).not.toBeNull()
    expect(fixture.nativeElement.textContent).toContain('PAC.Chat.ClawXpert.ModelProviderStepTitle')
    expect(fixture.nativeElement.textContent).toContain('PAC.ACTIONS.Next')
    expect(fixture.nativeElement.querySelector('a[href], [routerlink]')).toBeNull()
  })

  it('disables the next action while marketplace plugins are loading', async () => {
    const facade = createFacadeMock()
    const dialog = {
      open: jest.fn(() => ({
        closed: of(undefined)
      }))
    }
    const marketplace$ = new Subject<unknown>()
    mockPluginAPI = {
      getMarketplace: jest.fn(() => marketplace$)
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

    const nextButton = fixture.nativeElement.querySelector('[data-clawxpert-setup-next]') as HTMLButtonElement | null

    expect(fixture.componentInstance.marketplacePlugins()).toBeNull()
    expect(fixture.componentInstance.marketplacePluginsLoading()).toBe(true)
    expect(nextButton?.disabled).toBe(true)
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

  it('renders marketplace plugins and opens the real plugin install dialog', async () => {
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

    expect(mockPluginAPI.getMarketplace).toHaveBeenCalledWith({ targetApp: 'xpert' })
    expect(fixture.nativeElement.textContent).toContain('Integration Plugin')
    expect(fixture.nativeElement.querySelector('a[href], [routerlink]')).toBeNull()

    fixture.nativeElement.querySelector('[data-plugin-install-button="integration-plugin"]').click()

    expect(dialog.open).toHaveBeenCalledWith(
      PluginInstallComponent,
      expect.objectContaining({
        disableClose: true,
        data: expect.objectContaining({
          plugin: expect.objectContaining({
            name: 'integration-plugin'
          }),
          reload: expect.any(Function)
        })
      })
    )
  })

  it('shows model plugin configuration guidance when no LLM model is configured', async () => {
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
    fixture.componentInstance.currentStep.set(1)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(fixture.nativeElement.querySelector('[data-model-plugin-section="initialized"]')).not.toBeNull()
    expect(fixture.nativeElement.querySelector('[data-model-plugin-section="uninitialized"]')).not.toBeNull()
    expect(fixture.nativeElement.querySelector('[data-model-provider-config-form]')).not.toBeNull()
    expect(fixture.nativeElement.querySelector('pac-copilot-config-form')).not.toBeNull()
    expect(fixture.nativeElement.querySelector('a[href], [routerlink]')).toBeNull()
    expect(fixture.nativeElement.textContent).toContain('OpenAI Compatible')
    expect(fixture.nativeElement.textContent).toContain('SiliconFlow')
    expect(fixture.nativeElement.querySelector('copilot-model-select')).toBeNull()
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
    fixture.componentInstance.currentStep.set(1)
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
    fixture.componentInstance.currentStep.set(1)
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

  it('directly creates, publishes, binds, and navigates to a ClawXpert without opening the blank wizard', async () => {
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
    expect(xpertService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: XpertTypeEnum.Agent,
        name: 'clawxpert',
        title: 'ClawXpert',
        latest: true,
        copilotModel: {
          copilotId: 'copilot-primary',
          model: 'gpt-4.1',
          modelType: 'llm'
        },
        agent: expect.objectContaining({
          copilotModel: {
            copilotId: 'copilot-primary',
            model: 'gpt-4.1',
            modelType: 'llm'
          },
          options: expect.objectContaining({
            vision: {
              enabled: true
            }
          })
        })
      })
    )
    expect(xpertService.saveDraft).toHaveBeenCalledWith('created-xpert', expect.objectContaining({ team: expect.anything() }))
    expect(xpertService.publish).toHaveBeenCalledWith('created-xpert', false, {
      environmentId: null,
      releaseNotes: 'Initial ClawXpert bootstrap release.'
    })
    expect(facade.bindPublishedXpert).toHaveBeenCalledWith(xpertService.publishedXpert, {
      navigateToChat: true
    })
  })

  it('creates a default workspace before creating ClawXpert when the user has none', async () => {
    const facade = createFacadeMock()
    const dialog = {
      open: jest.fn(() => ({
        closed: of(undefined)
      }))
    }
    const xpertService = createXpertAPIMock()
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

    expect(workspaceService.getMyDefault).toHaveBeenCalled()
    expect(workspaceService.create).toHaveBeenCalledWith({
      name: 'Default Workspace'
    })
    expect(workspaceService.setMyDefault).toHaveBeenCalledWith('workspace-created')
    expect(workspaceService.refresh).toHaveBeenCalled()
    expect(xpertService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-created',
        name: 'clawxpert',
        title: 'ClawXpert'
      })
    )
  })
})
