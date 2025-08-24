import { computed, Directive, model } from '@angular/core'
import { TInterruptMessage } from '@cloud/app/@core/types'

@Directive()
export class AbstractInterruptComponent<T = unknown, O = unknown> {
  // Inputs
  readonly projectId = model<string>()
  readonly conversationId = model<string>()
  readonly message = model<TInterruptMessage<T>>()

  // Outputs
  readonly value = model<O>()

  // States
  readonly data = computed(() => this.message()?.data)
}
