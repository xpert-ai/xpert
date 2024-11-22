import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, input, model } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatDialogModule } from '@angular/material/dialog'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { MatTooltipModule } from '@angular/material/tooltip'
import { NgmDensityDirective, NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { CredentialsType, ToolProviderCredentials } from 'apps/cloud/src/app/@core'
import { RemoteSelectComponent } from 'apps/cloud/src/app/@shared'
import { isNil } from 'lodash-es'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    MatDialogModule,
    MatTooltipModule,
    MatSlideToggleModule,
    NgmI18nPipe,
    RemoteSelectComponent,
    NgmDensityDirective
  ],
  selector: 'xpert-tool-builtin-credential',
  templateUrl: './credential.component.html',
  styleUrl: 'credential.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [NgxControlValueAccessor],
  host: {
    '[class.block]': '!inlineBlock()',
    '[class.w-full]': '!inlineBlock()',
    '[class.inline-block]': 'inlineBlock()',
  }
})
export class XpertToolBuiltinCredentialComponent {
  eCredentialsType = CredentialsType

  protected cva = inject<NgxControlValueAccessor<Partial<Record<string, unknown>> | null>>(NgxControlValueAccessor)
  
  readonly credential = input<ToolProviderCredentials>(null)
  readonly credentials = input<Record<string, unknown>>(null)

  readonly valueModel = this.cva.value$

  readonly inlineBlock = computed(() => {
    return this.credential()?.type === CredentialsType.BOOLEAN
  })

  readonly params = computed(() => {
    return this.credential()?.depends?.reduce((acc, name) => {
        if (isNil(this.credentials()?.[name])) {
            return acc
        }
        acc[name] = this.credentials()[name]
        return acc
    }, {})
  })
}
