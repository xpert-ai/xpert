import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core'
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { ICopilotModel, injectToastr, TAvatar, XpertService } from 'apps/cloud/src/app/@core'
import { XpertBasicFormComponent } from '../basic-form/basic-form.component'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    RouterModule,
    DragDropModule,
    XpertBasicFormComponent
  ],
  selector: 'xpert-basic-dialog',
  templateUrl: 'basic-dialog.component.html',
  styleUrl: 'basic-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: []
})
export class XpertBasicDialogComponent {
  readonly #data = inject<{ name: string; avatar: TAvatar; description: string; title: string; copilotModel: ICopilotModel }>(DIALOG_DATA)
  readonly #dialogRef = inject(DialogRef)
  readonly xpertService = inject(XpertService)
  readonly #fb = inject(FormBuilder)
  readonly #toastr = injectToastr()

  readonly formGroup = this.#fb.group(this.#data)

  get name() {
    return this.formGroup.value.name
  }
  set name(value) {
    this.formGroup.patchValue({ name: value })
  }

  get avatar() {
    return this.formGroup.value.avatar
  }
  set avatar(value) {
    this.formGroup.patchValue({ avatar: value })
  }

  get copilotModel() {
    return this.formGroup.value.copilotModel
  }
  set copilotModel(value) {
    this.formGroup.patchValue({ copilotModel: value })
  }

  get title() {
    return this.formGroup.value.title
  }
  set title(value) {
    this.formGroup.patchValue({ title: value })
  }

  get description() {
    return this.formGroup.value.description
  }
  set description(value) {
    this.formGroup.patchValue({ description: value })
  }

  close() {
    this.#dialogRef.close()
  }

  apply() {
    this.#dialogRef.close(this.formGroup.value)
  }
}
