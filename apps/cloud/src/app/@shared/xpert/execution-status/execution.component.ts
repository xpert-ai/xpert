import { CommonModule } from '@angular/common'
import { Component, input } from '@angular/core'
import { NgmIsNilPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { IXpertAgentExecution } from '../../../@core'

@Component({
  standalone: true,
  imports: [CommonModule, NgmIsNilPipe, TranslateModule],
  selector: 'xpert-agent-execution-status',
  templateUrl: 'execution.component.html',
  styleUrls: ['execution.component.scss']
})
export class XpertAgentExecutionStatusComponent {
  readonly execution = input<IXpertAgentExecution>(null)
}
