import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component } from '@angular/core'
import { ClawXpertConversationDetailComponent } from '../clawxpert/clawxpert-conversation-detail.component'
import { WORKBENCH_CHAT_FACADE } from '../workbench-chat/workbench-chat.facade'
import { XpertWorkbenchFacade } from './xpert-workbench.facade'

@Component({
  standalone: true,
  selector: 'xp-chat-xpert-workbench',
  imports: [CommonModule, ClawXpertConversationDetailComponent],
  providers: [
    XpertWorkbenchFacade,
    {
      provide: WORKBENCH_CHAT_FACADE,
      useExisting: XpertWorkbenchFacade
    }
  ],
  host: { class: 'flex h-full min-h-0 flex-col' },
  template: `<xp-clawxpert-conversation-detail class="min-h-0 flex-1" />`,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatXpertWorkbenchComponent {}
