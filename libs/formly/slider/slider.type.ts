import { ChangeDetectionStrategy, Component, Type } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { XpSliderInputComponent } from '@xpert-ai/headless-ui'
import { XpFieldColor } from '@xpert-ai/headless-ui'
import { FieldType, FieldTypeConfig, FormlyFieldConfig, FormlyFieldProps } from '@ngx-formly/core'

interface SliderProps extends FormlyFieldProps {
  color?: XpFieldColor
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
  selector: 'xp-formly-slider',
  template: `
    <xp-slider-input
      class="w-full"
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
    </xp-slider-input>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./slider.type.scss'],
  imports: [FormsModule, XpSliderInputComponent]
})
export class FormlyFieldSliderComponent extends FieldType<FieldTypeConfig<SliderProps>> {
  override defaultOptions = {
    props: {
      thumbLabel: false
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
