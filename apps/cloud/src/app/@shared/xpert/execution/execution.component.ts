import { CommonModule } from '@angular/common'
import { Component, input } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { TranslateModule } from '@ngx-translate/core'
import { DateRelativePipe, IXpertAgentExecution } from '../../../@core'
import { CopyComponent } from '../../common'
import { UserPipe } from '../../pipes'
import { XpertAgentExecutionLogComponent } from '../execution-log/execution.component'
import { XpertAgentExecutionStatusComponent } from '../execution-status/execution.component'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    MatTooltipModule,
    UserPipe,
    DateRelativePipe,
    CopyComponent,
    XpertAgentExecutionStatusComponent,
    XpertAgentExecutionLogComponent
  ],
  selector: 'xpert-agent-execution',
  templateUrl: 'execution.component.html',
  styleUrls: ['execution.component.scss']
})
export class XpertAgentExecutionComponent {
  readonly execution = input<IXpertAgentExecution>(null)
}
