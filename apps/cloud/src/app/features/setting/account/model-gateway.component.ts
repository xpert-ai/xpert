import { Dialog } from '@angular/cdk/dialog'
import { CommonModule, DOCUMENT } from '@angular/common'
import { Clipboard } from '@angular/cdk/clipboard'
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  IModelGatewayApiKey,
  IModelGatewayCall,
  IModelGatewayCatalog,
  IModelGatewayCatalogItem,
  IModelAccessRequest,
  IUserModelGrant,
  ModelAccessRequestStatusEnum,
  ModelGatewayApiKeyStatusEnum
} from '@xpert-ai/contracts'
import {
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardCardImports,
  ZardEmptyComponent,
  ZardIconComponent,
  ZardFormImports,
  ZardSearchInputComponent,
  ZardSelectImports,
  ZardTableImports,
  ZardTabsImports,
  ZardTooltipImports
} from '@xpert-ai/headless-ui'
import { EyeOff } from 'lucide-angular'
import { firstValueFrom, startWith } from 'rxjs'
import { API_PREFIX, Store } from '@cloud/app/@core/state'
import { ModelGatewayService } from '../../../@core/services/model-gateway.service'
import { injectToastr } from '../../../@core/services/toastr.service'
import { getErrorMessage } from '../../../@core/types'
import {
  ModelAccessActionDialogComponent,
  ModelAccessActionDialogResult
} from '../model-access/model-access-action-dialog.component'
import { ModelGatewayKeyDialogComponent } from './model-gateway-key-dialog.component'
import {
  ModelGatewayRequestDialogComponent,
  ModelGatewayRequestDialogResult
} from './model-gateway-request-dialog.component'
import {
  ModelAccessWithdrawDialogComponent,
  ModelAccessWithdrawDialogResult
} from './model-access-withdraw-dialog.component'
import { getCurrentModelAccessStatus } from '../model-access/model-access-status'
import { modelGatewayCurlExample, ModelGatewayExampleThinking } from './model-gateway-examples'

