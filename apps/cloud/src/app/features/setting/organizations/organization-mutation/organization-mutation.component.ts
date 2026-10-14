import { XpDialogFrameImports } from '@xpert-ai/headless-ui'
import { DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { Component, inject, viewChild } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'
import { IOrganizationCreateInput } from 'apps/cloud/src/app/@core/types'
import { OrganizationStepFormComponent } from '../organization-step-form/organization-step-form.component'

@Component({
  imports: [
    ...XpDialogFrameImports,
    CommonModule,
    DragDropModule,
    TranslateModule,
    ZardButtonComponent,
    OrganizationStepFormComponent
  ],
  templateUrl: './organization-mutation.component.html'
})
export class OrganizationMutationComponent {
  readonly dialogRef = inject(DialogRef<IOrganizationCreateInput>)

  readonly stepForm = viewChild.required(OrganizationStepFormComponent)

  onApply() {
    const form = this.stepForm().form
    if (form.invalid) {
      form.markAllAsTouched()
      return
    }
    this.dialogRef.close(form.getRawValue() as IOrganizationCreateInput)
  }

  onCancel() {
    this.dialogRef.close()
  }
}
