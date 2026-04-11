
import { ChangeDetectionStrategy, Component, forwardRef, inject } from '@angular/core'
import { ControlValueAccessor, FormBuilder, FormControl, FormsModule, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms'
import { NgmInputComponent, NgmSelectComponent, NgmSliderInputComponent } from '@xpert-ai/ocap-angular/common'
import { AppearanceDirective, DensityDirective } from '@xpert-ai/ocap-angular/core'
import { ComponentStyling } from '@xpert-ai/story/core'
import { FieldType, FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { ColorInputComponent } from '../color-input/color-input.component'
import { SharedUiModule } from '../../../../@shared/ui.module'

const UI_DEFAULT_FONT_FAMILY =
  "var(--font-xp-sans, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei UI', 'Microsoft YaHei', 'Noto Sans CJK SC', 'Source Han Sans SC', ui-sans-serif, system-ui, sans-serif)"

@Component({
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    FormlyModule,
    SharedUiModule,
    AppearanceDirective,
    DensityDirective,
    NgmSliderInputComponent,
    NgmInputComponent,
    NgmSelectComponent,
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
    UI_DEFAULT_FONT_FAMILY,
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
    {
      value: UI_DEFAULT_FONT_FAMILY,
      label: 'UI Default Sans'
    },
    ...this.fontFamilies.filter((value) => value !== UI_DEFAULT_FONT_FAMILY).map((value) => ({ value, label: value }))
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
  fontWeightOptions = this.fontWeights.map((fontWeight) => ({
    value: fontWeight,
    label: fontWeight
  }))

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
  imports: [FormlyModule, TranslateModule, ReactiveFormsModule, DesignerTextComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'pac-formly-text-designer',
  template: `
<!-- Optional field label rendered by the designer wrapper. -->
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
