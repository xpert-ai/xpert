import { Component } from '@angular/core'
import { FormControl } from '@angular/forms'
import { FieldType } from '@ngx-formly/core'

@Component({
  selector: 'pac-formly-button-toggle',
  standalone: false,
  template: `
<label class="text-sm">{{to.label}}</label>
<mat-button-toggle-group [formControl]="_formControl" [multiple]="to?.multiple" ngmAppearance="outline" color="accent" displayDensity="compact">
    <mat-button-toggle *ngFor="let option of $any(to?.options)" [value]="option.value">{{ option.label }}</mat-button-toggle>
</mat-button-toggle-group>`,
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
