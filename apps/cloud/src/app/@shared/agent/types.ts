import { Directive, model, output } from '@angular/core'
import { TInterruptMessage } from '@cloud/app/@core/types'

@Directive()
export class AbstractInterruptComponent {
  // Inputs
  readonly message = model<TInterruptMessage>()

  // Outputs
  readonly value = model<any>()
}
