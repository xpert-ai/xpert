import { Component, HostBinding } from '@angular/core'
import { FieldWrapper } from '@ngx-formly/core'

@Component({
  selector: 'xp-formly-panel-wrapper',
  standalone: false,
  template: `
    @if (props?.label) {
      <div class="xp-formly__title">{{ props.label }}</div>
    }
    <div class="card-body">
      <ng-container #fieldComponent></ng-container>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        flex: 1;
        max-width: 100%;
        margin-top: 1rem;
      }
      :host.xp-formly__panel-padding {
        padding: 0 1.5rem;
      }
    `
  ],
  host: {
    class: 'xp-formly__panel-wrapper'
  }
})
export class MetadFormlyPanelComponent extends FieldWrapper {
  @HostBinding('class.xp-formly__nested-area') nestedArea = true
  @HostBinding('class.xp-formly__panel-padding')
  get isPadding() {
    return this.props?.padding
  }
}
