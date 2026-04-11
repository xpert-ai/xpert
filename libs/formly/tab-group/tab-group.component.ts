import { Component } from '@angular/core';
import { FieldType, FormlyFieldConfig } from '@ngx-formly/core';

@Component({
  selector: 'ngm-formly-tab-group',
  standalone: false,
  templateUrl: './tab-group.component.html',
  styleUrls: ['./tab-group.component.scss'],
  host: {
    'class': 'ngm-formly-tab-group'
  }
})
export class FormlyTabGroupComponent extends FieldType {

  isValid(field: FormlyFieldConfig): boolean | undefined {
    if (field.key) {
      return field.formControl?.valid
    }

    return field.fieldGroup?.every((f) => this.isValid(f))
  }
}
