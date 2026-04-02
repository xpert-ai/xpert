import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { RequestScopeLevel } from '@metad/contracts'
import { AssistantBindingScope, AssistantCode, Store, routeAnimations } from '../../../@core'
import { type AssistantRegistryItem } from '../../assistant/assistant.registry'
import { AssistantsSettingsFacade } from './assistants.facade'
import { AssistantsOrganizationPageComponent } from './assistants-organization.component'
import { AssistantsTenantPageComponent } from './assistants-tenant.component'

@Component({
  standalone: true,
  selector: 'pac-settings-assistants',
  imports: [CommonModule, AssistantsTenantPageComponent, AssistantsOrganizationPageComponent],
  providers: [AssistantsSettingsFacade],
  styles: `:host {@apply w-full;}`,
  animations: [routeAnimations],
  template: `
    @if (activeScope().level === requestScopeLevel.TENANT) {
      <pac-settings-assistants-tenant-page />
    } @else {
      <pac-settings-assistants-organization-page />
    }
  `
})
export class AssistantsSettingsComponent {
  readonly #store = inject(Store)
  readonly #facade = inject(AssistantsSettingsFacade)

  readonly activeScope = toSignal(this.#store.selectActiveScope(), {
    initialValue: this.#store.activeScope
  })
  readonly requestScopeLevel = RequestScopeLevel
  readonly assistantBindingScope = AssistantBindingScope

  tenantForm(code: AssistantCode) {
    return this.#facade.tenantForm(code)
  }

  organizationForm(code: AssistantCode) {
    return this.#facade.organizationForm(code)
  }

  assistantXpertOptions(scope: AssistantBindingScope, code: AssistantCode) {
    return this.#facade.assistantXpertOptions(scope, code)
  }

  saveConfig(assistant: AssistantRegistryItem, scope: AssistantBindingScope) {
    return this.#facade.saveConfig(assistant, scope)
  }

  resetOrganizationOverride(assistant: AssistantRegistryItem) {
    return this.#facade.resetOrganizationOverride(assistant)
  }
}
