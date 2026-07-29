import { TestBed } from '@angular/core/testing'
import { NgxPermissionsService, NgxRolesService } from 'ngx-permissions'
import { AiFeatureEnum, FeatureEnum, IFeatureOrganization, RequestScopeLevel } from '@xpert-ai/contracts'
import { AppQuery, AppStore, PersistQuery, PersistStore, Store } from './store.service'

function createFeatureOrganization(
  code: FeatureEnum | AiFeatureEnum,
  isEnabled: boolean,
  organizationId?: string,
  options?: { id?: string; featureId?: string; parentId?: string | null; name?: string }
): IFeatureOrganization {
  return {
    featureId: options?.featureId ?? code,
    organizationId,
    isEnabled,
    feature: {
      id: options?.id,
      code,
      description: '',
      icon: '',
      link: '',
      name: options?.name ?? code,
      status: '',
      parentId: options?.parentId
    }
  }
}

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

  it('checks only tenant features in tenant scope', () => {
    store.organizationId = null
    store.featureTenant = [createFeatureOrganization(FeatureEnum.FEATURE_SMTP, false)]
    store.featureOrganizations = [createFeatureOrganization(FeatureEnum.FEATURE_SMTP, true, 'org-1')]

    expect(store.hasFeatureEnabled(FeatureEnum.FEATURE_SMTP)).toBe(false)
  })

  it('uses organization features before tenant fallback in organization scope', () => {
    store.organizationId = 'org-1'
    store.featureTenant = [
      createFeatureOrganization(FeatureEnum.FEATURE_SMTP, true),
      createFeatureOrganization(FeatureEnum.FEATURE_EMAIL_TEMPLATE, true)
    ]
    store.featureOrganizations = [createFeatureOrganization(FeatureEnum.FEATURE_SMTP, false, 'org-1')]

    expect(store.hasFeatureEnabled(FeatureEnum.FEATURE_SMTP)).toBe(false)
    expect(store.hasFeatureEnabled(FeatureEnum.FEATURE_EMAIL_TEMPLATE)).toBe(true)
  })

  it('prefers child feature records when duplicate feature codes exist', () => {
    store.organizationId = 'org-1'
    store.featureTenant = [
      createFeatureOrganization(AiFeatureEnum.FEATURE_XPERT, true, undefined, {
        id: 'feature-legacy-xpert',
        featureId: 'feature-legacy-xpert',
        name: 'Xpert'
      })
    ]
    store.featureOrganizations = [
      createFeatureOrganization(AiFeatureEnum.FEATURE_XPERT, true, 'org-1', {
        id: 'feature-legacy-xpert',
        featureId: 'feature-legacy-xpert',
        name: 'Xpert'
      }),
      createFeatureOrganization(AiFeatureEnum.FEATURE_XPERT, false, 'org-1', {
        id: 'feature-xpert',
        featureId: 'feature-xpert',
        parentId: 'group-xpert',
        name: 'Digital Expert'
      })
    ]

    expect(store.hasFeatureEnabled(AiFeatureEnum.FEATURE_XPERT)).toBe(false)
  })

  it('emits feature enabled changes when switching scope', () => {
    store.organizationId = 'org-1'
    store.featureTenant = [createFeatureOrganization(FeatureEnum.FEATURE_SMTP, false)]
    store.featureOrganizations = [createFeatureOrganization(FeatureEnum.FEATURE_SMTP, true, 'org-1')]

    const values: boolean[] = []
    const subscription = store.selectHasFeatureEnabled(FeatureEnum.FEATURE_SMTP).subscribe((enabled) => {
      values.push(enabled)
    })

    store.organizationId = null

    expect(values).toEqual([true, false])

    subscription.unsubscribe()
  })
})
