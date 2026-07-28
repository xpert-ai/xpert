import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  DEFAULT_MODEL_GATEWAY_BODY_RETENTION_DAYS,
  DEFAULT_MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS,
  DEFAULT_MODEL_GATEWAY_REQUESTS_PER_MINUTE,
  IModelGatewayAdminSettings,
  IModelGatewayApiKey,
  IModelGatewayCall,
  MAX_MODEL_GATEWAY_BODY_RETENTION_DAYS,
  MAX_MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS,
  MAX_MODEL_GATEWAY_REQUESTS_PER_MINUTE,
  MIN_MODEL_GATEWAY_BODY_RETENTION_DAYS,
  MIN_MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS,
  MIN_MODEL_GATEWAY_REQUESTS_PER_MINUTE,
  ModelGatewayApiKeyStatusEnum
} from '@xpert-ai/contracts'
import {
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardDialogService,
  ZardFormImports,
  ZardInputDirective,
  ZardSwitchComponent,
  ZardTableImports,
  ZardTabsImports
} from '@xpert-ai/headless-ui'
import { NgmSpinComponent } from '@xpert-ai/ocap-angular/common'
import { Store } from '@xpert-ai/cloud/state'
import { firstValueFrom } from 'rxjs'
import { ModelGatewayService } from '../../../@core/services/model-gateway.service'
import { injectToastr } from '../../../@core/services/toastr.service'
import { getErrorMessage } from '../../../@core/types'
import {
  ModelAccessActionDialogComponent,
  ModelAccessActionDialogResult
} from '../model-access/model-access-action-dialog.component'
import { ModelGatewayCallBodyDialogComponent } from './model-gateway-call-body-dialog.component'

type GatewayAdminTab = 'calls' | 'keys' | 'settings'

