import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { ChatSharedTerminalComponent } from '@cloud/app/@shared/chat'
import { TChatMessageStep, TProgramToolMessage } from '@cloud/app/@core'
@Component({
  standalone: true,
  imports: [CommonModule, ChatSharedTerminalComponent],
  selector: 'chat-canvas-terminal',
  templateUrl: './terminal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatCanvasTerminalComponent {
  readonly step = input<TChatMessageStep<TProgramToolMessage>>()
}
