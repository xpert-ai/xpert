import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { BehaviorSubject, of } from 'rxjs'
import { CloudSidebarIdentityComponent } from './cloud-sidebar-identity.component'

jest.mock('@cloud/app/@shared/i18n', () => ({
  injectI18nService: () => ({
    instant: (key: string) => key
  })
}))

jest.mock('@xpert-ai/cloud/state', () => {
  class CurrentUserHydrationService {}
  class UsersService {}

  return {
    CurrentUserHydrationService,
    CURRENT_USER_BOOTSTRAP_RELATIONS: ['organizations', 'organizations.organization'],
    CURRENT_USER_ORGANIZATIONS_SELECT: {
      id: true,
      tenantId: true,
      organizations: true
    },
    UsersService
  }
})

jest.mock('@xpert-ai/core', () => ({
  nonNullable: <T>(value: T | null | undefined): value is T => value != null,
  OverlayAnimation1: []
}))

jest.mock('@xpert-ai/ocap-angular/common', () => {
  const { Component, Directive, Input } = jest.requireActual('@angular/core')

  @Component({
    standalone: true,
    selector: 'ngm-search',
    template: ''
  })
  class NgmSearchComponent {}

  @Directive({
    standalone: true,
    selector: '[ngmHighlight]'
  })
  class NgmHighlightDirective {
    @Input() ngmHighlight?: string
    @Input() content?: string
  }

  return {
    NgmHighlightDirective,
    NgmSearchComponent
  }
})

jest.mock('@xpert-ai/ocap-angular/core', () => ({
  debouncedSignal: (value: unknown) => value
}))

jest.mock('../../@core', () => {
  class OrganizationsService {}
  class ScopeService {}
  class Store {}

  return {
    IOrganization: {},
    OrganizationsService,
    RequestScopeLevel: {
      ORGANIZATION: 'organization',
      TENANT: 'tenant'
    },
    RolesEnum: {
      SUPER_ADMIN: 'SUPER_ADMIN'
    },
    ScopeService,
    Store
  }
})

jest.mock('../../@shared/organization', () => {
  const { Component, Input } = jest.requireActual('@angular/core')

  @Component({
    standalone: true,
    selector: 'pac-org-avatar',
    template: ''
  })
  class OrgAvatarComponent {
    @Input() organization?: unknown
  }

  return {
    OrgAvatarComponent
  }
})