@Component({
  standalone: true,
  selector: 'pac-model-gateway-admin',
  templateUrl: './model-gateway.component.html',
  host: {
    class: 'flex min-w-0 w-full max-w-full flex-1'
  },
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    NgmSpinComponent,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardInputDirective,
    ZardSwitchComponent,
    ...ZardFormImports,
    ...ZardTableImports,
    ...ZardTabsImports
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModelGatewayAdminComponent implements OnInit {
  readonly #service = inject(ModelGatewayService)
  readonly #formBuilder = inject(FormBuilder)
  readonly #dialog = inject(ZardDialogService)
  readonly #toastr = injectToastr()
  readonly #translate = inject(TranslateService)
  readonly #store = inject(Store)
  readonly #destroyRef = inject(DestroyRef)
  readonly #organizationId = toSignal(this.#store.selectOrganizationId(), { initialValue: null })
  #loadSequence = 0

  readonly activeTab = signal<GatewayAdminTab>('calls')
  readonly loading = signal(false)
  readonly calls = signal<IModelGatewayCall[]>([])
  readonly keys = signal<IModelGatewayApiKey[]>([])
  readonly callTotal = signal(0)
  readonly keyTotal = signal(0)
  readonly callPageIndex = signal(0)
  readonly keyPageIndex = signal(0)
  readonly pageSize = 20
  readonly settings = signal<IModelGatewayAdminSettings | null>(null)
  readonly isTenantScope = computed(() => !this.#organizationId())
  readonly callPageCount = computed(() => Math.max(1, Math.ceil(this.callTotal() / this.pageSize)))
  readonly keyPageCount = computed(() => Math.max(1, Math.ceil(this.keyTotal() / this.pageSize)))

  readonly keyStatus = ModelGatewayApiKeyStatusEnum
  readonly minRequestsPerMinute = MIN_MODEL_GATEWAY_REQUESTS_PER_MINUTE
  readonly maxRequestsPerMinute = MAX_MODEL_GATEWAY_REQUESTS_PER_MINUTE
  readonly requestsPerMinuteErrorDefault = `Enter an integer from ${MIN_MODEL_GATEWAY_REQUESTS_PER_MINUTE} to ${MAX_MODEL_GATEWAY_REQUESTS_PER_MINUTE}`
  readonly minConcurrentRequests = MIN_MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS
  readonly maxConcurrentRequests = MAX_MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS
  readonly concurrentRequestsErrorDefault = `Enter an integer from ${MIN_MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS} to ${MAX_MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS}`
  readonly minBodyRetentionDays = MIN_MODEL_GATEWAY_BODY_RETENTION_DAYS
  readonly maxBodyRetentionDays = MAX_MODEL_GATEWAY_BODY_RETENTION_DAYS
  readonly bodyRetentionDaysErrorDefault = `Enter an integer from ${MIN_MODEL_GATEWAY_BODY_RETENTION_DAYS} to ${MAX_MODEL_GATEWAY_BODY_RETENTION_DAYS}`
  readonly filterForm = this.#formBuilder.nonNullable.group({
    callsSearch: '',
    keysSearch: ''
  })
  readonly settingsForm = this.#formBuilder.nonNullable.group({
    storeBodies: false,
    bodyRetentionDays: this.#formBuilder.nonNullable.control(DEFAULT_MODEL_GATEWAY_BODY_RETENTION_DAYS, [
      Validators.required,
      integerValidator,
      Validators.min(MIN_MODEL_GATEWAY_BODY_RETENTION_DAYS),
      Validators.max(MAX_MODEL_GATEWAY_BODY_RETENTION_DAYS)
    ]),
    requestsPerMinute: this.#formBuilder.nonNullable.control(DEFAULT_MODEL_GATEWAY_REQUESTS_PER_MINUTE, [
      Validators.required,
      integerValidator,
      Validators.min(MIN_MODEL_GATEWAY_REQUESTS_PER_MINUTE),
      Validators.max(MAX_MODEL_GATEWAY_REQUESTS_PER_MINUTE)
    ]),
    maxConcurrentRequests: this.#formBuilder.nonNullable.control(DEFAULT_MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS, [
      Validators.required,
      integerValidator,
      Validators.min(MIN_MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS),
      Validators.max(MAX_MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS)
    ])
  })

  get requestsPerMinuteCtrl() {
    return this.settingsForm.controls.requestsPerMinute
  }

  get bodyRetentionDaysCtrl() {
    return this.settingsForm.controls.bodyRetentionDays
  }

  get maxConcurrentRequestsCtrl() {
    return this.settingsForm.controls.maxConcurrentRequests
  }

  ngOnInit() {
    this.syncBodyRetentionDaysControl(this.settingsForm.controls.storeBodies.value)
    this.settingsForm.controls.storeBodies.valueChanges
      .pipe(takeUntilDestroyed(this.#destroyRef))
      .subscribe((enabled) => this.syncBodyRetentionDaysControl(enabled))
    this.#store
      .selectOrganizationId()
      .pipe(takeUntilDestroyed(this.#destroyRef))
      .subscribe(() => void this.load())
  }

  setTab(tab: GatewayAdminTab) {
    if (tab === 'settings' && !this.isTenantScope()) {
      return
    }
    this.activeTab.set(tab)
  }

  async load() {
    const loadSequence = ++this.#loadSequence
    this.loading.set(true)
    try {
      if (!this.isTenantScope() && this.activeTab() === 'settings') {
        this.activeTab.set('calls')
      }
      const [calls, keys, settings] = await Promise.all([
        firstValueFrom(
          this.#service.getAdminCalls({
            search: this.filterForm.controls.callsSearch.value.trim(),
            take: this.pageSize,
            skip: this.callPageIndex() * this.pageSize
          })
        ),
        firstValueFrom(
          this.#service.getAdminKeys({
            search: this.filterForm.controls.keysSearch.value.trim(),
            take: this.pageSize,
            skip: this.keyPageIndex() * this.pageSize
          })
        ),
        this.isTenantScope() ? firstValueFrom(this.#service.getSettings()) : Promise.resolve(null)
      ])
      if (loadSequence !== this.#loadSequence) {
        return
      }
      this.calls.set(calls.items)
      this.keys.set(keys.items)
      this.callTotal.set(calls.total)
      this.keyTotal.set(keys.total)
      this.settings.set(settings)
      if (settings) {
        this.settingsForm.reset(
          {
            storeBodies: settings.storeBodies,
            bodyRetentionDays: parseBoundedInteger(
              settings.bodyRetentionDays,
              DEFAULT_MODEL_GATEWAY_BODY_RETENTION_DAYS,
              MIN_MODEL_GATEWAY_BODY_RETENTION_DAYS,
              MAX_MODEL_GATEWAY_BODY_RETENTION_DAYS
            ),
            requestsPerMinute: parseBoundedInteger(
              settings.requestsPerMinute,
              DEFAULT_MODEL_GATEWAY_REQUESTS_PER_MINUTE,
              MIN_MODEL_GATEWAY_REQUESTS_PER_MINUTE,
              MAX_MODEL_GATEWAY_REQUESTS_PER_MINUTE
            ),
            maxConcurrentRequests: parseBoundedInteger(
              settings.maxConcurrentRequests,
              DEFAULT_MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS,
              MIN_MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS,
              MAX_MODEL_GATEWAY_MAX_CONCURRENT_REQUESTS
            )
          },
          { emitEvent: false }
        )
        this.syncBodyRetentionDaysControl(settings.storeBodies)
      }
    } catch (error) {
      if (loadSequence === this.#loadSequence) {
        this.#toastr.error(getErrorMessage(error))
      }
    } finally {
      if (loadSequence === this.#loadSequence) {
        this.loading.set(false)
      }
    }
  }

  async saveSettings() {
    if (this.settingsForm.invalid) {
      this.settingsForm.markAllAsTouched()
      return
    }
    try {
      const settings = await firstValueFrom(this.#service.updateSettings(this.settingsForm.getRawValue()))
      this.settings.set(settings)
      this.settingsForm.reset(
        {
          storeBodies: settings.storeBodies,
          bodyRetentionDays: settings.bodyRetentionDays,
          requestsPerMinute: settings.requestsPerMinute,
          maxConcurrentRequests: settings.maxConcurrentRequests
        },
        { emitEvent: false }
      )
      this.syncBodyRetentionDaysControl(settings.storeBodies)
      this.#toastr.success(
        this.#translate.instant('PAC.ModelGateway.SettingsSaved', { Default: 'Gateway settings saved.' })
      )
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    }
  }

  async revokeKey(key: IModelGatewayApiKey) {
    const result = await this.requestReason()
    if (!result?.reason) {
      return
    }
    try {
      await firstValueFrom(this.#service.revokeAdminKey(key.id, { reason: result.reason }))
      await this.load()
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    }
  }

  async applyActiveSearch() {
    if (this.activeTab() === 'calls') {
      this.callPageIndex.set(0)
    } else if (this.activeTab() === 'keys') {
      this.keyPageIndex.set(0)
    }
    await this.load()
  }

  async previousPage() {
    if (this.activeTab() === 'calls' && this.callPageIndex() > 0) {
      this.callPageIndex.update((value) => value - 1)
    } else if (this.activeTab() === 'keys' && this.keyPageIndex() > 0) {
      this.keyPageIndex.update((value) => value - 1)
    } else {
      return
    }
    await this.load()
  }

  async nextPage() {
    if (this.activeTab() === 'calls' && this.callPageIndex() + 1 < this.callPageCount()) {
      this.callPageIndex.update((value) => value + 1)
    } else if (this.activeTab() === 'keys' && this.keyPageIndex() + 1 < this.keyPageCount()) {
      this.keyPageIndex.update((value) => value + 1)
    } else {
      return
    }
    await this.load()
  }

  activePageNumber() {
    return this.activeTab() === 'calls' ? this.callPageIndex() + 1 : this.keyPageIndex() + 1
  }

  activePageCount() {
    return this.activeTab() === 'calls' ? this.callPageCount() : this.keyPageCount()
  }

  activeTotal() {
    return this.activeTab() === 'calls' ? this.callTotal() : this.keyTotal()
  }

  async viewCallBody(call: IModelGatewayCall) {
    try {
      const body = await firstValueFrom(this.#service.getAdminCallBody(call.id))
      this.#dialog.open<ModelGatewayCallBodyDialogComponent, { call: IModelGatewayCall; body: typeof body }>(
        ModelGatewayCallBodyDialogComponent,
        {
          data: { call, body },
          width: 'min(92vw, 960px)'
        }
      )
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    }
  }

  formatDate(value?: Date | string | null) {
    return value
      ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
      : '—'
  }

  private async requestReason() {
    return firstValueFrom(
      this.#dialog.open<ModelAccessActionDialogComponent, { mode: 'revoke' }, ModelAccessActionDialogResult | null>(
        ModelAccessActionDialogComponent,
        { data: { mode: 'revoke' }, width: 'min(92vw, 500px)' }
      ).closed
    )
  }

  private syncBodyRetentionDaysControl(enabled: boolean) {
    if (enabled) {
      this.bodyRetentionDaysCtrl.enable({ emitEvent: false })
    } else {
      this.bodyRetentionDaysCtrl.disable({ emitEvent: false })
    }
  }
}

function parseBoundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback
}

function integerValidator(control: AbstractControl<unknown>): ValidationErrors | null {
  const value = control.value
  if (value === null || value === undefined || value === '') {
    return null
  }
  return Number.isInteger(Number(value)) ? null : { integer: true }
}
