import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { myRxResource } from '@metad/core'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { getErrorMessage, IXpert, XpertAgentExecutionService, XpertAgentExecutionStatusEnum } from '../../../@core'
import { XpertAgentExecutionAccordionComponent, XpertAgentExecutionComponent } from '../../xpert'

@Component({
  selector: 'chat-message-execution-panel',
  templateUrl: './execution.component.html',
  styleUrls: ['./execution.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    NgmSpinComponent,
    XpertAgentExecutionComponent,
    XpertAgentExecutionAccordionComponent
  ]
})
export class ChatMessageExecutionPanelComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum

  readonly #data = inject<{ id: string; xpert: IXpert }>(DIALOG_DATA, { optional: true })
  readonly #dialogRef = inject(DialogRef, { optional: true })
  readonly #executionService = inject(XpertAgentExecutionService)

  // Inputs
  readonly id = input<string>(this.#data?.id) // ID of XpertAgentExecution
  readonly xpert = input<Partial<IXpert>>(this.#data?.xpert)

  // Output
  readonly close = output<void>()

  readonly #execution = myRxResource({
    request: () => ({ id: this.id() }),
    loader: ({ request }) => this.#executionService.getOneLog(request.id)
  })

  readonly error = computed(() => getErrorMessage(this.#execution.error()))
  readonly loading = computed(() => this.#execution.status() === 'loading')

  readonly agents = computed(() => {
    if (this.xpert()) {
      return [this.xpert().agent, ...(this.xpert().agents ?? [])]
    }
    return []
  })

  readonly pageType = signal<'primary' | 'members'>('primary')

  readonly execution = computed(() => {
    const execution = this.#execution.value()
    const agents = this.agents()
    return execution
      ? {
          ...execution,
          agent: execution.agent ?? agents.find((node) => node.key === execution.agentKey)
        }
      : null
  })

  readonly executions = computed(() => {
    const agents = this.agents()
    return this.#execution.value()?.subExecutions?.map((exec) => ({
      ...exec,
      agent: exec.agent ?? agents.find((node) => node.key === exec.agentKey)
    }))
  })


  onClose() {
    this.close.emit()
    this.#dialogRef?.close()
  }
}
