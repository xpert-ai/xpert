import { CommonModule } from '@angular/common'
import { Component, computed, input } from '@angular/core'
import { TMessageComponent, TMessageComponentStep } from '@cloud/app/@core'
import { RelativeTimesPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ChatMessageStepIconComponent } from '../message-step-icon/icon.component'

@Component({
  standalone: true,
  selector: 'chat-tool-call-chunk',
  templateUrl: `tool-call-chunk.component.html`,
  styleUrl: `tool-call-chunk.component.scss`,
  imports: [CommonModule, TranslateModule, RelativeTimesPipe, ChatMessageStepIconComponent]
})
export class ChatToolCallChunkComponent {
  readonly chunk = input<TMessageComponent<TMessageComponentStep>>()
  readonly conversationStatus = input()

  readonly duration = computed(() => {
    const start = this.chunk()?.created_date ? new Date(this.chunk()?.created_date) : new Date()
    const end = this.chunk()?.end_date ? new Date(this.chunk()?.end_date) : new Date()
    return (end.getTime() - start.getTime()) / 1000
  })
}
