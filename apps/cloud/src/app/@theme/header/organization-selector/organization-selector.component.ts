import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, DestroyRef, inject, input, model, OnInit } from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { injectI18nService } from '@cloud/app/@shared/i18n'
import { nonNullable, OverlayAnimation1 } from '@metad/core'
import { NgmSearchComponent, NgmHighlightDirective } from '@metad/ocap-angular/common'
import { debouncedSignal } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { uniqBy } from 'lodash-es'
import { NgxPermissionsService } from 'ngx-permissions'
import { combineLatestWith, filter, map, switchMap, tap } from 'rxjs'
import { IOrganization, PermissionsEnum, Store, UsersOrganizationsService } from '../../../@core'
import { OrgAvatarComponent } from '../../../@shared/organization'

@Component({
  standalone: true,
  selector: 'pac-organization-selector',
  templateUrl: 'organization-selector.component.html',
  styleUrl: 'organization-selector.component.scss',
  host: {
    class: 'pac-organization-selector'
  },
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    CdkMenuModule,
    MatTooltipModule,
    NgmSearchComponent,
    OrgAvatarComponent,
    NgmHighlightDirective
],
  animations: [OverlayAnimation1]
})
export class OrganizationSelectorComponent implements OnInit {
  private readonly store = inject(Store)
  private readonly userOrganizationService = inject(UsersOrganizationsService)
  private readonly permissionsService = inject(NgxPermissionsService)
  private readonly destroyRef = inject(DestroyRef)
  readonly i18nService = injectI18nService()

  readonly isCollapsed = input<boolean>(false)

  readonly organization = model<IOrganization>(null)
  readonly searchTerm = model<string>('')
  readonly search = debouncedSignal(this.searchTerm, 300)

  readonly #organizations = toSignal(
    this.store.user$
      .pipe(
        filter(nonNullable),
        switchMap(({ id }) =>
          this.userOrganizationService.getAll(
            [
              'organization',
              'organization.contact',
              'organization.featureOrganizations',
              'organization.featureOrganizations.feature'
            ],
            { userId: id }
          )
        )
      )
      .pipe(
        map(({ items }) =>
          uniqBy(
            items.map(({ organization }) => organization),
            (item) => item.id
          ).sort((a, b) => a.name.localeCompare(b.name))
        ),
        tap((organizations) => {
          if (organizations.length > 0) {
            const defaultOrganization = organizations.find((organization: IOrganization) => organization.isDefault)
            const [firstOrganization] = organizations

            if (this.store.organizationId) {
              const organization = organizations.find(
                (organization: IOrganization) => organization.id === this.store.organizationId
              )
              this.store.selectedOrganization = organization || defaultOrganization || firstOrganization
            } else {
              // set default organization as selected
              this.store.selectedOrganization = defaultOrganization || firstOrganization
              this.store.organizationId = this.store.selectedOrganization.id
            }
          }
        }),
        combineLatestWith(
          this.permissionsService.permissions$.pipe(
            switchMap(() => this.permissionsService.hasPermission(PermissionsEnum.SUPER_ADMIN_EDIT))
          )
        ),
        map(([organizations, canAllOrgEdit]) => {
          return canAllOrgEdit
            ? [
                {
                  name: this.i18nService.instant('PAC.KEY_WORDS.Tenant', { Default: 'Tenant' }),
                  id: null
                } as IOrganization,
                ...organizations
              ]
            : organizations
        })
      )
  )
  readonly organizations = computed(() => {
    if (this.search()) {
      return this.#organizations()?.filter((org) => org.name.toLowerCase().includes(this.search().toLowerCase()))
    }

    return this.#organizations()
  })

  readonly canSelectOrg = computed(() => this.#organizations()?.length > 1)

  ngOnInit() {
    this.loadSelectedOrganization()
  }

  compareWith(a: IOrganization, b: IOrganization) {
    return a?.id === b?.id
  }

  private loadSelectedOrganization() {
    this.store.selectedOrganization$
      .pipe(
        filter((organization) => !!organization),
        tap((organization: IOrganization) => {
          this.organization.set(organization)
          this.store.featureOrganizations = organization.featureOrganizations ?? []
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe()
  }

  /**
   * Toggle another organization
   *
   * @param organization
   */
  selectOrganization(organization: IOrganization) {
    if (organization?.id === this.organization()?.id) {
      return
    }
    if (organization?.id) {
      this.store.selectedOrganization = organization
      this.store.organizationId = organization.id
      this.store.selectedEmployee = null
      // reload page
      window.location.reload()
    } else {
      this.store.selectedOrganization = null
      this.store.organizationId = null
      this.store.selectedEmployee = null
      this.organization.set({
        name: this.i18nService.instant('PAC.Header.Organization.AllOrg', { Default: 'All Org' }),
        id: null
      } as IOrganization)
    }

    // Reset selected project when organization is changed
    this.store.selectedProject = null
  }
}
