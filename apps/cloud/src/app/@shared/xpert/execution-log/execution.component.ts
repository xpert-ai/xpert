import { CommonModule } from '@angular/common'
import { Component, input, model } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { IXpertAgentExecution } from '../../../@core'
import { CopilotStoredMessageComponent } from '../../copilot'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    CopilotStoredMessageComponent
  ],
  selector: 'xpert-agent-execution-log',
  templateUrl: 'execution.component.html',
  styleUrls: ['execution.component.scss']
})
export class XpertAgentExecutionLogComponent {
  readonly execution = input<IXpertAgentExecution>(null)
  readonly expand = model<boolean>(false)

  toggleExpand() {
    this.expand.update((state) => !state)
  }
}