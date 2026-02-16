import { Component, HostBinding } from '@angular/core';
import { FieldWrapper } from '@ngx-formly/core';

@Component({
  selector: 'ngm-formly-panel-wrapper',
  standalone: false,
  template: `
<div *ngIf="props?.label" class="ngm-formly__title">{{ props.label }}</div>
<div class="card-body">
  <ng-container #fieldComponent></ng-container>
</div>
`,
  styles: [
    `:host {
display: flex;
flex-direction: column;
flex: 1;
max-width: 100%;
margin-top: 1rem;
}
:host.ngm-formly__panel-padding {
  padding: 0 1.5rem;
}`
  ],
  host: {
    class: 'ngm-formly__panel-wrapper'
  }
})
export class MetadFormlyPanelComponent extends FieldWrapper {
  @HostBinding('class.ngm-formly__nested-area') nestedArea = true
  @HostBinding('class.ngm-formly__panel-padding')
  get isPadding() {
    return this.props?.padding
  }
}
