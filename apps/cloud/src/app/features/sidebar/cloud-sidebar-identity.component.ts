import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal
} from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { injectI18nService } from '@cloud/app/@shared/i18n'
import {
  CurrentUserHydrationService,
  CURRENT_USER_BOOTSTRAP_RELATIONS,
  CURRENT_USER_ORGANIZATIONS_SELECT,
  type IUser,
  type IUserOrganization,
  UsersService
} from '@xpert-ai/cloud/state'
import { nonNullable, OverlayAnimation1 } from '@xpert-ai/core'
import { NgmHighlightDirective, NgmSearchComponent } from '@xpert-ai/ocap-angular/common'
import { debouncedSignal } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { uniqBy } from 'lodash-es'
import { firstValueFrom } from 'rxjs'
import { IOrganization, OrganizationsService, RequestScopeLevel, RolesEnum, ScopeService, Store } from '../../@core'
import { OrgAvatarComponent } from '../../@shared/organization'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'

const ORGANIZATION_PAGE_SIZE = 10

@Component({
  standalone: true,
  selector: 'pac-cloud-sidebar-identity',
  templateUrl: './cloud-sidebar-identity.component.html',
  styleUrl: './cloud-sidebar-identity.component.scss',
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    CdkMenuModule,
    ZardButtonComponent,
    NgmSearchComponent,
    OrgAvatarComponent,
    NgmHighlightDirective
  ],
  animations: [OverlayAnimation1],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CloudSidebarIdentityComponent {
  readonly collapsed = input(false)

  readonly collapsedChange = output<boolean>()
  readonly brandClick = output<void>()

  readonly #store = inject(Store)
  readonly #scopeService = inject(ScopeService)
  readonly #usersService = inject(UsersService)
  readonly #organizationsService = inject(OrganizationsService)
  readonly #currentUserHydrationService = inject(CurrentUserHydrationService)
  readonly #i18nService = injectI18nService()

  readonly searchTerm = model<string>('')
  readonly search = debouncedSignal(this.searchTerm, 300)
  readonly organizationsLoadedKey = signal<string | null>(null)
  readonly organizationsLoading = signal(false)
  readonly organizationsLoadingMore = signal(false)
  readonly tenantOrganizations = signal<{
    loadKey: string
    search: string
    items: IOrganization[]
    total: number
  } | null>(null)
  readonly activeScope = this.#scopeService.activeScope
  readonly canUseTenantScope = this.#scopeService.canUseTenantScope
  readonly currentUser = toSignal(this.#store.user$, {
    initialValue: this.#store.user
  })

  readonly #organizations = computed(() => {
    const user = this.currentUser()
    const loadKey = getCurrentUserOrganizationsLoadKey(user)
    const tenantOrganizations = this.tenantOrganizations()
    const membershipOrganizations = (user?.organizations ?? [])
      .filter((membership) => membership?.isActive !== false && membership?.organization?.isActive !== false)
      .map((membership) => membership.organization)
      .filter(nonNullable)
    const organizations =
      user?.role?.name === RolesEnum.SUPER_ADMIN && tenantOrganizations?.loadKey === loadKey
        ? tenantOrganizations.items
        : membershipOrganizations

    return uniqBy(
      organizations.filter((organization) => organization?.isActive !== false),
      (item) => item.id
    ).sort((a, b) => a.name.localeCompare(b.name))
  })

  readonly organizations = computed(() => {
    if (this.search()) {
      return this.#organizations().filter((org) => org.name.toLowerCase().includes(this.search().toLowerCase()))
    }

    return this.#organizations()
  })

  readonly currentOrganization = computed(() => {
    const scope = this.activeScope()
    if (scope.level !== RequestScopeLevel.ORGANIZATION) {
      return null
    }

    return (
      this.#organizations().find((organization) => organization.id === scope.organizationId) ||
      this.#store.selectedOrganization ||
      null
    )
  })

  readonly scopeEyebrow = computed(() =>
    this.activeScope().level === RequestScopeLevel.TENANT
      ? this.#i18nService.instant('PAC.Scope.TenantEyebrow', {
          Default: 'Tenant Console'
        })
      : this.#i18nService.instant('PAC.Scope.OrganizationEyebrow', {
          Default: 'Organization Scope'
        })
  )

  readonly scopeLabel = computed(() =>
    this.activeScope().level === RequestScopeLevel.TENANT
      ? this.#i18nService.instant('PAC.Scope.TenantLabel', {
          Default: 'Tenant defaults and governance'
        })
      : this.currentOrganization()?.name ||
        this.#i18nService.instant('PAC.Scope.SelectOrganization', {
          Default: 'Select an organization'
        })
  )

  readonly showTenantScopeItem = computed(() => this.currentUser()?.role?.name === RolesEnum.SUPER_ADMIN)
  readonly hasOrganizations = computed(() => this.#organizations().length > 0)
  readonly hasVisibleOrganizations = computed(() => this.organizations().length > 0)
  readonly hasMoreOrganizations = computed(() => {
    const user = this.currentUser()
    const page = this.tenantOrganizations()
    return (
      user?.role?.name === RolesEnum.SUPER_ADMIN &&
      page?.loadKey === getCurrentUserOrganizationsLoadKey(user) &&
      page.search === this.search().trim() &&
      page.items.length < page.total
    )
  })
  readonly canOpenMenu = computed(() => this.showTenantScopeItem() || this.hasOrganizations())
  private tenantOrganizationsRequestId = 0

  constructor() {
    effect(() => {
      this.#store.featureOrganizations = this.currentOrganization()?.featureOrganizations ?? []
    })

    effect(() => {
      const user = this.currentUser()
      if (!user || user.role?.name === RolesEnum.SUPER_ADMIN || !Array.isArray(user.organizations)) {
        return
      }

      this.#scopeService.ensureValidScope(this.#organizations())
    })

    effect(() => {
      const user = this.currentUser()
      const loadKey = getCurrentUserOrganizationsLoadKey(user)
      const search = this.search().trim()
      const page = this.tenantOrganizations()
      if (
        user?.role?.name !== RolesEnum.SUPER_ADMIN ||
        !loadKey ||
        this.organizationsLoadedKey() !== loadKey ||
        page?.search === search
      ) {
        return
      }

      void this.loadTenantOrganizations({ loadKey, search, append: false })
    })
  }

  toggleCollapsed(event: Event) {
    event.stopPropagation()
    this.collapsedChange.emit(!this.collapsed())
  }

  onBrandClick(event: Event) {
    event.stopPropagation()
    if (this.collapsed()) {
      this.collapsedChange.emit(false)
      return
    }

    this.brandClick.emit()
  }

  isTenantScope() {
    return this.activeScope().level === RequestScopeLevel.TENANT
  }

  isActiveOrganization(organization: IOrganization) {
    const scope = this.activeScope()
    return scope.level === RequestScopeLevel.ORGANIZATION && scope.organizationId === organization?.id
  }

  selectTenantScope() {
    if (this.isTenantScope()) {
      return
    }

    void this.#scopeService.switchToTenant()
  }

  selectOrganization(organization: IOrganization) {
    if (this.isActiveOrganization(organization)) {
      return
    }

    void this.#scopeService.switchToOrganization(organization)
  }

  resetSearch() {
    if (!this.searchTerm()) {
      return
    }

    this.searchTerm.set('')
  }

  async loadOrganizations() {
    const user = this.currentUser()
    const loadKey = getCurrentUserOrganizationsLoadKey(user)
    if (!loadKey) {
      return
    }

    if (user.role?.name === RolesEnum.SUPER_ADMIN) {
      const search = this.search().trim()
      const page = this.tenantOrganizations()
      if (page?.loadKey === loadKey && page.search === search) {
        return
      }

      await this.loadTenantOrganizations({ loadKey, search, append: false })
      return
    }

    if (this.organizationsLoadedKey() === loadKey || this.organizationsLoading()) {
      return
    }

    let shouldRefreshFeatureHydration = false
    this.organizationsLoading.set(true)
    try {
      const loadedUser = await this.#usersService.getMe(
        [...CURRENT_USER_BOOTSTRAP_RELATIONS],
        CURRENT_USER_ORGANIZATIONS_SELECT
      )
      const currentUser = this.#store.user
      if (!currentUser || getCurrentUserOrganizationsLoadKey(currentUser) !== loadKey) {
        return
      }

      this.#store.user = mergeLoadedCurrentUserOrganizations(currentUser, loadedUser)
      this.organizationsLoadedKey.set(loadKey)
      shouldRefreshFeatureHydration = this.#store.featureContextHydrated
    } catch (error) {
      console.warn('Load current-user organizations failed', error)
    } finally {
      this.organizationsLoading.set(false)
    }

    if (shouldRefreshFeatureHydration) {
      void this.#currentUserHydrationService.getFeatureHydration({ force: true }).catch((error) => {
        console.warn('Refresh current-user feature hydration after loading organizations failed', error)
      })
    }
  }

  async loadMoreOrganizations() {
    const user = this.currentUser()
    const loadKey = getCurrentUserOrganizationsLoadKey(user)
    if (
      user?.role?.name !== RolesEnum.SUPER_ADMIN ||
      !loadKey ||
      !this.hasMoreOrganizations() ||
      this.organizationsLoading() ||
      this.organizationsLoadingMore()
    ) {
      return
    }

    await this.loadTenantOrganizations({ loadKey, search: this.search().trim(), append: true })
  }

  private async loadTenantOrganizations({
    loadKey,
    search,
    append
  }: {
    loadKey: string
    search: string
    append: boolean
  }) {
    const currentPage = this.tenantOrganizations()
    const skip =
      append && currentPage?.loadKey === loadKey && currentPage.search === search ? currentPage.items.length : 0
    const requestId = ++this.tenantOrganizationsRequestId
    this.organizationsLoading.set(!append)
    this.organizationsLoadingMore.set(append)

    try {
      const { items, total } = await firstValueFrom(
        this.#organizationsService.getPage({
          take: ORGANIZATION_PAGE_SIZE,
          skip,
          search,
          relations: ['featureOrganizations', 'featureOrganizations.feature']
        })
      )
      const currentUser = this.#store.user
      if (
        requestId !== this.tenantOrganizationsRequestId ||
        !currentUser ||
        getCurrentUserOrganizationsLoadKey(currentUser) !== loadKey
      ) {
        return
      }

      const pageItems =
        append && currentPage?.loadKey === loadKey && currentPage.search === search
          ? uniqBy([...currentPage.items, ...items], (item) => item.id)
          : items
      this.tenantOrganizations.set({ loadKey, search, items: pageItems, total })
      this.organizationsLoadedKey.set(loadKey)
    } catch (error) {
      if (requestId === this.tenantOrganizationsRequestId) {
        console.warn('Load tenant organizations failed', error)
      }
    } finally {
      if (requestId === this.tenantOrganizationsRequestId) {
        this.organizationsLoading.set(false)
        this.organizationsLoadingMore.set(false)
      }
    }
  }
}

function getCurrentUserOrganizationsLoadKey(user: { id?: string | null; tenantId?: string | null } | null | undefined) {
  return user?.id ? `${user.tenantId ?? 'tenant'}:${user.id}` : null
}

function getMembershipOrganizationId(membership: IUserOrganization) {
  return membership.organizationId ?? membership.organization?.id ?? null
}

function mergeLoadedCurrentUserOrganizations(currentUser: IUser, loadedUser: IUser): IUser {
  const featureOrganizationsByOrganization = new Map(
    (currentUser.organizations ?? [])
      .map((membership) => {
        const organizationId = getMembershipOrganizationId(membership)
        const featureOrganizations = membership.organization?.featureOrganizations
        return organizationId && Array.isArray(featureOrganizations)
          ? ([organizationId, featureOrganizations] as const)
          : null
      })
      .filter(nonNullable)
  )
  const organizations = (loadedUser.organizations ?? []).map((membership) => {
    const organizationId = getMembershipOrganizationId(membership)
    const featureOrganizations = organizationId ? featureOrganizationsByOrganization.get(organizationId) : undefined

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

  return {
    ...currentUser,
    organizations
  }
}
