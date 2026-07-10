jest.mock('@xpert-ai/cloud/state', () => {
  const { signal } = jest.requireActual('@angular/core')

  return {
    CURRENT_USER_BOOTSTRAP_RELATIONS: [],
    CURRENT_USER_BOOTSTRAP_SELECT: {},
    CurrentUserHydrationService: class CurrentUserHydrationService {},
    UsersService: class UsersService {},
    injectUserPreferences: () => signal(null)
  }
})

jest.mock('../@core', () => ({
  AbilityActions: {
    Create: 'Create',
    Manage: 'Manage',
    Read: 'Read'
  },
  AIPermissionsEnum: {
    XPERT_EDIT: 'XPERT_EDIT'
  },
  AiFeatureEnum: {
    FEATURE_XPERT: 'FEATURE_XPERT',
    FEATURE_XPERT_CLAWXPERT: 'FEATURE_XPERT_CLAWXPERT'
  },
  EmployeesService: class EmployeesService {},
  MenuCatalog: {
    Project: 1,
    Stories: 2,
    Models: 3,
    Settings: 4,
    IndicatorApp: 5
  },
  RequestScopeLevel: {
    TENANT: 'tenant',
    ORGANIZATION: 'organization'
  },
  ScopeService: class ScopeService {},
  Store: class Store {},
  UsersOrganizationsService: class UsersOrganizationsService {},
  XpertAPIService: class XpertAPIService {},
  XpertTypeEnum: {
    Agent: 'agent'
  },
  routeAnimations: []
}))

jest.mock('../app.service', () => ({
  AppService: class AppService {}
}))