@Component({
  standalone: true,
  selector: 'xp-account-model-gateway',
  templateUrl: './model-gateway.component.html',
  host: {
    class: 'flex min-w-0 w-full max-w-full flex-1'
  },
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardEmptyComponent,
    ZardIconComponent,
    ZardSearchInputComponent,
    ...ZardFormImports,
    ...ZardSelectImports,
    ...ZardCardImports,
    ...ZardTableImports,
    ...ZardTabsImports,
    ...ZardTooltipImports
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpAccountModelGatewayComponent implements OnInit {
  readonly #service = inject(ModelGatewayService)
  readonly #frameDialog = inject(Dialog)
  readonly #toastr = injectToastr()
  readonly #translate = inject(TranslateService)
  readonly #document = inject(DOCUMENT)
  readonly #clipboard = inject(Clipboard)
  readonly #store = inject(Store)
  readonly #destroyRef = inject(DestroyRef)
  #loadSequence = 0

  readonly loading = signal(false)
  readonly loadFailed = signal(false)
  readonly selectedTabIndex = signal(0)
  readonly revealedKeys = signal(new Set<string>())
  readonly eyeOffIcon = EyeOff
  readonly catalog = signal<IModelGatewayCatalog | null>(null)
  readonly requests = signal<IModelAccessRequest[]>([])
  readonly grants = signal<IUserModelGrant[]>([])
  readonly keys = signal<IModelGatewayApiKey[]>([])
  readonly calls = signal<IModelGatewayCall[]>([])
  readonly requestPageIndex = signal(0)
  readonly requestPageSize = 5
  readonly requestPageCount = computed(() => Math.max(1, Math.ceil(this.requests().length / this.requestPageSize)))
  readonly pagedRequests = computed(() => {
    const start = this.requestPageIndex() * this.requestPageSize
    return this.requests().slice(start, start + this.requestPageSize)
  })
  readonly callTotal = signal(0)
  readonly callPageIndex = signal(0)
  readonly callPageSize = 20
  readonly callPageCount = computed(() => Math.max(1, Math.ceil(this.callTotal() / this.callPageSize)))
  readonly modelSearchControl = new FormControl('', { nonNullable: true })
  readonly modelSearch = toSignal(this.modelSearchControl.valueChanges.pipe(startWith('')), { initialValue: '' })
  readonly filteredCatalogItems = computed(() => {
    const search = this.modelSearch().trim().toLowerCase()
    const items = this.catalog()?.items ?? []
    if (!search) {
      return items
    }
    return items.filter((item) =>
      [item.externalModelId, item.provider, item.model].some((value) => value.toLowerCase().includes(search))
    )
  })
  readonly apiBaseUrl = `${this.#document.defaultView?.location.origin ?? ''}${API_PREFIX}/openai/v1`
  readonly exampleModelId = signal<string | null>(null)
  readonly exampleThinking = signal<ModelGatewayExampleThinking>('default')
  readonly exampleModels = computed(
    () => this.catalog()?.items.filter((item) => item.allowed && !item.deprecated) ?? []
  )
  readonly exampleModel = computed(
    () => this.exampleModels().find((item) => item.id === this.exampleModelId()) ?? this.exampleModels()[0] ?? null
  )
  readonly curlExample = computed(() =>
    modelGatewayCurlExample(this.apiBaseUrl, this.exampleModel()?.externalModelId ?? 'MODEL_ID', this.exampleThinking())
  )
  readonly requestStatus = ModelAccessRequestStatusEnum
  readonly keyStatus = ModelGatewayApiKeyStatusEnum

  selectExampleModel(value: string | number | Array<string | number>) {
    if (typeof value === 'string' && this.exampleModels().some((item) => item.id === value)) {
      this.exampleModelId.set(value)
    }
  }

  selectExampleThinking(value: string | number | Array<string | number>) {
    if (value === 'default' || value === 'enabled' || value === 'disabled') this.exampleThinking.set(value)
  }

  ngOnInit() {
    this.#store
      .selectOrganizationId()
      .pipe(takeUntilDestroyed(this.#destroyRef))
      .subscribe(() => {
        this.requestPageIndex.set(0)
        this.callPageIndex.set(0)
        void this.load()
      })
  }

  async load() {
    const loadSequence = ++this.#loadSequence
    this.loading.set(true)
    this.loadFailed.set(false)
    this.revealedKeys.set(new Set())
    try {
      const [catalog, requests, grants, keys, calls] = await Promise.all([
        firstValueFrom(this.#service.getCatalog()),
        firstValueFrom(this.#service.getMyRequests()),
        firstValueFrom(this.#service.getMyGrants()),
        firstValueFrom(this.#service.getMyKeys()),
        firstValueFrom(this.#service.getMyCalls(this.callPageSize, this.callPageIndex() * this.callPageSize))
      ])
      if (loadSequence !== this.#loadSequence) {
        return
      }
      this.catalog.set(catalog)
      this.requests.set(requests)
      this.grants.set(grants)
      this.requestPageIndex.update((value) => Math.min(value, this.requestPageCount() - 1))
      this.keys.set(keys)
      this.calls.set(calls.items)
      this.callTotal.set(calls.total)
    } catch (error) {
      if (loadSequence === this.#loadSequence) {
        this.loadFailed.set(true)
        this.#toastr.error(getErrorMessage(error))
      }
    } finally {
      if (loadSequence === this.#loadSequence) {
        this.loading.set(false)
      }
    }
  }

  async apply(item: IModelGatewayCatalogItem) {
    const result = await firstValueFrom(
      this.#frameDialog.open<
        ModelGatewayRequestDialogResult | null,
        IModelGatewayCatalogItem,
        ModelGatewayRequestDialogComponent
      >(ModelGatewayRequestDialogComponent, {
        data: item,
        width: 'min(92vw, 520px)',
        backdropClass: 'backdrop-blur-xs-black',
        panelClass: 'xp-overlay-pane-dialog',
        maxWidth: 'calc(100vw - 32px)'
      }).closed
    )
    if (!result) {
      return
    }
    try {
      await firstValueFrom(
        this.#service.createRequest({
          copilotId: item.copilotId,
          copilotModelId: item.copilotModelId,
          modelType: item.modelType,
          reason: result.reason
        })
      )
      this.#toastr.success(
        this.#translate.instant('XP.ModelGateway.RequestSubmitted', {
          Default: 'External API model request submitted.'
        })
      )
      this.requestPageIndex.set(0)
      await this.load()
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    }
  }

  async withdraw(request: IModelAccessRequest) {
    const result = await firstValueFrom(
      this.#frameDialog.open<ModelAccessWithdrawDialogResult | null, undefined, ModelAccessWithdrawDialogComponent>(
        ModelAccessWithdrawDialogComponent,
        {
          width: 'min(92vw, 500px)',
          backdropClass: 'backdrop-blur-xs-black',
          panelClass: 'xp-overlay-pane-dialog',
          maxWidth: 'calc(100vw - 32px)'
        }
      ).closed
    )
    if (!result) {
      return
    }
    try {
      await firstValueFrom(this.#service.withdrawRequest(request.id, result.reason))
      await this.load()
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    }
  }

  async createKey() {
    const input = await firstValueFrom(
      this.#frameDialog.open<
        Parameters<ModelGatewayService['createKey']>[0] | null,
        undefined,
        ModelGatewayKeyDialogComponent
      >(ModelGatewayKeyDialogComponent, {
        width: '500px',
        maxWidth: 'calc(100vw - 32px)',
        backdropClass: 'backdrop-blur-xs-black',
        panelClass: 'xp-overlay-pane-dialog'
      }).closed
    )
    if (!input) {
      return
    }
    try {
      await firstValueFrom(this.#service.createKey(input))
      await this.load()
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    }
  }

  async revokeKey(key: IModelGatewayApiKey) {
    const result = await firstValueFrom(
      this.#frameDialog.open<
        ModelAccessActionDialogResult | null,
        { mode: 'revoke' },
        ModelAccessActionDialogComponent
      >(ModelAccessActionDialogComponent, {
        data: { mode: 'revoke' },
        width: '500px',
        maxWidth: 'calc(100vw - 32px)',
        backdropClass: 'backdrop-blur-xs-black',
        panelClass: 'xp-overlay-pane-dialog'
      }).closed
    )
    if (!result?.reason) {
      return
    }
    try {
      await firstValueFrom(this.#service.revokeMyKey(key.id, { reason: result.reason }))
      await this.load()
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    }
  }

  previousRequestsPage() {
    if (this.requestPageIndex() > 0) {
      this.requestPageIndex.update((value) => value - 1)
    }
  }

  nextRequestsPage() {
    if (this.requestPageIndex() + 1 < this.requestPageCount()) {
      this.requestPageIndex.update((value) => value + 1)
    }
  }

  async previousCallsPage() {
    if (this.callPageIndex() === 0) {
      return
    }
    this.callPageIndex.update((value) => value - 1)
    await this.load()
  }

  async nextCallsPage() {
    if (this.callPageIndex() + 1 >= this.callPageCount()) {
      return
    }
    this.callPageIndex.update((value) => value + 1)
    await this.load()
  }

  copy(value: string) {
    try {
      if (!this.#clipboard.copy(value)) {
        this.#toastr.error(
          this.#translate.instant('XP.ModelGateway.CopyFailed', { Default: 'Failed to copy to clipboard' })
        )
        return
      }
      this.#toastr.success(this.#translate.instant('XP.ACTIONS.Copied', { Default: 'Copied' }))
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    }
  }

  toggleKey(id: string) {
    this.revealedKeys.update((current) => {
      const next = new Set(current)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  currentRequestStatus(request: IModelAccessRequest) {
    return getCurrentModelAccessStatus(request, this.grants())
  }

  formatDate(value?: Date | string | null) {
    return value
      ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
      : '—'
  }
}
