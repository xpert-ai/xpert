import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { CurrenciesEnum, DefaultValueDateTypeEnum } from '@xpert-ai/contracts'
import { ZardComboboxComponent, ZardInputDirective, ZardSwitchComponent } from '@xpert-ai/headless-ui'

@Component({
  selector: 'xp-organization-step-form',
  imports: [ReactiveFormsModule, TranslateModule, ZardInputDirective, ZardComboboxComponent, ZardSwitchComponent],
  templateUrl: './organization-step-form.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OrganizationStepFormComponent {
  readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', Validators.required],
    currency: [CurrenciesEnum.CNY, Validators.required],
    defaultValueDateType: [DefaultValueDateTypeEnum.TODAY, Validators.required],
    invitesAllowed: [true],
    inviteExpiryPeriod: [7, Validators.min(1)]
  })
}
