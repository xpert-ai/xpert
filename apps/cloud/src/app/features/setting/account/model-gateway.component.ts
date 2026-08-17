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
  ZardAccordionImports,
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardCardImports,
  ZardDialogService,
  ZardEmptyComponent,
  ZardFormImports,
  ZardIconComponent,
  ZardInputDirective,
  ZardTableImports
} from '@xpert-ai/headless-ui'
import { XpSpinComponent } from '@xpert-ai/headless-ui'
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
    XpSpinComponent,
    ...ZardAccordionImports,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardEmptyComponent,
    ZardIconComponent,
    ZardInputDirective,
    ...ZardFormImports,
    ...ZardCardImports,
    ...ZardTableImports
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpAccountModelGatewayComponent implements OnInit {
  readonly #service = inject(ModelGatewayService)
  readonly #dialog = inject(ZardDialogService)
  readonly #toastr = injectToastr()
  readonly #translate = inject(TranslateService)
  readonly #document = inject(DOCUMENT)
  readonly #clipboard = inject(Clipboard)
  readonly #store = inject(Store)
  readonly #destroyRef = inject(DestroyRef)
  #loadSequence = 0

  readonly loading = signal(false)
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
  readonly curlExample = computed(() => {
    const model = this.catalog()?.items.find((item) => item.grant)?.externalModelId ?? 'MODEL_ID'
    return `curl ${this.apiBaseUrl}/chat/completions \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"${model}","messages":[{"role":"user","content":"Hello"}]}'`
  })
  readonly requestStatus = ModelAccessRequestStatusEnum
  readonly keyStatus = ModelGatewayApiKeyStatusEnum

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
      this.#dialog.open<
        ModelGatewayRequestDialogComponent,
        IModelGatewayCatalogItem,
        ModelGatewayRequestDialogResult | null
      >(ModelGatewayRequestDialogComponent, {
        data: item,
        width: 'min(92vw, 520px)'
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
      this.#dialog.open<ModelAccessWithdrawDialogComponent, undefined, ModelAccessWithdrawDialogResult | null>(
        ModelAccessWithdrawDialogComponent,
        { width: 'min(92vw, 500px)' }
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
      this.#dialog.open<
        ModelGatewayKeyDialogComponent,
        undefined,
        Parameters<ModelGatewayService['createKey']>[0] | null
      >(ModelGatewayKeyDialogComponent, { width: 'min(92vw, 500px)' }).closed
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
      this.#dialog.open<ModelAccessActionDialogComponent, { mode: 'revoke' }, ModelAccessActionDialogResult | null>(
        ModelAccessActionDialogComponent,
        { data: { mode: 'revoke' }, width: 'min(92vw, 500px)' }
      ).closed
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

  currentRequestStatus(request: IModelAccessRequest) {
    return getCurrentModelAccessStatus(request, this.grants())
  }

  formatDate(value?: Date | string | null) {
    return value
      ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
      : '—'
  }
}
