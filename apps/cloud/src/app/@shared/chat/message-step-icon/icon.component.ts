import { CommonModule } from '@angular/common'
import { Component, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { TChatMessageStep, ChatMessageStepCategory } from 'apps/cloud/src/app/@core'

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  selector: 'chat-message-step-icon',
  templateUrl: 'icon.component.html',
  styleUrls: ['icon.component.scss']
})
export class ChatMessageStepIconComponent {
  eChatMessageStepCategory = ChatMessageStepCategory

  readonly step = input<TChatMessageStep>()
}
