
import { Component, forwardRef, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { ControlValueAccessor, FormGroup, FormsModule, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms'
import { cloneDeep } from '@xpert-ai/ocap-core'
import { FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { NGXLogger } from 'ngx-logger'
import { DesignerSchema, STORY_DESIGNER_SCHEMA } from '../types'

/**
 * Designer form component
 */
@Component({
  standalone: true,
  selector: 'ngm-schema-form',
  templateUrl: 'schema-form.component.html',
  styleUrls: ['schema-form.component.scss'],
  imports: [FormsModule, ReactiveFormsModule, FormlyModule, TranslateModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: forwardRef(() => NgmSchemaFormComponent)
    }
  ]
})
export class NgmSchemaFormComponent implements ControlValueAccessor {
  readonly #logger = inject(NGXLogger)
  private schema: DesignerSchema = inject(STORY_DESIGNER_SCHEMA)

  formGroup = new FormGroup({})
  model = {}
  options = {}

  readonly initial = signal(true)

  public readonly fields = toSignal(this.schema.getSchema())

  onChange: (input: any) => void
  onTouched: () => void

  writeValue(obj: any): void {
    if (obj) {
      this.formGroup.patchValue(obj)
      this.model = cloneDeep(obj)
    }
  }
  registerOnChange(fn: any): void {
    this.onChange = fn
  }
  registerOnTouched(fn: any): void {
    this.onTouched = fn
  }
  setDisabledState?(isDisabled: boolean): void {
    isDisabled ? this.formGroup.disable() : this.formGroup.enable()
  }

  onModelChange(event) {
    const title = this.schema.title()
    this.#logger.log(`[NgmSchemaFormComponent] schema '${title}' onModelChange value:`, event)
    this.onSubmit(event)
  }

  /**
   * Submit the form value back
   * @param value
   */
  onSubmit(value?: unknown) {
    const newValue = value ?? this.model
    this.onChange?.(newValue)
  }
}
