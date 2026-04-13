
import { Component, inject } from '@angular/core'
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms'

import { ToastrService } from '@xpert-ai/cloud/state'
import { NgmInputComponent } from '@xpert-ai/ocap-angular/common'
import { ButtonGroupDirective, OcapCoreModule } from '@xpert-ai/ocap-angular/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { AuthInfoType } from '../types'
import { Z_SHEET_DATA, ZardButtonComponent, ZardCheckboxComponent, ZardSheetRef } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  imports: [
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
  readonly data = inject<{ name: string; ping: (auth: AuthInfoType) => Promise<any> }>(Z_SHEET_DATA)
  readonly #sheetRef = inject(ZardSheetRef<BottomSheetBasicAuthComponent, AuthInfoType | undefined>)

  form = this.#formBuilder.group<AuthInfoType>({
    username: '',
    password: '',
    remeberMe: true
  })

  constructor(private toastrService: ToastrService) {}

  async onSubmit() {
    try {
      await this.data.ping({ ...this.form.value } as AuthInfoType)
      this.#sheetRef.close(this.form.value as AuthInfoType)
    } catch (err) {
      this.toastrService.error(
        this.#translate.instant('PAC.MESSAGE.UserAuthenticationFailure', { Default: 'User authentication failure' })
      )
    }
  }

  onCancel() {
    this.#sheetRef.close()
  }
}
