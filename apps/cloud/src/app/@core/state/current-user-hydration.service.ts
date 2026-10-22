import { DestroyRef, inject, Injectable } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { fromEvent } from 'rxjs'
import { IFeatureOrganization, IUser, IUserOrganization, RequestScopeLevel } from '@xpert-ai/contracts'
import { Store } from './store.service'
import { CURRENT_USER_FEATURE_RELATIONS, UsersService } from './users.service'
import {
  clearCurrentUserSessionCache,
  currentUserSessionEpoch,
  currentUserDisplayCacheInvalidated$
} from './current-user-session-cache'

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

export function mergeCurrentUserFeatureHydration(baseUser: IUser, hydrationUser: IUser, authoritative = true): IUser {
  const baseMembershipsByOrganization = new Map<string, IUserOrganization>()

  for (const membership of baseUser.organizations ?? []) {
    const organizationId = getMembershipOrganizationId(membership)

    if (organizationId) {
      baseMembershipsByOrganization.set(organizationId, membership)
    }
  }

  const authoritativeOrganizations = hydrationUser.organizations ?? baseUser.organizations
  const organizations = authoritativeOrganizations?.map((membership) => {
    const organizationId = getMembershipOrganizationId(membership)
    const baseMembership = organizationId ? baseMembershipsByOrganization.get(organizationId) : undefined
    const hydrationOrganization = membership.organization
    const featureOrganizations = hydrationOrganization?.featureOrganizations

    if (!baseMembership || !hydrationOrganization) {
      return {
        ...baseMembership,
        ...membership
      }
    }

    return {
      ...(authoritative ? baseMembership : membership),
      ...(authoritative ? membership : baseMembership),
      organization: {
        ...(authoritative ? baseMembership.organization : hydrationOrganization),
        ...(authoritative ? hydrationOrganization : baseMembership.organization),
        ...(Array.isArray(featureOrganizations) ? { featureOrganizations } : {})
      }
    }
  })

  const tenant =
    baseUser.tenant || hydrationUser.tenant
      ? {
          ...baseUser.tenant,
          ...(authoritative ? hydrationUser.tenant : {}),
          featureOrganizations: hydrationUser.tenant?.featureOrganizations ?? baseUser.tenant?.featureOrganizations
        }
      : baseUser.tenant

  return {
    ...baseUser,
    ...(authoritative ? hydrationUser : {}),
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
  private readonly expiresAtByKey = new Map<string, number>()
  private readonly latestRequestByKey = new Map<string, number>()
  private lastUserId: string | null = null
  private lastTenantId: string | null = null
  private hasLastContext = false
  private requestSequence = 0
  private sessionEpoch = currentUserSessionEpoch()
  private readonly destroyRef = inject(DestroyRef)

  constructor(
    private readonly usersService: UsersService,
    private readonly store: Store
  ) {
    currentUserDisplayCacheInvalidated$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      void this.getFeatureHydration({ force: true }).catch(() => undefined)
    })
    if (typeof window !== 'undefined') {
      fromEvent(window, 'focus')
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => {
          void this.getFeatureHydration({ skipSessionCache: true }).catch(() => undefined)
        })
    }
  }

  getFeatureHydration(options: FeatureHydrationOptions = {}): Promise<IUser | null> {
    if (this.sessionEpoch !== currentUserSessionEpoch()) this.resetMemoryCache()
    const userId = this.store.userId
    const currentUser = this.store.user

    if (!userId || !currentUser) {
      if (this.hasLastContext) this.clearCache()
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
      (this.expiresAtByKey.get(inFlightKey) ?? 0) > Date.now() &&
      (!options.skipSessionCache || this.serverHydratedKeys.has(inFlightKey))
    ) {
      return Promise.resolve(currentUser)
    }

    if (!options.force && !options.skipSessionCache) {
      const cachedUser = this.readSessionCache(sessionKey)
      if (cachedUser) {
        const mergedUser = this.applyHydration(cachedUser, false)
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
    clearCurrentUserSessionCache()
    this.resetMemoryCache()
  }

  private resetMemoryCache() {
    this.inFlight.clear()
    this.serverHydratedKeys.clear()
    this.expiresAtByKey.clear()
    this.latestRequestByKey.clear()
    this.lastUserId = null
    this.lastTenantId = null
    this.hasLastContext = false
    this.sessionEpoch = currentUserSessionEpoch()
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
    const requestEpoch = currentUserSessionEpoch()
    const tenantId = this.store.user?.tenantId ?? this.store.user?.tenant?.id ?? null
    const isCurrentRequest = () =>
      this.store.userId === userId &&
      (this.store.user?.tenantId ?? this.store.user?.tenant?.id ?? null) === tenantId &&
      currentUserSessionEpoch() === requestEpoch &&
      this.requestSequence === requestId &&
      this.latestRequestByKey.get(inFlightKey) === requestId
    const requestInFlightKey = inFlightKey
    this.latestRequestByKey.set(inFlightKey, requestId)

    if (!background) {
      this.store.featureContextHydrationLoading = true
      this.store.featureContextHydrationFailed = false
    }

    const promise = this.usersService
      .getMe([...CURRENT_USER_FEATURE_RELATIONS])
      .then((hydrationUser) => {
        if (!isCurrentRequest() || !this.store.user) {
          return this.store.user ?? null
        }
        const mergedUser = this.applyHydration(hydrationUser)
        this.serverHydratedKeys.add(inFlightKey)
        this.expiresAtByKey.set(inFlightKey, Date.now() + FEATURE_HYDRATION_CACHE_TTL_MS)
        this.writeSessionCache(sessionKey, hydrationUser)
        this.store.featureContextHydrationLoading = false
        this.store.featureContextHydrationFailed = false
        return mergedUser
      })
      .catch((error) => {
        if (!isCurrentRequest()) return this.store.user ?? null
        if (!background) {
          this.store.featureContextHydrationFailed = true
          this.store.featureContextHydrationLoading = false
          throw error
        }

        console.warn('Background current-user feature hydration failed', error)
        return this.store.user ?? null
      })
      .finally(() => {
        if (this.inFlight.get(requestInFlightKey) === promise) this.inFlight.delete(requestInFlightKey)
      })

    this.inFlight.set(requestInFlightKey, promise)
    return promise
  }

  private applyHydration(hydrationUser: IUser, authoritative = true) {
    const currentUser = this.store.user
    if (!currentUser) {
      return null
    }

    const mergedUser = mergeCurrentUserFeatureHydration(currentUser, hydrationUser, authoritative)
    this.store.user = mergedUser
    this.store.userRolePermissions = mergedUser.role?.rolePermissions ?? []

    const tenantFeatures = mergedUser.tenant?.featureOrganizations ?? []
    this.store.featureTenant = tenantFeatures.filter((item) => !item.organizationId)
    this.store.featureContextHydrated = true
    this.store.featureContextHydrationLoading = false
    this.store.featureContextHydrationFailed = false
    this.syncSelectedOrganizationFeatures(mergedUser)

    return mergedUser
  }

  private syncSelectedOrganizationFeatures(user: IUser) {
    const activeScope = this.store.activeScope
    if (activeScope.level === RequestScopeLevel.TENANT) {
      this.store.selectedOrganization = null
      this.store.featureOrganizations = []
      return
    }

    const activeOrganizationId = activeScope.organizationId
    const membership = (user.organizations ?? []).find(
      (item) => getMembershipOrganizationId(item) === activeOrganizationId
    )
    if (membership?.organization) {
      this.store.selectedOrganization = membership.organization
      this.store.featureOrganizations = Array.isArray(membership.organization.featureOrganizations)
        ? membership.organization.featureOrganizations
        : []
      return
    }

    this.store.selectedOrganization = null
    this.store.featureOrganizations = []
  }

  private buildInFlightKey(userId: string, tenantId: string | null, relations: readonly string[]) {
    const scope = this.store.activeScope
    const organizationId = scope.level === RequestScopeLevel.ORGANIZATION ? scope.organizationId : ''
    return `${userId}:${tenantId ?? 'tenant'}:${scope.level}:${organizationId}:${normalizeRelations(relations).join('|')}`
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
    if (this.hasLastContext && (this.lastUserId !== userId || this.lastTenantId !== tenantId)) {
      this.clearCache()
    }

    this.lastUserId = userId
    this.lastTenantId = tenantId
    this.hasLastContext = true
  }
}
