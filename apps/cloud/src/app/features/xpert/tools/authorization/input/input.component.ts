import { CdkListboxModule } from '@angular/cdk/listbox'
import { CommonModule } from '@angular/common'
import { Component, computed, inject } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatDialog } from '@angular/material/dialog'
import { ButtonGroupDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ApiProviderAuthType } from 'apps/cloud/src/app/@core'
import { MaterialModule } from 'apps/cloud/src/app/@shared/material.module'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { XpertToolAuthorizationComponent } from '../dialog/authorization.component'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    FormsModule,
    ReactiveFormsModule,
    MaterialModule,
    CdkListboxModule,
    ButtonGroupDirective
  ],
  selector: 'xpert-tool-authorization-input',
  templateUrl: 'input.component.html',
  styleUrls: ['input.component.scss'],
  hostDirectives: [NgxControlValueAccessor]
})
export class XpertToolAuthorizationInputComponent {
  eApiProviderAuthType = ApiProviderAuthType

  readonly #dialog = inject(MatDialog)
  protected cva = inject<NgxControlValueAccessor<Record<string, string> | null>>(NgxControlValueAccessor)

  readonly credentials = computed(() => this.cva.value$() ?? {})

  openAuth() {
    const credentials = this.credentials() ?? {}
    this.#dialog
      .open(XpertToolAuthorizationComponent, {
        data: {
          ...credentials,
          auth_type: credentials.auth_type ? [credentials.auth_type] : [],
          api_key_header_prefix: credentials.api_key_header_prefix ? [credentials.api_key_header_prefix] : []
        }
      })
      .afterClosed()
      .subscribe((value) => {
        if (value) {
          this.cva.value$.set({
            ...value,
            api_key_header_prefix: value.api_key_header_prefix[0],
            auth_type: value.auth_type[0]
          })
        }
      })
  }
}
