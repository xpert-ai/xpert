import { CommonModule, KeyValuePipe } from '@angular/common'
import { Component, computed, model, output } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { AIMessage, isAIMessage } from '@langchain/core/messages'
import { TranslateModule } from '@ngx-translate/core'

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, KeyValuePipe],
  selector: 'xpert-tool-call-confirm',
  templateUrl: 'confirm.component.html',
  styleUrls: ['confirm.component.scss']
})
export class ToolCallConfirmComponent {
  // Inputs
  readonly message = model<AIMessage>()

  readonly toolCalls = computed(() => {
    if (isAIMessage(this.message())) {
      return this.message().tool_calls
    }
    return null
  })

  readonly confirm = output()
  readonly reject = output()

  onConfirm() {
    this.confirm.emit()
  }
  onReject() {
    this.reject.emit()
  }

  updateParam(index: number, key: string, value: string) {
    this.message.update((message) => {
      const calls = [...message.tool_calls]
      calls[index] = {
        ...calls[index],
        args: {
          ...calls[index].args,
          [key]: value
        }
      }
      return new AIMessage({
        ...message,
        tool_calls: calls
      })
    })
  }
}
