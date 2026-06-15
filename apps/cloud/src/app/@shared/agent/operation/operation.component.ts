import { booleanAttribute, Component, computed, effect, input, model, output, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { SlashSvgComponent } from '@xpert-ai/ocap-angular/common'
import { attrModel, NgmI18nPipe } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  agentLabel,
  BIInterruptMessageType,
  TInterruptCommand,
  TInterruptMessage,
  TSensitiveOperation,
  TToolCall
} from '../../../@core'
import { XpertAgentIdentityComponent } from '../agent-identity/agent-identity.component'
import { XpertAgentInterruptComponent } from '../interrupt/interrupt.component'

type OperationTask = NonNullable<TSensitiveOperation['tasks']>[number]
type OperationInterrupt = OperationTask['interrupts'][number]
type ClientToolCall = {
  id?: string
  name: string
}
type ClientToolRequestCandidate = {
  clientToolCalls: unknown
}
type ClientToolCallCandidate = {
  id?: unknown
  name: unknown
  args?: unknown
}
type WrappedInterruptValueCandidate = {
  value?: unknown
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

function hasClientToolCalls(value: object): value is ClientToolRequestCandidate {
  return 'clientToolCalls' in value
}

function hasToolCallName(value: object): value is ClientToolCallCandidate {
  return 'name' in value
}

function hasNestedValue(value: object): value is WrappedInterruptValueCandidate {
  return 'value' in value
}

function isClientToolCall(value: unknown): value is ClientToolCall {
  if (!isObject(value) || !hasToolCallName(value)) {
    return false
  }

  return typeof value.name === 'string' && (value.id === undefined || typeof value.id === 'string')
}

function readClientToolCalls(value: unknown, depth = 0): ClientToolCall[] {
  if (!isObject(value)) {
    return []
  }

  if (hasClientToolCalls(value) && Array.isArray(value.clientToolCalls)) {
    return value.clientToolCalls.filter(isClientToolCall)
  }

  if (depth < 2 && hasNestedValue(value)) {
    return readClientToolCalls(value.value, depth + 1)
  }

  return []
}

/**
 * Display tools that call confirmation dialogs or interrupt components that require user interaction
 */
@Component({
  standalone: true,
  imports: [
    FormsModule,
    TranslateModule,
    SlashSvgComponent,
    NgmI18nPipe,
    XpertAgentIdentityComponent,
    XpertAgentInterruptComponent
  ],
  selector: 'xp-xpert-agent-operation',
  templateUrl: 'operation.component.html',
  styleUrls: ['operation.component.scss']
})
export class XpertAgentOperationComponent {
  agentLabel = agentLabel

  // Inputs
  readonly projectId = input<string>()
  readonly conversationId = input<string>()
  readonly operation = input<TSensitiveOperation>()
  readonly tools = input<{ name: string; title: string; parameters: any }[]>()
  readonly readonly = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  // Outputs
  readonly command = model<TInterruptCommand>()
  /**
   * For all command to resume the operation
   */
  readonly confirm = output()
  /**
   * @deprecated use confirm with command.resume instead
   */
  readonly reject = output()

  // States
  readonly toolCalls = computed(() => this.operation()?.tasks)
  readonly tasks = computed(() => this.operation()?.tasks)
  readonly resume = attrModel(this.command, 'resume')
  readonly agentKey = attrModel(this.command, 'agentKey')
  readonly interrupts = computed(() => this.operation()?.tasks?.flatMap((task) => task.interrupts) || [])
  readonly hasManualOperation = computed(
    () =>
      this.operation()?.tasks?.some(
        (task) =>
          Boolean(task.parameters?.length) ||
          task.interrupts?.some((interrupt) => !this.isClientToolInterrupt(interrupt))
      ) ?? false
  )

  readonly #toolCalls = signal<TToolCall[]>(null)

  constructor() {
    effect(() => {
      // console.log(this.operation())
      if (this.operation()?.tasks) {
        this.#toolCalls.set(this.operation().tasks.map(({ call }) => call))
        // Support one task temporarily
        if (this.operation().tasks.length > 0) {
          this.agentKey.set(this.operation().tasks[0].agent?.key || null)
        }
      }
    })
  }

  onConfirm() {
    const message = this.interrupts()[0]?.value as TInterruptMessage
    if (message && message.type === BIInterruptMessageType.DeleteArtifact) {
      this.resume.set({ confirm: true })
      setTimeout(() => {
        this.confirm.emit()
      })
    } else {
      this.confirm.emit()
    }
  }

  /**
   * @deprecated use onConfirm with command resume instead
   */
  onReject() {
    const message = this.interrupts()[0]?.value as TInterruptMessage
    if (message && message.type === BIInterruptMessageType.DeleteArtifact) {
      this.resume.set({ confirm: false })
      setTimeout(() => {
        this.confirm.emit()
      })
    } else {
      this.reject.emit()
    }
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

  getClientToolCalls(interrupt: OperationInterrupt) {
    return readClientToolCalls(interrupt.value)
  }

  isClientToolInterrupt(interrupt: OperationInterrupt) {
    return this.getClientToolCalls(interrupt).length > 0
  }
}
