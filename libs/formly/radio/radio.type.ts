
import { ChangeDetectionStrategy, Component, Type } from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'
import { FieldType, FieldTypeConfig, FormlyFieldConfig, FormlyFieldProps, FormlyModule } from '@ngx-formly/core'
import { ZardFormImports } from '@xpert-ai/headless-ui'

interface RadioOption {
  label: string
  value: unknown
}

interface RadioProps extends FormlyFieldProps {
  displayDensity?: 'default' | 'cosy' | 'compact'
  hideLabel?: boolean
  hideRequiredMarker?: boolean
  options?: RadioOption[]
}

export interface FormlyRadioFieldConfig extends FormlyFieldConfig<RadioProps> {
  type: 'radio' | Type<FieldType<FieldTypeConfig<RadioProps>>>
}

@Component({
  standalone: true,
  selector: 'ngm-formly-radio',
  imports: [ReactiveFormsModule, FormlyModule, ...ZardFormImports],
  template: `
    <div class="ngm-formly-radio flex max-w-full flex-col gap-2">
      @if (props.label && props.hideLabel !== true) {
        <label [attr.for]="id" class="text-sm font-medium text-foreground">
          {{ props.label }}
          @if (props.required && props.hideRequiredMarker !== true) {
            <span aria-hidden="true" class="text-destructive">*</span>
          }
        </label>
      }
    
      <z-radio-group
        class="ngm-formly-radio__group flex max-w-full flex-wrap gap-x-4 gap-y-2"
        [id]="id"
        [formControl]="formControl"
        [formlyAttributes]="field"
        [displayDensity]="props.displayDensity ?? 'default'"
        >
        @for (option of radioOptions; track trackByValue($index, option)) {
          <z-radio [value]="option.value">
            {{ option.label }}
          </z-radio>
        }
      </z-radio-group>
    </div>
    `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'ngm-formly-radio-field'
  }
})
export class NgmFormlyRadioComponent extends FieldType<FieldTypeConfig<RadioProps>> {
  get radioOptions(): RadioOption[] {
    return this.props.options ?? []
  }

  trackByValue(index: number, option: RadioOption) {
    return option?.value ?? index
  }
}
