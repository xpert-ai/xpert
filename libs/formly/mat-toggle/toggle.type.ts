import { Component, ChangeDetectionStrategy, ViewChild, Type } from '@angular/core'
import { FieldTypeConfig, FormlyFieldConfig } from '@ngx-formly/core'
import { FieldType, FormlyFieldProps } from '@ngx-formly/material/form-field'
import { ZardSwitchComponent } from '@xpert-ai/headless-ui'

interface ToggleProps extends FormlyFieldProps {
  labelPosition?: 'before' | 'after'
}

export interface FormlyToggleFieldConfig extends FormlyFieldConfig<ToggleProps> {
  type: 'toggle' | Type<NgmFormlyToggleComponent>
}

@Component({
  selector: 'ngm-formly-mat-toggle',
  standalone: false,
  template: `
    <z-switch
      class="text-sm"
      [id]="id"
      zSize="sm"
      [formControl]="formControl"
      [formlyAttributes]="field"
      [zType]="props.color === 'warn' ? 'destructive' : 'default'"
      [tabIndex]="props.tabindex"
      [required]="required"
      [labelPosition]="props.labelPosition"
    >
      {{ props.label }}
    </z-switch>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['toggle.type.scss']
})
export class NgmFormlyToggleComponent extends FieldType<FieldTypeConfig<ToggleProps>> {
  @ViewChild(ZardSwitchComponent, { static: true }) slideToggle!: ZardSwitchComponent
  override defaultOptions = {
    props: {
      hideFieldUnderline: true,
      floatLabel: 'always' as const,
      hideLabel: true
    }
  }

  override onContainerClick(event: MouseEvent): void {
    this.slideToggle.focus()
    super.onContainerClick(event)
  }
}
