import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { BlankTemplateSelectionComponent } from './blank-template-selection.component'
import type { XpertNewBlankComponent } from './blank.component'
@Component({
  selector: 'xp-blank-wizard-start',
  standalone: true,
  imports: [TranslateModule, BlankTemplateSelectionComponent],
  templateUrl: './blank-wizard-start.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BlankWizardStartComponent {
  readonly vm = input.required<XpertNewBlankComponent>()
  readonly section = input.required<string>()
}
