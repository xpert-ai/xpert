import { Injectable } from '@angular/core'
import { IFeatureOrganization, IUser, IUserOrganization } from '@xpert-ai/contracts'
import { Store } from './store.service'
import { CURRENT_USER_FEATURE_RELATIONS, UsersService } from './users.service'

const FEATURE_HYDRATION_CACHE_PREFIX = 'current-user-feature-context:v1'
const FEATURE_HYDRATION_CACHE_TTL_MS = 60_000

type FeatureHydrationOptions = {
  force?: boolean
  skipSessionCache?: boolean
}

type FeatureHydrationCachePayload = {
  expiresAt: number
  user: IUser
}

function normalizeRelations(relations: readonly string[]) {
  return Array.from(new Set(relations)).sort()
}

function hashString(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return hash.toString(36)
}

export function buildCurrentUserFeatureHydrationKey({
  userId,
  tenantId,
  relations
}: {
  userId: string
  tenantId?: string | null
  relations: readonly string[]
}) {
  const normalizedRelations = normalizeRelations(relations)
  return `${FEATURE_HYDRATION_CACHE_PREFIX}:${userId}:${tenantId ?? 'tenant'}:${hashString(
    normalizedRelations.join('|')
  )}`
}

function getMembershipOrganizationId(membership: IUserOrganization) {
  return membership.organizationId ?? membership.organization?.id ?? null
}

export function mergeCurrentUserFeatureHydration(baseUser: IUser, hydrationUser: IUser): IUser {
  const hydrationFeaturesByOrganization = new Map<string, IFeatureOrganization[]>()

  for (const membership of hydrationUser.organizations ?? []) {
    const organizationId = getMembershipOrganizationId(membership)
    const featureOrganizations = membership.organization?.featureOrganizations

    if (organizationId && Array.isArray(featureOrganizations)) {
      hydrationFeaturesByOrganization.set(organizationId, featureOrganizations)
    }
  }

  const baseOrganizations = baseUser.organizations ?? hydrationUser.organizations
  const organizations = baseOrganizations?.map((membership) => {
    const organizationId = getMembershipOrganizationId(membership)
    const featureOrganizations = organizationId
      ? hydrationFeaturesByOrganization.get(organizationId)
      : undefined

    if (!membership.organization || !featureOrganizations) {
      return membership
    }

    return {
      ...membership,
      organization: {
        ...membership.organization,
        featureOrganizations
      }
    }
  })

  const tenant = baseUser.tenant || hydrationUser.tenant
    ? {
        ...(baseUser.tenant ?? hydrationUser.tenant),
        featureOrganizations:
          hydrationUser.tenant?.featureOrganizations ?? baseUser.tenant?.featureOrganizations
      }
    : baseUser.tenant

  return {
    ...baseUser,
    employee: hydrationUser.employee ?? baseUser.employee,
    role: hydrationUser.role ?? baseUser.role,
    tenant,
    organizations
  }
}

