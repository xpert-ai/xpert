import { CommonModule } from '@angular/common'
import { Component, computed, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { IModelAccessRequest, ModelAccessSourceEnum, ModelAccessRequestStatusEnum } from '@xpert-ai/contracts'
import { NgmSpinComponent } from '@xpert-ai/ocap-angular/common'
import { NgmI18nPipe } from '@xpert-ai/ocap-angular/core'
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
  selector: 'pac-account-available-models',
  templateUrl: './available-models.component.html',
  host: {
    class: 'flex min-w-0 w-full max-w-full flex-1'
  },
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    NgmSpinComponent,
    NgmI18nPipe,
    ...ZardAccordionImports,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardEmptyComponent,
    ZardInputDirective,
    ...ZardFormImports,
    ...ZardCardImports
  ]
})
export class PACAccountAvailableModelsComponent {
  readonly #service = inject(ModelAccessService)
  readonly #dialog = inject(ZardDialogService)
  readonly #translate = inject(TranslateService)
  readonly #toastr = injectToastr()

  readonly state = toSignal(
    combineLatest([this.#service.catalog$, this.#service.myRequests$, this.#service.myGrants$]).pipe(
      map(([catalog, requests, grants]) => ({ catalog, requests, grants })),
      catchError((error) => {
        this.#toastr.error(getErrorMessage(error))
        return of(null)
      })
    ),
    { initialValue: undefined }
  )
  readonly availableModels = computed(
    () =>
      this.state()?.catalog.items.filter(
        (item) => item.planIncluded || item.accessSource === ModelAccessSourceEnum.Direct
      ) ?? []
  )
  readonly grantModels = computed(
    () =>
      this.state()?.catalog.items.filter(
        (item) =>
          !item.planIncluded && item.accessSource === ModelAccessSourceEnum.Grant && item.grant?.status === 'active'
      ) ?? []
  )
  readonly requestableModels = computed(() => this.state()?.catalog.items.filter((item) => item.requestable) ?? [])
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
        this.#translate.instant('PAC.ModelAccess.RequestSubmitted', {
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
