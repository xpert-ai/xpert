import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, forwardRef, inject } from '@angular/core'
import { ControlValueAccessor, FormBuilder, FormControl, FormsModule, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms'
import { NgmInputComponent, NgmSliderInputComponent } from '@metad/ocap-angular/common'
import { AppearanceDirective, DensityDirective } from '@metad/ocap-angular/core'
import { ComponentStyling } from '@metad/story/core'
import { FieldType, FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { ColorInputComponent } from '../color-input/color-input.component'
import { MaterialModule } from '../../../../@shared/material.module'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    FormlyModule,
    MaterialModule,

    AppearanceDirective,
    DensityDirective,
    NgmSliderInputComponent,
    NgmInputComponent,
    ColorInputComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'pac-designer-text',
  templateUrl: './text.component.html',
  styleUrls: ['./text.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: forwardRef(() => DesignerTextComponent)
    }
  ],
  animations: []
})
export class DesignerTextComponent implements ControlValueAccessor {
  private readonly formBuilder = inject(FormBuilder)


  fontFamilies = [
    "Lato, 'Noto Serif SC', monospace",
    "Arial, Helvetica, sans-serif",
    "'Times New Roman', Times, serif",
    "Verdana, Geneva, sans-serif",
    "Georgia, serif",
    "'Courier New', Courier, monospace",
    "Tahoma, Geneva, sans-serif",
    "'Trebuchet MS', sans-serif",
    "Palatino, serif",
    "Impact, Charcoal, sans-serif",
    "'Lucida Sans Unicode', 'Lucida Grande', sans-serif"
  ]
  fontFamilyOptions = [
    {
      value: null,
      label: '--'
    },
    ...this.fontFamilies.map((value) => ({value}))
  ]
  fontWeights = [
    'normal',
    'bold',
    'bolder',
    'lighter',
    '100',
    '200',
    '300',
    '400',
    '500',
    '600',
    '700',
    '800',
    '900'
  ]

  formGroup = this.formBuilder.group<ComponentStyling>({
    color: null,
    fontSize: null,
    lineHeight: null,
    textAlign: null,
    fontFamily: null,
    fontWeight: null,
    textShadow: null,
    filter: null,
    opacity: null
  } as any)


  get color() {
    return this.formGroup.get('color') as FormControl
  }
  get fontSize() {
    return this.formGroup.get('fontSize') as FormControl
  }
  get lineHeight() {
    return this.formGroup.get('lineHeight') as FormControl
  }
  get fontWeight() {
    return this.formGroup.get('fontWeight') as FormControl
  }
  get fontFamily() {
    return this.formGroup.get('fontFamily') as FormControl
  }
  get textAlign() {
    return this.formGroup.get('textAlign')!.value
  }
  set textAlign(value) {
    this.formGroup.get('textAlign')!.setValue(value)
  }

  get textShadow() {
    return this.formGroup.get('textShadow') as FormControl
  }

  get opacity() {
    return this.formGroup.get('opacity') as FormControl
  }

  private _onChange: (value: any) => void

  private valueSub = this.formGroup.valueChanges.subscribe((value) => {
    if (this._onChange) {
      this._onChange(value)
    }
  })

  writeValue(obj: any): void {
    if (obj) {
      this.formGroup.patchValue(obj)
    }
  }
  registerOnChange(fn: any): void {
    this._onChange = fn
  }
  registerOnTouched(fn: any): void {}
  setDisabledState?(isDisabled: boolean): void {}
}


@Component({
  standalone: true,
  imports: [CommonModule, FormlyModule, TranslateModule, ReactiveFormsModule, DesignerTextComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'pac-formly-text-designer',
  template: `
<!-- <div *ngIf="props?.label" class="p-4">{{props.label}}</div> -->
<pac-designer-text class="ngm-density__compact" [formControl]="$any(formControl)" />`,
  styles: [
    `
      :host {
        flex: 1;
        max-width: 100%;
      }
    `
  ]
})
export class PACFormlyTextDesignerComponent extends FieldType {

}
