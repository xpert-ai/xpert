import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { BehaviorSubject, of } from 'rxjs'
import { OrganizationSelectorComponent } from './organization-selector.component'

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

jest.mock('@xpert-ai/headless-ui', () => {
  const { Directive } = jest.requireActual('@angular/core')

  @Directive({
    standalone: true,
    // eslint-disable-next-line @angular-eslint/directive-selector
    selector: '[z-button]'
  })
  class ZardButtonComponent {}

  return {
    ZardButtonComponent,
    ZardTooltipImports: []
  }
})

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

jest.mock('../../../@core', () => {
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

jest.mock('../../../@shared/organization', () => {
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

describe('OrganizationSelectorComponent template', () => {
  it('shows organization loading feedback while the menu data request is pending', () => {
    const template = readFileSync(join(__dirname, 'organization-selector.component.html'), 'utf8')

    expect(template).toContain('@if (organizationsLoading())')
    expect(template).toContain('PAC.Organization.Loading')
    expect(template).toContain('ri-loader-4-line')
  })
})

describe('OrganizationSelectorComponent', () => {
  it('loads the first tenant organization page and searches from the first page for a super admin', async () => {
    const currentUser = {
      id: 'user-1',
      tenantId: 'tenant-1',
      role: {
        name: 'SUPER_ADMIN'
      },
      organizations: []
    }
    const organization = {
      id: 'org-1',
      name: 'Default Organization',
      isActive: true
    }
    const user$ = new BehaviorSubject(currentUser)
    const store = {
      featureContextHydrated: false,
      featureOrganizations: [],
      selectedOrganization: null,
      user: currentUser,
      user$: user$.asObservable()
    }
    const organizationsService = {
      getPage: jest
        .fn()
        .mockReturnValueOnce(of({ items: [organization], total: 11 }))
        .mockReturnValueOnce(of({ items: [{ ...organization, name: 'Searched Organization' }], total: 1 }))
    }
    const usersService = {
      getMe: jest.fn()
    }

    await TestBed.configureTestingModule({
      imports: [OrganizationSelectorComponent],
      providers: [
        {
          provide: jest.requireMock('../../../@core').Store,
          useValue: store
        },
        {
          provide: jest.requireMock('../../../@core').ScopeService,
          useValue: {
            activeScope: signal({ level: 'tenant' }),
            canUseTenantScope: signal(true),
            ensureValidScope: jest.fn(),
            switchToOrganization: jest.fn(),
            switchToTenant: jest.fn()
          }
        },
        {
          provide: jest.requireMock('../../../@core').OrganizationsService,
          useValue: organizationsService
        },
        {
          provide: jest.requireMock('@xpert-ai/cloud/state').UsersService,
          useValue: usersService
        },
        {
          provide: jest.requireMock('@xpert-ai/cloud/state').CurrentUserHydrationService,
          useValue: {
            getFeatureHydration: jest.fn()
          }
        }
      ]
    })
      .overrideComponent(OrganizationSelectorComponent, {
        set: {
          template: ''
        }
      })
      .compileComponents()

    const fixture = TestBed.createComponent(OrganizationSelectorComponent)
    fixture.detectChanges()

    await fixture.componentInstance.loadOrganizations()

    expect(organizationsService.getPage).toHaveBeenNthCalledWith(1, {
      take: 10,
      skip: 0,
      search: '',
      relations: ['featureOrganizations', 'featureOrganizations.feature']
    })
    expect(usersService.getMe).not.toHaveBeenCalled()
    expect(fixture.componentInstance.organizations()).toEqual([organization])
    expect(fixture.componentInstance.hasMoreOrganizations()).toBe(true)

    fixture.componentInstance.searchTerm.set('searched')
    fixture.detectChanges()
    await fixture.whenStable()

    expect(organizationsService.getPage).toHaveBeenNthCalledWith(2, {
      take: 10,
      skip: 0,
      search: 'searched',
      relations: ['featureOrganizations', 'featureOrganizations.feature']
    })
    expect(fixture.componentInstance.organizations()).toEqual([{ ...organization, name: 'Searched Organization' }])

    TestBed.resetTestingModule()
  })
})
