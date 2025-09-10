import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, input, signal } from '@angular/core'
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop'
import { mapChatMessagesToStoredMessages, SystemMessage } from '@langchain/core/messages'
import { TranslateModule } from '@ngx-translate/core'
import { filter, switchMap } from 'rxjs'
import {
  agentLabel,
  channelName,
  IXpertAgentExecution,
  XpertAgentExecutionService,
  XpertAgentExecutionStatusEnum
} from '../../../@core'
import { EmojiAvatarComponent } from '../../avatar'
import { XpertWorkflowIconComponent } from '../../workflow'
import { XpertAgentExecutionComponent } from '../execution/execution.component'
import { NgmSpinComponent } from '@metad/ocap-angular/common'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    EmojiAvatarComponent,
    NgmSpinComponent,
    XpertAgentExecutionComponent,
    XpertWorkflowIconComponent
  ],
  selector: 'xpert-agent-execution-accordion',
  templateUrl: 'execution.component.html',
  styleUrls: ['execution.component.scss']
})
export class XpertAgentExecutionAccordionComponent {
  eXpertAgentExecutionStatusEnum = XpertAgentExecutionStatusEnum

  readonly executionAPI = inject(XpertAgentExecutionService)

  readonly execution = input<IXpertAgentExecution>(null)

  readonly executions = computed(() => this.execution()?.subExecutions)

  readonly expand = signal(false)

  readonly xpert = computed(() => this.execution()?.xpert)
  readonly agent = computed(() => this.execution()?.agent)
  readonly avatar = computed(() => (this.agent() ? this.agent().avatar : this.xpert()?.avatar))
  readonly label = computed(() => {
    const execution = this.execution()
    if (this.agent()) {
      return agentLabel(this.agent())
    }
    if (this.xpert()) {
      return this.xpert().title || this.xpert().name
    }

    if (execution?.title) {
      return execution.title
    }

    return execution?.type
  })

  readonly category = computed(() => this.execution()?.category)
  readonly type = computed(() => this.execution()?.type)

  readonly state = signal(null)

  readonly channel_name = computed(() => {
    const execution = this.execution()
    if (!execution) return null
    return execution.channelName || (execution.agentKey ? channelName(execution.agentKey) : null)
  })

  readonly messages = computed(() => {
    const execution = this.execution()
    const channel_name = this.channel_name()
    const channel_values = this.state()
    if (!channel_values) return []

    const channel = channel_values?.[channel_name]
    const _messages = channel?.messages ?? channel_values?.messages
    if (_messages && channel?.system) {
      const system_messages = mapChatMessagesToStoredMessages([new SystemMessage(channel.system)])
      _messages.unshift(...system_messages)
    }

    return _messages ? _messages : execution.messages
  })

  readonly expandExecution = computed(() => ({
    ...(this.execution() ?? {}),
    messages: this.messages()
  }))

  readonly loading = signal(false)

  constructor() {
    toObservable(this.expand)
      .pipe(
        filter((expand) => expand && !this.state()),
        switchMap(() => {
          this.loading.set(true)
          return this.executionAPI.getOneState(this.execution().id)
        }),
        takeUntilDestroyed()
      )
      .subscribe((state) => {
        this.loading.set(false)
        this.state.set(state ?? {})
      })
  }
}
