import { TestBed } from '@angular/core/testing'
import { NgxPermissionsService, NgxRolesService } from 'ngx-permissions'
import { BehaviorSubject } from 'rxjs'
import {
  AiFeatureEnum,
  AIPermissionsEnum,
  PermissionsEnum,
  RequestScopeLevel,
  RolesEnum,
  Store,
  UserType
} from '../../@core'
import { SettingsNavigationService } from './settings-navigation.service'

describe('shared settings navigation authorization', () => {
  const scope = new BehaviorSubject({ level: RequestScopeLevel.ORGANIZATION })
  const user = new BehaviorSubject({ type: UserType.USER })
  const permissions = new BehaviorSubject({})
  const rolePermissions = new BehaviorSubject({})
  const hydrated = new BehaviorSubject(true)
  const granted = new Set<string>()
  const roles = new Set<string>()
  const features = new Set<string>()
  let navigation: SettingsNavigationService
  const paths = () => navigation.groups().flatMap((group) => group.items.map((item) => item.path))
  beforeEach(() => {
    granted.clear()
    roles.clear()
    features.clear()
    scope.next({ level: RequestScopeLevel.ORGANIZATION })
    user.next({ type: UserType.USER })
    hydrated.next(true)
    TestBed.configureTestingModule({
      providers: [
        {
          provide: NgxPermissionsService,
          useValue: { permissions$: permissions, getPermission: (key: string) => granted.has(key) }
        },
        { provide: NgxRolesService, useValue: { getRole: (key: string) => roles.has(key) } },
        {
          provide: Store,
          useValue: {
            user$: user,
            user: user.value,
            selectActiveScope: () => scope,
            activeScope: scope.value,
            userRolePermissions$: rolePermissions,
            featureContextHydrated$: hydrated,
            featureContextHydrated: true,
            hasPermission: (key: string) => granted.has(key),
            hasFeatureEnabled: (key: string) => features.has(key)
          }
        }
      ]
    })
    navigation = TestBed.inject(SettingsNavigationService)
  })

  it('requires original permissions and feature flags for management entries', () => {
    expect(paths()).not.toContain('assistants')
    roles.add(RolesEnum.ADMIN)
    permissions.next({})
    expect(paths()).not.toContain('assistants')
    features.add(AiFeatureEnum.FEATURE_XPERT)
    permissions.next({})
    rolePermissions.next({})
    expect(paths()).toContain('assistants')
    roles.clear()
    permissions.next({})
    expect(paths()).not.toContain('assistants')
  })

  it('keeps tenant and organization administration separate', () => {
    granted.add(PermissionsEnum.CHANGE_ROLES_PERMISSIONS)
    permissions.next({})
    expect(paths()).toContain('features/organization')
    expect(paths()).not.toContain('features/tenant')
    scope.next({ level: RequestScopeLevel.TENANT })
    expect(paths()).toContain('features/tenant')
    expect(paths()).not.toContain('features/organization')
  })

  it('keeps personal gateway and API key capabilities distinct from account membership', () => {
    expect(paths()).toContain('account/api-keys')
    expect(paths()).not.toContain('account/api')
    granted.add(AIPermissionsEnum.MODEL_GATEWAY_USE)
    rolePermissions.next({})
    expect(paths()).not.toContain('account/api')
    features.add(AiFeatureEnum.FEATURE_MODEL_GATEWAY)
    permissions.next({})
    rolePermissions.next({})
    expect(paths()).toContain('account/api')
    user.next({ type: UserType.COMMUNICATION })
    expect(paths()).not.toContain('account/api')
    expect(paths()).not.toContain('account/api-keys')
    expect(paths()).not.toContain('account/models')
    expect(paths()).toContain('account/profile')
  })
})
