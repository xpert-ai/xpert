import { Component, inject } from '@angular/core'
import { ChatKit } from '@xpert-ai/chatkit-angular'
import { XpertAssistantFacade } from './assistant.facade'

@Component({
  standalone: true,
  selector: 'xp-shared-assistant',
  imports: [ChatKit],
  template: `
    @if (status() === 'ready') {
      @if (control(); as chatkitControl) {
        <xpert-chatkit class="pointer-events-none fixed inset-0 z-70 block" [control]="chatkitControl" />
      }
    }
  `
})
export class XpertSharedAssistantComponent {
  readonly #facade = inject(XpertAssistantFacade)

  readonly control = this.#facade.control
  readonly status = this.#facade.status
}
