import { CommonModule } from '@angular/common'
import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal
} from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { MatTooltipModule } from '@angular/material/tooltip'
import { XpToolParametersFormComponent } from '@cloud/app/@shared/xpert'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { NgmDensityDirective, NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  getErrorMessage,
  IXpertTool,
  IXpertToolset,
  ToastrService,
  TToolParameter,
  XpertToolService,
  XpertToolsetService
} from 'apps/cloud/src/app/@core'
import { isNil, omit } from 'lodash-es'
import { Subscription } from 'rxjs'
import { JsonSchema7ObjectType } from 'zod-to-json-schema'


@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    MatTooltipModule,
    MatSlideToggleModule,
    NgmDensityDirective,
    NgmSpinComponent,
    XpToolParametersFormComponent
  ],
  selector: 'xpert-toolset-tool-test',
  templateUrl: './tool.component.html',
  styleUrl: 'tool.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertToolsetToolTestComponent {
  readonly toolsetService = inject(XpertToolsetService)
  readonly #toastr = inject(ToastrService)
  readonly toolService = inject(XpertToolService)

  // Inputs
  readonly tool = input<IXpertTool>()
  readonly toolset = input<IXpertToolset>()
  readonly disabled = input<boolean>(false)
  readonly visibleAll = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })
  readonly enabled = model<boolean>()

  // Outputs
  readonly saveParameters = output<Record<string, string>>()

  // Inner States
  readonly toolId = computed(() => this.tool()?.id)

  readonly toolAvatar = computed(() => this.tool()?.avatar)

  // Buildin Tools schema or JSON schema
  readonly schema = computed(() => this.tool()?.schema)
  readonly parameterList = computed<TToolParameter[]>(() => {
    const parameters = this.schema()?.parameters ?? this.tool()?.provider?.parameters
    return parameters?.filter((_) => isNil(_.visible) || _.visible || this.visibleAll())
  })

  readonly parameters = model<Record<string, any>>(null)
  readonly invalid = computed(() => this.parameterList()?.some((param) => param.required && isNil(this.parameters()?.[param.name])))
  readonly testResult = signal(null)

  readonly loading = signal(false)
  #testSubscription: Subscription = null

  constructor() {
    effect(() => {
      // console.log(this.schema())
    })
  }

  saveAsDefault() {
    this.saveParameters.emit(this.parameters())
  }

  onParameter(name: string, event: any) {
    this.parameters.update((state) => ({
      ...(state ?? {}),
      [name]: event
    }))
  }

  testTool() {
    this.loading.set(true)
    this.testResult.set(null)
    this.#testSubscription = this.toolService
      .test({
        ...this.tool(),
        toolset: this.toolset() ? omit(this.toolset(), 'tools') : this.tool().toolset,
        parameters: this.parameters(),
      })
      .subscribe({
        next: (result) => {
          this.loading.set(false)
          if (result) {
            this.testResult.set(result)
          } else {
            this.testResult.set(null)
          }
        },
        error: (error) => {
          this.#toastr.error(getErrorMessage(error))
          this.loading.set(false)
          this.testResult.set(JSON.stringify(getErrorMessage(error), null, 4))
        }
      })
  }

  stopTestTool() {
    this.#testSubscription?.unsubscribe()
    this.loading.set(false)
  }
}
