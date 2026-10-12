import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import {
  XpDialogFrameImports,
  XpHighlightDirective,
  ZardButtonComponent,
  ZardIconComponent,
  ZardSearchInputComponent
} from '@xpert-ai/headless-ui'
import { IOrganization } from '../../../../@core'
import { OrgAvatarComponent } from '../../../../@shared/organization'

export interface InviteOrganizationSelectDialogData {
  organizations: IOrganization[]
  selectedOrganizationId?: string | null
}

@Component({
  standalone: true,
  selector: 'xp-invite-organization-select',
  templateUrl: './invite-organization-select.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex max-w-2xl flex-col'
  },
  imports: [
    ...XpDialogFrameImports,
    CommonModule,
    FormsModule,
    DragDropModule,
    TranslateModule,
    ZardSearchInputComponent,
    XpHighlightDirective,
    OrgAvatarComponent,
    ZardButtonComponent,
    ZardIconComponent
  ]
})
export class InviteOrganizationSelectComponent {
  readonly dialogRef = inject(DialogRef<IOrganization | undefined>)
  readonly data = inject<InviteOrganizationSelectDialogData>(DIALOG_DATA)

  readonly searchTerm = signal('')
  readonly selectedOrganizationId = signal(this.data.selectedOrganizationId ?? this.data.organizations[0]?.id ?? null)
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
    () => this.data.organizations.find((organization) => organization.id === this.selectedOrganizationId()) ?? null
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
