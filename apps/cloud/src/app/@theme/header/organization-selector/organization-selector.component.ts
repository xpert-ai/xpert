import { CdkMenuModule } from '@angular/cdk/menu'

import { Component, computed, effect, inject, input, model, signal } from '@angular/core'
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
import { NgmSearchComponent, NgmHighlightDirective } from '@xpert-ai/ocap-angular/common'
import { debouncedSignal } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { uniqBy } from 'lodash-es'
import { IOrganization, RequestScopeLevel, RolesEnum, ScopeService, Store } from '../../../@core'
import { OrgAvatarComponent } from '../../../@shared/organization'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
@Component({
  standalone: true,
  selector: 'pac-organization-selector',
  templateUrl: 'organization-selector.component.html',
  styleUrl: 'organization-selector.component.scss',
  host: {
    class: 'pac-organization-selector'
  },
  imports: [
    FormsModule,
    TranslateModule,
    CdkMenuModule,
    ...ZardTooltipImports,
    NgmSearchComponent,
    OrgAvatarComponent,
    NgmHighlightDirective
  ],
  animations: [OverlayAnimation1]
})
export class OrganizationSelectorComponent {
  private readonly store = inject(Store)
  private readonly scopeService = inject(ScopeService)
  private readonly usersService = inject(UsersService)
  private readonly currentUserHydrationService = inject(CurrentUserHydrationService)
  readonly i18nService = injectI18nService()

  readonly isCollapsed = input<boolean>(false)

  readonly searchTerm = model<string>('')
  readonly search = debouncedSignal(this.searchTerm, 300)
  readonly organizationsLoadedKey = signal<string | null>(null)
  readonly organizationsLoading = signal(false)
  readonly activeScope = this.scopeService.activeScope
  readonly canUseTenantScope = this.scopeService.canUseTenantScope
  readonly currentUser = toSignal(this.store.user$, {
    initialValue: this.store.user
  })

  readonly #organizations = computed(
    () =>
      uniqBy(
        (this.currentUser()?.organizations ?? [])
          .filter((membership) => membership?.isActive !== false && membership?.organization?.isActive !== false)
          .map((membership) => membership.organization)
          .filter(nonNullable),
        (item) => item.id
      ).sort((a, b) => a.name.localeCompare(b.name))
  )

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
      this.store.selectedOrganization ||
      null
    )
  })

  readonly scopeEyebrow = computed(() =>
    this.activeScope().level === RequestScopeLevel.TENANT
      ? this.i18nService.instant('PAC.Scope.TenantEyebrow', {
          Default: 'Tenant Console'
        })
      : this.i18nService.instant('PAC.Scope.OrganizationEyebrow', {
          Default: 'Organization Scope'
        })
  )

  readonly scopeLabel = computed(() =>
    this.activeScope().level === RequestScopeLevel.TENANT
      ? this.i18nService.instant('PAC.Scope.TenantLabel', {
          Default: 'Tenant defaults and governance'
        })
      : this.currentOrganization()?.name ||
        this.i18nService.instant('PAC.Scope.SelectOrganization', {
          Default: 'Select an organization'
        })
  )

  readonly showTenantScopeItem = computed(
    () => this.currentUser()?.role?.name === RolesEnum.SUPER_ADMIN
  )
  readonly hasOrganizations = computed(() => this.#organizations().length > 0)
  readonly hasVisibleOrganizations = computed(() => this.organizations().length > 0)
  readonly canOpenMenu = computed(() => this.showTenantScopeItem() || this.hasOrganizations())

  constructor() {
    effect(() => {
      this.store.featureOrganizations = this.currentOrganization()?.featureOrganizations ?? []
    })

    effect(() => {
      const user = this.currentUser()
      if (!user || !Array.isArray(user.organizations)) {
        return
      }

      this.scopeService.ensureValidScope(this.#organizations())
    })
  }

  isTenantScope() {
    return this.activeScope().level === RequestScopeLevel.TENANT
  }

  isActiveOrganization(organization: IOrganization) {
    const scope = this.activeScope()
    return (
      scope.level === RequestScopeLevel.ORGANIZATION &&
      scope.organizationId === organization?.id
    )
  }

  selectTenantScope() {
    if (this.isTenantScope()) {
      return
    }

    void this.scopeService.switchToTenant()
  }

  selectOrganization(organization: IOrganization) {
    if (this.isActiveOrganization(organization)) {
      return
    }

    void this.scopeService.switchToOrganization(organization)
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
    if (!loadKey || this.organizationsLoadedKey() === loadKey || this.organizationsLoading()) {
      return
    }

    this.organizationsLoading.set(true)
    try {
      const loadedUser = await this.usersService.getMe(
        [...CURRENT_USER_BOOTSTRAP_RELATIONS],
        CURRENT_USER_ORGANIZATIONS_SELECT
      )
      const currentUser = this.store.user
      if (!currentUser || getCurrentUserOrganizationsLoadKey(currentUser) !== loadKey) {
        return
      }

      this.store.user = mergeLoadedCurrentUserOrganizations(currentUser, loadedUser)
      this.organizationsLoadedKey.set(loadKey)

      if (this.store.featureContextHydrated) {
        try {
          await this.currentUserHydrationService.getFeatureHydration({ force: true })
        } catch (error) {
          console.warn('Refresh current-user feature hydration after loading organizations failed', error)
        }
      }
    } catch (error) {
      console.warn('Load current-user organizations failed', error)
    } finally {
      this.organizationsLoading.set(false)
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
