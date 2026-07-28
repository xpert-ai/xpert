import { Directive } from '@angular/core'

/**
 * @deprecated use tailwind utilities instead.
 */
@Directive({
  standalone: true,
  selector: '[ngmButtonGroup]',
  host: {
    class: 'ngm-button-group'
  }
})
export class ButtonGroupDirective {}
