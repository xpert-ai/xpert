import { CommonModule } from '@angular/common'
import { Component, computed, DestroyRef, inject, signal } from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  IModelAccessCatalog,
  IModelAccessRequest,
  ModelAccessRequestStatusEnum,
  ModelAccessSourceEnum,
  UserModelGrantStatusEnum
} from '@xpert-ai/contracts'
import { XpSpinComponent } from '@xpert-ai/headless-ui'
import { XpI18nPipe } from '@xpert-ai/headless-ui'
import {
  ZardAccordionImports,
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardCardImports,
  ZardDialogService,
  ZardEmptyComponent,
  ZardFormImports,
  ZardInputDirective
} from '@xpert-ai/headless-ui'
import { catchError, combineLatest, firstValueFrom, map, of, startWith } from 'rxjs'
import { ModelAccessService } from '../../../@core/services/model-access.service'
import { injectToastr } from '../../../@core/services/toastr.service'
import { getErrorMessage } from '../../../@core/types'
import {
  ModelAccessRequestDialogComponent,
  ModelAccessRequestDialogResult
} from './model-access-request-dialog.component'
import {
  ModelAccessWithdrawDialogComponent,
  ModelAccessWithdrawDialogResult
} from './model-access-withdraw-dialog.component'
import { getCurrentModelAccessStatus } from '../model-access/model-access-status'

@Component({
  standalone: true,
  selector: 'xp-account-available-models',
  templateUrl: './available-models.component.html',
  host: {
    class: 'flex min-w-0 w-full max-w-full flex-1'
  },
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    XpSpinComponent,
    XpI18nPipe,
    ...ZardAccordionImports,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardEmptyComponent,
    ZardInputDirective,
    ...ZardFormImports,
    ...ZardCardImports
  ]
})
export class XpAccountAvailableModelsComponent {
  readonly #service = inject(ModelAccessService)
  readonly #dialog = inject(ZardDialogService)
  readonly #translate = inject(TranslateService)
  readonly #toastr = injectToastr()
  readonly #destroyRef = inject(DestroyRef)
  #catalogSubscribed = false

  readonly state = toSignal(
    combineLatest([this.#service.myRequests$, this.#service.myGrants$]).pipe(
      map(([requests, grants]) => ({ requests, grants })),
      catchError((error) => {
        this.#toastr.error(getErrorMessage(error))
        return of(null)
      })
    ),
    { initialValue: undefined }
  )
  readonly catalog = signal<IModelAccessCatalog | null>(null)
  readonly catalogLoading = signal(false)
  readonly catalogLoadFailed = signal(false)
  readonly requestAvailability = computed<boolean | null>(() => this.catalog()?.canRequest ?? null)
  readonly availableModels = computed(
    () =>
      this.catalog()?.items.filter((item) => item.planIncluded || item.accessSource === ModelAccessSourceEnum.Direct) ??
      []
  )
  readonly grantModels = computed(
    () => this.state()?.grants.filter((item) => item.status === UserModelGrantStatusEnum.Active) ?? []
  )
  readonly requestableModels = computed(() => this.catalog()?.items.filter((item) => item.requestable) ?? [])
  readonly availableModelSearchControl = new FormControl('', { nonNullable: true })
  readonly availableModelSearch = toSignal(this.availableModelSearchControl.valueChanges.pipe(startWith('')), {
    initialValue: ''
  })
  readonly filteredAvailableModels = computed(() => {
    const search = this.availableModelSearch().trim().toLowerCase()
    const items = this.availableModels()
    if (!search) {
      return items
    }
    return items.filter((item) =>
      [
        item.externalModelId,
        item.model,
        item.modelLabel?.en_US,
        item.modelLabel?.zh_Hans,
        item.provider,
        item.providerLabel?.en_US,
        item.providerLabel?.zh_Hans,
        item.copilotName
      ].some((value) => value?.toLowerCase().includes(search))
    )
  })

  readonly requestedStatus = ModelAccessRequestStatusEnum.Requested

  loadAvailableModels() {
    if (this.#catalogSubscribed || this.catalogLoading()) {
      return
    }

    this.#catalogSubscribed = true
    this.catalogLoading.set(true)
    this.catalogLoadFailed.set(false)
    this.#service.catalog$.pipe(takeUntilDestroyed(this.#destroyRef)).subscribe({
      next: (catalog) => {
        this.catalog.set(catalog)
        this.catalogLoading.set(false)
      },
      error: (error) => {
        this.#catalogSubscribed = false
        this.catalog.set(null)
        this.catalogLoading.set(false)
        this.catalogLoadFailed.set(true)
        this.#toastr.error(getErrorMessage(error))
      }
    })
  }

  currentRequestStatus(request: IModelAccessRequest) {
    return getCurrentModelAccessStatus(request, this.state()?.grants ?? [])
  }

  formatValidUntil(value: Date | string) {
    return this.#service.formatValidUntil(value)
  }

  async apply() {
    const items = this.requestableModels()
    if (!items.length) {
      return
    }
    const result = await firstValueFrom(
      this.#dialog.open<
        ModelAccessRequestDialogComponent,
        { items: typeof items },
        ModelAccessRequestDialogResult | null
      >(ModelAccessRequestDialogComponent, {
        data: { items },
        width: 'min(92vw, 560px)'
      }).closed
    )
    if (!result) {
      return
    }
    try {
      await firstValueFrom(
        this.#service.createRequest({
          copilotId: result.item.copilotId,
          copilotModelId: result.item.copilotModelId,
          modelType: result.item.modelType,
          reason: result.reason
        })
      )
      this.#toastr.success(
        this.#translate.instant('XP.ModelAccess.RequestSubmitted', {
          Default: 'Model access request submitted.'
        })
      )
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    }
  }

  async withdraw(request: IModelAccessRequest) {
    const result = await firstValueFrom(
      this.#dialog.open<ModelAccessWithdrawDialogComponent, undefined, ModelAccessWithdrawDialogResult | null>(
        ModelAccessWithdrawDialogComponent,
        { width: 'min(92vw, 520px)' }
      ).closed
    )
    if (!result) {
      return
    }
    try {
      await firstValueFrom(this.#service.withdrawRequest(request.id, { reason: result.reason }))
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    }
  }
}
