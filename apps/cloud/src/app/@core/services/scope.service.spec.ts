import { HttpErrorResponse } from '@angular/common/http'
import { TestBed } from '@angular/core/testing'
import { Router } from '@angular/router'
import { IOrganization, IUser, RequestScopeLevel, RolesEnum } from '@xpert-ai/contracts'
import { BehaviorSubject, Observable, of, Subject, throwError } from 'rxjs'
import { Store } from '../state/store.service'
import { OrganizationsService } from './organizations.service'
import { ScopeService } from './scope.service'

describe('ScopeService organization restoration', () => {
  const persistedOrganization: IOrganization = {
    id: 'org-2',
    name: 'Organization 2',
    isActive: true
  } as IOrganization

  function setup({
    role = RolesEnum.SUPER_ADMIN,
    organizationResult = of(persistedOrganization)
  }: {
    role?: RolesEnum
    organizationResult?: Observable<IOrganization>
  } = {}) {
    const user: IUser = {
      id: 'user-1',
      tenantId: 'tenant-1',
      role: {
        name: role
      }
    } as IUser
    const activeScope = {
      level: RequestScopeLevel.ORGANIZATION,
      organizationId: persistedOrganization.id
    } as const
    const userSubject = new BehaviorSubject(user)
    const activeScopeSubject = new BehaviorSubject(activeScope)
    const routerEvents = new Subject()
    const store = {
      activeScope,
      clearScopedSelections: jest.fn(),
      getLastCompatibleRoute: jest.fn(() => null),
      lastOrganizationId: persistedOrganization.id,
      selectedOrganization: null,
      selectActiveScope: jest.fn(() => activeScopeSubject.asObservable()),
      setLastCompatibleRoute: jest.fn(),
      setOrganizationScope: jest.fn(),
      setTenantScope: jest.fn(),
      user,
      user$: userSubject.asObservable()
    }
    const organizationsService = {
      getById: jest.fn(() => organizationResult)
    }
    const router = {
      events: routerEvents.asObservable(),
      navigateByUrl: jest.fn(() => Promise.resolve(true)),
      routerState: {
        snapshot: {
          root: {
            data: { scopeContext: 'dual-scope' },
            firstChild: null,
            pathFromRoot: []
          }
        }
      },
      url: '/chat'
    }

    TestBed.configureTestingModule({
      providers: [
        ScopeService,
        { provide: OrganizationsService, useValue: organizationsService },
        { provide: Router, useValue: router },
        { provide: Store, useValue: store }
      ]
    })

    return {
      organizationsService,
      service: TestBed.inject(ScopeService),
      store
    }
  }

  afterEach(() => {
    TestBed.resetTestingModule()
  })

  it('restores a super admin persisted organization outside membership results', async () => {
    const { organizationsService, service, store } = setup()

    await service.initializeEntryScope([])

    expect(organizationsService.getById).toHaveBeenCalledWith(persistedOrganization.id, undefined, [
      'featureOrganizations',
      'featureOrganizations.feature'
    ])
    expect(store.setOrganizationScope).toHaveBeenCalledWith(persistedOrganization)
    expect(store.setTenantScope).not.toHaveBeenCalled()
  })

  it('does not bypass membership validation for a regular user', async () => {
    const fallbackOrganization = {
      id: 'org-1',
      name: 'Organization 1',
      isActive: true,
      isDefault: true
    } as IOrganization
    const { organizationsService, service, store } = setup({ role: RolesEnum.ADMIN })

    await service.initializeEntryScope([fallbackOrganization], fallbackOrganization.id)

    expect(organizationsService.getById).not.toHaveBeenCalled()
    expect(store.setOrganizationScope).toHaveBeenCalledWith(fallbackOrganization)
  })

  it.each([403, 404])('falls back when the persisted organization is rejected with status %s', async (status) => {
    const fallbackOrganization = {
      id: 'org-1',
      name: 'Organization 1',
      isActive: true,
      isDefault: true
    } as IOrganization
    const { service, store } = setup({
      organizationResult: throwError(() => new HttpErrorResponse({ status }))
    })

    await service.initializeEntryScope([fallbackOrganization], fallbackOrganization.id)

    expect(store.setOrganizationScope).toHaveBeenCalledWith(fallbackOrganization)
  })

  it.each([0, 500])('preserves the persisted organization when loading fails with status %s', async (status) => {
    const fallbackOrganization = {
      id: 'org-1',
      name: 'Organization 1',
      isActive: true,
      isDefault: true
    } as IOrganization
    const { service, store } = setup({
      organizationResult: throwError(() => new HttpErrorResponse({ status }))
    })

    await service.initializeEntryScope([fallbackOrganization], fallbackOrganization.id)

    expect(store.setOrganizationScope).not.toHaveBeenCalled()
    expect(store.setTenantScope).not.toHaveBeenCalled()
  })

  it('initializes the entry scope only once for the same signed-in user', async () => {
    const { organizationsService, service } = setup()

    await service.initializeEntryScope([])
    await service.initializeEntryScope([])

    expect(organizationsService.getById).toHaveBeenCalledTimes(1)
  })
})
