import { TestBed } from '@angular/core/testing'
import { NgxPermissionsService, NgxRolesService } from 'ngx-permissions'
import { RequestScopeLevel } from '@xpert-ai/contracts'
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

  it('clears persisted organization scope on logout', () => {
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
  })
})
