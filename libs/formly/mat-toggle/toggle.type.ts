import { Component, ChangeDetectionStrategy, ViewChild, Type } from '@angular/core';
import { FieldTypeConfig, FormlyFieldConfig } from '@ngx-formly/core';
import { FieldType, FormlyFieldProps } from '@ngx-formly/material/form-field';
import { MatSlideToggle } from '@angular/material/slide-toggle';

interface ToggleProps extends FormlyFieldProps {
  labelPosition?: 'before' | 'after';
}

export interface FormlyToggleFieldConfig extends FormlyFieldConfig<ToggleProps> {
  type: 'toggle' | Type<NgmFormlyToggleComponent>;
}

@Component({
  selector: 'ngm-formly-mat-toggle',
  template: `
    <mat-slide-toggle class="text-sm" ngm-density  small
      [id]="id"
      [formControl]="formControl"
      [formlyAttributes]="field"
      [color]="props.color"
      [tabIndex]="props.tabindex"
      [required]="required"
      [labelPosition]="props.labelPosition"
    >
      {{ props.label }}
    </mat-slide-toggle>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['toggle.type.scss']
})
export class NgmFormlyToggleComponent extends FieldType<FieldTypeConfig<ToggleProps>> {
  @ViewChild(MatSlideToggle, { static: true }) slideToggle!: MatSlideToggle;
  override defaultOptions = {
    props: {
      hideFieldUnderline: true,
      floatLabel: 'always' as const,
      hideLabel: true,
    },
  };

  override onContainerClick(event: MouseEvent): void {
    this.slideToggle.focus();
    super.onContainerClick(event);
  }
}
