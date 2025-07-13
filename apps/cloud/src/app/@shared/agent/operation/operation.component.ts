import { CommonModule } from '@angular/common'
import { booleanAttribute, Component, computed, effect, input, model, output, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { SlashSvgComponent } from '@metad/ocap-angular/common'
import { attrModel, NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { agentLabel, TInterruptCommand, TSensitiveOperation, TToolCall } from '../../../@core'
import { XpertAgentIdentityComponent } from '../agent-identity/agent-identity.component'
import { XpertAgentInterruptComponent } from '../interrupt/interrupt.component'

/**
 * Display tools that call confirmation dialogs or interrupt components that require user interaction
 */
@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    SlashSvgComponent,
    NgmI18nPipe,
    XpertAgentIdentityComponent,
    XpertAgentInterruptComponent
  ],
  selector: 'xpert-agent-operation',
  templateUrl: 'operation.component.html',
  styleUrls: ['operation.component.scss']
})
export class XpertAgentOperationComponent {
  agentLabel = agentLabel

  // Inputs
  readonly operation = input<TSensitiveOperation>()
  readonly tools = input<{ name: string; title: string; parameters: any }[]>()
  readonly readonly = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  // Outputs
  readonly command = model<TInterruptCommand>()
  // readonly toolCallsChange = output<TToolCall[]>()
  readonly confirm = output()
  readonly reject = output()

  // States
  readonly toolCalls = computed(() => this.operation()?.tasks)
  readonly tasks = computed(() => this.operation()?.tasks)
  readonly resume = attrModel(this.command, 'resume')
  readonly agentKey = attrModel(this.command, 'agentKey')

  readonly #toolCalls = signal<TToolCall[]>(null)

  constructor() {
    effect(
      () => {
        console.log(this.operation())
        if (this.operation()?.tasks) {
          this.#toolCalls.set(this.operation().tasks.map(({ call }) => call))
          // Support one task temporarily
          if (this.operation().tasks.length > 0) {
            this.agentKey.set(this.operation().tasks[0].agent?.key || null)
          }
        }
      },
      { allowSignalWrites: true }
    )
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

    this.command.update((state) => ({
      ...(state ?? {}),
      toolCalls: this.#toolCalls()
    }))
  }
}
