import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { of } from 'rxjs'
import { ASSISTANT_REGISTRY } from '../../assistant/assistant.registry'
import { AssistantsSettingsComponent } from './assistants.component'
import { AssistantsSettingsFacade } from './assistants.facade'

jest.mock('@xpert-ai/headless-ui', () => {
  const angularCore = jest.requireActual('@angular/core')

  class ZardComboboxComponent {
    value: unknown = null
    options: unknown[] = []
    disabled = false
    placeholder = ''
    zSearchTerm = ''
    zDisplayWith: ((option: unknown, value: unknown) => string) | null = null
    zTriggerMode = 'input'
    zSearchTermChange = new angularCore.EventEmitter()
    zValueChange = new angularCore.EventEmitter()
  }

  angularCore.Component({
    selector: 'z-combobox',
    standalone: true,
    template: '<ng-content />',
    inputs: ['value', 'options', 'disabled', 'placeholder', 'zSearchTerm', 'zDisplayWith', 'zTriggerMode'],
    outputs: ['zSearchTermChange', 'zValueChange']
  })(ZardComboboxComponent)

  class ZardComboboxOptionTemplateDirective {}

  angularCore.Directive({
    selector: '[zComboboxOption]',
    standalone: true
  })(ZardComboboxOptionTemplateDirective)

  return {
    ZardComboboxComponent,
    ZardComboboxOptionTemplateDirective,
    ZardFormImports: []
  }
})

jest.mock('apps/cloud/src/app/@core', () => {
  const { of } = jest.requireActual('rxjs')

  class AssistantBindingService {
    getByScope(): any {
      return of([])
    }

    getAvailableXperts(): any {
      return of([])
    }

    getEffective(): any {
      return of({
        code: 'chatbi',
        enabled: false,
        assistantId: null,
        sourceScope: 'none'
      })
    }

    upsert(): any {
      return of({})
    }

    delete(): any {
      return of({})
    }
  }

  class Store {
    featureOrganizations$ = of([])
    featureTenant$ = of([])
    selectedOrganization$ = of(null)
    user$ = of(null)
    selectedOrganization = null
    activeScope = { level: 'organization', organizationId: 'org-1' }

    selectOrganizationId() {
      return of(null)
    }

    selectActiveScope() {
      return of(this.activeScope)
    }

    hasFeatureEnabled() {
      return true
    }
  }

  class ToastrService {
    success() {
      return undefined
    }

    error() {
      return undefined
    }
  }

  return {
    AiFeatureEnum: {
      FEATURE_XPERT: 'FEATURE_XPERT',
      FEATURE_XPERT_CHATBI: 'FEATURE_XPERT_CHATBI',
      FEATURE_XPERT_CLAWXPERT: 'FEATURE_XPERT_CLAWXPERT'
    },
    AssistantCode: {
      CHAT_COMMON: 'chat_common',
      XPERT_SHARED: 'xpert_shared',
      CHATBI: 'chatbi',
      CLAWXPERT: 'clawxpert'
    },
    AssistantBindingScope: {
      TENANT: 'tenant',
      ORGANIZATION: 'organization'
    },
    AssistantBindingSourceScope: {
      NONE: 'none',
      TENANT: 'tenant',
      ORGANIZATION: 'organization'
    },
    RequestScopeLevel: {
      TENANT: 'tenant',
      ORGANIZATION: 'organization'
    },
    AssistantBindingService,
    RolesEnum: {
      SUPER_ADMIN: 'SUPER_ADMIN',
      ADMIN: 'ADMIN'
    },
    Store,
    ToastrService,
    getErrorMessage: (error: any) => error?.message ?? '',
    routeAnimations: []
  }
})

const {
  AssistantCode,
  AssistantBindingScope,
  AssistantBindingService,
  RolesEnum,
  Store,
  ToastrService
} = jest.requireMock('apps/cloud/src/app/@core') as {
  AssistantCode: {
    CHAT_COMMON: string
    XPERT_SHARED: string
    CHATBI: string
    CLAWXPERT: string
  }
  AssistantBindingScope: {
    TENANT: string
    ORGANIZATION: string
  }
  AssistantBindingService: new (...args: any[]) => unknown
  RolesEnum: {
    SUPER_ADMIN: string
    ADMIN: string
  }
  Store: new (...args: any[]) => unknown
  ToastrService: new (...args: any[]) => unknown
}

