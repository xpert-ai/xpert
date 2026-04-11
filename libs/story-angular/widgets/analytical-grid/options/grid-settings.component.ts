
import { Component, forwardRef, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { ControlValueAccessor, FormGroup, FormsModule, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms'
import { cloneDeep } from '@xpert-ai/ocap-core'
import { FormlyModule } from '@ngx-formly/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { map } from 'rxjs/operators'
import { getGridOptionsSchema } from '../analytical-grid.schema'

@Component({
  standalone: true,
  imports: [FormsModule, ReactiveFormsModule, TranslateModule, FormlyModule],
  selector: 'ngm-grid-settings',
  templateUrl: 'grid-settings.component.html',
  styles: [],
  host: {
    class: 'ngm-grid-settings'
  },
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: forwardRef(() => NgmGridSettingsComponent)
    }
  ]
})
export class NgmGridSettingsComponent implements ControlValueAccessor {
  private readonly translateService = inject(TranslateService)

  formGroup = new FormGroup({})

  fields = toSignal(
    this.translateService.stream('Story.Widgets').pipe(map(getGridOptionsSchema))
  )

  model = {}
  options = {}

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
    this.onChange(event)
  }
}
