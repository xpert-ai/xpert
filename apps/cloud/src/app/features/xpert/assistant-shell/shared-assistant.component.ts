import { Component, DestroyRef, inject } from '@angular/core'
import { ChatKit } from '@xpert-ai/chatkit-angular'
import { ViewClientCommandRegistry } from '../../../@shared/view-extension/view-client-command-registry.service'
import { registerAssistantChatSendMessageCommand } from '../../assistant/assistant-chat-client-command'
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
  readonly #clientCommands = inject(ViewClientCommandRegistry)
  readonly #destroyRef = inject(DestroyRef)

  readonly control = this.#facade.control
  readonly status = this.#facade.status

  constructor() {
    const unregister = registerAssistantChatSendMessageCommand(this.#clientCommands, {
      getControl: () => this.control(),
      isReady: () => this.status() === 'ready'
    })

    this.#destroyRef.onDestroy(unregister)
  }
}