describe('AssistantsSettingsComponent', () => {
  let assistantBindingService: {
    getByScope: jest.Mock
    getAvailableXperts: jest.Mock
    getEffective: jest.Mock
    upsert: jest.Mock
    delete: jest.Mock
  }
  let store: {
    featureOrganizations$: any
    featureTenant$: any
    selectedOrganization$: any
    user$: any
    activeScope: {
      level: string
      organizationId: string
    }
    selectOrganizationId: jest.Mock
    selectActiveScope: jest.Mock
    hasFeatureEnabled: jest.Mock
  }
  let toastr: {
    success: jest.Mock
    error: jest.Mock
  }

  beforeEach(async () => {
    assistantBindingService = {
      getByScope: jest.fn((scope: string) =>
        of(
          scope === AssistantBindingScope.TENANT
            ? [
                {
                  code: AssistantCode.XPERT_SHARED,
                  enabled: true,
                  assistantId: 'workspace-assistant',
                  scope,
                  tenantId: 'tenant-1',
                  organizationId: null
                }
              ]
            : [
                {
                  code: AssistantCode.CHATBI,
                  enabled: false,
                  assistantId: 'chatbi-assistant',
                  scope,
                  tenantId: 'tenant-1',
                  organizationId: 'org-1'
                }
              ]
        )
      ),
      getEffective: jest.fn((code: string) =>
        of({
          code,
          enabled: code === AssistantCode.XPERT_SHARED,
          assistantId: code === AssistantCode.XPERT_SHARED ? 'workspace-assistant' : 'chatbi-assistant',
          scope:
            code === AssistantCode.XPERT_SHARED ? AssistantBindingScope.TENANT : AssistantBindingScope.ORGANIZATION,
          tenantId: 'tenant-1',
          organizationId: code === AssistantCode.XPERT_SHARED ? null : 'org-1',
          sourceScope: code === AssistantCode.XPERT_SHARED ? 'tenant' : 'organization'
        })
      ),
      getAvailableXperts: jest.fn((scope: string) =>
        of(
          scope === AssistantBindingScope.TENANT
            ? [
                {
                  id: 'tenant-assistant',
                  name: 'Tenant Assistant',
                  title: 'Tenant Assistant',
                  latest: true
                }
              ]
            : [
                {
                  id: 'tenant-assistant',
                  name: 'Tenant Assistant',
                  title: 'Tenant Assistant',
                  latest: true
                },
                {
                  id: 'org-assistant',
                  name: 'Org Assistant',
                  title: 'Org Assistant',
                  latest: true
                }
              ]
        )
      ),
      upsert: jest.fn(() => of({})),
      delete: jest.fn(() => of({}))
    }

    store = {
      featureOrganizations$: of([]),
      featureTenant$: of([]),
      selectedOrganization$: of({ id: 'org-1', name: 'Org One' }),
      user$: of({ role: { name: RolesEnum.ADMIN } }),
      activeScope: { level: 'organization', organizationId: 'org-1' },
      selectOrganizationId: jest.fn(() => of('org-1')),
      selectActiveScope: jest.fn(() => of({ level: 'organization', organizationId: 'org-1' })),
      hasFeatureEnabled: jest.fn(() => true)
    }

    toastr = {
      success: jest.fn(),
      error: jest.fn()
    }

    TestBed.resetTestingModule()
    TestBed.overrideComponent(AssistantsSettingsComponent, {
      set: {
        template: ''
      }
    })
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), AssistantsSettingsComponent],
      providers: [
        {
          provide: AssistantBindingService,
          useValue: assistantBindingService
        },
        {
          provide: Store,
          useValue: store
        },
        {
          provide: ToastrService,
          useValue: toastr
        }
      ]
    }).compileComponents()
  })

  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('saves an organization override with the form values', async () => {
    const fixture = TestBed.createComponent(AssistantsSettingsComponent)
    await fixture.whenStable()

    const component = fixture.componentInstance
    component.organizationForm(AssistantCode.CHATBI as any).patchValue({
      enabled: true,
      assistantId: 'chatbi-override'
    })

    await component.saveConfig(
      ASSISTANT_REGISTRY.find((item) => item.code === AssistantCode.CHATBI)!,
      AssistantBindingScope.ORGANIZATION as any
    )

    expect(assistantBindingService.upsert).toHaveBeenCalledWith({
      code: AssistantCode.CHATBI,
      scope: AssistantBindingScope.ORGANIZATION,
      enabled: true,
      assistantId: 'chatbi-override'
    })
    expect(toastr.success).toHaveBeenCalled()
  })

  it('deletes an organization override when resetting to the tenant default', async () => {
    const fixture = TestBed.createComponent(AssistantsSettingsComponent)
    await fixture.whenStable()

    const component = fixture.componentInstance
    await component.resetOrganizationOverride(ASSISTANT_REGISTRY.find((item) => item.code === AssistantCode.CHATBI)!)

    expect(assistantBindingService.delete).toHaveBeenCalledWith(
      AssistantCode.CHATBI,
      AssistantBindingScope.ORGANIZATION
    )
    expect(toastr.success).toHaveBeenCalled()
  })

  it('uses tenant-only xperts for tenant defaults and tenant-plus-org xperts for organization overrides', async () => {
    const fixture = TestBed.createComponent(AssistantsSettingsComponent)
    await fixture.whenStable()
    fixture.detectChanges()
    await fixture.whenStable()

    const component = fixture.componentInstance

    const tenantOptions = component.assistantXpertOptions(
      AssistantBindingScope.TENANT as any,
      AssistantCode.XPERT_SHARED as any
    )
    const organizationOptions = component.assistantXpertOptions(
      AssistantBindingScope.ORGANIZATION as any,
      AssistantCode.CHATBI as any
    )

    expect(tenantOptions.map((option) => option.value)).toEqual(['tenant-assistant'])
    expect(organizationOptions.map((option) => option.value)).toEqual(['tenant-assistant', 'org-assistant'])
  })

  it('registers the common assistant in the settings registry', () => {
    expect(ASSISTANT_REGISTRY.some((item) => item.code === AssistantCode.CHAT_COMMON)).toBe(true)
  })

  it('keeps ClawXpert out of the admin assistants settings list', async () => {
    const fixture = TestBed.createComponent(AssistantsSettingsComponent)
    await fixture.whenStable()

    const facade = fixture.debugElement.injector.get(AssistantsSettingsFacade)
    const assistantCodes = facade.assistants().map((item) => item.code)

    expect(assistantCodes).not.toContain(AssistantCode.CLAWXPERT)
    expect(assistantCodes).toContain(AssistantCode.CHAT_COMMON)
  })
})
