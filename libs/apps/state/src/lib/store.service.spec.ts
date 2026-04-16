import { TestBed } from '@angular/core/testing'
import { NgxPermissionsService, NgxRolesService } from 'ngx-permissions'
import { RequestScopeLevel } from '@xpert-ai/contracts'
import { AppQuery, AppStore, PersistQuery, PersistStore, Store } from './store.service'

describe('Store', () => {
  let store: Store

  beforeEach(() => {
    localStorage.clear()

    TestBed.configureTestingModule({
      providers: [
        AppStore,
        AppQuery,
        PersistStore,
        PersistQuery,
        Store,
        {
          provide: NgxPermissionsService,
          useValue: {
            flushPermissions: jest.fn(),
            loadPermissions: jest.fn()
          }
        },
        {
          provide: NgxRolesService,
          useValue: {
            flushRoles: jest.fn(),
            addRole: jest.fn()
          }
        }
      ]
    })

    store = TestBed.inject(Store)
  })

  it('restores the previously selected organization scope from persisted state', () => {
    localStorage.setItem('_activeScopeLevel', RequestScopeLevel.ORGANIZATION)
    localStorage.setItem('_organizationId', 'org-2')
    localStorage.setItem('_lastOrganizationId', 'org-2')

    TestBed.resetTestingModule()
    TestBed.configureTestingModule({
      providers: [
        AppStore,
        AppQuery,
        PersistStore,
        PersistQuery,
        Store,
        {
          provide: NgxPermissionsService,
          useValue: {
            flushPermissions: jest.fn(),
            loadPermissions: jest.fn()
          }
        },
        {
          provide: NgxRolesService,
          useValue: {
            flushRoles: jest.fn(),
            addRole: jest.fn()
          }
        }
      ]
    })

    const restoredStore = TestBed.inject(Store)

    expect(restoredStore.activeScope).toEqual({
      level: RequestScopeLevel.ORGANIZATION,
      organizationId: 'org-2'
    })
    expect(restoredStore.organizationId).toBe('org-2')
  })

  it('restores tenant scope from persisted state', () => {
    localStorage.setItem('_activeScopeLevel', RequestScopeLevel.TENANT)
    localStorage.setItem('_lastOrganizationId', 'org-2')

    TestBed.resetTestingModule()
    TestBed.configureTestingModule({
      providers: [
        AppStore,
        AppQuery,
        PersistStore,
        PersistQuery,
        Store,
        {
          provide: NgxPermissionsService,
          useValue: {
            flushPermissions: jest.fn(),
            loadPermissions: jest.fn()
          }
        },
        {
          provide: NgxRolesService,
          useValue: {
            flushRoles: jest.fn(),
            addRole: jest.fn()
          }
        }
      ]
    })

    const restoredStore = TestBed.inject(Store)

    expect(restoredStore.activeScope).toEqual({
      level: RequestScopeLevel.TENANT
    })
    expect(restoredStore.organizationId).toBeNull()
    expect(restoredStore.lastOrganizationId).toBe('org-2')
  })

  it('clears runtime scope on logout but can restore remembered scope for the same user', () => {
    store.userId = 'user-1'
    store.organizationId = 'org-1'
    store.token = 'token-1'
    store.refreshToken = 'refresh-1'

    expect(store.activeScope).toEqual({
      level: RequestScopeLevel.ORGANIZATION,
      organizationId: 'org-1'
    })

    store.clear()

    expect(store.token).toBeNull()
    expect(store.refreshToken).toBeNull()
    expect(store.userId).toBeNull()
    expect(store.organizationId).toBeNull()
    expect(store.lastOrganizationId).toBeNull()
    expect(store.activeScope).toEqual({
      level: RequestScopeLevel.TENANT
    })

    store.userId = 'user-1'
    store.restoreRememberedScope('user-1')

    expect(store.activeScope).toEqual({
      level: RequestScopeLevel.ORGANIZATION,
      organizationId: 'org-1'
    })
    expect(store.lastOrganizationId).toBe('org-1')
  })
})
