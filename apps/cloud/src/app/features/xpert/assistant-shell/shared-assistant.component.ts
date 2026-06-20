import { Dialog } from '@angular/cdk/dialog'
import { Component, DestroyRef, inject } from '@angular/core'
import { ChatKit } from '@xpert-ai/chatkit-angular'
import { ViewClientCommandRegistry } from '../../../@shared/view-extension/view-client-command-registry.service'
import {
  registerAssistantChatSendMessageCommand,
  registerAssistantContextSetCommand
} from '../../assistant/assistant-chat-client-command'
import { registerWorkbenchFileOpenCommand } from '../../assistant/workbench-file-open-client-command'
import { openWorkbenchFilePreviewDialog } from '../../assistant/workbench-file-preview-dialog.component'
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
  readonly #dialog = inject(Dialog)

  readonly control = this.#facade.control
  readonly status = this.#facade.status

  constructor() {
    const unregisterAssistant = registerAssistantChatSendMessageCommand(this.#clientCommands, {
      getControl: () => this.control(),
      isReady: () => this.status() === 'ready'
    })
    const unregisterFileOpen = registerWorkbenchFileOpenCommand(this.#clientCommands, {
      openFile: (file) => {
        openWorkbenchFilePreviewDialog(this.#dialog, file)
      }
    })
    const unregisterAssistantContext = registerAssistantContextSetCommand(this.#clientCommands, {
      setContext: (key, context) => {
        this.#facade.setWorkbenchContext(key, context)
      }
    })

    this.#destroyRef.onDestroy(() => {
      unregisterAssistant()
      unregisterFileOpen()
      unregisterAssistantContext()
    })
  }
}
