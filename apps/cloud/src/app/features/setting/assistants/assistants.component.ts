import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, signal, type Signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { environment } from '@cloud/environments/environment'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { firstValueFrom, map, startWith } from 'rxjs'
import {
  ZardComboboxComponent,
  ZardComboboxOptionTemplateDirective,
  type ZardComboboxOption,
  ZardFormImports
} from '@xpert-ai/headless-ui'
import {
  AiFeatureEnum,
  AssistantCode,
  AssistantConfigScope,
  AssistantConfigSourceScope,
  AssistantConfigService,
  IAssistantConfig,
  IResolvedAssistantConfig,
  IXpert,
  RolesEnum,
  Store,
  ToastrService,
  XpertAPIService,
  getErrorMessage,
  routeAnimations,
  XpertTypeEnum,
  OrderTypeEnum
} from '../../../@core'
import { ASSISTANT_REGISTRY, AssistantRegistryItem } from '../../assistant/assistant.registry'

type AssistantFormValue = {
  enabled: boolean
  assistantId: string
  frameUrl: string
}

@Component({
  standalone: true,
  selector: 'pac-settings-assistants',
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    TranslateModule,
    ZardComboboxComponent,
    ZardComboboxOptionTemplateDirective,
    ...ZardFormImports
  ],
  animations: [routeAnimations],
  template: `
    <div class="flex h-full flex-col overflow-hidden">
      <div class="border-b border-divider-regular px-6 py-5">
        <div class="text-xs uppercase tracking-[0.24em] text-text-tertiary">
          {{ 'PAC.Assistant.SettingsEyebrow' | translate: { Default: 'Unified Assistant Config' } }}
        </div>
        <div class="mt-2 text-2xl font-semibold text-text-primary">
          {{ 'PAC.MENU.Assistants' | translate: { Default: 'Assistants' } }}
        </div>
        <p class="mt-2 max-w-3xl text-sm text-text-secondary">
          {{
            'PAC.Assistant.SettingsDesc'
              | translate
                : {
                    Default:
                      'Manage tenant defaults and organization-specific overrides for the assistants used across chat experiences.'
                  }
          }}
        </p>
      </div>

      <div class="flex-1 overflow-auto p-4 md:p-6">
        @if (loading()) {
          <div class="flex min-h-[18rem] items-center justify-center rounded-3xl border border-divider-regular bg-components-card-bg text-sm text-text-secondary">
            {{ 'PAC.Common.Loading' | translate: { Default: 'Loading...' } }}
          </div>
        } @else {
          <div class="space-y-6">
            @for (assistant of assistants(); track assistant.code) {
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

                  <div class="grid gap-3 rounded-2xl border border-divider-regular bg-background-default-subtle p-4 text-sm text-text-secondary md:grid-cols-3">
                    <div>
                      <div class="text-xs uppercase tracking-[0.18em] text-text-tertiary">
                        {{ 'PAC.Assistant.EffectiveSource' | translate: { Default: 'Effective Source' } }}
                      </div>
                      <div class="mt-2 font-medium text-text-primary">
                        {{ sourceLabel(effectiveConfig(assistant.code)?.sourceScope) }}
                      </div>
                    </div>
                    <div>
                      <div class="text-xs uppercase tracking-[0.18em] text-text-tertiary">
                        {{ 'PAC.Assistant.EffectiveStatus' | translate: { Default: 'Effective Status' } }}
                      </div>
                      <div class="mt-2 font-medium text-text-primary">
                        {{ effectiveStatusLabel(effectiveConfig(assistant.code)) }}
                      </div>
                    </div>
                    <div>
                      <div class="text-xs uppercase tracking-[0.18em] text-text-tertiary">
                        {{ 'PAC.Assistant.ActiveOrganization' | translate: { Default: 'Active Organization' } }}
                      </div>
                      <div class="mt-2 font-medium text-text-primary">
                        {{
                          organizationName() ||
                            ('PAC.Assistant.NoOrganization' | translate: { Default: 'No organization selected' })
                        }}
                      </div>
                    </div>
                  </div>
                </div>

                <div class="grid gap-6 p-5 xl:grid-cols-2">
                  <form
                    class="space-y-4 rounded-2xl border border-divider-regular bg-background-default-subtle p-4"
                    [formGroup]="tenantForm(assistant.code)"
                  >
                    <div class="flex items-center justify-between gap-3">
                      <div>
                        <div class="text-sm font-semibold text-text-primary">
                          {{ 'PAC.Assistant.TenantDefault' | translate: { Default: 'Tenant Default' } }}
                        </div>
                        <div class="mt-1 text-xs text-text-secondary">
                          {{
                            'PAC.Assistant.TenantDefaultDesc'
                              | translate
                                : {
                                    Default: 'Applies when an organization override does not exist. Only super admins can edit this section.'
                                  }
                          }}
                        </div>
                      </div>
                      <label class="flex items-center gap-2 text-sm text-text-secondary">
                        <input type="checkbox" formControlName="enabled" class="h-4 w-4" />
                        <span>{{ 'PAC.Assistant.Enabled' | translate: { Default: 'Enabled' } }}</span>
                      </label>
                    </div>

                    <div class="grid gap-4">
                      <label class="grid gap-2">
                        <span class="text-sm text-text-secondary">
                          {{ 'PAC.Assistant.AssistantId' | translate: { Default: 'Assistant ID / Xpert ID' } }}
                        </span>
                        <z-combobox
                          zTriggerMode="input"
                          class="w-full"
                          [value]="assistantSelectionValue(assistantConfigScope.TENANT, assistant.code)"
                          [options]="assistantXpertOptions(assistantConfigScope.TENANT, assistant.code)"
                          [disabled]="!canManageTenant()"
                          [placeholder]="
                            'PAC.Assistant.AssistantIdPlaceholder'
                              | translate: { Default: 'Search accessible xperts by name or id' }
                          "
                          [zSearchTerm]="assistantSearchTerm(assistantConfigScope.TENANT, assistant.code)"
                          [zDisplayWith]="displayAssistantXpert"
                          (zSearchTermChange)="
                            onAssistantSearchTermChange(assistantConfigScope.TENANT, assistant.code, $event)
                          "
                          (zValueChange)="selectAssistantXpert(assistantConfigScope.TENANT, assistant.code, $event)"
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
                          [readonly]="!canManageTenant()"
                          placeholder="https://app.xpertai.cn/chatkit"
                        />
                      </label>
                    </div>

                    <div class="rounded-2xl border border-dashed border-divider-regular bg-components-card-bg px-4 py-3">
                      <div class="text-xs uppercase tracking-[0.18em] text-text-tertiary">
                        {{ 'PAC.Assistant.RuntimeApiUrl' | translate: { Default: 'Runtime API URL' } }}
                      </div>
                      <div class="mt-2 break-all font-mono text-xs text-text-primary">{{ fixedApiUrl }}</div>
                      <div class="mt-3 text-xs text-text-secondary">
                        {{
                          'PAC.Assistant.RuntimeJwtDesc'
                            | translate
                              : { Default: 'Authentication uses the current user JWT automatically.' }
                        }}
                      </div>
                    </div>

                    <div class="flex items-center justify-between gap-3">
                      <div class="text-xs text-text-tertiary">
                        {{ sourceStateLabel(tenantConfig(assistant.code)) }}
                      </div>
                      <button
                        type="button"
                        class="rounded-full border border-divider-regular px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-hover-bg disabled:cursor-not-allowed disabled:opacity-60"
                        [disabled]="!canManageTenant() || tenantForm(assistant.code).invalid || savingKey() === (assistant.code + ':tenant')"
                        (click)="saveConfig(assistant, assistantConfigScope.TENANT)"
                      >
                        {{ 'PAC.KEY_WORDS.Save' | translate: { Default: 'Save' } }}
                      </button>
                    </div>
                  </form>

                  <form
                    class="space-y-4 rounded-2xl border border-divider-regular bg-background-default-subtle p-4"
                    [formGroup]="organizationForm(assistant.code)"
                  >
                    <div class="flex items-center justify-between gap-3">
                      <div>
                        <div class="text-sm font-semibold text-text-primary">
                          {{ 'PAC.Assistant.OrganizationOverride' | translate: { Default: 'Organization Override' } }}
                        </div>
                        <div class="mt-1 text-xs text-text-secondary">
                          {{
                            'PAC.Assistant.OrganizationOverrideDesc'
                              | translate
                                : {
                                    Default:
                                      'Overrides the tenant default for the currently selected organization. Use reset to inherit from tenant again.'
                                  }
                          }}
                        </div>
                      </div>
                      <label class="flex items-center gap-2 text-sm text-text-secondary">
                        <input type="checkbox" formControlName="enabled" class="h-4 w-4" />
                        <span>{{ 'PAC.Assistant.Enabled' | translate: { Default: 'Enabled' } }}</span>
                      </label>
                    </div>

                    <div class="grid gap-4">
                      <label class="grid gap-2">
                        <span class="text-sm text-text-secondary">
                          {{ 'PAC.Assistant.AssistantId' | translate: { Default: 'Assistant ID / Xpert ID' } }}
                        </span>
                        <z-combobox
                          zTriggerMode="input"
                          class="w-full"
                          [value]="assistantSelectionValue(assistantConfigScope.ORGANIZATION, assistant.code)"
                          [options]="assistantXpertOptions(assistantConfigScope.ORGANIZATION, assistant.code)"
                          [disabled]="!organizationId()"
                          [placeholder]="
                            'PAC.Assistant.AssistantIdPlaceholder'
                              | translate: { Default: 'Search accessible xperts by name or id' }
                          "
                          [zSearchTerm]="assistantSearchTerm(assistantConfigScope.ORGANIZATION, assistant.code)"
                          [zDisplayWith]="displayAssistantXpert"
                          (zSearchTermChange)="
                            onAssistantSearchTermChange(assistantConfigScope.ORGANIZATION, assistant.code, $event)
                          "
                          (zValueChange)="
                            selectAssistantXpert(assistantConfigScope.ORGANIZATION, assistant.code, $event)
                          "
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
                          placeholder="https://app.xpertai.cn/chatkit"
                        />
                      </label>
                    </div>

                    <div class="rounded-2xl border border-dashed border-divider-regular bg-components-card-bg px-4 py-3">
                      <div class="text-xs uppercase tracking-[0.18em] text-text-tertiary">
                        {{ 'PAC.Assistant.RuntimeApiUrl' | translate: { Default: 'Runtime API URL' } }}
                      </div>
                      <div class="mt-2 break-all font-mono text-xs text-text-primary">{{ fixedApiUrl }}</div>
                      <div class="mt-3 text-xs text-text-secondary">
                        {{
                          'PAC.Assistant.RuntimeJwtDesc'
                            | translate
                              : { Default: 'Authentication uses the current user JWT automatically.' }
                        }}
                      </div>
                    </div>

                    <div class="flex items-center justify-between gap-3">
                      <div class="text-xs text-text-tertiary">
                        {{ sourceStateLabel(organizationConfig(assistant.code)) }}
                      </div>
                      <div class="flex items-center gap-2">
                        <button
                          type="button"
                          class="rounded-full border border-divider-regular px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-hover-bg disabled:cursor-not-allowed disabled:opacity-60"
                          [disabled]="!organizationId() || !organizationConfig(assistant.code) || savingKey() === (assistant.code + ':organization:delete')"
                          (click)="resetOrganizationOverride(assistant)"
                        >
                          {{ 'PAC.Assistant.UseTenantDefault' | translate: { Default: 'Use Tenant Default' } }}
                        </button>
                        <button
                          type="button"
                          class="rounded-full border border-divider-regular px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-hover-bg disabled:cursor-not-allowed disabled:opacity-60"
                          [disabled]="!organizationId() || organizationForm(assistant.code).invalid || savingKey() === (assistant.code + ':organization')"
                          (click)="saveConfig(assistant, assistantConfigScope.ORGANIZATION)"
                        >
                          {{ 'PAC.KEY_WORDS.Save' | translate: { Default: 'Save' } }}
                        </button>
                      </div>
                    </div>

                    @if (!organizationId()) {
                      <div class="rounded-2xl border border-dashed border-divider-regular px-4 py-3 text-sm text-text-secondary">
                        {{
                          'PAC.Assistant.OrganizationRequired'
                            | translate
                              : { Default: 'Select an organization to manage organization-level overrides.' }
                        }}
                      </div>
                    }
                  </form>
                </div>
              </section>
            }
          </div>
        }
      </div>
    </div>
  `
})
export class AssistantsSettingsComponent {
  readonly #assistantConfigService = inject(AssistantConfigService)
  readonly #store = inject(Store)
  readonly #formBuilder = inject(FormBuilder)
  readonly #toastr = inject(ToastrService)
  readonly #translate = inject(TranslateService)
  readonly #xpertService = inject(XpertAPIService)
  readonly #skipNextAssistantSearchSync = new Set<string>()

