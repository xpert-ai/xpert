import { OverlayContainer } from '@angular/cdk/overlay'
import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { BehaviorSubject, of, Subject } from 'rxjs'
import { OrganizationSelectorComponent } from './organization-selector.component'

jest.mock('@cloud/app/@shared/i18n', () => ({
  injectI18nService: () => ({
    instant: (key: string) => key
  })
}))

jest.mock('@cloud/app/@core/state', () => {
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

jest.mock('@xpert-ai/headless-ui', () => ({
  ...jest.requireActual('@xpert-ai/headless-ui'),
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
    selector: 'xp-org-avatar',
    template: ''
  })
  class OrgAvatarComponent {
    @Input() organization?: unknown
  }

  return {
    OrgAvatarComponent
  }
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
          provide: jest.requireMock('@cloud/app/@core/state').UsersService,
          useValue: usersService
        },
        {
          provide: jest.requireMock('@cloud/app/@core/state').CurrentUserHydrationService,
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

describe('OrganizationSelectorComponent dropdown', () => {
  afterEach(() => TestBed.resetTestingModule())

  async function setup(role = 'SUPER_ADMIN') {
    const organization = { id: 'org-1', name: 'Example Organization', isActive: true }
    const currentUser = {
      id: 'user-1',
      tenantId: 'tenant-1',
      role: { name: role },
      organizations: [{ organization }]
    }
    const user$ = new BehaviorSubject(currentUser)
    const activeScope = signal<{ level: string; organizationId?: string }>({ level: 'tenant' })
    const scopeService = {
      activeScope,
      canUseTenantScope: signal(role === 'SUPER_ADMIN'),
      ensureValidScope: jest.fn(),
      switchToOrganization: jest.fn(() => activeScope.set({ level: 'organization', organizationId: organization.id })),
      switchToTenant: jest.fn(() => activeScope.set({ level: 'tenant' }))
    }
    const organizationsService = {
      getPage: jest.fn(() => of({ items: [organization], total: 1 }))
    }
    await TestBed.configureTestingModule({
      imports: [OrganizationSelectorComponent, TranslateModule.forRoot()],
      providers: [
        {
          provide: jest.requireMock('../../../@core').Store,
          useValue: {
            user: currentUser,
            user$: user$.asObservable(),
            selectedOrganization: null,
            featureContextHydrated: false
          }
        },
        { provide: jest.requireMock('../../../@core').ScopeService, useValue: scopeService },
        { provide: jest.requireMock('../../../@core').OrganizationsService, useValue: organizationsService },
        {
          provide: jest.requireMock('@cloud/app/@core/state').UsersService,
          useValue: { getMe: jest.fn(() => Promise.resolve(currentUser)) }
        },
        {
          provide: jest.requireMock('@cloud/app/@core/state').CurrentUserHydrationService,
          useValue: { getFeatureHydration: jest.fn() }
        }
      ]
    }).compileComponents()
    const fixture = TestBed.createComponent(OrganizationSelectorComponent)
    fixture.componentRef.setInput('variant', 'breadcrumb')
    fixture.detectChanges()
    const element = fixture.nativeElement as HTMLElement
    const trigger = element.querySelector('button')!
    const overlay = TestBed.inject(OverlayContainer).getContainerElement()
    const open = async () => {
      trigger.click()
      fixture.detectChanges()
      await fixture.whenStable()
      fixture.detectChanges()
    }
    return { fixture, trigger, overlay, open, scopeService, organizationsService, organization }
  }

  it('switches scope through the existing service by keyboard and click, and marks the active item', async () => {
    const { fixture, trigger, overlay, open, scopeService, organization } = await setup()
    expect(trigger.textContent).toContain('XP.Scope.TenantEyebrow')
    await open()
    expect(overlay.querySelector('[aria-current="true"]')?.textContent).toContain('XP.Scope.TenantEyebrow')
    const organizationItem = overlay.querySelectorAll<HTMLButtonElement>('[z-menu-item]')[1]
    organizationItem.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }))
    fixture.detectChanges()
    expect(scopeService.switchToOrganization).toHaveBeenCalledTimes(1)
    expect(scopeService.switchToOrganization).toHaveBeenCalledWith(organization)
    expect(overlay.querySelector('[role="menu"]')).toBeNull()
    expect(trigger.textContent).toContain(organization.name)

    await open()
    expect(overlay.querySelector('[aria-current="true"]')?.textContent).toContain(organization.name)
    overlay.querySelector<HTMLButtonElement>('[z-menu-item]')!.click()
    fixture.detectChanges()
    expect(scopeService.switchToTenant).toHaveBeenCalledTimes(1)
    expect(trigger.textContent).toContain('XP.Scope.TenantEyebrow')
  })

  it('keeps the tenant option hidden for organization-only users', async () => {
    const { fixture, overlay, open, scopeService, organization, organizationsService } = await setup('VIEWER')
    scopeService.activeScope.set({ level: 'organization', organizationId: organization.id })
    fixture.detectChanges()
    await open()
    expect(overlay.querySelectorAll('[z-menu-item]')).toHaveLength(1)
    expect(overlay.textContent).not.toContain('XP.Scope.TenantEyebrow')
    expect(organizationsService.getPage).not.toHaveBeenCalled()
    expect(scopeService.switchToTenant).not.toHaveBeenCalled()
  })

  it('shows pending organization loading and resets search when the menu closes', async () => {
    const { fixture, trigger, overlay, open, organizationsService } = await setup()
    const request = new Subject<{ items: Array<{ id: string; name: string; isActive: boolean }>; total: number }>()
    organizationsService.getPage.mockReturnValue(request.asObservable())
    await open()
    expect(overlay.querySelector('[role="status"]')?.textContent).toContain('XP.Organization.Loading')
    request.next({ items: [], total: 0 })
    request.complete()
    await fixture.whenStable()
    fixture.detectChanges()
    expect(overlay.querySelector('[role="status"]')?.textContent).toContain('XP.Organization.EmptySearch')

    fixture.componentInstance.searchTerm.set('example')
    trigger.click()
    fixture.detectChanges()
    expect(fixture.componentInstance.searchTerm()).toBe('')
    expect(overlay.querySelector('[role="menu"]')).toBeNull()
  })
})
