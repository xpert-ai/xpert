import { FormsModule } from '@angular/forms'
import { CommonModule } from '@angular/common'
import { Component, Input, computed, effect, inject, signal } from '@angular/core'
import { XpSpinComponent, XpTableComponent, ZardSearchInputComponent, ZardButtonComponent } from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import {
  IBusinessArea,
  IBusinessAreaAccessGrant,
  BusinessAreaService,
  IUserGroup,
  OrderTypeEnum,
  UserGroupService,
  getErrorMessage,
  injectToastr
} from '../../../../@core'
import { BusinessAreaAccessComponent } from '../../business-area/business-area-access.component'
import { TranslationBaseComponent } from '../../../../@shared/language'

@Component({
  standalone: true,
  selector: 'xp-organization-user-groups',
  templateUrl: './organization-user-groups.component.html',
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    XpTableComponent,
    XpSpinComponent,
    ZardSearchInputComponent,
    ZardButtonComponent,
    BusinessAreaAccessComponent
  ],
  host: { class: 'block min-w-0 w-full' }
})
export class OrganizationUserGroupsComponent extends TranslationBaseComponent {
  readonly #userGroupService = inject(UserGroupService)
  readonly #areas = inject(BusinessAreaService)
  readonly selectedGroupId = signal('')
  readonly selectedAreaId = signal('')
  readonly groupGrants = signal<IBusinessAreaAccessGrant[]>([])
  readonly areas = signal<IBusinessArea[]>([])
  readonly grantsLoading = signal(false)

  async selectGroup(id: string) {
    this.selectedGroupId.set(id)
    this.selectedAreaId.set('')
    this.groupGrants.set([])
    if (!id) return
    this.grantsLoading.set(true)
    try {
      const [grants, areas] = await Promise.all([
        firstValueFrom(this.#areas.groupGrants(id)),
        firstValueFrom(this.#areas.getAll())
      ])
      if (this.selectedGroupId() !== id) return
      this.groupGrants.set(grants)
      this.areas.set(areas.items)
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      if (this.selectedGroupId() === id) this.grantsLoading.set(false)
    }
  }

  areaName(id: string) {
    return this.areas().find((area) => area.id === id)?.name ?? id
  }

  readonly #toastr = injectToastr()

  readonly #organizationId = signal<string | null>(null)

  @Input() set organizationId(value: string | null) {
    this.#organizationId.set(value ?? null)
  }

  readonly groups = signal<IUserGroup[]>([])
  readonly loading = signal(false)
  readonly loadFailed = signal(false)
  readonly search = signal('')
  readonly visibleGroups = computed(() => {
    const search = this.search().trim().toLocaleLowerCase()
    return this.groups().filter(
      (group) => !search || [group.name, group.description].some((value) => value?.toLocaleLowerCase().includes(search))
    )
  })

  refresh() {
    const id = this.#organizationId()
    if (id) void this.loadGroups(id)
  }

  constructor() {
    super()

    effect(() => {
      const organizationId = this.#organizationId()
      this.selectedGroupId.set('')
      this.selectedAreaId.set('')
      this.groupGrants.set([])
      if (!organizationId) {
        this.groups.set([])
        return
      }

      void this.loadGroups(organizationId)
    })
  }

  private async loadGroups(organizationId: string) {
    this.loading.set(true)
    this.loadFailed.set(false)
    try {
      const { items } = await firstValueFrom(
        this.#userGroupService.getAllByOrganization(organizationId, {
          relations: ['members'],
          order: {
            updatedAt: OrderTypeEnum.DESC
          }
        })
      )

      if (organizationId === this.#organizationId()) this.groups.set(items ?? [])
    } catch (error) {
      if (organizationId !== this.#organizationId()) return
      this.loadFailed.set(true)
      this.groups.set([])
      this.#toastr.error(getErrorMessage(error))
    } finally {
      if (organizationId === this.#organizationId()) this.loading.set(false)
    }
  }
}
