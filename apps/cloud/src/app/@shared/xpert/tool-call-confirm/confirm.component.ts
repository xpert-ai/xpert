import { CommonModule } from '@angular/common'
import { Component, computed, model, output, input, effect } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { AIMessage, isAIMessage } from '@langchain/core/messages'
import { SlashSvgComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, SlashSvgComponent],
  selector: 'xpert-tool-call-confirm',
  templateUrl: 'confirm.component.html',
  styleUrls: ['confirm.component.scss']
})
export class ToolCallConfirmComponent {
  // Inputs
  readonly message = model<AIMessage>()
  readonly tools = input<{name: string; title: string; parameters: any}[]>()

  readonly toolCalls = computed(() => {
    if (isAIMessage(this.message())) {
      return this.message().tool_calls?.map((toolCall) => {
        const tool = this.tools()?.find((_) => _.name === toolCall.name)
        return {
          toolCall,
          tool,
          params: Object.keys(toolCall.args).map((name) => ({
            name,
            title: tool?.parameters?.find((_) => _.name === name)?.title,
            value: toolCall.args[name]
          }))
        }
      })
    }
    return null
  })

  readonly confirm = output()
  readonly reject = output()

  constructor() {
    effect(() => {
      // console.log(this.tools())
    })
  }

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
