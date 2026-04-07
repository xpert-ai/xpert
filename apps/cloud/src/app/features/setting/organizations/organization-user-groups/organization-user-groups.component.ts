import { CommonModule } from '@angular/common'
import { Component, Input, effect, inject, signal } from '@angular/core'
import { NgmSpinComponent, NgmTableComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import {
  IUserGroup,
  OrderTypeEnum,
  UserGroupService,
  getErrorMessage,
  injectToastr
} from '../../../../@core'
import { TranslationBaseComponent } from '../../../../@shared/language'

@Component({
  standalone: true,
  selector: 'pac-organization-user-groups',
  templateUrl: './organization-user-groups.component.html',
  imports: [CommonModule, TranslateModule, NgmTableComponent, NgmSpinComponent]
})
export class OrganizationUserGroupsComponent extends TranslationBaseComponent {
  readonly #userGroupService = inject(UserGroupService)
  readonly #toastr = injectToastr()

  readonly #organizationId = signal<string | null>(null)

  @Input() set organizationId(value: string | null) {
    this.#organizationId.set(value ?? null)
  }

  readonly groups = signal<IUserGroup[]>([])
  readonly loading = signal(false)

  constructor() {
    super()

    effect(() => {
      const organizationId = this.#organizationId()
      if (!organizationId) {
        this.groups.set([])
        return
      }

      void this.loadGroups(organizationId)
    })
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
      this.groups.set([])
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.loading.set(false)
    }
  }
}
