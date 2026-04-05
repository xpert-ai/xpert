import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, signal } from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { injectOrganization } from '@metad/cloud/state'
import { injectConfirmDelete, NgmSpinComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent, ZardInputDirective } from '@xpert-ai/headless-ui'
import { combineLatest, firstValueFrom } from 'rxjs'
import { map, take } from 'rxjs/operators'
import {
  getErrorMessage,
  injectToastr,
  injectUserGroupAPI,
  IUser,
  IUserGroup,
  IXpert,
  OrderTypeEnum,
  routeAnimations,
  UsersOrganizationsService,
  injectXpertAPI
} from '../../../@core'
import { TranslationBaseComponent } from '../../../@shared/language'
import { UserAvatarComponent } from '../../../@shared/user'

@Component({
  standalone: true,
  selector: 'pac-user-groups-settings',
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    TranslateModule,
    NgmSpinComponent,
    ZardButtonComponent,
    ZardInputDirective,
    UserAvatarComponent
  ],
  templateUrl: './groups.component.html',
  styleUrl: './groups.component.css',
  animations: [routeAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserGroupsSettingsComponent extends TranslationBaseComponent {
  readonly #destroyRef = inject(DestroyRef)
  readonly #route = inject(ActivatedRoute)
  readonly #router = inject(Router)
  readonly #userGroupService = injectUserGroupAPI()
  readonly #xpertService = injectXpertAPI()
  readonly #usersOrganizationsService = inject(UsersOrganizationsService)
  readonly #toastr = injectToastr()
  readonly confirmDelete = injectConfirmDelete()

  readonly organization = injectOrganization()
  readonly loading = signal(false)
  readonly xpertsLoading = signal(false)
  readonly saving = signal(false)
  readonly deleting = signal(false)
  readonly preferCreateMode = signal(false)
  readonly groupQuery = signal('')
  readonly memberQuery = signal('')
  readonly groups = signal<IUserGroup[]>([])
  readonly organizationUsers = signal<IUser[]>([])
  readonly activeOrganizationUserIds = signal<string[]>([])
  readonly selectedMemberIds = signal<string[]>([])
  readonly availableXperts = signal<IXpert[]>([])
  readonly selectedXpertIds = signal<string[]>([])
  readonly initialSelectedXpertIds = signal<string[]>([])

  readonly selectedGroupId = toSignal(this.#route.paramMap.pipe(map((params) => params.get('id'))), {
    initialValue: this.#route.snapshot.paramMap.get('id')
  })
  readonly createMode = toSignal(this.#route.queryParamMap.pipe(map((params) => params.get('mode') === 'create')), {
    initialValue: this.#route.snapshot.queryParamMap.get('mode') === 'create'
  })

  readonly selectedGroup = computed(() => {
    const selectedGroupId = this.selectedGroupId()
    return this.groups().find((group) => group.id === selectedGroupId) ?? null
  })

  readonly isNewGroup = computed(() => !this.selectedGroup())
  readonly isBusy = computed(() => this.loading() || this.xpertsLoading() || this.saving() || this.deleting())
  readonly selectedMemberCount = computed(() => this.selectedMemberIds().length)
  readonly selectedXpertCount = computed(() => this.selectedXpertIds().length)
  readonly hasOrganizationUsers = computed(() => this.organizationUsers().length > 0)
  readonly selectedXperts = computed(() =>
    this.availableXperts().filter((xpert) => this.selectedXpertIds().includes(xpert.id))
  )
  readonly hasXpertChanges = computed(() => {
    const current = [...this.selectedXpertIds()].sort()
    const initial = [...this.initialSelectedXpertIds()].sort()

    if (current.length !== initial.length) {
      return true
    }

    return current.some((id, index) => id !== initial[index])
  })

  readonly filteredGroups = computed(() => {
    const query = this.normalizeSearch(this.groupQuery())
    const groups = this.groups()

    if (!query) {
      return groups
    }

    return groups.filter((group) => this.matchesGroup(group, query))
  })

  readonly selectedUsers = computed(() => {
    const selectedIds = new Set(this.selectedMemberIds())
    return this.sortUsers(this.organizationUsers().filter((user) => selectedIds.has(user.id)))
  })
  readonly inactiveSelectedUsers = computed(() => {
    const selectedIds = new Set(this.selectedMemberIds())
    const activeIds = new Set(this.activeOrganizationUserIds())

    return this.sortUsers(
      this.organizationUsers().filter((user) => selectedIds.has(user.id) && !activeIds.has(user.id))
    )
  })
  readonly hasInactiveSelectedUsers = computed(() => this.inactiveSelectedUsers().length > 0)

  readonly visibleUsers = computed(() => {
    const query = this.normalizeSearch(this.memberQuery())
    const selectedIds = new Set(this.selectedMemberIds())
    const activeIds = new Set(this.activeOrganizationUserIds())

    return [...this.organizationUsers()]
      .filter((user) => activeIds.has(user.id) || selectedIds.has(user.id))
      .filter((user) => this.matchesUser(user, query))
      .sort((a, b) => {
        const aRank = selectedIds.has(a.id) ? 0 : 1
        const bRank = selectedIds.has(b.id) ? 0 : 1
        if (aRank !== bRank) {
          return aRank - bRank
        }

        return this.userLabel(a).localeCompare(this.userLabel(b))
      })
  })

  readonly canSelectVisibleUsers = computed(() => {
    const selectedIds = new Set(this.selectedMemberIds())
    return this.visibleUsers().some((user) => !selectedIds.has(user.id))
  })

  readonly name = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required]
  })
  readonly description = new FormControl('', {
    nonNullable: true
  })

  constructor() {
    super()

    effect(() => {
      const organizationId = this.organization()?.id
      if (!organizationId) {
        this.groups.set([])
        this.organizationUsers.set([])
        this.activeOrganizationUserIds.set([])
        this.selectedMemberIds.set([])
        return
      }

      this.loadData()
    })

    effect(() => {
      const group = this.selectedGroup()
      if (group) {
        this.preferCreateMode.set(false)
        this.name.setValue(group.name ?? '')
        this.description.setValue(group.description ?? '')
        this.selectedMemberIds.set(group.members?.map((member) => member.id) ?? [])
        return
      }

      this.name.setValue('')
      this.description.setValue('')
      this.selectedMemberIds.set([])
    })

    effect(() => {
      const organizationId = this.organization()?.id
      const groupId = this.selectedGroup()?.id ?? null

      if (!organizationId) {
        this.availableXperts.set([])
        this.selectedXpertIds.set([])
        this.initialSelectedXpertIds.set([])
        return
      }

      void this.loadXpertAuthorizations(organizationId, groupId)
    })
  }

  loadData() {
    this.loading.set(true)

    combineLatest({
      groups: this.#userGroupService
        .getAllInOrg({
          relations: ['members'],
          order: {
            updatedAt: OrderTypeEnum.DESC
          }
        })
        .pipe(take(1)),
      memberships: this.#usersOrganizationsService
        .getAllInOrg(['user'], {
          isActive: true
        })
        .pipe(take(1))
    })
      .pipe(takeUntilDestroyed(this.#destroyRef))
      .subscribe({
        next: ({ groups, memberships }) => {
          const nextGroups = groups.items ?? []
          const usersById = new Map<string, IUser>()
          const activeUserIds = new Set<string>()
          ;(memberships.items ?? []).forEach((membership) => {
            if (membership.user?.id && !usersById.has(membership.user.id)) {
              usersById.set(membership.user.id, membership.user)
            }

            if (membership.user?.id) {
              activeUserIds.add(membership.user.id)
            }
          })
          nextGroups.forEach((group) => {
            group.members?.forEach((member) => {
              if (member?.id && !usersById.has(member.id)) {
                usersById.set(member.id, member)
              }
            })
          })

          this.groups.set(nextGroups)
          this.organizationUsers.set(this.sortUsers([...usersById.values()]))
          this.activeOrganizationUserIds.set([...activeUserIds])
          this.loading.set(false)

          const selectedGroupId = this.selectedGroupId()
          if (!selectedGroupId && nextGroups.length && !this.preferCreateMode() && !this.createMode()) {
            this.openGroup(nextGroups[0].id)
            return
          }

          if (selectedGroupId && !nextGroups.some((group) => group.id === selectedGroupId)) {
            this.startCreate()
          }
        },
        error: (error) => {
          this.loading.set(false)
          this.#toastr.error(getErrorMessage(error))
        }
      })
  }

  openGroup(groupId: string) {
    this.preferCreateMode.set(false)
    this.#router.navigate(['/settings/groups', groupId])
  }

  startCreate() {
    this.preferCreateMode.set(true)
    this.#router.navigate(['/settings/groups'], {
      queryParams: {
        mode: 'create'
      }
    })
  }

  updateGroupQuery(value: string) {
    this.groupQuery.set(value)
  }

  updateMemberQuery(value: string) {
    this.memberQuery.set(value)
  }

  toggleMember(userId: string, checked: boolean) {
    if (checked && !this.isActiveOrganizationUser(userId)) {
      return
    }

    this.selectedMemberIds.update((state) => {
      if (checked) {
        return [...new Set([...state, userId])]
      }

      return state.filter((id) => id !== userId)
    })
  }

  hasMember(userId: string) {
    return this.selectedMemberIds().includes(userId)
  }

  isActiveOrganizationUser(userId: string) {
    return this.activeOrganizationUserIds().includes(userId)
  }

  selectVisibleMembers() {
    const nextIds = new Set(this.selectedMemberIds())
    this.visibleUsers().forEach((user) => nextIds.add(user.id))
    this.selectedMemberIds.set([...nextIds])
  }

  clearSelectedMembers() {
    this.selectedMemberIds.set([])
  }

  removeMember(userId: string) {
    this.toggleMember(userId, false)
  }

  isXpertSelected(xpertId: string) {
    return this.selectedXpertIds().includes(xpertId)
  }

  toggleXpert(xpertId: string) {
    this.selectedXpertIds.update((state) =>
      state.includes(xpertId) ? state.filter((id) => id !== xpertId) : [...state, xpertId]
    )
  }

  xpertLabel(xpert: IXpert) {
    return xpert.title || xpert.name || xpert.id
  }

  save() {
    const trimmedName = this.name.getRawValue().trim()
    if (!trimmedName) {
      this.name.markAsTouched()
      this.name.setErrors({ required: true })
      return
    }

    const selectedGroup = this.selectedGroup()
    const organizationId = this.organization()?.id
    const payload = {
      name: trimmedName,
      description: this.description.getRawValue().trim() || null
    }
    const invalidMemberIds = this.selectedMemberIds().filter((id) => !this.isActiveOrganizationUser(id))
    if (invalidMemberIds.length) {
      this.#toastr.error(
        'PAC.UserGroup.RemoveInactiveMembersHint',
        undefined,
        'Remove inactive members from this group before saving.'
      )
      return
    }

    this.saving.set(true)
    const save$ = selectedGroup
      ? this.#userGroupService.update(selectedGroup.id, payload)
      : this.#userGroupService.create(payload)

    save$.pipe(takeUntilDestroyed(this.#destroyRef)).subscribe({
      next: async (group: IUserGroup) => {
        try {
          await firstValueFrom(this.#userGroupService.updateMembers(group.id, this.selectedMemberIds(), organizationId))
          await this.syncXpertAuthorizations(group.id)
          this.saving.set(false)
          this.#toastr.success('PAC.MESSAGE.UpdateSuccess', { Default: 'Saved successfully' })
          if (this.organization()?.id) {
            this.loadData()
          }
          this.#router.navigate(['/settings/groups', group.id])
        } catch (error) {
          this.saving.set(false)
          this.#toastr.error(getErrorMessage(error))
        }
      },
      error: (error) => {
        this.saving.set(false)
        this.#toastr.error(getErrorMessage(error))
      }
    })
  }

  deleteSelected() {
    const group = this.selectedGroup()
    if (!group) {
      return
    }

    this.confirmDelete(
      {
        value: group.name,
        information: this.getTranslation('PAC.UserGroup.DeleteConfirmDetail', {
          Default:
            this.groupMemberCount(group) > 0
              ? 'This group still contains members. Deleting it will also remove any XPERT access bound through this group.'
              : 'Deleting this group will also remove any XPERT access bound through this group.'
        })
      },
      this.#userGroupService.delete(group.id)
    ).subscribe({
      next: () => {
        this.deleting.set(false)
        this.#toastr.success('PAC.Messages.DeletedSuccessfully', { Default: 'Deleted successfully' })
        this.startCreate()
        if (this.organization()?.id) {
          this.loadData()
        }
      },
      error: (error) => {
        this.deleting.set(false)
        this.#toastr.error(getErrorMessage(error))
      }
    })
  }

  userLabel(user: IUser) {
    return (
      user.name || [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || user.username || user.id
    )
  }

  userSecondaryText(user: IUser) {
    return user.email || user.username || user.id
  }

  groupMemberCount(group: IUserGroup) {
    return group.members?.length ?? 0
  }

  groupInitials(group: IUserGroup) {
    return this.initialsFromText(group.name)
  }

  xpertInitials(xpert: IXpert) {
    return this.initialsFromText(this.xpertLabel(xpert))
  }

  private sortUsers(users: IUser[]) {
    return [...users].sort((a, b) => this.userLabel(a).localeCompare(this.userLabel(b)))
  }

  private matchesGroup(group: IUserGroup, query: string) {
    return [group.name, group.description, this.memberCountLabel(this.groupMemberCount(group))]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(query))
  }

  private matchesUser(user: IUser, query: string) {
    if (!query) {
      return true
    }

    return [this.userLabel(user), this.userSecondaryText(user), user.id]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(query))
  }

  private memberCountLabel(count: number) {
    return `${count} ${count === 1 ? 'member' : 'members'}`
  }

  private normalizeSearch(value: string | null | undefined) {
    return value?.trim().toLowerCase() ?? ''
  }

  private initialsFromText(value: string | null | undefined) {
    const parts = value?.trim().split(/\s+/).filter(Boolean) ?? []

    if (!parts.length) {
      return 'UG'
    }

    return parts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('')
  }

  private async loadXpertAuthorizations(organizationId: string, groupId: string | null) {
    this.xpertsLoading.set(true)
    try {
      const { items } = await firstValueFrom(
        this.#xpertService.getAllInOrg({
          where: {
            latest: true
          },
          order: {
            updatedAt: OrderTypeEnum.DESC
          }
        } as any)
      )

      const availableXperts = (items ?? []).filter((item) => !!item.publishAt)
      this.availableXperts.set(availableXperts)

      if (!groupId) {
        this.selectedXpertIds.set([])
        this.initialSelectedXpertIds.set([])
        return
      }

      const results = await Promise.all(
        availableXperts.map(async (xpert) => {
          const groups = await firstValueFrom(this.#xpertService.getXpertUserGroups(xpert.id, organizationId))
          return groups.some((group) => group.id === groupId) ? xpert.id : null
        })
      )

      const selectedXpertIds = results.filter(Boolean) as string[]
      this.selectedXpertIds.set(selectedXpertIds)
      this.initialSelectedXpertIds.set(selectedXpertIds)
    } catch (error) {
      this.availableXperts.set([])
      this.selectedXpertIds.set([])
      this.initialSelectedXpertIds.set([])
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.xpertsLoading.set(false)
    }
  }

  private async syncXpertAuthorizations(groupId: string) {
    const organizationId = this.organization()?.id
    if (!organizationId || !this.availableXperts().length || !this.hasXpertChanges()) {
      this.initialSelectedXpertIds.set([...this.selectedXpertIds()])
      return
    }

    const selectedIds = new Set(this.selectedXpertIds())
    const initialIds = new Set(this.initialSelectedXpertIds())
    const changedXperts = this.availableXperts().filter((xpert) => selectedIds.has(xpert.id) !== initialIds.has(xpert.id))

    await Promise.all(
      changedXperts.map(async (xpert) => {
        const groups = await firstValueFrom(this.#xpertService.getXpertUserGroups(xpert.id, organizationId))
        const currentGroupIds = groups.map((group) => group.id)
        const nextGroupIds = selectedIds.has(xpert.id)
          ? [...new Set([...currentGroupIds, groupId])]
          : currentGroupIds.filter((id) => id !== groupId)

        await firstValueFrom(this.#xpertService.updateXpertUserGroups(xpert.id, nextGroupIds, organizationId))
      })
    )

    this.initialSelectedXpertIds.set([...this.selectedXpertIds()])
  }
}
