import { CommonModule } from '@angular/common'
import { Component, computed, effect, input, signal } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { agentLabel, IXpertAgentExecution, XpertAgentExecutionStatusEnum } from '../../../@core'
import { XpertAgentExecutionComponent } from '../execution/execution.component'
import { EmojiAvatarComponent } from '../../avatar'

@Component({
  standalone: true,
  imports: [CommonModule, TranslateModule, EmojiAvatarComponent, XpertAgentExecutionComponent],
  selector: 'xpert-agent-execution-accordion',
  templateUrl: 'execution.component.html',
  styleUrls: ['execution.component.scss']
})
export class XpertAgentExecutionAccordionComponent {
  eXpertAgentExecutionStatusEnum = XpertAgentExecutionStatusEnum
  
  readonly execution = input<IXpertAgentExecution>(null)

  readonly executions = computed(() => this.execution()?.subExecutions) 

  readonly expand = signal(false)

  readonly xpert = computed(() => this.execution()?.xpert)
  readonly agent = computed(() => this.execution()?.agent)
  readonly avatar = computed(() => this.agent() ? this.agent().avatar : this.xpert()?.avatar)
  readonly label = computed(() => this.agent() ? agentLabel(this.agent()) : this.xpert() ? (this.xpert().title || this.xpert().name) : this.execution().title)

  constructor() {
    effect(() => {
      // console.log(this.xpert())
    })
  }
}
