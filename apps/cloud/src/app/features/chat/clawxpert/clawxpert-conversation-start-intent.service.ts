import { Injectable, signal } from '@angular/core'

@Injectable({ providedIn: 'root' })
export class ClawXpertConversationStartIntentService {
  readonly #requestId = signal(0)
  readonly requestId = this.#requestId.asReadonly()

  requestNewConversation() {
    this.#requestId.update((value) => value + 1)
  }
}
