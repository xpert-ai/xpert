import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import {
  XpDialogActionGroupDirective,
  XpI18nPipe,
  XpSpinComponent,
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardCheckboxComponent,
  ZardIconComponent,
  ZardSearchInputComponent,
  ZardSelectImports,
  ZardSwitchComponent,
  ZardTooltipImports
} from '@xpert-ai/headless-ui'
import { XpertWorkflowIconComponent } from 'apps/cloud/src/app/@shared/workflow'
import type { XpertNewBlankComponent } from './blank.component'
@Component({
  selector: 'xp-blank-wizard-capabilities',
  standalone: true,
  imports: [
    XpDialogActionGroupDirective,
    TranslateModule,
    ...ZardTooltipImports,
    FormsModule,
    XpI18nPipe,
    XpSpinComponent,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardCheckboxComponent,
    ZardIconComponent,
    ZardSearchInputComponent,
    ...ZardSelectImports,
    ZardSwitchComponent,
    XpertWorkflowIconComponent
  ],
  templateUrl: './blank-wizard-capabilities.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BlankWizardCapabilitiesComponent {
  readonly vm = input.required<XpertNewBlankComponent>()
  readonly section = input.required<string>()
}
