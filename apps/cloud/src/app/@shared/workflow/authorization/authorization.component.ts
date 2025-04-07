import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatSliderModule } from '@angular/material/slider'
import { MatTooltipModule } from '@angular/material/tooltip'
import { linkedModel } from '@metad/core'
import { NgmRadioSelectComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { ApiAuthType, TSelectOption, TWorkflowAuthorization, TWorkflowVarGroup } from '../../../@core/types'
import { XpertVariableInputComponent } from '../variable-input/input.component'

@Component({
  selector: 'xpert-workflow-authorization',
  templateUrl: './authorization.component.html',
  styleUrls: ['./authorization.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    CdkMenuModule,
    DragDropModule,
    TranslateModule,
    MatTooltipModule,
    MatSliderModule,
    NgmRadioSelectComponent,
    XpertVariableInputComponent
  ]
})
export class XpertWorkflowAuthorizationComponent {
  eApiProviderAuthType = ApiAuthType

  readonly data = inject<{ authorization: TWorkflowAuthorization; variables: TWorkflowVarGroup[] }>(DIALOG_DATA)
  readonly #dialogRef = inject(DialogRef)

  // States
  readonly authorization = signal<TWorkflowAuthorization>(this.data.authorization)
  readonly variables = signal<TWorkflowVarGroup[]>(this.data.variables)

  readonly authType = linkedModel({
    initialValue: null,
    compute: () => this.authorization()?.auth_type,
    update: (auth_type) => {
      this.authorization.update((state) => ({ ...state, auth_type }))
    }
  })
  readonly username = linkedModel({
    initialValue: null,
    compute: () => this.authorization()?.username,
    update: (username) => {
      this.authorization.update((state) => ({ ...state, username }))
    }
  })

  readonly password = linkedModel({
    initialValue: null,
    compute: () => this.authorization()?.password,
    update: (password) => {
      this.authorization.update((state) => ({ ...state, password }))
    }
  })
  readonly api_key_type = linkedModel({
    initialValue: null,
    compute: () => this.authorization()?.api_key_type,
    update: (api_key_type) => {
      this.authorization.update((state) => ({ ...state, api_key_type }))
    }
  })
  readonly api_key_header = linkedModel({
    initialValue: null,
    compute: () => this.authorization()?.api_key_header,
    update: (api_key_header) => {
      this.authorization.update((state) => ({ ...state, api_key_header }))
    }
  })
  readonly api_key_value = linkedModel({
    initialValue: null,
    compute: () => this.authorization()?.api_key_value,
    update: (api_key_value) => {
      this.authorization.update((state) => ({ ...state, api_key_value }))
    }
  })

  readonly AuthSelectOptions: TSelectOption<ApiAuthType>[] = [
    {
      value: ApiAuthType.NONE,
      label: 'None'
    },
    {
      value: ApiAuthType.API_KEY,
      label: 'API Key'
    },
    {
      value: ApiAuthType.BASIC,
      label: 'Basic'
    }
  ]

  readonly PrefixSelectOptions: TSelectOption<TWorkflowAuthorization['api_key_type']>[] = [
    {
      value: '',
      label: 'Basic'
    },
    {
      value: 'bearar',
      label: 'Bearar'
    },
    {
      value: 'custom',
      label: 'Custom'
    }
  ]

  save() {
    this.#dialogRef.close(this.authorization())
  }

  cancel() {
    this.#dialogRef.close()
  }
}
