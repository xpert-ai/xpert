import { ChangeDetectionStrategy, Component, Type } from '@angular/core'
import { FieldType, FieldTypeConfig, FormlyFieldConfig, FormlyFieldProps } from '@ngx-formly/core'

interface CheckboxProps extends FormlyFieldProps {
  indeterminate?: boolean
  hideRequiredMarker?: boolean
  labelPosition?: 'before' | 'after'
  help?: string
}

export interface FormlyCheckboxFieldConfig extends FormlyFieldConfig<CheckboxProps> {
  type: 'checkbox' | Type<NgmFormlyCheckboxComponent>
}

@Component({
  selector: 'ngm-formly-checkbox',
  standalone: false,
  template: `
    <z-checkbox
      class="ngm-formly-checkbox"
      [attr.id]="id"
      [formControl]="formControl"
      [formlyAttributes]="field"
      [indeterminate]="props.indeterminate && formControl.value === null"
      [labelPosition]="props.labelPosition ?? 'after'"
      [tabIndex]="props.tabindex"
      (focusin)="onFocus()"
      (focusout)="onBlur()"
    >
      {{ props.label }}
      @if (props.required && props.hideRequiredMarker !== true) {
        <span aria-hidden="true" class="text-destructive">*</span>
      }
      @if (props.help) {
        <a
          [href]="props.help"
          target="_blank"
          rel="noopener noreferrer"
          class="group ml-1 text-xs text-primary-500 hover:text-primary-700 hover:underline"
        >
          {{ 'FORMLY.COMMON.Help' | translate: { Default: 'Help' } }}
          <i class="ri-external-link-line inline-block transition-transform group-hover:translate-x-1"></i>
        </a>
      }
    </z-checkbox>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./checkbox.type.scss']
})
export class NgmFormlyCheckboxComponent extends FieldType<FieldTypeConfig<CheckboxProps>> {
  override defaultOptions = {
    props: {
      hideFieldUnderline: true,
      indeterminate: true,
      floatLabel: 'always' as const,
      hideLabel: true
    }
  }

  onFocus() {
    this.props.focus?.(this.field)
  }

  onBlur() {
    this.props.blur?.(this.field)
  }
}
