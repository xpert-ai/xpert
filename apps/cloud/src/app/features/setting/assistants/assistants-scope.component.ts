import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import {
  ZardComboboxComponent,
  ZardComboboxOptionTemplateDirective,
  ZardFormImports
} from '@xpert-ai/headless-ui'
import { AssistantCode, AssistantConfigScope } from '../../../@core'
import { AssistantsSettingsFacade } from './assistants.facade'

@Component({
  standalone: true,
  selector: 'pac-settings-assistants-scope',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    ZardComboboxComponent,
    ZardComboboxOptionTemplateDirective,
    ...ZardFormImports
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      @for (assistant of facade.assistants(); track assistant.code) {
        <section class="rounded-3xl border border-divider-regular bg-components-card-bg shadow-sm">
          <div class="flex flex-col gap-4 border-b border-divider-regular px-5 py-5 lg:flex-row lg:items-start lg:justify-between">
            <div class="min-w-0">
              <div class="text-xs uppercase tracking-[0.24em] text-text-tertiary">
                {{ 'PAC.Assistant.Code' | translate: { Default: 'Assistant Code' } }}
              </div>
              <div class="mt-2 text-xl font-semibold text-text-primary">
                {{ assistant.labelKey | translate: { Default: assistant.defaultLabel } }}
              </div>
              <p class="mt-2 max-w-3xl text-sm text-text-secondary">
                {{ assistant.descriptionKey | translate: { Default: assistant.defaultDescription } }}
              </p>
            </div>

            @if (isOrganizationScope()) {
              <div class="grid gap-3 rounded-2xl border border-divider-regular bg-background-default-subtle p-4 text-sm text-text-secondary md:grid-cols-3">
                <div>
                  <div class="text-xs uppercase tracking-[0.18em] text-text-tertiary">
                    {{ 'PAC.Assistant.EffectiveSource' | translate: { Default: 'Effective Source' } }}
                  </div>
                  <div class="mt-2 font-medium text-text-primary">
                    {{ facade.sourceLabel(facade.effectiveConfig(assistant.code)?.sourceScope) }}
                  </div>
                </div>
                <div>
                  <div class="text-xs uppercase tracking-[0.18em] text-text-tertiary">
                    {{ 'PAC.Assistant.EffectiveStatus' | translate: { Default: 'Effective Status' } }}
                  </div>
                  <div class="mt-2 font-medium text-text-primary">
                    {{ facade.effectiveStatusLabel(facade.effectiveConfig(assistant.code)) }}
                  </div>
                </div>
                <div>
                  <div class="text-xs uppercase tracking-[0.18em] text-text-tertiary">
                    {{ 'PAC.Assistant.ActiveOrganization' | translate: { Default: 'Active Organization' } }}
                  </div>
                  <div class="mt-2 font-medium text-text-primary">
                    {{
                      facade.organizationName() ||
                        ('PAC.Assistant.NoOrganization' | translate: { Default: 'No organization selected' })
                    }}
                  </div>
                </div>
              </div>
            }
          </div>

          <form
            class="space-y-4 p-5"
            [formGroup]="form(assistant.code)"
          >
            <div class="rounded-2xl border border-divider-regular bg-background-default-subtle p-4">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <div class="text-sm font-semibold text-text-primary">
                    {{
                      (isTenantScope()
                        ? 'PAC.Assistant.TenantDefault'
                        : 'PAC.Assistant.OrganizationOverride'
                      ) | translate
                        : {
                            Default: isTenantScope() ? 'Tenant Default' : 'Organization Override'
                          }
                    }}
                  </div>
                  <div class="mt-1 text-xs text-text-secondary">
                    {{
                      (isTenantScope()
                        ? 'PAC.Assistant.TenantDefaultDesc'
                        : 'PAC.Assistant.OrganizationOverrideDesc'
                      ) | translate
                        : {
                            Default: isTenantScope()
                              ? 'Configure the tenant-level default assistant for this experience.'
                              : 'Configure an organization-specific override. Leave it unset to inherit the tenant default.'
                          }
                    }}
                  </div>
                </div>
                <label class="flex items-center gap-2 text-sm text-text-secondary">
                  <input type="checkbox" formControlName="enabled" class="h-4 w-4" />
                  <span>{{ 'PAC.Assistant.Enabled' | translate: { Default: 'Enabled' } }}</span>
                </label>
              </div>

              <div class="mt-4 grid gap-4">
                <label class="grid gap-2">
                  <span class="text-sm text-text-secondary">
                    {{ 'PAC.Assistant.AssistantId' | translate: { Default: 'Assistant ID / Xpert ID' } }}
                  </span>
                  <z-combobox
                    zTriggerMode="input"
                    class="w-full"
                    [value]="facade.assistantSelectionValue(scope(), assistant.code)"
                    [options]="facade.assistantXpertOptions(scope(), assistant.code)"
                    [disabled]="!canEdit()"
                    [placeholder]="
                      'PAC.Assistant.AssistantIdPlaceholder'
                        | translate: { Default: 'Search accessible xperts by name or id' }
                    "
                    [zSearchTerm]="facade.assistantSearchTerm(scope(), assistant.code)"
                    [zDisplayWith]="facade.displayAssistantXpert"
                    (zSearchTermChange)="facade.onAssistantSearchTermChange(scope(), assistant.code, $event)"
                    (zValueChange)="facade.selectAssistantXpert(scope(), assistant.code, $event)"
                  >
                    <ng-template zComboboxOption let-option>
                      <div class="flex flex-col py-1">
                        <span class="text-sm font-medium text-text-primary">{{ option.data?.label }}</span>
                        <span class="font-mono text-xs text-text-secondary">{{ option.data?.id }}</span>
                      </div>
                    </ng-template>
                  </z-combobox>
                </label>

                <label class="grid gap-2">
                  <span class="text-sm text-text-secondary">
                    {{ 'PAC.Assistant.FrameUrl' | translate: { Default: 'Frame URL' } }}
                  </span>
                  <input
                    class="rounded-2xl border border-divider-regular bg-components-card-bg px-3 py-2 text-sm text-text-primary outline-none"
                    formControlName="frameUrl"
                    [readonly]="isTenantScope() && !facade.canManageTenant()"
                    placeholder="https://app.xpertai.cn/chatkit"
                  />
                  <span class="text-xs text-text-secondary">
                    {{
                      'PAC.Assistant.FrameUrlLocalHint'
                        | translate: { Default: 'Use /chatkit for the same-origin local ChatKit page.' }
                    }}
                  </span>
                </label>
              </div>

              <div class="mt-4 rounded-2xl border border-dashed border-divider-regular bg-components-card-bg px-4 py-3">
                <div class="text-xs uppercase tracking-[0.18em] text-text-tertiary">
                  {{ 'PAC.Assistant.RuntimeApiUrl' | translate: { Default: 'Runtime API URL' } }}
                </div>
                <div class="mt-2 break-all font-mono text-xs text-text-primary">{{ facade.fixedApiUrl }}</div>
                <div class="mt-3 text-xs text-text-secondary">
                  {{
                    'PAC.Assistant.RuntimeJwtDesc'
                      | translate
                        : { Default: 'Authentication uses the current user JWT automatically.' }
                  }}
                </div>
              </div>

              <div class="mt-4 flex items-center justify-between gap-3">
                <div class="text-xs text-text-tertiary">
                  {{ facade.sourceStateLabel(config(assistant.code)) }}
                </div>
                <div class="flex items-center gap-2">
                  @if (isOrganizationScope()) {
                    <button
                      type="button"
                      class="rounded-full border border-divider-regular px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-hover-bg disabled:cursor-not-allowed disabled:opacity-60"
                      [disabled]="
                        !facade.organizationId() ||
                        !facade.organizationConfig(assistant.code) ||
                        facade.savingKey() === (assistant.code + ':organization:delete')
                      "
                      (click)="facade.resetOrganizationOverride(assistant)"
                    >
                      {{ 'PAC.Assistant.UseTenantDefault' | translate: { Default: 'Use Tenant Default' } }}
                    </button>
                  }

                  <button
                    type="button"
                    class="rounded-full border border-divider-regular px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-hover-bg disabled:cursor-not-allowed disabled:opacity-60"
                    [disabled]="
                      !canEdit() ||
                      form(assistant.code).invalid ||
                      facade.savingKey() === savingKey(assistant.code)
                    "
                    (click)="facade.saveConfig(assistant, scope())"
                  >
                    {{ 'PAC.KEY_WORDS.Save' | translate: { Default: 'Save' } }}
                  </button>
                </div>
              </div>

              @if (isTenantScope() && !facade.canManageTenant()) {
                <div class="mt-4 rounded-2xl border border-dashed border-divider-regular px-4 py-3 text-sm text-text-secondary">
                  {{
                    'PAC.Assistant.TenantPermissionRequired'
                      | translate
                        : { Default: 'Only super admins can edit tenant default assistant settings.' }
                  }}
                </div>
              }

              @if (isOrganizationScope() && !facade.organizationId()) {
                <div class="mt-4 rounded-2xl border border-dashed border-divider-regular px-4 py-3 text-sm text-text-secondary">
                  {{
                    'PAC.Assistant.OrganizationRequired'
                      | translate
                        : { Default: 'Select an organization to manage organization-level overrides.' }
                  }}
                </div>
              }
            </div>
          </form>
        </section>
      }
    </div>
  `
})
export class AssistantsScopeComponent {
  readonly facade = inject(AssistantsSettingsFacade)
  readonly scope = input.required<AssistantConfigScope>()

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
    return this.scope() === AssistantConfigScope.TENANT
  }

  isOrganizationScope() {
    return this.scope() === AssistantConfigScope.ORGANIZATION
  }

  savingKey(code: AssistantCode) {
    return `${code}:${this.scope()}`
  }
}
