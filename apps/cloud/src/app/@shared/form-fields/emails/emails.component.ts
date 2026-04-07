
import { Component, Input, forwardRef } from '@angular/core'
import { ControlValueAccessor, ReactiveFormsModule, NG_VALUE_ACCESSOR } from '@angular/forms'
import { NgmFieldAppearance, NgmFieldColor } from "@metad/ocap-angular/core";
import { TranslateModule } from '@ngx-translate/core'
import { ZardFormImports, ZardTagSelectComponent } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  imports: [ZardTagSelectComponent, ...ZardFormImports, ReactiveFormsModule, TranslateModule],
  selector: 'pac-form-field-emails',
  templateUrl: 'emails.component.html',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: forwardRef(() => FormFieldEmailsComponent),
    }
  ]
})
export class FormFieldEmailsComponent implements ControlValueAccessor {
  
  @Input() appearance: NgmFieldAppearance
  @Input() label: string
  @Input() placeholder: string
  @Input() color: NgmFieldColor = undefined
  @Input() removable: boolean

  keywords: string[] = []
  _onChange: (value: string[]) => void

  writeValue(obj: any): void {
    this.keywords = Array.isArray(obj) ? obj.filter(Boolean) : []
  }
  registerOnChange(fn: any): void {
    this._onChange = fn
  }
  registerOnTouched(fn: any): void {
  }
  setDisabledState?(isDisabled: boolean): void {
  }

  onValueChange(value: unknown[]) {
    this.keywords = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
    this._onChange?.(this.keywords)
  }
}