import { Renderer2, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { Router } from '@angular/router'
import { CurrentUserHydrationService, UsersService } from '@xpert-ai/cloud/state'
import { TranslateService } from '@ngx-translate/core'
import { NGXLogger } from 'ngx-logger'
import { NgxPermissionsService, NgxRolesService } from 'ngx-permissions'
import { BehaviorSubject, of, Subject } from 'rxjs'
import {
  AIPermissionsEnum,
  AiFeatureEnum,
  EmployeesService,
  IUser,
  RequestScopeLevel,
  ScopeService,
  Store,
  UsersOrganizationsService,
  XpertAPIService,
  XpertTypeEnum
} from '../@core'
import { AppService } from '../app.service'
import { FEATURE_ENTRY_ONBOARDING_GUIDE_KEY } from './features-onboarding'
import { FeaturesComponent } from './features.component'

type FeatureTestOptions = {
  autoShownAt?: string | null
  hasClawXpertFeature?: boolean
  hasCreatePermission?: boolean
  hasXpertFeature?: boolean
  xpertCount?: number
}

function mountEntryOnboardingTargets() {
  document.body.innerHTML = `
    <button data-onboarding-target="scope-switcher"></button>
    <button data-onboarding-target="plugins-marketplace"></button>
    <button data-onboarding-target="model-providers"></button>
    <button data-onboarding-target="workspace"></button>
  `
}

function createUser(autoShownAt?: string | null): IUser {
  return {
    id: 'user-1',
    tenantId: 'tenant-1',
    tenant: {
      id: 'tenant-1',
      featureOrganizations: []
    },
    role: {
      rolePermissions: [
        {
          permission: AIPermissionsEnum.XPERT_EDIT,
          enabled: true
        }
      ]
    },
    organizations: [
      {
        id: 'membership-1',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        userId: 'user-1',
        isDefault: true,
        isActive: true,
        organization: {
          id: 'org-1',
          isActive: true,
          name: 'Org 1'
        },
        preferences: autoShownAt
          ? {
              entryGuides: {
                clawxpert: {
                  autoShownAt
                }
              }
            }
          : {}
      }
    ]
  } as IUser
}

async function setup(options: FeatureTestOptions = {}) {
  const userSubject = new BehaviorSubject<IUser>(createUser(options.autoShownAt))
  const routerEvents$ = new Subject()
  const activeScope = signal({
    level: RequestScopeLevel.ORGANIZATION,
    organizationId: 'org-1'
  })
  const store = {
    get user() {
      return userSubject.value
    },
    set user(user: IUser) {
      userSubject.next(user)
    },
    get featureContextHydrated() {
      return true
    },
    set featureContextHydrated(_hydrated: boolean) {},
    get featureContextHydrationLoading() {
      return false
    },
    set featureContextHydrationLoading(_loading: boolean) {},
    get featureContextHydrationFailed() {
      return false
    },
    set featureContextHydrationFailed(_failed: boolean) {},
    get featureTenant() {
      return []
    },
    set featureTenant(_features: unknown[]) {},
    user$: userSubject.asObservable(),
    userId: 'user-1',
    organizationId: 'org-1',
    lastOrganizationId: 'org-1',
    userRolePermissions$: of([
      {
        permission: AIPermissionsEnum.XPERT_EDIT,
        enabled: true
      }
    ]),
    selectedOrganization$: of({
      id: 'org-1'
    }),
    featureTenant$: of([]),
    featureOrganizations$: of([]),
    featureContextHydrated$: of(true),
    preferences: signal(null),
    updatePreferences: jest.fn(),
    selectActiveScope: jest.fn(() => of(activeScope())),
    hasFeatureEnabled: jest.fn((feature: AiFeatureEnum) => {
      if (feature === AiFeatureEnum.FEATURE_XPERT) {
        return options.hasXpertFeature ?? true
      }

      if (feature === AiFeatureEnum.FEATURE_XPERT_CLAWXPERT) {
        return options.hasClawXpertFeature ?? true
      }

      return false
    }),
    hasPermission: jest.fn(() => options.hasCreatePermission ?? true)
  }
  const xpertService = {
    getMyAll: jest.fn(() =>
      of({
        items: [],
        total: options.xpertCount ?? 0
      })
    )
  }
  const updatedMembership = {
    ...userSubject.value.organizations[0],
    preferences: {
      entryGuides: {
        clawxpert: {
          autoShownAt: '2026-07-02T00:00:00.000Z'
        }
      }
    }
  }
  const usersOrganizationsService = {
    markEntryGuideAutoShown: jest.fn(() => Promise.resolve(updatedMembership))
  }
  const router = {
    events: routerEvents$.asObservable(),
    navigate: jest.fn(),
    url: '/chat'
  }

  await TestBed.configureTestingModule({
    providers: [
      {
        provide: AppService,
        useValue: {
          fullscreenIndex$: of(null),
          isMobile: signal(false),
          navigation$: of(null),
          title: signal('')
        }
      },
      {
        provide: CurrentUserHydrationService,
        useValue: {
          getFeatureHydration: jest.fn(() => Promise.resolve())
        }
      },
      {
        provide: EmployeesService,
        useValue: {
          getEmployeeByUserId: jest.fn(() => Promise.resolve({ success: false }))
        }
      },
      {
        provide: NGXLogger,
        useValue: {
          debug: jest.fn(),
          error: jest.fn(),
          warn: jest.fn()
        }
      },
      {
        provide: NgxPermissionsService,
        useValue: {
          loadPermissions: jest.fn()
        }
      },
      {
        provide: NgxRolesService,
        useValue: {
          getRole: jest.fn(() => null)
        }
      },
      {
        provide: Renderer2,
        useValue: {}
      },
      {
        provide: Router,
        useValue: router
      },
      {
        provide: ScopeService,
        useValue: {
          activeScope,
          initializeEntryScope: jest.fn(),
          scopeLevel: signal(RequestScopeLevel.ORGANIZATION)
        }
      },
      {
        provide: Store,
        useValue: store
      },
      {
        provide: TranslateService,
        useValue: {
          instant: jest.fn((key: string) => key),
          onLangChange: of(null),
          stream: jest.fn(() => of({}))
        }
      },
      {
        provide: UsersOrganizationsService,
        useValue: usersOrganizationsService
      },
      {
        provide: UsersService,
        useValue: {
          getMe: jest.fn(() => Promise.resolve(userSubject.value))
        }
      },
      {
        provide: XpertAPIService,
        useValue: xpertService
      }
    ]
  })

  const component = TestBed.runInInjectionContext(() => new FeaturesComponent())
  component.user = userSubject.value
  component.sidebarCollapsed.set(false)

  return {
    component,
    store,
    router,
    usersOrganizationsService,
    xpertService
  }
}

describe('FeaturesComponent entry onboarding', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    TestBed.resetTestingModule()
  })

  it('auto opens the entry guide and marks it shown for an eligible current membership', async () => {
    mountEntryOnboardingTargets()
    const { component, store, usersOrganizationsService, xpertService } = await setup()

    await component['maybeOpenEntryOnboardingGuide']()
    await Promise.resolve()

    expect(component.entryOnboardingOpen()).toBe(true)
    expect(component.entryOnboardingVisible()).toBe(true)
    expect(xpertService.getMyAll).toHaveBeenCalledWith({
      where: {
        createdById: 'user-1',
        type: XpertTypeEnum.Agent,
        latest: true
      },
      take: 1
    })
    expect(usersOrganizationsService.markEntryGuideAutoShown).toHaveBeenCalledWith(FEATURE_ENTRY_ONBOARDING_GUIDE_KEY)
    expect(store.user.organizations?.[0]?.preferences?.entryGuides?.clawxpert?.autoShownAt).toBe(
      '2026-07-02T00:00:00.000Z'
    )
  })

  it('does not auto open or mark the entry guide after it was already shown', async () => {
    mountEntryOnboardingTargets()
    const { component, usersOrganizationsService, xpertService } = await setup({
      autoShownAt: '2026-07-01T00:00:00.000Z'
    })

    await component['maybeOpenEntryOnboardingGuide']()

    expect(component.entryOnboardingOpen()).toBe(false)
    expect(xpertService.getMyAll).not.toHaveBeenCalled()
    expect(usersOrganizationsService.markEntryGuideAutoShown).not.toHaveBeenCalled()
  })

  it('uses completion instead of creation when the ClawXpert feature is unavailable', async () => {
    const { component, router } = await setup({
      hasClawXpertFeature: false,
      xpertCount: 0
    })

    component.entryOnboardingXpertCount.set(0)

    expect(component.entryOnboardingFinishText()).toBe('PAC.ACTIONS.Done')

    await component.onEntryOnboardingFinish()

    expect(router.navigate).not.toHaveBeenCalled()
  })

  it('opens the ClawXpert setup flow after entry onboarding instead of direct chat', async () => {
    const { component, router } = await setup({
      xpertCount: 0
    })

    component.entryOnboardingXpertCount.set(0)
    component.entryOnboardingOpen.set(true)

    expect(component.entryOnboardingFinishText()).toBe('PAC.Chat.ClawXpert.EntryGuideCreate')

    await component.onEntryOnboardingFinish()

    expect(router.navigate).toHaveBeenCalledWith(['/chat/clawxpert'], {
      queryParams: {
        onboarding: 'clawxpert'
      }
    })
    expect((component as { entryOnboardingCreating?: () => boolean }).entryOnboardingCreating?.()).toBe(false)
    expect(component.entryOnboardingOpen()).toBe(false)
  })
})
