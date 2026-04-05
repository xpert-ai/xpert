import { computed, effect, inject, Injectable, signal, type Signal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormBuilder, Validators } from '@angular/forms'
import { environment } from '@cloud/environments/environment'
import { TranslateService } from '@ngx-translate/core'
import { firstValueFrom, map, of, startWith, switchMap } from 'rxjs'
import { type ZardComboboxDeprecatedOption } from '@xpert-ai/headless-ui'
import {
  AiFeatureEnum,
  AssistantBindingScope,
  AssistantBindingSourceScope,
  AssistantBindingService,
  AssistantCode,
  IAssistantBinding,
  IPagination,
  IResolvedAssistantBinding,
  IXpert,
  RolesEnum,
  Store,
  ToastrService,
  getErrorMessage
} from '../../../@core'
import { ASSISTANT_REGISTRY, type AssistantRegistryItem } from '../../assistant/assistant.registry'

const SETTINGS_XPERT_SCOPE_CODE = AssistantCode.CHAT_COMMON

@Injectable()
export class AssistantsSettingsFacade {
  readonly #assistantBindingService = inject(AssistantBindingService)
  readonly #store = inject(Store)
  readonly #formBuilder = inject(FormBuilder)
  readonly #toastr = inject(ToastrService)
  readonly #translate = inject(TranslateService)
  readonly #skipNextAssistantSearchSync = new Set<string>()

