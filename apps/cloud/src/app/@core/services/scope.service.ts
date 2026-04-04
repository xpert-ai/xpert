import { computed, effect, inject, Injectable } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { ActivatedRouteSnapshot, NavigationEnd, Route, Router } from '@angular/router'
import { IOrganization, RequestScopeLevel, RolesEnum, Store } from '@metad/cloud/state'
import { distinctUntilChanged, filter, map, startWith } from 'rxjs'

export type RouteScopeContext = 'tenant-only' | 'organization-only' | 'dual-scope'

const DEFAULT_TENANT_ROUTE = '/settings/tenant'
const DEFAULT_ORGANIZATION_ROUTE = '/chat'

@Injectable({ providedIn: 'root' })
export class ScopeService {
  readonly #router = inject(Router)
  readonly #store = inject(Store)

  readonly activeScope = toSignal(this.#store.selectActiveScope(), {
    initialValue: this.#store.activeScope
  })
  readonly scopeLevel = computed(() => this.activeScope().level)
  readonly currentUrl = toSignal(
    this.#router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      startWith(null),
      map(() => this.#router.url),
      distinctUntilChanged()
    ),
    { initialValue: this.#router.url }
  )
  readonly currentRouteScope = toSignal(
    this.#router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      startWith(null),
      map(() => getRouteScopeFromSnapshot(this.#router.routerState.snapshot.root)),
      distinctUntilChanged()
    ),
    {
      initialValue: getRouteScopeFromSnapshot(this.#router.routerState.snapshot.root)
    }
  )
  readonly canUseTenantScope = computed(
    () => this.#store.user?.role?.name === RolesEnum.SUPER_ADMIN
  )
  readonly currentScopeName = computed(() => {
    const scope = this.activeScope()
    if (scope.level === RequestScopeLevel.TENANT) {
      return 'Tenant Console'
    }

    return this.#store.selectedOrganization?.name || 'Organization'
  })

  constructor() {
    effect(() => {
      const routeScope = this.currentRouteScope()
      const url = this.currentUrl()
      if (!url) {
        return
      }

      if (isRouteCompatible(routeScope, RequestScopeLevel.TENANT)) {
        this.#store.setLastCompatibleRoute(RequestScopeLevel.TENANT, url)
      }

      if (isRouteCompatible(routeScope, RequestScopeLevel.ORGANIZATION)) {
        this.#store.setLastCompatibleRoute(RequestScopeLevel.ORGANIZATION, url)
      }
    })

    effect(() => {
      const scope = this.activeScope()
      const routeScope = this.currentRouteScope()
      const currentUrl = this.currentUrl()

      if (isRouteCompatible(routeScope, scope.level)) {
        return
      }

      const fallback =
        this.resolveScopeTransitionTarget(scope.level)

      if (!fallback || fallback === currentUrl) {
        return
      }

      queueMicrotask(() => {
        void this.#router.navigateByUrl(fallback)
      })
    })
  }

  initializeEntryScope(organizations: IOrganization[], preferredOrganizationId?: string | null) {
    const validOrganizations = this.resolveValidOrganizations(organizations)
    const scope = this.activeScope()
    const persistedOrganization =
      scope.level === RequestScopeLevel.ORGANIZATION
        ? validOrganizations.find((organization) => organization.id === scope.organizationId) ?? null
        : null
    const defaultOrganization = this.resolveDefaultOrganization(
      validOrganizations,
      preferredOrganizationId
    )

    if (!validOrganizations.length) {
      if (
        scope.level !== RequestScopeLevel.TENANT ||
        this.#store.selectedOrganization
      ) {
        this.#store.setTenantScope()
      }
      return
    }

    if (scope.level === RequestScopeLevel.TENANT && this.canUseTenantScope()) {
      if (this.#store.selectedOrganization) {
        this.#store.setTenantScope()
      }
      return
    }

    const targetOrganization = persistedOrganization ?? defaultOrganization
    if (!targetOrganization) {
      return
    }

    if (
      scope.level !== RequestScopeLevel.ORGANIZATION ||
      scope.organizationId !== targetOrganization.id ||
      this.#store.selectedOrganization?.id !== targetOrganization.id
    ) {
      this.#store.setOrganizationScope(targetOrganization)
    }
  }

  ensureValidScope(organizations: IOrganization[]) {
    const defaultOrganization = this.resolveDefaultOrganization(organizations)

    if (!defaultOrganization) {
      this.#store.setTenantScope()
      return
    }

    if (this.activeScope().level === RequestScopeLevel.TENANT) {
      if (!this.canUseTenantScope()) {
        this.#store.setOrganizationScope(defaultOrganization)
      }
      return
    }

    const scope = this.activeScope()
    const organizationId =
      scope.level === RequestScopeLevel.ORGANIZATION
        ? scope.organizationId
        : this.#store.lastOrganizationId
    const selectedOrganization =
      organizations.find((organization) => organization.id === organizationId) ||
      defaultOrganization

    if (selectedOrganization?.id !== this.#store.selectedOrganization?.id) {
      this.#store.setOrganizationScope(selectedOrganization)
    }
  }

  isCurrentRouteCompatible(level: RequestScopeLevel) {
    return isRouteCompatible(this.currentRouteScope(), level)
  }

  async switchToTenant() {
    if (!this.canUseTenantScope()) {
      return false
    }

    this.#store.clearScopedSelections()
    this.#store.setTenantScope()

    const target = this.resolveScopeTransitionTarget(RequestScopeLevel.TENANT)
    if (target && target !== this.currentUrl()) {
      return this.#router.navigateByUrl(target)
    }

    return true
  }

  async switchToOrganization(organization: IOrganization) {
    if (!organization?.id) {
      return false
    }

    const wasOrganizationScope = this.scopeLevel() === RequestScopeLevel.ORGANIZATION
    this.#store.clearScopedSelections()
    this.#store.setOrganizationScope(organization)

    if (
      wasOrganizationScope &&
      this.isCurrentRouteCompatible(RequestScopeLevel.ORGANIZATION)
    ) {
      return true
    }

    const target = this.resolveScopeTransitionTarget(RequestScopeLevel.ORGANIZATION)
    if (target && target !== this.currentUrl()) {
      return this.#router.navigateByUrl(target)
    }

    return true
  }

  private resolveTenantFallback() {
    return (
      this.#store.getLastCompatibleRoute(RequestScopeLevel.TENANT) ||
      DEFAULT_TENANT_ROUTE
    )
  }

  private resolveOrganizationFallback() {
    return (
      this.#store.getLastCompatibleRoute(RequestScopeLevel.ORGANIZATION) ||
      DEFAULT_ORGANIZATION_ROUTE
    )
  }

  private resolveScopeTransitionTarget(level: RequestScopeLevel) {
    return (
      resolveCurrentSectionScopeUrl(this.#router.routerState.snapshot.root, level) ||
      (level === RequestScopeLevel.TENANT
        ? this.resolveTenantFallback()
        : this.resolveOrganizationFallback())
    )
  }

  private resolveDefaultOrganization(
    organizations: IOrganization[],
    preferredOrganizationId?: string | null
  ) {
    return (
      organizations.find((organization) => organization.id === preferredOrganizationId) ||
      organizations.find((organization) => organization.isDefault) ||
      organizations[0] ||
      null
    )
  }

  private resolveValidOrganizations(organizations: IOrganization[]) {
    return organizations.filter(
      (organization) => !!organization?.id && organization.isActive !== false
    )
  }
}

export function isRouteCompatible(
  routeScope: RouteScopeContext,
  level: RequestScopeLevel
) {
  if (routeScope === 'dual-scope') {
    return true
  }

  return (
    (routeScope === 'tenant-only' && level === RequestScopeLevel.TENANT) ||
    (routeScope === 'organization-only' &&
      level === RequestScopeLevel.ORGANIZATION)
  )
}

export function getRouteScopeFromSnapshot(
  snapshot: ActivatedRouteSnapshot | null
): RouteScopeContext {
  let current = snapshot
  let scope: RouteScopeContext = 'dual-scope'

  while (current) {
    if (current.data?.['scopeContext']) {
      scope = current.data['scopeContext'] as RouteScopeContext
    }
    current = current.firstChild ?? null
  }

  return scope
}

function resolveCurrentSectionScopeUrl(
  root: ActivatedRouteSnapshot | null,
  level: RequestScopeLevel
) {
  const snapshots: ActivatedRouteSnapshot[] = []
  let current = root

  while (current) {
    snapshots.push(current)
    current = current.firstChild ?? null
  }

  const targetPath = level === RequestScopeLevel.TENANT ? 'tenant' : 'organization'

  for (let index = snapshots.length - 1; index >= 0; index--) {
    const snapshot = snapshots[index]
    const routeScope = (snapshot.data?.['scopeContext'] as RouteScopeContext | undefined) ?? 'dual-scope'

    if (isRouteCompatible(routeScope, level)) {
      continue
    }

    const parent = snapshot.parent
    const children = parent?.routeConfig?.children ?? []
    const candidate =
      pickScopeSibling(children, targetPath, level) ??
      pickDefaultCompatibleChild(children, level)

    if (!candidate) {
      continue
    }

    return buildUrlFromSnapshot(parent, candidate.path)
  }

  return null
}

function pickScopeSibling(
  children: Route[],
  targetPath: string,
  level: RequestScopeLevel
) {
  return children.find(
    (route) =>
      !route.redirectTo &&
      route.path === targetPath &&
      isRouteCompatible((route.data?.['scopeContext'] as RouteScopeContext | undefined) ?? 'dual-scope', level)
  )
}

function pickDefaultCompatibleChild(children: Route[], level: RequestScopeLevel) {
  return children.find(
    (route) =>
      !route.redirectTo &&
      route.path === '' &&
      isRouteCompatible((route.data?.['scopeContext'] as RouteScopeContext | undefined) ?? 'dual-scope', level)
  )
}

function buildUrlFromSnapshot(snapshot: ActivatedRouteSnapshot | null, childPath?: string) {
  const segments = snapshot?.pathFromRoot.flatMap((item) => item.url.map((segment) => segment.path)) ?? []
  const parts = [...segments.filter(Boolean)]

  if (childPath) {
    parts.push(childPath)
  }

  return '/' + parts.join('/')
}
