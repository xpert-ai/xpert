import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { derivedAsync } from 'ngxtension/derived-async'
import { of } from 'rxjs'
import { IXpert, XpertAgentExecutionService, XpertAgentExecutionStatusEnum } from '../../../@core'
import { XpertAgentExecutionAccordionComponent, XpertAgentExecutionComponent } from '../../xpert'

@Component({
  selector: 'chat-message-execution',
  templateUrl: './execution.component.html',
  styleUrls: ['./execution.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    XpertAgentExecutionComponent,
    XpertAgentExecutionAccordionComponent
  ]
})
export class ChatMessageExecutionPanelComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum

  readonly agentExecutionService = inject(XpertAgentExecutionService)

  // Inputs
  readonly id = input<string>()
  readonly xpert = input<Partial<IXpert>>()

  // Output
  readonly close = output<void>()

  readonly #execution = derivedAsync(() => {
    const id = this.id()
    return id ? this.agentExecutionService.getOneLog(id) : of(null)
  })

  readonly agents = computed(() => {
    if (this.xpert()) {
      return [this.xpert().agent, ...(this.xpert().agents ?? [])]
    }
    return []
  })

  readonly pageType = signal<'overview' | 'steps'>('overview')

  readonly execution = computed(() => {
    const execution = this.#execution()
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
    return this.#execution()?.subExecutions?.map((exec) => ({
      ...exec,
      agent: exec.agent ?? agents.find((node) => node.key === exec.agentKey)
    }))
  })
}
