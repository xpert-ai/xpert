
import { Component, computed, input } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { NgxJsonViewerModule } from 'ngx-json-viewer'

@Component({
  standalone: true,
  imports: [TranslateModule, NgxJsonViewerModule],
  selector: 'copilot-message-tool-call',
  templateUrl: 'tool-call.component.html',
  styleUrls: ['tool-call.component.scss']
})
export class CopilotMessageToolCallComponent {
  readonly toolCall = input<{
    name: string
    args: {
      input: string
    }
    id: string
    type: string
  }>()

  readonly args = computed(() => this.toolCall()?.args)
}
