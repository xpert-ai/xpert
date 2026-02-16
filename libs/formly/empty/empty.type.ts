import { ChangeDetectionStrategy, Component, HostBinding } from '@angular/core'
import { FieldType } from '@ngx-formly/core'

@Component({
  selector: 'pac-formly-empty',
  standalone: false,
  template: ``,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host {
        flex: 1;
        max-width: 100%;
      }
    `
  ]
})
export class PACFormlyEmptyComponent extends FieldType {
  @HostBinding('class.pac-formly-empty') public _formlyEmptyComponent = true
}
