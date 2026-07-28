import { CommonModule } from '@angular/common'
import { Component, input } from '@angular/core'
import { XpIsNilPipe } from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import { IXpertAgentExecution } from '../../../@core'

@Component({
  standalone: true,
  imports: [CommonModule, XpIsNilPipe, TranslateModule],
  selector: 'xpert-agent-execution-status',
  templateUrl: 'execution.component.html',
  styleUrls: ['execution.component.scss']
})
export class XpertAgentExecutionStatusComponent {
  readonly execution = input<IXpertAgentExecution>(null)
}