  readonly featureOrganizations = toSignal(this.#store.featureOrganizations$.pipe(startWith([])))
  readonly featureTenant = toSignal(this.#store.featureTenant$.pipe(startWith([])))
  readonly organizationId = toSignal(this.#store.selectOrganizationId())
  readonly selectedOrganization = toSignal(this.#store.selectedOrganization$.pipe(startWith(null)))
  readonly user = toSignal(this.#store.user$)
  readonly fixedApiUrl = buildAssistantRuntimeApiUrl(environment.API_BASE_URL)
  readonly chatkitFrameUrl = sanitizeConfiguredFrameUrl(environment.CHATKIT_FRAME_URL)
  readonly tenantXperts: Signal<IXpert[]> = toSignal(
    this.#assistantBindingService.getAvailableXperts(AssistantBindingScope.TENANT, SETTINGS_XPERT_SCOPE_CODE).pipe(
      map((items: IXpert[] | IPagination<IXpert> | null | undefined) => this.normalizeXperts(items))
    ),
    { initialValue: [] as IXpert[] }
  )
  readonly organizationAvailableXperts: Signal<IXpert[]> = toSignal(
    toObservable(this.organizationId).pipe(
      switchMap((organizationId) =>
        organizationId
          ? this.#assistantBindingService.getAvailableXperts(
              AssistantBindingScope.ORGANIZATION,
              SETTINGS_XPERT_SCOPE_CODE
            )
          : of([] as IXpert[])
      ),
      map((items: IXpert[] | IPagination<IXpert> | null | undefined) => this.normalizeXperts(items))
    ),
    { initialValue: [] as IXpert[] }
  )
  readonly xpertLookup = computed(() =>
    [...this.tenantXperts(), ...this.organizationAvailableXperts()].reduce(
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
      if (assistant.management !== 'system') {
        return false
      }

      if (!this.#store.hasFeatureEnabled(AiFeatureEnum.FEATURE_XPERT)) {
        return false
      }

      return assistant.featureKeys.every((featureKey) => this.#store.hasFeatureEnabled(featureKey))
    })
  })

  readonly loading = signal(true)
  readonly savingKey = signal<string | null>(null)
  readonly tenantConfigs = signal<Partial<Record<AssistantCode, IAssistantBinding>>>({})
  readonly organizationConfigs = signal<Partial<Record<AssistantCode, IAssistantBinding>>>({})
  readonly effectiveConfigs = signal<Partial<Record<AssistantCode, IResolvedAssistantBinding>>>({})

  readonly tenantForms = Object.fromEntries(
    ASSISTANT_REGISTRY.map((assistant) => [assistant.code, this.createForm()])
  ) as Record<AssistantCode, ReturnType<AssistantsSettingsFacade['createForm']>>
  readonly organizationForms = Object.fromEntries(
    ASSISTANT_REGISTRY.map((assistant) => [assistant.code, this.createForm()])
  ) as Record<AssistantCode, ReturnType<AssistantsSettingsFacade['createForm']>>

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

  readonly displayAssistantXpert = (_option: ZardComboboxDeprecatedOption | null, value: unknown) => {
    if (value === null || value === undefined || value === '') {
      return ''
    }

    const xpert = this.xpertLookup()[`${value}`]
    return xpert ? this.getXpertLabel(xpert) : `${value}`
  }

  sourceLabel(sourceScope?: string | null) {
    switch (sourceScope) {
      case AssistantBindingSourceScope.ORGANIZATION:
        return this.t('PAC.Assistant.OrganizationOverride', 'Organization Override')
      case AssistantBindingSourceScope.TENANT:
        return this.t('PAC.Assistant.TenantDefault', 'Tenant Default')
      default:
        return this.t('PAC.Assistant.NotConfigured', 'Not Configured')
    }
  }

  effectiveStatusLabel(config?: IResolvedAssistantBinding | null) {
    if (!config || config.sourceScope === AssistantBindingSourceScope.NONE) {
      return this.t('PAC.Assistant.NotConfigured', 'Not Configured')
    }

    return config.enabled
      ? this.t('PAC.Assistant.Enabled', 'Enabled')
      : this.t('PAC.KEY_WORDS.Disabled', 'Disabled')
  }

  sourceStateLabel(config?: IAssistantBinding | null) {
    if (config) {
      return config.scope === AssistantBindingScope.ORGANIZATION
        ? this.t('PAC.Assistant.SavedInOrganizationScope', 'Saved in organization scope')
        : this.t('PAC.Assistant.SavedInTenantScope', 'Saved in tenant scope')
    }

    return this.t('PAC.Assistant.NoSavedConfigInScope', 'No saved config in this scope')
  }

  assistantSearchTerm(scope: AssistantBindingScope, code: AssistantCode) {
    return this.assistantSearchTerms()[this.assistantSearchKey(scope, code)] ?? ''
  }

  assistantSelectionValue(scope: AssistantBindingScope, code: AssistantCode) {
    return scope === AssistantBindingScope.TENANT
      ? this.tenantForm(code).controls.assistantId.value
      : this.organizationForm(code).controls.assistantId.value
  }

  assistantXpertOptions(scope: AssistantBindingScope, code: AssistantCode): ZardComboboxDeprecatedOption[] {
    const searchTerm = this.assistantSearchTerm(scope, code).trim().toLowerCase()
    const xperts =
      scope === AssistantBindingScope.TENANT
        ? this.tenantXperts()
        : this.organizationAvailableXperts()

    return xperts
      .filter((xpert) => {
        if (!searchTerm) {
          return true
        }

        return [xpert.id, xpert.slug, xpert.name, xpert.title, xpert.titleCN, xpert.description]
          .filter((value): value is string => !!value)
          .some((value) => value.toLowerCase().includes(searchTerm))
      })
      .map((xpert) => {
        const label = this.getXpertLabel(xpert)
        const description = this.getXpertDescription(xpert)
        const meta = this.getXpertMeta(xpert, label)

        return {
          id: xpert.id,
          label,
          value: xpert.id,
          keywords: [label, description, meta].filter((value): value is string => !!value),
          data: {
            id: xpert.id,
            label,
            description,
            meta
          }
        }
      })
  }

  onAssistantSearchTermChange(scope: AssistantBindingScope, code: AssistantCode, value: string) {
    const key = this.assistantSearchKey(scope, code)

    if (this.#skipNextAssistantSearchSync.has(key)) {
      this.#skipNextAssistantSearchSync.delete(key)
      this.setAssistantSearchTerm(key, '')
      return
    }

    this.setAssistantSearchTerm(key, value)
  }

  selectAssistantXpert(scope: AssistantBindingScope, code: AssistantCode, value: unknown) {
    const assistantId = value ? `${value}` : ''
    const form = scope === AssistantBindingScope.TENANT ? this.tenantForm(code) : this.organizationForm(code)

    form.controls.assistantId.setValue(assistantId)
    form.controls.assistantId.markAsDirty()
    form.controls.assistantId.markAsTouched()
    this.resetAssistantSearch(scope, code)
  }

  async saveConfig(assistant: AssistantRegistryItem, scope: AssistantBindingScope) {
    const form =
      scope === AssistantBindingScope.TENANT ? this.tenantForm(assistant.code) : this.organizationForm(assistant.code)
    form.markAllAsTouched()

    if (form.invalid) {
      return
    }

    const savingKey = `${assistant.code}:${scope}`
    this.savingKey.set(savingKey)

    try {
      await firstValueFrom(
        this.#assistantBindingService.upsert({
          code: assistant.code,
          scope,
          enabled: form.getRawValue().enabled,
          assistantId: form.getRawValue().assistantId
        })
      )
      this.#toastr.success('PAC.MESSAGE.UpdateSuccess', { Default: 'Saved successfully' })
      await this.loadConfigs()
    } catch (error) {
      this.#toastr.error(
        getErrorMessage(error) || this.t('PAC.Assistant.SaveFailed', 'Failed to save assistant configuration.')
      )
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
      await firstValueFrom(this.#assistantBindingService.delete(assistant.code, AssistantBindingScope.ORGANIZATION))
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
        IAssistantBinding[],
        IAssistantBinding[],
        IResolvedAssistantBinding[]
      ] = await Promise.all([
        firstValueFrom<IAssistantBinding[]>(this.#assistantBindingService.getByScope(AssistantBindingScope.TENANT)),
        this.organizationId()
          ? firstValueFrom<IAssistantBinding[]>(
              this.#assistantBindingService.getByScope(AssistantBindingScope.ORGANIZATION)
            )
          : Promise.resolve([] as IAssistantBinding[]),
        Promise.all(
          assistants.map((assistant) =>
            firstValueFrom<IResolvedAssistantBinding>(this.#assistantBindingService.getEffective(assistant.code))
          )
        )
      ])

      this.tenantConfigs.set(this.toConfigMap(tenantConfigs))
      this.organizationConfigs.set(this.toConfigMap(organizationConfigs))
      this.effectiveConfigs.set(
        effectiveConfigs.reduce((acc, item) => {
          acc[item.code] = item
          return acc
        }, {} as Partial<Record<AssistantCode, IResolvedAssistantBinding>>)
      )

      ASSISTANT_REGISTRY.forEach((assistant) => {
        this.patchForm(this.tenantForm(assistant.code), this.tenantConfig(assistant.code))
        this.patchForm(this.organizationForm(assistant.code), this.organizationConfig(assistant.code))
        this.clearAssistantSearch(AssistantBindingScope.TENANT, assistant.code)
        this.clearAssistantSearch(AssistantBindingScope.ORGANIZATION, assistant.code)
      })

      if (!this.canManageTenant()) {
        Object.values(this.tenantForms).forEach((form) => form.disable({ emitEvent: false }))
      }
      if (!this.organizationId()) {
        Object.values(this.organizationForms).forEach((form) => form.disable({ emitEvent: false }))
      }
    } catch (error) {
      this.#toastr.error(
        getErrorMessage(error) || this.t('PAC.Assistant.LoadFailed', 'Failed to load assistant configurations.')
      )
    } finally {
      this.loading.set(false)
    }
  }

