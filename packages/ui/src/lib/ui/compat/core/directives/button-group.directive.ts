import { Directive } from '@angular/core'

/**
 * @deprecated use tailwind utilities instead.
 */
@Directive({
  standalone: true,
  selector: '[xpButtonGroup]',
  host: {
    class: 'xp-button-group'
  }
})
export class XpButtonGroupDirective {}
