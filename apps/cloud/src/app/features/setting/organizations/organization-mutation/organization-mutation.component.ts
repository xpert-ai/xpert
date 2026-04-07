import { DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { Component, HostBinding, inject, model } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { UiDialogCloseDirective, ZardButtonComponent, ZardDialogComponent } from '@xpert-ai/headless-ui'
import { IOrganizationCreateInput } from 'apps/cloud/src/app/@core/types'
import { OrganizationStepFormComponent } from '../organization-step-form/organization-step-form.component'

@Component({
  imports: [
    CommonModule,
    FormsModule,
    DragDropModule,
    TranslateModule,
    ZardDialogComponent,
    ZardButtonComponent,
    OrganizationStepFormComponent,
    UiDialogCloseDirective
  ],
  templateUrl: './organization-mutation.component.html',
  styleUrls: ['./organization-mutation.component.scss']
})
export class OrganizationMutationComponent {
  @HostBinding('class.ngm-dialog-container') isDialogContainer = true
  readonly dialogRef = inject(DialogRef<IOrganizationCreateInput>)

  readonly organization = model<IOrganizationCreateInput>({} as IOrganizationCreateInput)

  onApply() {
    this.dialogRef.close(this.organization())
  }

  onCancel() {
    this.dialogRef.close()
  }
}