  private patchForm(form: ReturnType<AssistantsSettingsFacade['createForm']>, config?: IAssistantBinding | null) {
    form.reset(
      {
        enabled: config?.enabled ?? true,
        assistantId: config?.assistantId ?? ''
      },
      { emitEvent: false }
    )
  }

  private createForm() {
    return this.#formBuilder.nonNullable.group({
      enabled: this.#formBuilder.nonNullable.control(true),
      assistantId: this.#formBuilder.nonNullable.control('', Validators.required)
    })
  }

  private toConfigMap(items: IAssistantBinding[]) {
    return items.reduce((acc, item) => {
      acc[item.code] = item
      return acc
    }, {} as Partial<Record<AssistantCode, IAssistantBinding>>)
  }

  private getXpertLabel(xpert: Partial<IXpert> | null | undefined) {
    return xpert?.title || xpert?.titleCN || xpert?.name || xpert?.slug || xpert?.id || ''
  }

  private getXpertDescription(xpert: Partial<IXpert> | null | undefined) {
    return xpert?.description?.trim() || ''
  }

  private getXpertMeta(xpert: Partial<IXpert> | null | undefined, label?: string) {
    return [xpert?.slug, xpert?.id]
      .filter((value): value is string => !!value && value !== label)
      .filter((value, index, values) => values.indexOf(value) === index)
      .join(' / ')
  }

  private normalizeXperts(items: IXpert[] | IPagination<IXpert> | null | undefined): IXpert[] {
    const seen = new Set<string>()
    const candidates = Array.isArray(items) ? items : (Array.isArray(items?.items) ? items.items : [])

    return candidates.filter((xpert): xpert is IXpert => {
      if (!xpert?.id || xpert.latest === false || seen.has(xpert.id)) {
        return false
      }

      seen.add(xpert.id)
      return true
    })
  }

  private assistantSearchKey(scope: AssistantBindingScope, code: AssistantCode) {
    return `${scope}:${code}`
  }

  private setAssistantSearchTerm(key: string, value: string) {
    this.assistantSearchTerms.update((state) => ({
      ...state,
      [key]: value
    }))
  }

  private resetAssistantSearch(scope: AssistantBindingScope, code: AssistantCode) {
    const key = this.assistantSearchKey(scope, code)
    this.#skipNextAssistantSearchSync.add(key)
    this.setAssistantSearchTerm(key, '')
  }

  private clearAssistantSearch(scope: AssistantBindingScope, code: AssistantCode) {
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

function sanitizeConfiguredFrameUrl(frameUrl?: string | null) {
  const normalized = frameUrl?.trim()
  if (!normalized || normalized.startsWith('DOCKER_')) {
    return null
  }

  return normalized
}
