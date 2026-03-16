
import { ChangeDetectionStrategy, Component, Type } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgmSliderInputComponent } from '@metad/ocap-angular/common'
import { FieldTypeConfig, FormlyFieldConfig } from '@ngx-formly/core'
import { FieldType, FormlyFieldProps } from '@ngx-formly/material/form-field'

interface SliderProps extends FormlyFieldProps {
  displayWith?: (value: number) => string
  invert?: boolean
  tickInterval?: number
  valueText?: string
  vertical?: boolean
  input?: (field: FormlyFieldConfig<SliderProps>, value: number) => void
  change?: (field: FormlyFieldConfig<SliderProps>, value: number) => void

  /** @deprecated Use `discrete` instead. */
  thumbLabel?: boolean
  discrete?: boolean
  showTickMarks?: boolean
  autoScale?: boolean
  unit?: string
}

export interface FormlySliderFieldConfig extends FormlyFieldConfig<SliderProps> {
  type: 'slider' | Type<FormlyFieldSliderComponent>
}

@Component({
  standalone: true,
  selector: 'pac-formly-mat-slider',
  template: `
<ngm-slider-input class="w-full"
  [tabIndex]="props.tabindex"
  [label]="props.label"
  [color]="props.color"
  [displayWith]="props.displayWith"
  [max]="props.max"
  [min]="props.min"
  [step]="props.step"
  [discrete]="props.discrete ?? props.thumbLabel"
  [showTickMarks]="props.showTickMarks"
  [autoScale]="props.autoScale"
  [unit]="props.unit"
  [(ngModel)]="model"
  (valueChange)="onChange($event)"
>
</ngm-slider-input>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./slider.type.scss'],
  imports: [FormsModule, NgmSliderInputComponent]
})
export class FormlyFieldSliderComponent extends FieldType<FieldTypeConfig<SliderProps>> {
  override defaultOptions = {
    props: {
      hideFieldUnderline: true,
      floatLabel: 'always' as const,
      thumbLabel: false,
    }
  }

  get model() {
    return this.formControl?.value
  }

  set model(value) {
    this.formControl?.setValue(value)
  }

  onChange(value) {
    if (this.props.change) {
      this.props.change(this.field, value)
    }
  }
}
