import { XpDialogFrameImports } from '@xpert-ai/headless-ui'
import { DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { Component, inject, model } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'
import { IOrganizationCreateInput } from 'apps/cloud/src/app/@core/types'
import { OrganizationStepFormComponent } from '../organization-step-form/organization-step-form.component'

@Component({
  imports: [
    ...XpDialogFrameImports,
    CommonModule,
    FormsModule,
    DragDropModule,
    TranslateModule,
    ZardButtonComponent,
    OrganizationStepFormComponent
  ],
  templateUrl: './organization-mutation.component.html'
})
export class OrganizationMutationComponent {
  readonly dialogRef = inject(DialogRef<IOrganizationCreateInput>)

  readonly organization = model<IOrganizationCreateInput>({} as IOrganizationCreateInput)

  onApply() {
    this.dialogRef.close(this.organization())
  }

  onCancel() {
    this.dialogRef.close()
  }
}
