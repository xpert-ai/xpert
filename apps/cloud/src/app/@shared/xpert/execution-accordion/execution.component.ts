import { CommonModule } from '@angular/common'
import { Component, computed, input, signal } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { IXpertAgentExecution, XpertAgentExecutionStatusEnum } from '../../../@core'
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

  readonly agent = computed(() => this.execution()?.agent)
  readonly avatar = computed(() => this.agent()?.avatar)
}
