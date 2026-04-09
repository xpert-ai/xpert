import { CdkMenuModule } from '@angular/cdk/menu'

import { Component, computed, effect, inject, input, model } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { injectI18nService } from '@cloud/app/@shared/i18n'
import { nonNullable, OverlayAnimation1 } from '@metad/core'
import { NgmSearchComponent, NgmHighlightDirective } from '@metad/ocap-angular/common'
import { debouncedSignal } from '@metad/ocap-angular/core'
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
  readonly i18nService = injectI18nService()

  readonly isCollapsed = input<boolean>(false)

  readonly searchTerm = model<string>('')
  readonly search = debouncedSignal(this.searchTerm, 300)
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
}
