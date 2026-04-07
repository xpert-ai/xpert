import { Dialog } from '@angular/cdk/dialog'
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { FormBuilder, FormControl, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { ActivatedRoute, Router } from '@angular/router'
import { IOrganizationCreateInput, OrganizationDemoNetworkEnum } from '@metad/contracts'
import { UsersService } from '@metad/cloud/state'
import { injectConfirmDelete, NgmTableComponent } from '@metad/ocap-angular/common'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import { distinctUntilChanged, map } from 'rxjs/operators'
import {
  IOrganization,
  OrganizationsService,
  PermissionsEnum,
  RequestScopeLevel,
  ScreenshotService,
  Store,
  ToastrService,
  getErrorMessage,
  routeAnimations
} from '../../../@core'
import { timezones } from '../../../@core/constants/timezone'
import { OrganizationMutationComponent } from './organization-mutation/organization-mutation.component'
import { ZardInputDirective, ZardStepperImports, ZardInputGroupComponent, ZardIconComponent, ZardTabsImports, ZardRadioComponent, ZardRadioGroupComponent, ZardButtonComponent, ZardSelectImports, ZardSwitchComponent } from '@xpert-ai/headless-ui'
import { OrgAvatarComponent, OrgAvatarEditorComponent } from '@cloud/app/@shared/organization'
import { TagMaintainComponent } from '@cloud/app/@shared/tag'
import { CommonModule } from '@angular/common'
import { OrganizationMembersComponent } from './organization-members/organization-members.component'
import { OrganizationUserGroupsComponent } from './organization-user-groups/organization-user-groups.component'

type OrganizationDetailsTab = 'general' | 'members' | 'user-groups' | 'controls' | 'tags' | 'demo'

@Component({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    ...ZardStepperImports,
    ...ZardTabsImports,
    ...ZardSelectImports,
    ZardInputGroupComponent,
    ZardInputDirective,
    ZardIconComponent,
    ZardRadioComponent,
    ZardRadioGroupComponent,
    ZardButtonComponent,
    ZardSwitchComponent,
    OrgAvatarEditorComponent,
    OrgAvatarComponent,
    NgmTableComponent,
    TagMaintainComponent,
    OrganizationMembersComponent,
    OrganizationUserGroupsComponent
  ],
  selector: 'pac-organizations',
  templateUrl: './organizations.component.html',
  styleUrls: ['./organizations.component.css'],
  animations: [routeAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OrganizationsComponent {
  readonly #destroyRef = inject(DestroyRef)
  readonly #route = inject(ActivatedRoute)
  readonly #router = inject(Router)
  readonly #store = inject(Store)
  readonly #fb = inject(FormBuilder)
  readonly #usersService = inject(UsersService)
  readonly #organizationsService = inject(OrganizationsService)
  readonly #dialog = inject(Dialog)
  readonly #toastrService = inject(ToastrService)
  readonly #translate = inject(TranslateService)
  readonly #screenshotService = inject(ScreenshotService)

  readonly confirmDelete = injectConfirmDelete()

  readonly requestScopeLevel = RequestScopeLevel
  readonly organizationDemoNetworkEnum = OrganizationDemoNetworkEnum
  readonly timezones = timezones
  readonly noTimeZoneValue = '__none__'

  readonly activeScope = toSignal(this.#store.selectActiveScope(), {
    initialValue: this.#store.activeScope
  })
  readonly activeLanguage = toSignal(
    this.#translate.onLangChange.pipe(map(({ lang }) => lang)),
    { initialValue: this.#translate.currentLang || this.#translate.getDefaultLang() || 'en' }
  )
  readonly routeOrganizationId = toSignal(
    this.#route.paramMap.pipe(
      map((params) => params.get('id')),
      distinctUntilChanged()
    ),
    { initialValue: this.#route.snapshot.paramMap.get('id') }
  )

  readonly searchText = signal('')
  readonly selectedTab = signal<OrganizationDetailsTab>('general')
  readonly organizations = signal<IOrganization[]>([])
  readonly selectedOrganization = signal<IOrganization | null>(null)
  readonly loading = signal(false)
  readonly saving = signal(false)
  readonly uploadingAvatar = signal(false)
  readonly generatingDemo = signal(false)
  readonly error = signal<string | null>(null)
  readonly refreshTick = signal(0)

  readonly source = new FormControl<OrganizationDemoNetworkEnum | string | null>(OrganizationDemoNetworkEnum.github)
  readonly fileUrl = new FormControl('', [Validators.required])

  readonly form = this.#fb.group({
    name: ['', [Validators.required]],
    officialName: [''],
    profile_link: [''],
    website: [''],
    short_description: [''],
    currency: ['USD', [Validators.required]],
    timeZone: [''],
    defaultValueDateType: ['TODAY', [Validators.required]],
    invitesAllowed: [true],
    inviteExpiryPeriod: [7, [Validators.min(1)]],
    isDefault: [false],
    isActive: [true]
  })

  readonly isTenantScope = computed(
    () => this.activeScope().level === RequestScopeLevel.TENANT
  )
  readonly canViewAllOrganizations = computed(
    () => this.isTenantScope() && this.#store.hasPermission(PermissionsEnum.ALL_ORG_VIEW)
  )
  readonly canCreateOrganizations = computed(
    () => this.isTenantScope() && this.#store.hasPermission(PermissionsEnum.ALL_ORG_EDIT)
  )
  readonly isTenantDetailView = computed(
    () => this.isTenantScope() && !!this.routeOrganizationId()
  )
  readonly showRegistrySection = computed(
    () => !this.isTenantScope() || !this.isTenantDetailView()
  )
  readonly showDetailsSection = computed(
    () => !this.isTenantScope() || this.isTenantDetailView()
  )
  readonly canEditSelectedOrganization = computed(
    () => !!this.selectedOrganization() && this.#store.hasPermission(PermissionsEnum.ALL_ORG_EDIT)
  )
  readonly canManageSelectedMembers = computed(
    () =>
      !!this.selectedOrganization() &&
      [PermissionsEnum.ALL_ORG_EDIT, PermissionsEnum.ORG_USERS_EDIT].some((permission) =>
        this.#store.hasPermission(permission)
      )
  )
  readonly canEditGovernanceFields = computed(
    () => this.canEditSelectedOrganization() && this.isTenantScope()
  )
  readonly visibleOrganizations = computed(() => {
    const search = this.searchText().trim().toLowerCase()
    const organizations = this.organizations()
    if (!search || !this.isTenantScope()) {
      return organizations
    }

    return organizations.filter((organization) =>
      [
        organization.name,
        organization.officialName,
        organization.profile_link,
        organization.currency,
        organization.timeZone
      ]
        .filter(Boolean)
        .some((value) => `${value}`.toLowerCase().includes(search))
    )
  })
  readonly selectedOrganizationId = computed(() => this.selectedOrganization()?.id ?? null)
  readonly selectedOrganizationTags = computed(() => this.selectedOrganization()?.tags ?? [])
  readonly registrySectionTitle = computed(() => {
    this.activeLanguage()
    return this.isTenantScope()
      ? this.#translate.instant('PAC.Organization.RegistryTitle', {
          Default: 'Organization Registry'
        })
      : this.#translate.instant('PAC.Organization.CurrentOrganizationTitle', {
          Default: 'Current organization'
        })
  })
  readonly selectedOrganizationSubtitle = computed(
    () => this.selectedOrganization()?.short_description?.trim() || null
  )

  #loadToken = 0

  constructor() {
    effect(() => {
      this.activeScope()
      this.routeOrganizationId()
      this.refreshTick()
      void this.loadOrganizationsWorkspace()
    }, { allowSignalWrites: true })

    effect(() => {
      if (
        this.isTenantScope() &&
        (this.selectedTab() === 'tags' || this.selectedTab() === 'demo')
      ) {
        this.selectedTab.set('general')
      }
    }, { allowSignalWrites: true })

    effect(() => {
      this.selectedOrganization()
      this.canEditSelectedOrganization()
      this.canEditGovernanceFields()
      this.applyFormAccess()
    }, { allowSignalWrites: true })

    this.source.valueChanges
      .pipe(takeUntilDestroyed(this.#destroyRef))
      .subscribe((value) => {
        if (value !== null) {
          this.fileUrl.setValue('', { emitEvent: false })
          this.fileUrl.disable({ emitEvent: false })
        } else {
          this.fileUrl.enable({ emitEvent: false })
        }
      })

    this.fileUrl.disable({ emitEvent: false })
  }

  async addOrganization() {
    const organization = await firstValueFrom(
      this.#dialog.open<IOrganizationCreateInput>(OrganizationMutationComponent, {
        backdropClass: 'xp-overlay-share-sheet',
        panelClass: 'xp-overlay-pane-share-sheet'
      }).closed
    )
    if (!organization) {
      return
    }

    try {
      const created = await firstValueFrom(this.#organizationsService.create(organization))
      this.#toastrService.success('PAC.NOTES.ORGANIZATIONS.AddNewOrganization', {
        Default: 'Add New Organization'
      })
      await this.navigateToOrganization(created.id)
    } catch (error) {
      this.#toastrService.error(getErrorMessage(error))
    }
  }

  selectOrganization(organization: IOrganization) {
    if (!organization?.id || organization.id === this.selectedOrganizationId()) {
      return
    }

    if (this.isTenantScope()) {
      void this.navigateToOrganization(organization.id)
      return
    }

    this.selectedOrganization.set(organization)
    this.patchForm(organization)
  }

  openOrganizationDetails(event: MouseEvent, organization: IOrganization) {
    event.stopPropagation()
    if (!organization?.id) {
      return
    }

    this.selectedTab.set('general')

    if (this.isTenantScope()) {
      if (organization.id !== this.routeOrganizationId()) {
        void this.navigateToOrganization(organization.id)
      }
      return
    }

    if (organization.id !== this.selectedOrganizationId()) {
      this.selectedOrganization.set(organization)
      this.patchForm(organization)
    }
  }

  deleteOrganization(event: MouseEvent, organization: IOrganization) {
    event.stopPropagation()
    if (!this.canCreateOrganizations()) {
      return
    }

    const information = this.#translate.instant('PAC.NOTES.ORGANIZATIONS.DELETE_CONFIRM', {
      Default:
        'Delete this organization only when it has no members, pending invites, or user groups.'
    })

    this.confirmDelete(
      {
        value: organization?.name,
        information
      },
      this.#organizationsService.delete(organization.id)
    ).subscribe({
      next: async () => {
        await this.refreshCurrentUserContext()
        this.#toastrService.success('PAC.NOTES.ORGANIZATIONS.DELETE_ORGANIZATION', {
          Default: `Organization '{{ name }}' was removed`,
          name: organization.name
        })
        if (organization.id === this.routeOrganizationId()) {
          await this.#router.navigate(['/settings/organizations'])
        }
        this.refresh()
      },
      error: (error) => {
        this.#toastrService.error(getErrorMessage(error))
      }
    })
  }

  resetForm() {
    this.patchForm(this.selectedOrganization())
  }

  async backToRegistry() {
    this.selectedTab.set('general')
    await this.#router.navigate(['/settings/organizations'])
  }

  async saveOrganization() {
    const organization = this.selectedOrganization()
    if (!organization || this.form.invalid || !this.canEditSelectedOrganization()) {
      return
    }

    this.saving.set(true)
    try {
      const payload = this.form.getRawValue() as any
      const timeZone = payload.timeZone === this.noTimeZoneValue ? '' : payload.timeZone
      await firstValueFrom(
        this.#organizationsService.update(organization.id, {
          ...payload,
          timeZone
        })
      )
      await this.refreshCurrentUserContext()

      this.#toastrService.success('PAC.MESSAGE.MAIN_ORGANIZATION_UPDATED', {
        Default: 'Main Org Updated'
      })
      this.refresh()
    } catch (error) {
      this.#toastrService.error(getErrorMessage(error))
    } finally {
      this.saving.set(false)
    }
  }

  async onAvatarSelected(event: Event) {
    const organization = this.selectedOrganization()
    const file = (event.target as HTMLInputElement).files?.[0]
    if (!organization || !file || !this.canEditSelectedOrganization()) {
      return
    }

    this.uploadingAvatar.set(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const screenshot = await firstValueFrom(this.#screenshotService.create(formData))
      await firstValueFrom(this.#organizationsService.update(organization.id, { imageUrl: screenshot.url }))
      await this.refreshCurrentUserContext()
      this.refresh()
    } catch (error) {
      this.#toastrService.error(getErrorMessage(error))
    } finally {
      this.uploadingAvatar.set(false)
      ;(event.target as HTMLInputElement).value = ''
    }
  }

  async generateDemo() {
    const organization = this.selectedOrganization()
    if (!organization || !this.canEditSelectedOrganization()) {
      return
    }

    const source = this.source.value ?? this.fileUrl.value
    if (!source) {
      this.fileUrl.markAsTouched()
      return
    }

    this.generatingDemo.set(true)
    try {
      await firstValueFrom(
        this.#organizationsService.demo(organization.id, {
          source,
          importData: true
        })
      )
      this.#toastrService.success('PAC.NOTES.ORGANIZATIONS.DEMO_GENERATED', {
        Default: 'Demo generated'
      })
      this.refresh()
    } catch (error) {
      this.#toastrService.error(getErrorMessage(error))
    } finally {
      this.generatingDemo.set(false)
    }
  }

  refresh() {
    this.refreshTick.update((value) => value + 1)
  }

  isSelectedRow(organization: IOrganization) {
    return organization?.id === this.selectedOrganizationId()
  }

  organizationIdentifier(organization: IOrganization) {
    return organization?.profile_link || organization?.id || '-'
  }

  organizationStatusLabel(organization: IOrganization) {
    this.activeLanguage()
    return organization?.isActive
      ? this.#translate.instant('PAC.KEY_WORDS.Active', { Default: 'Active' })
      : this.#translate.instant('PAC.KEY_WORDS.Disabled', { Default: 'Disabled' })
  }

  organizationStatusTone(organization: IOrganization) {
    return organization?.isActive
      ? 'bg-state-success-hover/20 text-text-success'
      : 'bg-state-destructive-hover/20 text-text-destructive'
  }

  governanceReadonlyHint() {
    this.activeLanguage()
    return this.#translate.instant('PAC.Organization.GovernanceReadonlyHint', {
      Default: 'Tenant-governed fields remain locked in organization scope.'
    })
  }

  private async loadOrganizationsWorkspace() {
    const loadToken = ++this.#loadToken
    this.loading.set(true)
    this.error.set(null)

    try {
      const activeScope = this.activeScope()
      const routeOrganizationId = this.routeOrganizationId()

      let organizations: IOrganization[] = []
      let forcedOrganizationId: string | null = null

      if (this.canViewAllOrganizations()) {
        const response = await firstValueFrom(this.#organizationsService.getAll())
        organizations = this.sortOrganizations(response.items)
      } else if (activeScope.level === RequestScopeLevel.ORGANIZATION && activeScope.organizationId) {
        const organization = await firstValueFrom(
          this.#organizationsService.getById(activeScope.organizationId, null, ['tags'])
        )
        organizations = [organization]
        forcedOrganizationId = organization.id
      } else {
        organizations = []
      }

      if (loadToken !== this.#loadToken) {
        return
      }

      this.organizations.set(organizations)

      const selectedOrganizationId = this.resolveSelectedOrganizationId(
        organizations,
        forcedOrganizationId,
        routeOrganizationId
      )

      if (!selectedOrganizationId) {
        this.selectedOrganization.set(null)
        this.form.reset(
          {
            name: '',
            officialName: '',
            profile_link: '',
            website: '',
            short_description: '',
            currency: 'USD',
            timeZone: '',
            defaultValueDateType: 'TODAY',
            invitesAllowed: true,
            inviteExpiryPeriod: 7,
            isDefault: false,
            isActive: true
          },
          { emitEvent: false }
        )
        return
      }

      const detail =
        organizations.find(
          (organization) =>
            organization.id === selectedOrganizationId &&
            Array.isArray(organization.tags)
        ) ??
        (await firstValueFrom(
          this.#organizationsService.getById(selectedOrganizationId, null, ['tags'])
        ))

      if (loadToken !== this.#loadToken) {
        return
      }

      this.selectedOrganization.set(detail)
      this.patchForm(detail)
      this.syncStoreSelectedOrganization(detail)
    } catch (error) {
      if (loadToken !== this.#loadToken) {
        return
      }

      this.organizations.set([])
      this.selectedOrganization.set(null)
      this.error.set(getErrorMessage(error))
    } finally {
      if (loadToken === this.#loadToken) {
        this.loading.set(false)
      }
    }
  }

  private applyFormAccess() {
    const hasSelection = !!this.selectedOrganization()
    if (!hasSelection || !this.canEditSelectedOrganization()) {
      this.form.disable({ emitEvent: false })
      return
    }

    this.form.enable({ emitEvent: false })

    if (!this.canEditGovernanceFields()) {
      this.form.get('isDefault')?.disable({ emitEvent: false })
      this.form.get('isActive')?.disable({ emitEvent: false })
    }
  }

  private patchForm(organization: IOrganization | null) {
    if (!organization) {
      return
    }

    this.form.reset(
      {
        name: organization.name ?? '',
        officialName: organization.officialName ?? '',
        profile_link: organization.profile_link ?? '',
        website: organization.website ?? '',
        short_description: organization.short_description ?? '',
        currency: organization.currency ?? 'USD',
        timeZone: organization.timeZone || this.noTimeZoneValue,
        defaultValueDateType: organization.defaultValueDateType ?? 'TODAY',
        invitesAllowed: organization.invitesAllowed ?? true,
        inviteExpiryPeriod: organization.inviteExpiryPeriod ?? 7,
        isDefault: organization.isDefault ?? false,
        isActive: organization.isActive ?? true
      },
      { emitEvent: false }
    )
    this.form.markAsPristine()
  }

  private resolveSelectedOrganizationId(
    organizations: IOrganization[],
    forcedOrganizationId: string | null,
    routeOrganizationId: string | null
  ) {
    if (!organizations.length) {
      return null
    }

    if (
      forcedOrganizationId &&
      organizations.some((organization) => organization.id === forcedOrganizationId)
    ) {
      return forcedOrganizationId
    }

    if (
      routeOrganizationId &&
      organizations.some((organization) => organization.id === routeOrganizationId)
    ) {
      return routeOrganizationId
    }

    const currentSelectionId = this.selectedOrganization()?.id
    if (
      currentSelectionId &&
      organizations.some((organization) => organization.id === currentSelectionId)
    ) {
      return currentSelectionId
    }

    return (
      organizations.find((organization) => organization.isDefault)?.id ??
      organizations[0]?.id ??
      null
    )
  }

  private sortOrganizations(organizations: IOrganization[]) {
    return [...organizations].sort((left, right) => {
      if (left.isDefault !== right.isDefault) {
        return Number(right.isDefault) - Number(left.isDefault)
      }

      return (left.name ?? '').localeCompare(right.name ?? '')
    })
  }

  private syncStoreSelectedOrganization(organization: IOrganization) {
    const activeScope = this.activeScope()
    if (
      activeScope.level === RequestScopeLevel.ORGANIZATION &&
      activeScope.organizationId === organization.id
    ) {
      this.#store.selectedOrganization = organization
    }
  }

  private async navigateToOrganization(organizationId: string) {
    await this.#router.navigate(['/settings/organizations', organizationId])
  }

  private async refreshCurrentUserContext() {
    this.#store.user = await this.#usersService.getMe([
      'employee',
      'organizations',
      'organizations.organization',
      'organizations.organization.featureOrganizations',
      'organizations.organization.featureOrganizations.feature',
      'role',
      'role.rolePermissions',
      'tenant',
      'tenant.featureOrganizations',
      'tenant.featureOrganizations.feature'
    ])
  }
}
