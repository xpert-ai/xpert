import { computed, Directive, model, output } from '@angular/core'
import { TInterruptMessage } from '@cloud/app/@core/types'

@Directive()
export class AbstractInterruptComponent<T = unknown> {
  // Inputs
  readonly message = model<TInterruptMessage<T>>()

  // Outputs
  readonly value = model<any>()

  // States
  readonly data = computed(() => this.message()?.data)
}
