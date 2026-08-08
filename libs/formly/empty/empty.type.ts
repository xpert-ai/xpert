import { ChangeDetectionStrategy, Component, HostBinding } from '@angular/core'
import { FieldType } from '@ngx-formly/core'

@Component({
  selector: 'xp-formly-empty',
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
export class XpFormlyEmptyComponent extends FieldType {
  @HostBinding('class.xp-formly-empty') public _formlyEmptyComponent = true
}
