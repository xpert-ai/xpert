import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { TranslateModule } from '@ngx-translate/core'
import { NgxFloatUiModule, NgxFloatUiPlacements, NgxFloatUiTriggers } from 'ngx-float-ui'
import { NgmCopilotChatComponent } from '../chat/chat.component'
import { CopilotGlobalService } from './global.service'

/**
 * @deprecated use ChatKit instead
 */
@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ngm-copilot-global',
  templateUrl: 'global.component.html',
  styleUrls: ['global.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    NgxFloatUiModule,
    MatTooltipModule,

    NgmCopilotChatComponent
  ],
  host: {
    class: 'ngm-copilot-global'
  }
})
export class CopilotGlobalComponent {
  eNgxFloatUiPlacements = NgxFloatUiPlacements
  eNgxFloatUiTriggers = NgxFloatUiTriggers
  
  public copilotGlobalService = inject(CopilotGlobalService)
}
