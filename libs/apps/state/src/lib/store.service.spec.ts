import { TestBed } from '@angular/core/testing'
import { NgxPermissionsService, NgxRolesService } from 'ngx-permissions'
import { RequestScopeLevel } from '@metad/contracts'
import { AppQuery, AppStore, PersistQuery, PersistStore, Store } from './store.service'

describe('Store', () => {
  let store: Store

  beforeEach(() => {
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

  it('clears runtime scope on logout but can restore remembered scope for the same user', () => {
    store.userId = 'user-1'
    store.organizationId = 'org-1'

    expect(store.activeScope).toEqual({
      level: RequestScopeLevel.ORGANIZATION,
      organizationId: 'org-1'
    })

    store.clear()

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
