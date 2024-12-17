import { CommonModule } from '@angular/common'
import { Component, computed, inject } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { ApiProviderAuthType } from 'apps/cloud/src/app/@core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { XpertToolAuthorizationComponent } from '../dialog/authorization.component'
import { Dialog } from '@angular/cdk/dialog'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    FormsModule,
    ReactiveFormsModule,
  ],
  selector: 'xpert-tool-authorization-input',
  templateUrl: 'input.component.html',
  styleUrls: ['input.component.scss'],
  hostDirectives: [NgxControlValueAccessor]
})
export class XpertToolAuthorizationInputComponent {
  eApiProviderAuthType = ApiProviderAuthType

  readonly #dialog = inject(Dialog)
  protected cva = inject<NgxControlValueAccessor<Record<string, string> | null>>(NgxControlValueAccessor)

  readonly credentials = computed(() => this.cva.value$() ?? {})

  openAuth() {
    const credentials = this.credentials() ?? {}
    this.#dialog
      .open<{api_key_header_prefix: string[]; auth_type: string[]}>(XpertToolAuthorizationComponent, {
        data: {
          ...credentials,
          auth_type: credentials.auth_type ? [credentials.auth_type] : [],
          api_key_header_prefix: credentials.api_key_header_prefix ? [credentials.api_key_header_prefix] : []
        }
      })
      .closed
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
