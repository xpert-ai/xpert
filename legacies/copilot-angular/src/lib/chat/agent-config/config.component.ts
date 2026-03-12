import { ClipboardModule } from '@angular/cdk/clipboard'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatSliderModule } from '@angular/material/slider'
import { TranslateModule } from '@ngx-translate/core'
import { NgmCopilotEngineService } from '../../services'
import { ZardCheckboxComponent, ZardTooltipImports } from '@xpert-ai/headless-ui'
/**
 * @deprecated use ChatKit instead
 */
@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'copilot-agent-config',
  templateUrl: 'config.component.html',
  styleUrls: ['config.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    ClipboardModule,
    ...ZardTooltipImports,

    MatSliderModule,
    ZardCheckboxComponent
  ]
})
export class CopilotAgentConfigComponent {
  readonly copilotEngine = input<NgmCopilotEngineService>()

  get recursionLimit() {
    return this.copilotEngine().agentConfig.recursionLimit
  }
  set recursionLimit(recursionLimit) {
    this.copilotEngine().updateAgentConfig({ recursionLimit })
  }

  get interactive() {
    return this.copilotEngine().agentConfig.interactive
  }
  set interactive(interactive) {
    this.copilotEngine().updateAgentConfig({ interactive })
  }

  get verbose() {
    return this.copilotEngine().agentConfig.verbose
  }
  set verbose(verbose) {
    this.copilotEngine().updateAgentConfig({ verbose })
  }
}
