
import { Component, Input, OnInit, forwardRef } from '@angular/core'
import { ControlValueAccessor, FormControl, ReactiveFormsModule, NG_VALUE_ACCESSOR } from '@angular/forms'
import { distinctUntilChanged } from 'rxjs'
import { NgmFieldAppearance, NgmFieldColor } from "@metad/ocap-angular/core";
import { ZardChipInputEvent, ZardChipsImports, ZardFormImports, ZardIconComponent } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  imports: [...ZardChipsImports, ...ZardFormImports, ZardIconComponent, ReactiveFormsModule],
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
export class FormFieldEmailsComponent implements ControlValueAccessor, OnInit {
  
  @Input() appearance: NgmFieldAppearance
  @Input() label: string
  @Input() placeholder: string
  @Input() color: NgmFieldColor = undefined
  @Input() removable: boolean

  addOnBlur = true
  keywords = new Set([])
  formControl = new FormControl([])
  _onChange: (value: string[]) => void

  ngOnInit(): void {
    this.formControl.valueChanges.pipe(distinctUntilChanged()).subscribe((value) => {
      this._onChange?.(value)
    })
  }

  writeValue(obj: any): void {
    if (obj) {
      this.formControl.setValue(obj)
    }
  }
  registerOnChange(fn: any): void {
    this._onChange = fn
  }
  registerOnTouched(fn: any): void {
  }
  setDisabledState?(isDisabled: boolean): void {
  }

  addKeywordFromInput(event: ZardChipInputEvent) {
    if (event.value) {
      this.keywords.add(event.value)
      event.chipInput!.clear()
      this.formControl.setValue(Array.from(this.keywords))
    }
  }

  removeKeyword(keyword: string) {
    this.keywords.delete(keyword)
    this.formControl.setValue(Array.from(this.keywords))
  }
}
