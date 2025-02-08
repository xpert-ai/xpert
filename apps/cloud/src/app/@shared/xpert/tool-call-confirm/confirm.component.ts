import { CommonModule } from '@angular/common'
import { Component, computed, output, input, effect, signal, booleanAttribute } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { SlashSvgComponent } from '@metad/ocap-angular/common'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { agentLabel, ToolCall, TSensitiveOperation } from '../../../@core'
import { XpertAgentIdentityComponent } from '../agent-identity/agent-identity.component'

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, SlashSvgComponent, NgmI18nPipe, XpertAgentIdentityComponent],
  selector: 'xpert-tool-call-confirm',
  templateUrl: 'confirm.component.html',
  styleUrls: ['confirm.component.scss']
})
export class ToolCallConfirmComponent {
  agentLabel = agentLabel
  
  // Inputs
  readonly operation = input<TSensitiveOperation>()
  readonly tools = input<{name: string; title: string; parameters: any}[]>()
  readonly readonly = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  // Outputs
  readonly toolCallsChange = output<ToolCall[]>()
  readonly confirm = output()
  readonly reject = output()

  // States
  readonly toolCalls = computed(() => this.operation()?.toolCalls)
  readonly agents = computed(() => this.operation()?.nextAgents)

  readonly #toolCalls = signal<ToolCall[]>(null)

  constructor() {
    effect(() => {
      if (this.operation()) {
        this.#toolCalls.set(this.operation().toolCalls.map(({call}) => call))
      }
    }, { allowSignalWrites: true })
  }

  onConfirm() {
    this.confirm.emit()
  }
  onReject() {
    this.reject.emit()
  }

  updateParam(index: number, key: string, value: string) {
    this.#toolCalls.update((calls) => {
      calls[index] = {
        ...calls[index],
        args: {
          ...calls[index].args,
          [key]: value
        }
      }
      return [...calls]
    })

    this.toolCallsChange.emit(this.#toolCalls())
  }
}
