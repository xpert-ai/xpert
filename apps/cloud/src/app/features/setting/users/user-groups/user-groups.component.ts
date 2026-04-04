import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { NgmSpinComponent, NgmTableComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { BehaviorSubject, combineLatest, firstValueFrom } from 'rxjs'
import { map, switchMap } from 'rxjs/operators'
import {
  getErrorMessage,
  injectToastr,
  injectUserGroupAPI,
  IOrganization,
  IUserGroup,
  IUserOrganization,
  OrderTypeEnum,
  UsersOrganizationsService
} from '../../../../@core'
import { TranslationBaseComponent } from '../../../../@shared/language'
import { ButtonGroupDirective } from '@metad/ocap-angular/core'
import { ZardButtonComponent, ZardSwitchComponent } from '@xpert-ai/headless-ui'
import { PACEditUserComponent } from '../edit-user/edit-user.component'

type TMembershipWithOrganization = IUserOrganization & {
  organization?: IOrganization | null
}

@Component({
  standalone: true,
  selector: 'pac-user-groups',
  templateUrl: './user-groups.component.html',
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    ButtonGroupDirective,
    ZardButtonComponent,
    ZardSwitchComponent,
    NgmTableComponent,
    NgmSpinComponent
  ]
})
export class PACUserGroupsComponent extends TranslationBaseComponent {
  readonly #userComponent = inject(PACEditUserComponent)
  readonly #userOrganizationsService = inject(UsersOrganizationsService)
  readonly #userGroupService = injectUserGroupAPI()
  readonly #toastr = injectToastr()

  readonly #refresh$ = new BehaviorSubject<void>(undefined)

  readonly loading = signal(false)
  readonly savingGroupId = signal<string | null>(null)
  readonly selectedOrganizationId = signal<string | null>(null)
  readonly groups = signal<IUserGroup[]>([])

  readonly memberships = toSignal(
    combineLatest([this.#userComponent.userId$, this.#refresh$]).pipe(
      switchMap(([userId]) =>
        this.#userOrganizationsService.getAll(['organization'], {
          userId,
          isActive: true
        })
      ),
      map(({ items }) => this.sortMemberships(items as TMembershipWithOrganization[]))
    ),
    { initialValue: [] }
  )

  readonly selectedMembership = computed(
    () => this.memberships().find((membership) => membership.organizationId === this.selectedOrganizationId()) ?? null
  )
  readonly selectedOrganization = computed(() => this.selectedMembership()?.organization ?? null)
  readonly user = this.#userComponent.user
  readonly userId = computed(() => this.user()?.id ?? null)
  readonly hasMemberships = computed(() => this.memberships().length > 0)

  constructor() {
    super()

    effect(() => {
      const memberships = this.memberships()
      const currentOrganizationId = this.selectedOrganizationId()

      if (!memberships.length) {
        this.selectedOrganizationId.set(null)
        this.groups.set([])
        return
      }

      if (currentOrganizationId && memberships.some((membership) => membership.organizationId === currentOrganizationId)) {
        return
      }

      this.selectedOrganizationId.set(memberships[0]?.organizationId ?? null)
    })

    effect(() => {
      const organizationId = this.selectedOrganizationId()
      if (!organizationId) {
        this.groups.set([])
        return
      }

      void this.loadGroups(organizationId)
    })
  }

  selectOrganization(organizationId: string) {
    if (!organizationId || organizationId === this.selectedOrganizationId()) {
      return
    }

    this.selectedOrganizationId.set(organizationId)
  }

  groupById(id: string) {
    return this.groups().find((group) => group.id === id) ?? null
  }

  groupMemberCount(group: IUserGroup) {
    return group.members?.length ?? 0
  }

  isJoined(group: IUserGroup) {
    const userId = this.userId()
    return !!userId && !!group.members?.some((member) => member.id === userId)
  }

  async updateMembership(group: IUserGroup, joined: boolean) {
    const userId = this.userId()
    const organizationId = this.selectedOrganizationId()
    if (!userId || !organizationId) {
      return
    }

    const currentMemberIds = [...new Set((group.members ?? []).map((member) => member.id).filter(Boolean))]
    const nextMemberIds = joined
      ? [...new Set([...currentMemberIds, userId])]
      : currentMemberIds.filter((id) => id !== userId)

    this.savingGroupId.set(group.id)
    try {
      await firstValueFrom(this.#userGroupService.updateMembers(group.id, nextMemberIds, organizationId))
      this.#toastr.success('PAC.MESSAGE.UpdateSuccess', { Default: 'Saved successfully' })
      await this.loadGroups(organizationId)
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.savingGroupId.set(null)
    }
  }

  private async loadGroups(organizationId: string) {
    this.loading.set(true)
    try {
      const { items } = await firstValueFrom(
        this.#userGroupService.getAllByOrganization(organizationId, {
          relations: ['members'],
          order: {
            updatedAt: OrderTypeEnum.DESC
          }
        })
      )

      this.groups.set(items ?? [])
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
      this.groups.set([])
    } finally {
      this.loading.set(false)
    }
  }

  private sortMemberships(memberships: TMembershipWithOrganization[]) {
    return [...(memberships ?? [])].sort((left, right) => {
      if ((left.isDefault ?? false) !== (right.isDefault ?? false)) {
        return Number(right.isDefault) - Number(left.isDefault)
      }

      return (left.organization?.name ?? '').localeCompare(right.organization?.name ?? '')
    })
  }
}
