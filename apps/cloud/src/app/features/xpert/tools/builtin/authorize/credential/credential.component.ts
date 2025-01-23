import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, model } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatDialogModule } from '@angular/material/dialog'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { MatTooltipModule } from '@angular/material/tooltip'
import { NgmRemoteSelectComponent } from '@metad/ocap-angular/common'
import { NgmDensityDirective, NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { CredentialsType, ToolProviderCredentials } from 'apps/cloud/src/app/@core'
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
    NgmRemoteSelectComponent,
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

  protected cva = inject<NgxControlValueAccessor<unknown | null>>(NgxControlValueAccessor)
  
  readonly credential = input<ToolProviderCredentials>(null)
  readonly credentials = input<Record<string, unknown>>(null)

  readonly valueModel = this.cva.value$

  readonly inlineBlock = computed(() => this.credential()?.type === CredentialsType.BOOLEAN)
  readonly placeholder = computed(() => this.credential()?.placeholder)

  readonly params = computed(() => {
    const credentials = this.credentials()
    return this.credential()?.depends?.reduce((acc, name) => {
        if (isNil(credentials?.[name])) {
            return acc
        }
        acc[name] = credentials[name]
        return acc
    }, {})
  })

  readonly options = computed(() => this.credential()?.options)

  constructor() {
    effect(() => {
      if (this.valueModel() === undefined && !isNil(this.credential()?.default)) {
        this.valueModel.set(this.credential().default)
      }
    }, { allowSignalWrites: true })
  }
}
