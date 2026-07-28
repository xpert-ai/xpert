import { DecimalPipe } from '@angular/common'
import { Component, input, output } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { CopilotServerService } from '@cloud/app/@core'
import { ICopilot } from '@xpert-ai/contracts'
import { TranslateModule } from '@ngx-translate/core'
import { CopilotConfigFormComponent } from '@cloud/app/@shared/copilot'
import { ZardButtonComponent, ZardSliderComponent } from '@xpert-ai/headless-ui'
import { ManagementCopilotServerService } from './management-copilot-server.service'

@Component({
  standalone: true,
  selector: 'pac-copilot-form',
  templateUrl: './copilot-form.component.html',
  styleUrls: ['./copilot-form.component.scss'],
  providers: [{ provide: CopilotServerService, useClass: ManagementCopilotServerService }],
  imports: [
    DecimalPipe,
    TranslateModule,
    FormsModule,
    ReactiveFormsModule,
    ZardSliderComponent,
    ZardButtonComponent,
    CopilotConfigFormComponent
  ]
})
export class CopilotFormComponent {
  readonly copilot = input<ICopilot>()
  readonly saved = output<void>()

  formatBalanceLabel(value: number): string {
    if (value >= 1000000) {
      return Math.round(value / 1000000) + 'm'
    }
    if (value >= 1000) {
      return Math.round(value / 1000) + 'k'
    }

    return `${value}`
  }
}
