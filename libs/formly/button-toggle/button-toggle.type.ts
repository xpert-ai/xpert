import { Component } from '@angular/core'
import { FormControl } from '@angular/forms'
import { FieldType } from '@ngx-formly/core'

@Component({
  selector: 'pac-formly-button-toggle',
  standalone: false,
  template: `
<label class="text-sm">{{to.label}}</label>
<z-toggle-group [formControl]="_formControl" [multiple]="to?.multiple" ngmAppearance="outline" color="accent" displayDensity="compact">
  @for (option of $any(to?.options); track option) {
    <z-toggle-group-item [value]="option.value">{{ option.label }}</z-toggle-group-item>
  }
</z-toggle-group>`,
  host: {
    class: 'pac-formly-button-toggle'
  },
  styleUrls: ['./button-toggle.type.scss'],
})
export class PACFormlyButtonToggleComponent extends FieldType {
  get _formControl() {
    return this.formControl as FormControl
  }
}
