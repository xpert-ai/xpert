import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { BehaviorSubject } from 'rxjs'
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
  class ScopeService {}
  class Store {}

  return {
    IOrganization: {},
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
  it('stops organization loading after organizations load while feature hydration continues in the background', async () => {
    const currentUser = {
      id: 'user-1',
      tenantId: 'tenant-1',
      role: {
        name: 'SUPER_ADMIN'
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
