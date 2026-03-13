import { Clipboard } from '@angular/cdk/clipboard'
import { CommonModule } from '@angular/common'
import { Component, computed, inject, input, signal } from '@angular/core'
import { NgmIsNilPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { IXpertAgentExecution, XpertAgentExecutionStatusEnum } from '../../../@core'
import { CopyComponent } from '../../common'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
@Component({
  standalone: true,
  imports: [CommonModule, TranslateModule, ...ZardTooltipImports, CopyComponent, NgmIsNilPipe],
  selector: 'chat-message-execution',
  templateUrl: 'execution.component.html',
  styleUrls: ['execution.component.scss'],
  host: {
    class: 'xpert-execution-status',
    '[class]': 'status()'
  }
})
export class ChatMessageExecutionComponent {
  eXpertAgentExecutionStatusEnum = XpertAgentExecutionStatusEnum

  readonly #clipboard = inject(Clipboard)

  // Inputs
  readonly execution = input<IXpertAgentExecution>(null)

  // States
  readonly status = computed(() => this.execution().status)
  readonly expand = signal(false)
}
