import { TestBed } from '@angular/core/testing'
import { IFeatureOrganization, IOrganization, IUser } from '@xpert-ai/contracts'
import { Store } from './store.service'
import { CURRENT_USER_FEATURE_RELATIONS, UsersService } from './users.service'
import {
  buildCurrentUserFeatureHydrationKey,
  CurrentUserHydrationService,
  mergeCurrentUserFeatureHydration
} from './current-user-hydration.service'

describe('CurrentUserHydrationService', () => {
  let service: CurrentUserHydrationService
  let usersService: { getMe: jest.Mock<Promise<IUser>, [string[]]> }
  let storeState: {
    userId: string | null
    user: IUser | null
    selectedOrganization: IOrganization | null
    featureContextHydrated: boolean
    featureContextHydrationLoading: boolean
    featureContextHydrationFailed: boolean
    featureTenant: IFeatureOrganization[]
    featureOrganizations: IFeatureOrganization[]
  }

  const tenantFeature = {
    id: 'tenant-feature',
    tenantId: 'tenant-1',
    organizationId: null,
    featureId: 'feature-tenant',
    feature: { id: 'feature-tenant', code: 'tenant-feature' },
    isEnabled: true
  } as IFeatureOrganization
  const orgFeature = {
    id: 'org-feature',
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    featureId: 'feature-org',
    feature: { id: 'feature-org', code: 'org-feature' },
    isEnabled: true
  } as IFeatureOrganization

  function createBootstrapUser(id = 'user-1'): IUser {
    return {
      id,
      tenantId: 'tenant-1',
      tenant: {
        id: 'tenant-1',
        name: 'Tenant'
      },
      role: {
        id: 'role-1',
        name: 'admin',
        rolePermissions: []
      },
      organizations: [
        {
          id: 'membership-1',
          userId: id,
          tenantId: 'tenant-1',
          organizationId: 'org-1',
          isDefault: true,
          isActive: true,
          organization: {
            id: 'org-1',
            name: 'Org',
            isDefault: true,
            profile_link: '',
            totalEmployees: 0,
            banner: '',
            short_description: '',
            client_focus: '',
            overview: '',
            currency: 'USD',
            isActive: true,
            defaultValueDateType: 'TODAY',
            tags: []
          }
        }
      ]
    }
  }

  function createHydrationUser(id = 'user-1'): IUser {
    return {
      id,
      tenantId: 'tenant-1',
      tenant: {
        id: 'tenant-1',
        featureOrganizations: [tenantFeature]
      },
      role: {
        id: 'role-1',
        name: 'admin',
        rolePermissions: []
      },
      organizations: [
        {
          id: 'membership-1',
          userId: id,
          tenantId: 'tenant-1',
          organizationId: 'org-1',
          isDefault: true,
          isActive: true,
          organization: {
            id: 'org-1',
            name: 'Org from hydration',
            isDefault: true,
            profile_link: '',
            totalEmployees: 0,
            banner: '',
            short_description: '',
            client_focus: '',
            overview: '',
            currency: 'USD',
            isActive: true,
            defaultValueDateType: 'TODAY',
            tags: [],
            featureOrganizations: [orgFeature]
          }
        }
      ]
    }
  }

  beforeEach(() => {
    window.sessionStorage.clear()
    usersService = {
      getMe: jest.fn()
    }
    storeState = {
      userId: 'user-1',
      user: createBootstrapUser(),
      selectedOrganization: createBootstrapUser().organizations[0].organization,
      featureContextHydrated: false,
      featureContextHydrationLoading: false,
      featureContextHydrationFailed: false,
      featureTenant: [],
      featureOrganizations: []
    }

    const store = {
      get userId() {
        return storeState.userId
      },
      set userId(value: string | null) {
        storeState.userId = value
      },
      get user() {
        return storeState.user
      },
      set user(value: IUser | null) {
        storeState.user = value
      },
      get selectedOrganization() {
        return storeState.selectedOrganization
      },
      set selectedOrganization(value: IOrganization | null) {
        storeState.selectedOrganization = value
      },
      get featureContextHydrated() {
        return storeState.featureContextHydrated
      },
      set featureContextHydrated(value: boolean) {
        storeState.featureContextHydrated = value
      },
      get featureContextHydrationLoading() {
        return storeState.featureContextHydrationLoading
      },
      set featureContextHydrationLoading(value: boolean) {
        storeState.featureContextHydrationLoading = value
      },
      get featureContextHydrationFailed() {
        return storeState.featureContextHydrationFailed
      },
      set featureContextHydrationFailed(value: boolean) {
        storeState.featureContextHydrationFailed = value
      },
      get featureTenant() {
        return storeState.featureTenant
      },
      set featureTenant(value: IFeatureOrganization[]) {
        storeState.featureTenant = value
      },
      get featureOrganizations() {
        return storeState.featureOrganizations
      },
      set featureOrganizations(value: IFeatureOrganization[]) {
        storeState.featureOrganizations = value
      }
    }

    TestBed.configureTestingModule({
      providers: [
        CurrentUserHydrationService,
        { provide: UsersService, useValue: usersService },
        { provide: Store, useValue: store }
      ]
    })

    service = TestBed.inject(CurrentUserHydrationService)
  })

  it('reuses one in-flight request for the same user and feature relations', async () => {
    let resolveRequest: (user: IUser) => void
    usersService.getMe.mockReturnValue(
      new Promise<IUser>((resolve) => {
        resolveRequest = resolve
      })
    )

    const first = service.getFeatureHydration()
    const second = service.getFeatureHydration()

    expect(usersService.getMe).toHaveBeenCalledTimes(1)
    expect(usersService.getMe).toHaveBeenCalledWith([...CURRENT_USER_FEATURE_RELATIONS])

    resolveRequest(createHydrationUser())
    await expect(Promise.all([first, second])).resolves.toHaveLength(2)
    expect(storeState.featureContextHydrated).toBe(true)
    expect(storeState.featureTenant).toEqual([tenantFeature])
    expect(storeState.featureOrganizations).toEqual([orgFeature])
  })

  it('force refresh bypasses pending normal hydration and keeps the force result applied', async () => {
    let resolveNormalRequest!: (user: IUser) => void
    let resolveForceRequest!: (user: IUser) => void
    const forcedFeature = {
      ...orgFeature,
      id: 'forced-org-feature',
      featureId: 'forced-feature',
      feature: { id: 'forced-feature', code: 'forced-feature' }
    } as IFeatureOrganization
    const forcedUser = createHydrationUser()
    forcedUser.organizations[0].organization.featureOrganizations = [forcedFeature]

    usersService.getMe
      .mockReturnValueOnce(
        new Promise<IUser>((resolve) => {
          resolveNormalRequest = resolve
        })
      )
      .mockReturnValueOnce(
        new Promise<IUser>((resolve) => {
          resolveForceRequest = resolve
        })
      )

    const normalHydration = service.getFeatureHydration()
    const forcedHydration = service.getFeatureHydration({ force: true })

    expect(usersService.getMe).toHaveBeenCalledTimes(2)

    resolveForceRequest(forcedUser)
    await forcedHydration
    resolveNormalRequest(createHydrationUser())
    await expect(Promise.all([normalHydration, forcedHydration])).resolves.toHaveLength(2)
    expect(storeState.featureContextHydrated).toBe(true)
    expect(storeState.featureOrganizations).toEqual([forcedFeature])
  })

  it('uses a stable cache key when relation order differs', () => {
    const reversed = [...CURRENT_USER_FEATURE_RELATIONS].reverse()

    expect(
      buildCurrentUserFeatureHydrationKey({
        userId: 'user-1',
        tenantId: 'tenant-1',
        relations: [...CURRENT_USER_FEATURE_RELATIONS]
      })
    ).toEqual(
      buildCurrentUserFeatureHydrationKey({
        userId: 'user-1',
        tenantId: 'tenant-1',
        relations: reversed
      })
    )
  })

  it('force bypasses the store cache and requests fresh hydration', async () => {
    storeState.featureContextHydrated = true
    usersService.getMe.mockResolvedValue(createHydrationUser())

    await service.getFeatureHydration({ force: true })

    expect(usersService.getMe).toHaveBeenCalledTimes(1)
  })

  it('skipSessionCache reuses current user after server hydration completed in this app session', async () => {
    usersService.getMe.mockResolvedValue(createHydrationUser())

    await service.getFeatureHydration()
    await service.getFeatureHydration({ skipSessionCache: true })

    expect(usersService.getMe).toHaveBeenCalledTimes(1)
  })

  it('skipSessionCache requests fresh hydration when the store was not server hydrated in this app session', async () => {
    storeState.featureContextHydrated = true
    usersService.getMe.mockResolvedValue(createHydrationUser())

    await service.getFeatureHydration({ skipSessionCache: true })

    expect(usersService.getMe).toHaveBeenCalledTimes(1)
  })

  it('does not reuse server hydration state across tenant changes for the same user', async () => {
    usersService.getMe.mockResolvedValue(createHydrationUser())

    await service.getFeatureHydration()
    storeState.user = {
      ...createBootstrapUser(),
      tenantId: 'tenant-2',
      tenant: {
        id: 'tenant-2',
        name: 'Tenant 2'
      }
    }
    storeState.featureContextHydrated = true
    await service.getFeatureHydration({ skipSessionCache: true })

    expect(usersService.getMe).toHaveBeenCalledTimes(2)
  })

  it('clears loading and failed state when session cache hydrates the store', async () => {
    const sessionKey = buildCurrentUserFeatureHydrationKey({
      userId: 'user-1',
      tenantId: 'tenant-1',
      relations: [...CURRENT_USER_FEATURE_RELATIONS]
    })
    window.sessionStorage.setItem(
      sessionKey,
      JSON.stringify({
        expiresAt: Date.now() + 60_000,
        user: createHydrationUser()
      })
    )
    storeState.featureContextHydrationLoading = true
    storeState.featureContextHydrationFailed = true
    usersService.getMe.mockResolvedValue(createHydrationUser())

    await service.getFeatureHydration()

    expect(storeState.featureContextHydrated).toBe(true)
    expect(storeState.featureContextHydrationLoading).toBe(false)
    expect(storeState.featureContextHydrationFailed).toBe(false)
  })

  it('replaces stale selected organization features when the selected organization disappears', async () => {
    const org2Feature = {
      ...orgFeature,
      id: 'org-2-feature',
      organizationId: 'org-2',
      featureId: 'feature-org-2',
      feature: { id: 'feature-org-2', code: 'org-2-feature' }
    } as IFeatureOrganization
    const hydrationUser = createHydrationUser()
    hydrationUser.organizations = [
      {
        id: 'membership-2',
        userId: 'user-1',
        tenantId: 'tenant-1',
        organizationId: 'org-2',
        isDefault: true,
        isActive: true,
        organization: {
          ...createBootstrapUser().organizations[0].organization,
          id: 'org-2',
          name: 'Org 2',
          featureOrganizations: [org2Feature]
        }
      }
    ]
    storeState.featureOrganizations = [orgFeature]
    usersService.getMe.mockResolvedValue(hydrationUser)

    await service.getFeatureHydration()

    expect(storeState.selectedOrganization?.id).toBe('org-2')
    expect(storeState.featureOrganizations).toEqual([org2Feature])
  })

  it('keys in-flight requests by user id so switching users does not reuse stale work', async () => {
    usersService.getMe.mockResolvedValue(createHydrationUser())

    await service.getFeatureHydration()
    storeState.userId = 'user-2'
    storeState.user = createBootstrapUser('user-2')
    storeState.featureContextHydrated = false
    await service.getFeatureHydration()

    expect(usersService.getMe).toHaveBeenCalledTimes(2)
  })

  it('merges feature hydration without dropping bootstrap organization fields', () => {
    const bootstrapUser = createBootstrapUser()
    bootstrapUser.organizations[0].organization.short_description = 'Keep me'

    const merged = mergeCurrentUserFeatureHydration(bootstrapUser, createHydrationUser())

    expect(merged.organizations[0].organization.short_description).toBe('Keep me')
    expect(merged.organizations[0].organization.name).toBe('Org')
    expect(merged.organizations[0].organization.featureOrganizations).toEqual([orgFeature])
    expect(merged.tenant.name).toBe('Tenant')
    expect(merged.tenant.featureOrganizations).toEqual([tenantFeature])
  })
})
