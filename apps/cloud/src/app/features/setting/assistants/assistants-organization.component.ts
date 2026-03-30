import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { AssistantConfigScope } from '../../../@core'
import { AssistantsSettingsFacade } from './assistants.facade'
import { AssistantsScopeComponent } from './assistants-scope.component'

@Component({
  standalone: true,
  selector: 'pac-settings-assistants-organization-page',
  imports: [CommonModule, TranslateModule, AssistantsScopeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex h-full flex-col overflow-hidden">
      <div class="flex-1 overflow-auto p-4 md:p-6">
        @if (facade.loading()) {
          <div class="flex min-h-[18rem] items-center justify-center rounded-3xl border border-divider-regular bg-components-card-bg text-sm text-text-secondary">
            {{ 'PAC.Common.Loading' | translate: { Default: 'Loading...' } }}
          </div>
        } @else {
          <div class="space-y-6">
            <section class="rounded-3xl border border-divider-regular bg-components-card-bg px-5 py-5">
              <div class="text-xs uppercase tracking-[0.24em] text-text-tertiary">
                {{ 'PAC.Assistant.OrganizationScope' | translate: { Default: 'Organization Scope' } }}
              </div>
              <div class="mt-2 text-2xl font-semibold text-text-primary">
                {{
                  facade.organizationName() ||
                    ('PAC.Assistant.OrganizationOverride' | translate: { Default: 'Organization Override' })
                }}
              </div>
              <p class="mt-2 max-w-3xl text-sm text-text-secondary">
                {{
                  'PAC.Assistant.OrganizationPageDesc'
                    | translate
                      : {
                          Default:
                            'Configure organization-specific overrides for assistant routing. Unconfigured assistants continue inheriting the tenant default.'
                        }
                }}
              </p>
            </section>

            <pac-settings-assistants-scope [scope]="assistantConfigScope.ORGANIZATION" />
          </div>
        }
      </div>
    </div>
  `
})
export class AssistantsOrganizationPageComponent {
  readonly facade = inject(AssistantsSettingsFacade)
  readonly assistantConfigScope = AssistantConfigScope
}
