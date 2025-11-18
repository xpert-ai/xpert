import { CommonModule } from '@angular/common'
import { booleanAttribute, Component, computed, input, output, signal } from '@angular/core'
import { TMessageComponent, TMessageComponentStep } from '@cloud/app/@core'
import { RelativeTimesPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { NgxJsonViewerModule } from 'ngx-json-viewer'
import { ChatMessageStepIconComponent } from '../message-step-icon/icon.component'
import { Copy2Component } from '../../common'

@Component({
  standalone: true,
  selector: 'chat-tool-call-chunk',
  templateUrl: `tool-call-chunk.component.html`,
  styleUrl: `tool-call-chunk.component.scss`,
  imports: [CommonModule, TranslateModule, MatTooltipModule, NgxJsonViewerModule, RelativeTimesPipe, Copy2Component, ChatMessageStepIconComponent]
})
export class ChatToolCallChunkComponent {
  // Inputs
  readonly chunk = input<TMessageComponent<TMessageComponentStep>>()
  readonly conversationStatus = input()
  readonly openable = input<boolean, string | boolean>(false, {
    transform: booleanAttribute
  })

  // Outputs
  readonly open = output<void>()

  // States
  readonly duration = computed(() => {
    const start = this.chunk()?.created_date ? new Date(this.chunk()?.created_date) : null
    const end = this.chunk()?.end_date ? new Date(this.chunk()?.end_date) : new Date()
    return start ? (end.getTime() - start.getTime()) / 1000 : null
  })

  readonly output = computed(() => {
    const artifact = this.chunk()?.artifact
    const output = this.chunk()?.output
    if (Array.isArray(artifact) ? artifact.length : !!artifact) {
      return artifact
    }
    if (output) {
      try {
        return JSON.parse(output)
      } catch (error) {
        return output
      }
    }
    return null
  })

  readonly expanded = signal(false)

  toggleExpand() {
    this.expanded.set(!this.expanded())
  }
}
