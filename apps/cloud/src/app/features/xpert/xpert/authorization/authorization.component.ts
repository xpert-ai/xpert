import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { Router } from '@angular/router'
import { Store } from '@xpert-ai/cloud/state'
import { NgmSpinComponent } from '@xpert-ai/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { combineLatest } from 'rxjs'
import { map, take } from 'rxjs/operators'
import { XpertComponent } from '../xpert.component'
import {
  getErrorMessage,
  injectToastr,
  injectUserGroupAPI,
  injectXpertAPI,
  IOrganization,
  IUserGroup,
  IUserOrganization,
  OrderTypeEnum,
  OrganizationsService,
  PermissionsEnum,
  UsersOrganizationsService
} from 'apps/cloud/src/app/@core'

type TOrganizationMembership = IUserOrganization & {
  organization?: IOrganization | null
}

@Component({
  standalone: true,
  selector: 'xpert-authorization',
  templateUrl: './authorization.component.html',
  styleUrls: ['./authorization.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslateModule, NgmSpinComponent]
})
export class XpertAuthorizationComponent {
  readonly #destroyRef = inject(DestroyRef)
  readonly #store = inject(Store)
  readonly #router = inject(Router)
  readonly #xpertService = injectXpertAPI()
  readonly #userGroupService = injectUserGroupAPI()
  readonly #organizationsService = inject(OrganizationsService)
  readonly #usersOrganizationsService = inject(UsersOrganizationsService)
  readonly #xpertComponent = inject(XpertComponent)
  readonly #toastr = injectToastr()

  #authorizationRequestId = 0
  #organizationsRequestId = 0
  #organizationsLoaded = false
  #lastLoadedKey: string | null = null

  readonly xpert = this.#xpertComponent.xpert
  readonly loading = signal(false)
  readonly organizationsLoading = signal(false)
  readonly saving = signal(false)
  readonly query = signal('')
  readonly availableGroups = signal<IUserGroup[]>([])
  readonly organizationOptions = signal<IOrganization[]>([])
  readonly selectedOrganizationId = signal<string | null>(null)
  readonly initialSelectedGroupIdsByOrganization = signal<Record<string, string[]>>({})
  readonly selectedGroupIdsByOrganization = signal<Record<string, string[]>>({})

  readonly isTenantXpert = computed(() => !this.xpert()?.organizationId)
  readonly targetOrganizationId = computed(() => this.xpert()?.organizationId ?? this.selectedOrganizationId())
  readonly selectedOrganization = computed(() => {
    const organizationId = this.targetOrganizationId()
    if (!organizationId) {
      return null
    }

    return (
      this.organizationOptions().find((organization) => organization.id === organizationId) ??
      this.resolveFallbackOrganization(organizationId)
    )
  })
  readonly selectedGroupIds = computed(() => {
    const organizationId = this.targetOrganizationId()
    if (!organizationId) {
      return []
    }

    return this.selectedGroupIdsByOrganization()[organizationId] ?? []
  })
  readonly initialSelectedGroupIds = computed(() => {
    const organizationId = this.targetOrganizationId()
    if (!organizationId) {
      return []
    }

    return this.initialSelectedGroupIdsByOrganization()[organizationId] ?? []
  })
  readonly selectedGroups = computed(() =>
    this.availableGroups().filter((group) => this.selectedGroupIds().includes(group.id))
  )
  readonly filteredGroups = computed(() => {
    const query = this.normalizeSearch(this.query())

    if (!query) {
      return this.availableGroups()
    }

    return this.availableGroups().filter((group) => this.matchesGroup(group, query))
  })
  readonly selectedGroupCount = computed(() => this.selectedGroupIds().length)
  readonly selectedMemberCount = computed(() => {
    const members = new Set<string>()

    this.selectedGroups().forEach((group) => {
      group.members?.forEach((member) => {
        if (member?.id) {
          members.add(member.id)
        }
      })
    })

    return members.size
  })
  readonly canSelectVisibleGroups = computed(() => {
    const selectedIds = new Set(this.selectedGroupIds())
    return !!this.targetOrganizationId() && this.filteredGroups().some((group) => !selectedIds.has(group.id))
  })
  readonly hasChanges = computed(() => {
    const current = [...this.selectedGroupIds()].sort()
    const initial = [...this.initialSelectedGroupIds()].sort()

    if (current.length !== initial.length) {
      return true
    }

    return current.some((id, index) => id !== initial[index])
  })
  readonly hasAvailableOrganizations = computed(() => this.organizationOptions().length > 0 || !!this.selectedOrganization())
  readonly isBusy = computed(() => this.loading() || this.organizationsLoading() || this.saving())

  constructor() {
    effect(() => {
      const xpert = this.xpert()
      if (!xpert?.id) {
        return
      }

      if (xpert.organizationId) {
        this.selectedOrganizationId.set(xpert.organizationId)
        this.ensureOrganizationOption(this.resolveFallbackOrganization(xpert.organizationId))
        return
      }

      if (!this.#organizationsLoaded) {
        this.loadOrganizations()
      }
    })

    effect(() => {
      const xpertId = this.#xpertComponent.xpertId()
      const organizationId = this.targetOrganizationId()

      if (!xpertId || !organizationId) {
        this.availableGroups.set([])
        return
      }

      const nextKey = `${xpertId}:${organizationId}`
      if (this.#lastLoadedKey === nextKey) {
        return
      }

      this.#lastLoadedKey = nextKey
      this.loadAuthorizationData(organizationId)
    })
  }

  openGroupsSettings() {
    const organization = this.selectedOrganization()
    if (this.isTenantXpert() && organization) {
      this.#store.setOrganizationScope(organization)
    }

    this.#router.navigate(['/settings/groups'])
  }

  changeOrganization(organizationId: string) {
    const nextOrganizationId = organizationId || null
    if (nextOrganizationId === this.selectedOrganizationId()) {
      return
    }

    this.selectedOrganizationId.set(nextOrganizationId)
  }

  updateQuery(value: string) {
    this.query.set(value)
  }

  isSelected(groupId: string) {
    return this.selectedGroupIds().includes(groupId)
  }

  toggleGroup(groupId: string, checked: boolean) {
    this.updateCurrentSelection((state) => {
      if (checked) {
        return [...state, groupId]
      }

      return state.filter((id) => id !== groupId)
    })
  }

  selectVisibleGroups() {
    this.updateCurrentSelection((state) => {
      const nextIds = new Set(state)
      this.filteredGroups().forEach((group) => nextIds.add(group.id))
      return [...nextIds]
    })
  }

  clearSelection() {
    this.updateCurrentSelection(() => [])
  }

  resetSelection() {
    this.updateCurrentSelection(() => [...this.initialSelectedGroupIds()])
  }

  save() {
    const organizationId = this.targetOrganizationId()
    if (!organizationId || !this.hasChanges()) {
      return
    }

    this.saving.set(true)
    this.#xpertService
      .updateXpertUserGroups(this.#xpertComponent.xpertId(), this.selectedGroupIds(), organizationId)
      .pipe(takeUntilDestroyed(this.#destroyRef))
      .subscribe({
        next: (groups) => {
          const selectedGroupIds = (groups ?? []).map((group) => group.id)
          this.initialSelectedGroupIdsByOrganization.update((state) => ({
            ...state,
            [organizationId]: selectedGroupIds
          }))
          this.selectedGroupIdsByOrganization.update((state) => ({
            ...state,
            [organizationId]: selectedGroupIds
          }))
          this.saving.set(false)
          this.#toastr.success('PAC.MESSAGE.UpdateSuccess', { Default: 'Saved successfully' })
        },
        error: (error) => {
          this.saving.set(false)
          this.#toastr.error(getErrorMessage(error))
          this.loadAuthorizationData(organizationId)
        }
      })
  }

  groupMemberCount(group: IUserGroup) {
    return group.members?.length ?? 0
  }

  groupInitials(group: IUserGroup) {
    const parts = group.name?.trim().split(/\s+/).filter(Boolean) ?? []

    if (!parts.length) {
      return 'UG'
    }

    return parts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('')
  }

  organizationLabel(organization: IOrganization | null) {
    return organization?.name?.trim() || organization?.officialName?.trim() || organization?.id || ''
  }

  private loadOrganizations() {
    const userId = this.#store.user?.id
    if (!userId) {
      this.organizationOptions.set([])
      this.selectedOrganizationId.set(null)
      return
    }

    this.organizationsLoading.set(true)
    const requestId = ++this.#organizationsRequestId
    const organizations$ = this.#store.hasPermission(PermissionsEnum.ALL_ORG_VIEW)
      ? this.#organizationsService.getAll([], { isActive: true }).pipe(
          map(({ items }) => this.sortOrganizations(items ?? []))
        )
      : this.#usersOrganizationsService.getAll(['organization'], { userId, isActive: true }).pipe(
          map(({ items }) => this.normalizeOrganizationsFromMemberships(items as TOrganizationMembership[]))
        )

    organizations$
      .pipe(take(1), takeUntilDestroyed(this.#destroyRef))
      .subscribe({
        next: (organizations) => {
          if (requestId !== this.#organizationsRequestId) {
            return
          }

          this.#organizationsLoaded = true
          this.organizationsLoading.set(false)
          this.organizationOptions.set(organizations)

          const currentOrganizationId = this.selectedOrganizationId()
          if (currentOrganizationId && organizations.some((organization) => organization.id === currentOrganizationId)) {
            return
          }

          this.selectedOrganizationId.set(organizations[0]?.id ?? null)
        },
        error: (error) => {
          if (requestId !== this.#organizationsRequestId) {
            return
          }

          this.organizationsLoading.set(false)
          this.organizationOptions.set([])
          this.selectedOrganizationId.set(null)
          this.#toastr.error(getErrorMessage(error))
        }
      })
  }

  private loadAuthorizationData(organizationId: string) {
    const requestId = ++this.#authorizationRequestId
    this.loading.set(true)
    this.availableGroups.set([])

    combineLatest({
      availableGroups: this.#userGroupService
        .getAllByOrganization(organizationId, {
          relations: ['members'],
          order: {
            updatedAt: OrderTypeEnum.DESC
          }
        })
        .pipe(take(1)),
      xpertGroups: this.#xpertService.getXpertUserGroups(this.#xpertComponent.xpertId(), organizationId).pipe(take(1))
    })
      .pipe(takeUntilDestroyed(this.#destroyRef))
      .subscribe({
        next: ({ availableGroups, xpertGroups }) => {
          if (requestId !== this.#authorizationRequestId) {
            return
          }

          const groups = availableGroups.items ?? []
          const availableGroupIds = new Set(groups.map((group) => group.id))
          const serverSelectedGroupIds = [...new Set((xpertGroups ?? []).map((group) => group.id))].filter((id) =>
            availableGroupIds.has(id)
          )

          this.availableGroups.set(groups)
          this.initialSelectedGroupIdsByOrganization.update((state) => ({
            ...state,
            [organizationId]: serverSelectedGroupIds
          }))
          this.selectedGroupIdsByOrganization.update((state) => ({
            ...state,
            [organizationId]: this.sanitizeGroupIds(
              state[organizationId] ?? serverSelectedGroupIds,
              availableGroupIds
            )
          }))
          this.loading.set(false)
        },
        error: (error) => {
          if (requestId !== this.#authorizationRequestId) {
            return
          }

          this.availableGroups.set([])
          this.loading.set(false)
          this.#toastr.error(getErrorMessage(error))
        }
      })
  }

  private sanitizeGroupIds(groupIds: string[], availableGroupIds: Set<string>) {
    return [...new Set((groupIds ?? []).filter((id) => availableGroupIds.has(id)))]
  }

  private updateCurrentSelection(updater: (state: string[]) => string[]) {
    const organizationId = this.targetOrganizationId()
    if (!organizationId) {
      return
    }

    this.selectedGroupIdsByOrganization.update((state) => ({
      ...state,
      [organizationId]: [...new Set(updater(state[organizationId] ?? []))]
    }))
  }

  private normalizeOrganizationsFromMemberships(memberships: TOrganizationMembership[]) {
    const organizations = new Map<string, IOrganization>()

    ;(memberships ?? []).forEach((membership) => {
      const organization = membership.organization
      if (organization?.id && !organizations.has(organization.id)) {
        organizations.set(organization.id, organization)
      }
    })

    return this.sortOrganizations([...organizations.values()])
  }

  private sortOrganizations(organizations: IOrganization[]) {
    return [...organizations].sort((a, b) => this.organizationLabel(a).localeCompare(this.organizationLabel(b)))
  }

  private ensureOrganizationOption(organization: IOrganization | null) {
    if (!organization?.id) {
      return
    }

    this.organizationOptions.update((state) => {
      if (state.some((item) => item.id === organization.id)) {
        return state
      }

      return this.sortOrganizations([...state, organization])
    })
  }

  private resolveFallbackOrganization(organizationId: string) {
    const xpertOrganization = this.xpert()?.organization
    if (xpertOrganization?.id === organizationId) {
      return xpertOrganization
    }

    const activeOrganization = this.#store.selectedOrganization
    if (activeOrganization?.id === organizationId) {
      return activeOrganization
    }

    return null
  }

  private matchesGroup(group: IUserGroup, query: string) {
    return [group.name, group.description, `${this.groupMemberCount(group)} members`]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(query))
  }

  private normalizeSearch(value: string | null | undefined) {
    return value?.trim().toLowerCase() ?? ''
  }
}