describe('CloudSidebarIdentityComponent', () => {
  it('keeps existing memberships until the first tenant organization page loads and appends more organizations', async () => {
    const membershipOrganization = {
      id: 'org-1',
      name: 'Existing Organization',
      isActive: true
    }
    const currentUser = {
      id: 'user-1',
      tenantId: 'tenant-1',
      role: {
        name: 'SUPER_ADMIN'
      },
      organizations: [
        {
          id: 'membership-1',
          organizationId: membershipOrganization.id,
          isActive: true,
          organization: membershipOrganization
        }
      ]
    }
    const tenantOrganizations = Array.from({ length: 11 }, (_, index) => ({
      id: `org-${index + 2}`,
      name: `Tenant Organization ${String(index + 1).padStart(2, '0')}`,
      isActive: true
    }))
    const firstPage = [membershipOrganization, ...tenantOrganizations.slice(0, 9)]
    const secondPage = tenantOrganizations.slice(9)
    const user$ = new BehaviorSubject(currentUser)
    const store = {
      featureContextHydrated: false,
      featureOrganizations: [],
      selectedOrganization: null,
      user: currentUser,
      user$: user$.asObservable()
    }
    const scopeService = {
      activeScope: signal({ level: 'tenant' }),
      canUseTenantScope: signal(true),
      ensureValidScope: jest.fn(),
      switchToOrganization: jest.fn(),
      switchToTenant: jest.fn()
    }
    const usersService = {
      getMe: jest.fn()
    }
    const organizationsService = {
      getPage: jest
        .fn()
        .mockReturnValueOnce(of({ items: firstPage, total: 12 }))
        .mockReturnValueOnce(of({ items: secondPage, total: 12 }))
    }
    const currentUserHydrationService = {
      getFeatureHydration: jest.fn()
    }

    await TestBed.configureTestingModule({
      imports: [CloudSidebarIdentityComponent],
      providers: [
        {
          provide: jest.requireMock('../../@core').Store,
          useValue: store
        },
        {
          provide: jest.requireMock('../../@core').ScopeService,
          useValue: scopeService
        },
        {
          provide: jest.requireMock('../../@core').OrganizationsService,
          useValue: organizationsService
        },
        {
          provide: jest.requireMock('@xpert-ai/cloud/state').UsersService,
          useValue: usersService
        },
        {
          provide: jest.requireMock('@xpert-ai/cloud/state').CurrentUserHydrationService,
          useValue: currentUserHydrationService
        }
      ]
    })
      .overrideComponent(CloudSidebarIdentityComponent, {
        set: {
          template: ''
        }
      })
      .compileComponents()

    const fixture = TestBed.createComponent(CloudSidebarIdentityComponent)

    expect(fixture.componentInstance.organizations()).toEqual([membershipOrganization])

    await fixture.componentInstance.loadOrganizations()

    expect(organizationsService.getPage).toHaveBeenNthCalledWith(1, {
      take: 10,
      skip: 0,
      search: '',
      relations: ['featureOrganizations', 'featureOrganizations.feature']
    })
    expect(usersService.getMe).not.toHaveBeenCalled()
    expect(fixture.componentInstance.organizations()).toHaveLength(10)
    expect(fixture.componentInstance.hasMoreOrganizations()).toBe(true)

    await fixture.componentInstance.loadMoreOrganizations()

    expect(organizationsService.getPage).toHaveBeenNthCalledWith(2, {
      take: 10,
      skip: 10,
      search: '',
      relations: ['featureOrganizations', 'featureOrganizations.feature']
    })
    expect(fixture.componentInstance.organizations()).toHaveLength(12)
    expect(fixture.componentInstance.hasMoreOrganizations()).toBe(false)

    TestBed.resetTestingModule()
  })

  it('stops organization loading after organizations load while feature hydration continues in the background', async () => {
    const currentUser = {
      id: 'user-1',
      tenantId: 'tenant-1',
      role: {
        name: 'ADMIN'
      },
      organizations: [
        {
          id: 'membership-1',
          organizationId: 'org-1',
          isActive: true,
          organization: {
            id: 'org-1',
            name: 'Org 1',
            isActive: true
          }
        }
      ]
    }
    const loadedUser = {
      ...currentUser,
      organizations: [
        ...currentUser.organizations,
        {
          id: 'membership-2',
          organizationId: 'org-2',
          isActive: true,
          organization: {
            id: 'org-2',
            name: 'Org 2',
            isActive: true
          }
        }
      ]
    }
    const user$ = new BehaviorSubject(currentUser)
    const store = {
      featureContextHydrated: true,
      featureOrganizations: [],
      selectedOrganization: currentUser.organizations[0].organization,
      user: currentUser,
      user$: user$.asObservable()
    }
    const scopeService = {
      activeScope: signal({
        level: 'organization',
        organizationId: 'org-1'
      }),
      canUseTenantScope: signal(true),
      ensureValidScope: jest.fn(),
      switchToOrganization: jest.fn(),
      switchToTenant: jest.fn()
    }
    const usersService = {
      getMe: jest.fn().mockResolvedValue(loadedUser)
    }
    let resolveHydration: (value: unknown) => void
    const hydrationPromise = new Promise((resolve) => {
      resolveHydration = resolve
    })
    const currentUserHydrationService = {
      getFeatureHydration: jest.fn(() => hydrationPromise)
    }

    await TestBed.configureTestingModule({
      imports: [CloudSidebarIdentityComponent],
      providers: [
        {
          provide: jest.requireMock('../../@core').Store,
          useValue: store
        },
        {
          provide: jest.requireMock('../../@core').ScopeService,
          useValue: scopeService
        },
        {
          provide: jest.requireMock('../../@core').OrganizationsService,
          useValue: {
            getPage: jest.fn()
          }
        },
        {
          provide: jest.requireMock('@xpert-ai/cloud/state').UsersService,
          useValue: usersService
        },
        {
          provide: jest.requireMock('@xpert-ai/cloud/state').CurrentUserHydrationService,
          useValue: currentUserHydrationService
        }
      ]
    })
      .overrideComponent(CloudSidebarIdentityComponent, {
        set: {
          template: ''
        }
      })
      .compileComponents()

    const fixture = TestBed.createComponent(CloudSidebarIdentityComponent)
    const loadPromise = fixture.componentInstance.loadOrganizations()
    await Promise.resolve()
    await Promise.resolve()

    try {
      expect(usersService.getMe).toHaveBeenCalled()
      expect(currentUserHydrationService.getFeatureHydration).toHaveBeenCalledWith({ force: true })
      expect(fixture.componentInstance.organizationsLoading()).toBe(false)
    } finally {
      resolveHydration(null)
      await loadPromise
      TestBed.resetTestingModule()
    }
  })
})
