import { CdkListboxModule } from '@angular/cdk/listbox'
import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog'
import { ButtonGroupDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ApiProviderAuthType } from 'apps/cloud/src/app/@core'
import { MaterialModule } from 'apps/cloud/src/app/@shared/material.module'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    FormsModule,
    ReactiveFormsModule,
    MaterialModule,
    CdkListboxModule,
    ButtonGroupDirective,
  ],
  selector: 'xpert-tool-authorization',
  templateUrl: 'authorization.component.html',
  styleUrls: ['authorization.component.scss']
})
export class XpertToolAuthorizationComponent {
  eApiProviderAuthType = ApiProviderAuthType

  readonly data = inject(MAT_DIALOG_DATA)
  readonly #formBuilder = inject(FormBuilder)
  readonly #dialogRef = inject(MatDialogRef)
    
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
}