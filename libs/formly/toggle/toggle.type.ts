import { Component, ChangeDetectionStrategy, ViewChild, Type } from '@angular/core'
import { FieldType, FieldTypeConfig, FormlyFieldConfig, FormlyFieldProps } from '@ngx-formly/core'
import { ZardSwitchComponent } from '@xpert-ai/headless-ui'

interface ToggleProps extends FormlyFieldProps {
  color?: string
  labelPosition?: 'before' | 'after'
}

export interface FormlyToggleFieldConfig extends FormlyFieldConfig<ToggleProps> {
  type: 'toggle' | Type<NgmFormlyToggleComponent>
}

@Component({
  selector: 'ngm-formly-toggle',
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
      [required]="props.required"
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

  onContainerClick(): void {
    this.slideToggle.focus()
  }
}
