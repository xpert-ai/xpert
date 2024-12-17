import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ButtonGroupDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ApiProviderAuthType } from 'apps/cloud/src/app/@core'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    FormsModule,
    ReactiveFormsModule,
    CdkListboxModule,
    DragDropModule,
    ButtonGroupDirective,
    MatTooltipModule,
    MatButtonModule
  ],
  selector: 'xpert-tool-authorization',
  templateUrl: 'authorization.component.html',
  styleUrls: ['authorization.component.scss']
})
export class XpertToolAuthorizationComponent {
  eApiProviderAuthType = ApiProviderAuthType

  readonly data = inject(DIALOG_DATA)
  readonly #formBuilder = inject(FormBuilder)
  readonly #dialogRef = inject(DialogRef)
    
  readonly formGroup = this.#formBuilder.group({
    auth_type: this.#formBuilder.control(ApiProviderAuthType.NONE),
    api_key_header_prefix: this.#formBuilder.control<'' | 'bearar' | 'custom'>(''),
    api_key_header: this.#formBuilder.control('Authorization'),
    api_key_value: this.#formBuilder.control(null),
    username: this.#formBuilder.control(null),
    password: this.#formBuilder.control(null),
  })

  get authType() {
    return this.formGroup.get('auth_type').value?.[0]
  }

  constructor() {
    if (this.data) {
      this.formGroup.patchValue(this.data)
    }
  }

  save() {
    this.#dialogRef.close(this.formGroup.value)
  }

  cancel() {
    this.#dialogRef.close()
  }
}