function getStorage() {
  try {
    return globalThis.sessionStorage ?? null
  } catch {
    return null
  }
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

function isFeatureHydrationCachePayload(value: unknown): value is FeatureHydrationCachePayload {
  if (!isObject(value)) {
    return false
  }

  const expiresAt = Reflect.get(value, 'expiresAt')
  const user = Reflect.get(value, 'user')

  return typeof expiresAt === 'number' && isObject(user)
}

@Injectable({ providedIn: 'root' })
export class CurrentUserHydrationService {
  private readonly inFlight = new Map<string, Promise<IUser | null>>()
  private readonly serverHydratedKeys = new Set<string>()
  private readonly latestRequestByKey = new Map<string, number>()
  private lastUserId: string | null = null
  private lastTenantId: string | null = null
  private hasLastContext = false
  private requestSequence = 0

  constructor(
    private readonly usersService: UsersService,
    private readonly store: Store
  ) {}

  getFeatureHydration(options: FeatureHydrationOptions = {}): Promise<IUser | null> {
    const userId = this.store.userId
    const currentUser = this.store.user

    if (!userId || !currentUser) {
      return Promise.resolve(null)
    }

    const relations = [...CURRENT_USER_FEATURE_RELATIONS]
    const tenantId = currentUser.tenantId ?? currentUser.tenant?.id ?? null
    this.clearInFlightWhenContextChanges(userId, tenantId)
    const sessionKey = buildCurrentUserFeatureHydrationKey({ userId, tenantId, relations })
    const inFlightKey = this.buildInFlightKey(userId, tenantId, relations)

    const existing = options.force ? null : this.inFlight.get(inFlightKey)
    if (existing) {
      return existing
    }

    if (
      !options.force &&
      this.store.featureContextHydrated &&
      (!options.skipSessionCache || this.serverHydratedKeys.has(inFlightKey))
    ) {
      return Promise.resolve(currentUser)
    }

    if (!options.force && !options.skipSessionCache) {
      const cachedUser = this.readSessionCache(sessionKey)
      if (cachedUser) {
        const mergedUser = this.applyHydration(cachedUser)
        void this.fetchAndApplyHydration({
          userId,
          inFlightKey,
          sessionKey,
          background: true,
          reuseInFlight: true
        })
        return Promise.resolve(mergedUser)
      }
    }

    return this.fetchAndApplyHydration({
      userId,
      inFlightKey,
      sessionKey,
      background: false,
      reuseInFlight: !options.force
    })
  }

  clearCache() {
    this.inFlight.clear()
    this.serverHydratedKeys.clear()
    this.latestRequestByKey.clear()
    this.lastUserId = null
    this.lastTenantId = null
    this.hasLastContext = false
  }

  private fetchAndApplyHydration({
    userId,
    inFlightKey,
    sessionKey,
    background,
    reuseInFlight
  }: {
    userId: string
    inFlightKey: string
    sessionKey: string
    background: boolean
    reuseInFlight: boolean
  }) {
    const existing = reuseInFlight ? this.inFlight.get(inFlightKey) : null
    if (existing) {
      return existing
    }
    const requestId = ++this.requestSequence
    const requestInFlightKey = reuseInFlight ? inFlightKey : `${inFlightKey}:request:${requestId}`
    this.latestRequestByKey.set(inFlightKey, requestId)

    if (!background) {
      this.store.featureContextHydrationLoading = true
      this.store.featureContextHydrationFailed = false
    }

    const promise = this.usersService
      .getMe([...CURRENT_USER_FEATURE_RELATIONS])
      .then((hydrationUser) => {
        if (this.store.userId !== userId || !this.store.user) {
          return this.store.user ?? null
        }
        if (this.latestRequestByKey.get(inFlightKey) !== requestId) {
          return this.store.user
        }

        const mergedUser = this.applyHydration(hydrationUser)
        this.serverHydratedKeys.add(inFlightKey)
        this.writeSessionCache(sessionKey, hydrationUser)
        this.store.featureContextHydrationLoading = false
        this.store.featureContextHydrationFailed = false
        return mergedUser
      })
      .catch((error) => {
        if (!background) {
          this.store.featureContextHydrationFailed = true
          this.store.featureContextHydrationLoading = false
          throw error
        }

        console.warn('Background current-user feature hydration failed', error)
        return this.store.user ?? null
      })
      .finally(() => {
        this.inFlight.delete(requestInFlightKey)
      })

    this.inFlight.set(requestInFlightKey, promise)
    return promise
  }

  private applyHydration(hydrationUser: IUser) {
    const currentUser = this.store.user
    if (!currentUser) {
      return null
    }

    const mergedUser = mergeCurrentUserFeatureHydration(currentUser, hydrationUser)
    this.store.user = mergedUser

    const tenantFeatures = mergedUser.tenant?.featureOrganizations ?? []
    this.store.featureTenant = tenantFeatures.filter((item) => !item.organizationId)
    this.store.featureContextHydrated = true
    this.store.featureContextHydrationLoading = false
    this.store.featureContextHydrationFailed = false
    this.syncSelectedOrganizationFeatures(mergedUser)

    return mergedUser
  }

  private syncSelectedOrganizationFeatures(user: IUser) {
    const memberships = user.organizations ?? []
    const selectedOrganizationId = this.store.selectedOrganization?.id
    const membership = selectedOrganizationId ? memberships.find(
      (item) => getMembershipOrganizationId(item) === selectedOrganizationId
    ) : null
    const nextMembership =
      membership ??
      memberships.find((item) => item.isDefault && item.organization) ??
      memberships.find((item) => item.organization) ??
      null
    const organization = nextMembership?.organization ?? null
    const featureOrganizations = Array.isArray(organization?.featureOrganizations)
      ? organization.featureOrganizations
      : []

    this.store.selectedOrganization = organization
    this.store.featureOrganizations = featureOrganizations
  }

  private buildInFlightKey(userId: string, tenantId: string | null, relations: readonly string[]) {
    return `${userId}:${tenantId ?? 'tenant'}:${normalizeRelations(relations).join('|')}`
  }

  private readSessionCache(key: string) {
    const storage = getStorage()
    if (!storage) {
      return null
    }

    const cached = storage.getItem(key)
    if (!cached) {
      return null
    }

    try {
      const parsed: unknown = JSON.parse(cached)
      if (!isFeatureHydrationCachePayload(parsed) || parsed.expiresAt <= Date.now()) {
        storage.removeItem(key)
        return null
      }

      return parsed.user
    } catch {
      storage.removeItem(key)
      return null
    }
  }

  private writeSessionCache(key: string, user: IUser) {
    const storage = getStorage()
    if (!storage) {
      return
    }

    const payload: FeatureHydrationCachePayload = {
      expiresAt: Date.now() + FEATURE_HYDRATION_CACHE_TTL_MS,
      user
    }

    try {
      storage.setItem(key, JSON.stringify(payload))
    } catch {
      storage.removeItem(key)
    }
  }

  private clearInFlightWhenContextChanges(userId: string, tenantId: string | null) {
    if (
      this.hasLastContext &&
      (this.lastUserId !== userId || this.lastTenantId !== tenantId)
    ) {
      this.inFlight.clear()
      this.serverHydratedKeys.clear()
      this.latestRequestByKey.clear()
    }

    this.lastUserId = userId
    this.lastTenantId = tenantId
    this.hasLastContext = true
  }
}
