import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, HostBinding, computed, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgmDialogComponent } from '@metad/components/dialog'
import { NgmHighlightDirective, NgmSearchComponent } from '@metad/ocap-angular/common'
import { ButtonGroupDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { IOrganization } from '../../../../@core'
import { OrgAvatarComponent } from '../../../../@shared/organization'
import { ZardButtonComponent, ZardIconComponent } from '@xpert-ai/headless-ui'

export interface InviteOrganizationSelectDialogData {
  organizations: IOrganization[]
  selectedOrganizationId?: string | null
}

@Component({
  standalone: true,
  selector: 'pac-invite-organization-select',
  templateUrl: './invite-organization-select.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex max-w-2xl flex-col'
  },
  imports: [
    CommonModule,
    FormsModule,
    DragDropModule,
    TranslateModule,
    NgmDialogComponent,
    NgmSearchComponent,
    NgmHighlightDirective,
    ButtonGroupDirective,
    OrgAvatarComponent,
    ZardButtonComponent,
    ZardIconComponent
  ]
})
export class InviteOrganizationSelectComponent {
  @HostBinding('class.ngm-dialog-container') isDialogContainer = true

  readonly dialogRef = inject(DialogRef<IOrganization | undefined>)
  readonly data = inject<InviteOrganizationSelectDialogData>(DIALOG_DATA)

  readonly searchTerm = signal('')
  readonly selectedOrganizationId = signal(
    this.data.selectedOrganizationId ?? this.data.organizations[0]?.id ?? null
  )
  readonly organizations = computed(() => {
    const keyword = this.searchTerm().trim().toLowerCase()
    if (!keyword) {
      return this.data.organizations
    }

    return this.data.organizations.filter((organization) =>
      [organization.name, organization.officialName, organization.profile_link]
        .filter(Boolean)
        .some((value) => `${value}`.toLowerCase().includes(keyword))
    )
  })
  readonly selectedOrganization = computed(
    () =>
      this.data.organizations.find(
        (organization) => organization.id === this.selectedOrganizationId()
      ) ?? null
  )

  trackById(_: number, organization: IOrganization) {
    return organization.id
  }

  selectOrganization(organization: IOrganization) {
    this.selectedOrganizationId.set(organization.id)
  }

  apply() {
    this.dialogRef.close(this.selectedOrganization() ?? undefined)
  }

  cancel() {
    this.dialogRef.close()
  }
}
