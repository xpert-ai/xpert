import { CommonModule } from '@angular/common'
import { Component, computed, input, model } from '@angular/core'
import type { StoredMessage } from '@langchain/core/messages'
import { TranslateModule } from '@ngx-translate/core'
import type { IModelUsageDetails } from '@xpert-ai/contracts'
import { IXpertAgentExecution } from '../../../@core'
import { CopilotStoredMessageComponent } from '../../copilot'

@Component({
  standalone: true,
  imports: [CommonModule, TranslateModule, CopilotStoredMessageComponent],
  selector: 'xpert-agent-execution-log',
  templateUrl: 'execution.component.html',
  styleUrls: ['execution.component.scss']
})
export class XpertAgentExecutionLogComponent {
  readonly execution = input<IXpertAgentExecution>(null)
  readonly expand = model<boolean>(false)
  readonly modelUsages = computed(
    () => new Map((this.execution()?.modelUsages ?? []).map((usage) => [usage.requestId, usage]))
  )

  toggleExpand() {
    this.expand.update((state) => !state)
  }

  modelUsage(message: StoredMessage): IModelUsageDetails | undefined {
    if (message.type !== 'tool') return undefined
    const toolCallId = message.data.tool_call_id
    return toolCallId ? this.modelUsages().get(toolCallId) : undefined
  }
}
