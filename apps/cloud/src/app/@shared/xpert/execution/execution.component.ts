import { Clipboard } from '@angular/cdk/clipboard'
import { CommonModule } from '@angular/common'
import { Component, inject, input, signal, WritableSignal } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { IXpertAgentExecution } from '../../../@core'
import { UserPipe } from '../../pipes'
import { XpertAgentExecutionLogComponent } from '../execution-log/execution.component'
import { XpertAgentExecutionStatusComponent } from '../execution-status/execution.component'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    UserPipe,
    XpertAgentExecutionStatusComponent,
    XpertAgentExecutionLogComponent
  ],
  selector: 'xpert-agent-execution',
  templateUrl: 'execution.component.html',
  styleUrls: ['execution.component.scss']
})
export class XpertAgentExecutionComponent {
  readonly #clipboard = inject(Clipboard)

  readonly execution = input<IXpertAgentExecution>(null)

  readonly inputCopied = signal(false)
  readonly outputCopied = signal(false)

  copy(content: any, status: WritableSignal<boolean>) {
    status.set(true)
    this.#clipboard.copy(JSON.stringify(content, null, 2))
    setTimeout(() => {
      status.set(false)
    }, 2000)
  }
}
