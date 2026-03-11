import { CommonModule } from '@angular/common'
import { Component, Inject, inject } from '@angular/core'
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MAT_BOTTOM_SHEET_DATA, MatBottomSheetRef } from '@angular/material/bottom-sheet'

import { ToastrService } from '@metad/cloud/state'
import { NgmInputComponent } from '@metad/ocap-angular/common'
import { ButtonGroupDirective, OcapCoreModule } from '@metad/ocap-angular/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { AuthInfoType } from '../types'
import { ZardButtonComponent, ZardCheckboxComponent } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ZardButtonComponent,
    ZardCheckboxComponent,
    TranslateModule,

    ButtonGroupDirective,
    OcapCoreModule,
    NgmInputComponent
  ],
  selector: 'bottom-sheet-basic',
  templateUrl: 'bottom-sheet-basic.component.html'
})
export class BottomSheetBasicAuthComponent {
  readonly #formBuilder = inject(FormBuilder)
  readonly #translate = inject(TranslateService)

  form = this.#formBuilder.group<AuthInfoType>({
    username: '',
    password: '',
    remeberMe: true
  })

  constructor(
    @Inject(MAT_BOTTOM_SHEET_DATA)
    public data: { name: string; ping: (auth: AuthInfoType) => Promise<any> },
    private _bottomSheetRef: MatBottomSheetRef<BottomSheetBasicAuthComponent>,
    private toastrService: ToastrService
  ) {}

  async onSubmit() {
    try {
      await this.data.ping({ ...this.form.value } as AuthInfoType)
      this._bottomSheetRef.dismiss(this.form.value)
    } catch (err) {
      this.toastrService.error(
        this.#translate.instant('PAC.MESSAGE.UserAuthenticationFailure', { Default: 'User authentication failure' })
      )
    }
  }

  onCancel() {
    this._bottomSheetRef.dismiss()
  }
}
