import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import {
  ZardButtonComponent,
  ZardBadgeComponent,
  ZardIconComponent,
  ZardSwitchComponent,
  ZardComboboxComponent,
  ZardComboboxOptionTemplateDirective
} from '@xpert-ai/headless-ui'
import { AssistantBindingScope, AssistantCode } from '../../../@core'
import { AssistantsSettingsFacade } from './assistants.facade'

@Component({
  standalone: true,
  selector: 'xp-settings-assistants-scope',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    ZardButtonComponent,
    ZardBadgeComponent,
    ZardIconComponent,
    ZardSwitchComponent,
    ZardComboboxComponent,
    ZardComboboxOptionTemplateDirective
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-full min-w-0' },
  templateUrl: './assistants-scope.component.html'
})
export class AssistantsScopeComponent {
  readonly facade = inject(AssistantsSettingsFacade)
  readonly scope = input.required<AssistantBindingScope>()

  form(code: AssistantCode) {
    return this.isTenantScope() ? this.facade.tenantForm(code) : this.facade.organizationForm(code)
  }

  config(code: AssistantCode) {
    return this.isTenantScope() ? this.facade.tenantConfig(code) : this.facade.organizationConfig(code)
  }

  canEdit() {
    return this.isTenantScope() ? this.facade.canManageTenant() : !!this.facade.organizationId()
  }

  isTenantScope() {
    return this.scope() === AssistantBindingScope.TENANT
  }

  isOrganizationScope() {
    return this.scope() === AssistantBindingScope.ORGANIZATION
  }

  savingKey(code: AssistantCode) {
    return `${code}:${this.scope()}`
  }
}
