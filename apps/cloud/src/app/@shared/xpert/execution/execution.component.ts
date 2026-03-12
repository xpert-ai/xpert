import { CommonModule } from '@angular/common'
import { Component, input } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { DateRelativePipe, IXpertAgentExecution } from '../../../@core'
import { CopyComponent } from '../../common'
import { UserPipe } from '../../pipes'
import { XpertAgentExecutionLogComponent } from '../execution-log/execution.component'
import { XpertAgentExecutionStatusComponent } from '../execution-status/execution.component'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
@Component({
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    ...ZardTooltipImports,
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