  readonly featureOrganizations = toSignal(this.#store.featureOrganizations$.pipe(startWith([])))
  readonly featureTenant = toSignal(this.#store.featureTenant$.pipe(startWith([])))
  readonly organizationId = toSignal(this.#store.selectOrganizationId())
  readonly selectedOrganization = toSignal(this.#store.selectedOrganization$.pipe(startWith(null)))
  readonly user = toSignal(this.#store.user$)
  readonly fixedApiUrl = buildAssistantRuntimeApiUrl(environment.API_BASE_URL)
  readonly xperts: Signal<IXpert[]> = toSignal(
    this.#xpertService.getMyAll({
      relations: ['createdBy'],
      where: { type: XpertTypeEnum.Agent, latest: true },
      order: { createdAt: OrderTypeEnum.DESC }
    }).pipe(
      map((result: { items?: IXpert[] | null }): IXpert[] =>
        (result.items ?? []).filter((xpert): xpert is IXpert => Boolean(xpert) && xpert.latest !== false)
      )
    ),
    { initialValue: [] as IXpert[] }
  )
  readonly xpertLookup = computed(() =>
    this.xperts().reduce(
      (acc, xpert) => {
        acc[xpert.id] = xpert
        return acc
      },
      {} as Record<string, IXpert>
    )
  )
  readonly assistantSearchTerms = signal<Record<string, string>>({})
  readonly organizationName = computed(() => this.selectedOrganization()?.name ?? null)
  readonly canManageTenant = computed(() => this.user()?.role?.name === RolesEnum.SUPER_ADMIN)
  readonly assistants = computed(() => {
    this.featureOrganizations()
    this.featureTenant()

    return ASSISTANT_REGISTRY.filter((assistant) => {
      if (!this.#store.hasFeatureEnabled(AiFeatureEnum.FEATURE_XPERT)) {
        return false
      }

      return assistant.featureKeys.every((featureKey) => this.#store.hasFeatureEnabled(featureKey))
    })
  })

  readonly loading = signal(true)
  readonly savingKey = signal<string | null>(null)
  readonly assistantConfigScope = AssistantConfigScope
  readonly tenantConfigs = signal<Partial<Record<AssistantCode, IAssistantConfig>>>({})
  readonly organizationConfigs = signal<Partial<Record<AssistantCode, IAssistantConfig>>>({})
  readonly effectiveConfigs = signal<Partial<Record<AssistantCode, IResolvedAssistantConfig>>>({})

  readonly tenantForms = Object.fromEntries(
    ASSISTANT_REGISTRY.map((assistant) => [assistant.code, this.createForm()])
  ) as Record<AssistantCode, ReturnType<AssistantsSettingsComponent['createForm']>>
  readonly organizationForms = Object.fromEntries(
    ASSISTANT_REGISTRY.map((assistant) => [assistant.code, this.createForm()])
  ) as Record<AssistantCode, ReturnType<AssistantsSettingsComponent['createForm']>>

  constructor() {
    effect(() => {
      this.assistants()
      this.organizationId()

      if (this.canManageTenant()) {
        Object.values(this.tenantForms).forEach((form) => form.enable({ emitEvent: false }))
      } else {
        Object.values(this.tenantForms).forEach((form) => form.disable({ emitEvent: false }))
      }

      if (this.organizationId()) {
        Object.values(this.organizationForms).forEach((form) => form.enable({ emitEvent: false }))
      } else {
        Object.values(this.organizationForms).forEach((form) => form.disable({ emitEvent: false }))
      }

      void this.loadConfigs()
    })
  }

  tenantForm(code: AssistantCode) {
    return this.tenantForms[code]
  }

  organizationForm(code: AssistantCode) {
    return this.organizationForms[code]
  }

  tenantConfig(code: AssistantCode) {
    return this.tenantConfigs()[code] ?? null
  }

  organizationConfig(code: AssistantCode) {
    return this.organizationConfigs()[code] ?? null
  }

  effectiveConfig(code: AssistantCode) {
    return this.effectiveConfigs()[code] ?? null
  }

  readonly displayAssistantXpert = (_option: ZardComboboxOption | null, value: unknown) => {
    if (value === null || value === undefined || value === '') {
      return ''
    }

    const xpert = this.xpertLookup()[`${value}`]
    return xpert ? this.getXpertLabel(xpert) : `${value}`
  }

  sourceLabel(sourceScope?: string | null) {
    switch (sourceScope) {
      case AssistantConfigSourceScope.ORGANIZATION:
        return this.t('PAC.Assistant.OrganizationOverride', 'Organization Override')
      case AssistantConfigSourceScope.TENANT:
        return this.t('PAC.Assistant.TenantDefault', 'Tenant Default')
      default:
        return this.t('PAC.Assistant.NotConfigured', 'Not Configured')
    }
  }

  effectiveStatusLabel(config?: IResolvedAssistantConfig | null) {
    if (!config || config.sourceScope === AssistantConfigSourceScope.NONE) {
      return this.t('PAC.Assistant.NotConfigured', 'Not Configured')
    }

    return config.enabled
      ? this.t('PAC.Assistant.Enabled', 'Enabled')
      : this.t('PAC.KEY_WORDS.Disabled', 'Disabled')
  }

  sourceStateLabel(config?: IAssistantConfig | null) {
    if (config) {
      return config.organizationId
        ? this.t('PAC.Assistant.SavedInOrganizationScope', 'Saved in organization scope')
        : this.t('PAC.Assistant.SavedInTenantScope', 'Saved in tenant scope')
    }

    return this.t('PAC.Assistant.NoSavedConfigInScope', 'No saved config in this scope')
  }

  assistantSearchTerm(scope: AssistantConfigScope, code: AssistantCode) {
    return this.assistantSearchTerms()[this.assistantSearchKey(scope, code)] ?? ''
  }

  assistantSelectionValue(scope: AssistantConfigScope, code: AssistantCode) {
    return scope === AssistantConfigScope.TENANT
      ? this.tenantForm(code).controls.assistantId.value
      : this.organizationForm(code).controls.assistantId.value
  }

  assistantXpertOptions(scope: AssistantConfigScope, code: AssistantCode): ZardComboboxOption[] {
    const searchTerm = this.assistantSearchTerm(scope, code).trim().toLowerCase()

    return this.xperts()
      .filter((xpert) => {
        if (!searchTerm) {
          return true
        }

        return [
          xpert.id,
          xpert.slug,
          xpert.name,
          xpert.title,
          xpert.titleCN
        ]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(searchTerm))
      })
      .map((xpert) => ({
        id: xpert.id,
        label: this.getXpertLabel(xpert),
        value: xpert.id,
        data: {
          id: xpert.id,
          label: this.getXpertLabel(xpert)
        }
      }))
  }

  onAssistantSearchTermChange(scope: AssistantConfigScope, code: AssistantCode, value: string) {
    const key = this.assistantSearchKey(scope, code)

    if (this.#skipNextAssistantSearchSync.has(key)) {
      this.#skipNextAssistantSearchSync.delete(key)
      this.setAssistantSearchTerm(key, '')
      return
    }

    this.setAssistantSearchTerm(key, value)
  }

  selectAssistantXpert(scope: AssistantConfigScope, code: AssistantCode, value: unknown) {
    const assistantId = value ? `${value}` : ''
    const form = scope === AssistantConfigScope.TENANT ? this.tenantForm(code) : this.organizationForm(code)

    form.controls.assistantId.setValue(assistantId)
    form.controls.assistantId.markAsDirty()
    form.controls.assistantId.markAsTouched()
    this.resetAssistantSearch(scope, code)
  }

  async saveConfig(assistant: AssistantRegistryItem, scope: AssistantConfigScope) {
    const form = scope === AssistantConfigScope.TENANT ? this.tenantForm(assistant.code) : this.organizationForm(assistant.code)
    form.markAllAsTouched()

    if (form.invalid) {
      return
    }

    const savingKey = `${assistant.code}:${scope}`
    this.savingKey.set(savingKey)

    try {
      await firstValueFrom(
        this.#assistantConfigService.upsert({
          code: assistant.code,
          scope,
          enabled: form.getRawValue().enabled,
          options: this.toOptions(form.getRawValue())
        })
      )
      this.#toastr.success('PAC.MESSAGE.UpdateSuccess', { Default: 'Saved successfully' })
      await this.loadConfigs()
    } catch (error) {
      this.#toastr.error(getErrorMessage(error) || this.t('PAC.Assistant.SaveFailed', 'Failed to save assistant configuration.'))
    } finally {
      this.savingKey.set(null)
    }
  }

  async resetOrganizationOverride(assistant: AssistantRegistryItem) {
    if (!this.organizationId()) {
      return
    }

    const savingKey = `${assistant.code}:organization:delete`
    this.savingKey.set(savingKey)

    try {
      await firstValueFrom(this.#assistantConfigService.delete(assistant.code, AssistantConfigScope.ORGANIZATION))
      this.#toastr.success('PAC.MESSAGE.UpdateSuccess', { Default: 'Saved successfully' })
      await this.loadConfigs()
    } catch (error) {
      this.#toastr.error(
        getErrorMessage(error) ||
          this.t('PAC.Assistant.ResetOrganizationFailed', 'Failed to reset organization assistant configuration.')
      )
    } finally {
      this.savingKey.set(null)
    }
  }

  private async loadConfigs() {
    const assistants = this.assistants()

    this.loading.set(true)
    try {
      const [tenantConfigs, organizationConfigs, effectiveConfigs]: [
        IAssistantConfig[],
        IAssistantConfig[],
        IResolvedAssistantConfig[]
      ] = await Promise.all([
        firstValueFrom<IAssistantConfig[]>(this.#assistantConfigService.getByScope(AssistantConfigScope.TENANT)),
        this.organizationId()
          ? firstValueFrom<IAssistantConfig[]>(
              this.#assistantConfigService.getByScope(AssistantConfigScope.ORGANIZATION)
            )
          : Promise.resolve([] as IAssistantConfig[]),
        Promise.all(
          assistants.map((assistant) =>
            firstValueFrom<IResolvedAssistantConfig>(this.#assistantConfigService.getEffective(assistant.code))
          )
        )
      ])

      this.tenantConfigs.set(this.toConfigMap(tenantConfigs))
      this.organizationConfigs.set(this.toConfigMap(organizationConfigs))
      this.effectiveConfigs.set(
        effectiveConfigs.reduce((acc, item) => {
          acc[item.code] = item
          return acc
        }, {} as Partial<Record<AssistantCode, IResolvedAssistantConfig>>)
      )

      ASSISTANT_REGISTRY.forEach((assistant) => {
        this.patchForm(this.tenantForm(assistant.code), this.tenantConfig(assistant.code))
        this.patchForm(this.organizationForm(assistant.code), this.organizationConfig(assistant.code))
        this.clearAssistantSearch(AssistantConfigScope.TENANT, assistant.code)
        this.clearAssistantSearch(AssistantConfigScope.ORGANIZATION, assistant.code)
      })

      if (!this.canManageTenant()) {
        Object.values(this.tenantForms).forEach((form) => form.disable({ emitEvent: false }))
      }
      if (!this.organizationId()) {
        Object.values(this.organizationForms).forEach((form) => form.disable({ emitEvent: false }))
      }
    } catch (error) {
      this.#toastr.error(getErrorMessage(error) || this.t('PAC.Assistant.LoadFailed', 'Failed to load assistant configurations.'))
    } finally {
      this.loading.set(false)
    }
  }

  private patchForm(form: ReturnType<AssistantsSettingsComponent['createForm']>, config?: IAssistantConfig | null) {
    form.reset(
      {
        enabled: config?.enabled ?? true,
        assistantId: config?.options?.assistantId ?? '',
        frameUrl: config?.options?.frameUrl ?? ''
      },
      { emitEvent: false }
    )
  }

  private createForm() {
    return this.#formBuilder.nonNullable.group({
      enabled: this.#formBuilder.nonNullable.control(true),
      assistantId: this.#formBuilder.nonNullable.control('', Validators.required),
      frameUrl: this.#formBuilder.nonNullable.control('', Validators.required)
    })
  }

  private toConfigMap(items: IAssistantConfig[]) {
    return items.reduce((acc, item) => {
      acc[item.code] = item
      return acc
    }, {} as Partial<Record<AssistantCode, IAssistantConfig>>)
  }

  private toOptions(value: AssistantFormValue) {
    return {
      assistantId: value.assistantId,
      frameUrl: value.frameUrl
    }
  }

  private getXpertLabel(xpert: Partial<IXpert> | null | undefined) {
    return xpert?.title || xpert?.titleCN || xpert?.name || xpert?.slug || xpert?.id || ''
  }

  private assistantSearchKey(scope: AssistantConfigScope, code: AssistantCode) {
    return `${scope}:${code}`
  }

  private setAssistantSearchTerm(key: string, value: string) {
    this.assistantSearchTerms.update((state) => ({
      ...state,
      [key]: value
    }))
  }

  private resetAssistantSearch(scope: AssistantConfigScope, code: AssistantCode) {
    const key = this.assistantSearchKey(scope, code)
    this.#skipNextAssistantSearchSync.add(key)
    this.setAssistantSearchTerm(key, '')
  }

  private clearAssistantSearch(scope: AssistantConfigScope, code: AssistantCode) {
    this.#skipNextAssistantSearchSync.delete(this.assistantSearchKey(scope, code))
    this.setAssistantSearchTerm(this.assistantSearchKey(scope, code), '')
  }

  private t(key: string, Default: string) {
    return this.#translate.instant(key, { Default })
  }
}

function buildAssistantRuntimeApiUrl(baseUrl?: string | null) {
  const normalizedBaseUrl = normalizeAssistantBaseUrl(baseUrl)
  return normalizedBaseUrl ? `${normalizedBaseUrl}/api/ai` : '/api/ai'
}

function normalizeAssistantBaseUrl(baseUrl?: string | null) {
  if (!baseUrl) {
    return ''
  }

  const normalized = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
  if (normalized.startsWith('http')) {
    return normalized
  }

  if (normalized.startsWith('//')) {
    const protocol = typeof window === 'undefined' ? 'https:' : window.location.protocol
    return `${protocol}${normalized}`
  }

  return normalized
}
