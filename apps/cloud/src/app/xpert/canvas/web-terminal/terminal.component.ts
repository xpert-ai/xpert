import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { ChatSharedTerminalComponent } from '@cloud/app/@shared/chat'

@Component({
  standalone: true,
  imports: [CommonModule, ChatSharedTerminalComponent],
  selector: 'chat-canvas-web-terminal',
  templateUrl: './terminal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatCanvasWebTerminalComponent {
  readonly projectId = input<string>()
  readonly conversationId = input<string>()
}
