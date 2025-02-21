import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, input } from '@angular/core'
import { FormGroup, FormsModule } from '@angular/forms'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { assign, isNil } from 'lodash-es'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { toFormlySchema } from '../../../@core'
import { ParameterTypeEnum, TParameterSchema } from '../../../@core/types'
import { ParameterComponent } from '../parameter/parameter.component'

/**
 */
@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, FormlyModule, ParameterComponent],
  selector: 'parameter-form',
  templateUrl: 'form.component.html',
  styleUrls: ['form.component.scss'],
  hostDirectives: [NgxControlValueAccessor]
})
export class ParameterFormComponent {
  eParameterTypeEnum = ParameterTypeEnum

  protected cva = inject<NgxControlValueAccessor<Record<string, unknown>>>(NgxControlValueAccessor)
  readonly i18n = new NgmI18nPipe()

  // Inputs
  readonly schema = input<TParameterSchema>()

  // Attrs
  get invalid() {
    return this.#invalid()
  }

  // States
  readonly type = computed(() => this.schema().type)
  readonly parameters = computed(() => this.schema().parameters)
  readonly fields = computed(() => (this.schema()?.properties ? toFormlySchema(this.schema(), this.i18n) : null))

  readonly value$ = this.cva.value$

  readonly form = new FormGroup({})
  optionsModel = {}
  formOptions = {}

  readonly #invalid = computed(() => {
    if (this.schema().required?.length) {
      return this.schema().required.some((name) => isNil(this.value$()?.[name]))
    }
    return false
  })

  constructor() {
    effect(
      () => {
        if (this.fields() && this.value$()) {
          assign(this.optionsModel, this.value$())
        }
      },
      { allowSignalWrites: true }
    )
  }

  updateValue(name: string, value: unknown) {
    this.value$.update((state) => ({ ...(state ?? {}), [name]: value }))
  }

  updateValues() {
    this.value$.update((state) => ({ ...(state ?? {}), ...this.optionsModel }))
  }

  isRequired(name: string) {
    return this.schema().required?.includes(name)
  }
}
