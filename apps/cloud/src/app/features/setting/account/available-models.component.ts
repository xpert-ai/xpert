import { Dialog } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { Component, computed, DestroyRef, inject, linkedSignal, OnInit, signal } from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  AiModelTypeEnum,
  I18nObject,
  IModelAccessCatalog,
  IModelAccessCatalogItem,
  IModelAccessRequest,
  ModelAccessRequestStatusEnum,
  ModelAccessSourceEnum,
  UserModelGrantStatusEnum
} from '@xpert-ai/contracts'
import { XpI18nPipe } from '@xpert-ai/headless-ui'
import {
  ZardAvatarComponent,
  ZardAccordionImports,
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardCardImports,
  ZardEmptyComponent,
  ZardIconComponent,
  ZardSearchInputComponent,
  ZardSelectImports,
  ZardTableImports,
  ZardTabsImports
} from '@xpert-ai/headless-ui'
import { catchError, combineLatest, firstValueFrom, map, of, startWith, Subject, switchMap } from 'rxjs'
import { ModelAccessService } from '../../../@core/services/model-access.service'
import { injectAiProviders } from '../../../@core/services/copilot-server.service'
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
import { AvailableModelRowComponent } from './available-model-row.component'
import { ModelTypeIconComponent } from './model-type-icon.component'

interface AvailableModelProviderGroup {
  provider: string
  label?: I18nObject | null
  icon?: I18nObject
  items: IModelAccessCatalogItem[]
}

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
    XpI18nPipe,
    AvailableModelRowComponent,
    ModelTypeIconComponent,
    ...ZardAccordionImports,
    ZardAvatarComponent,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardEmptyComponent,
    ZardIconComponent,
    ZardSearchInputComponent,
    ...ZardSelectImports,
    ...ZardTableImports,
    ...ZardTabsImports,
    ...ZardCardImports
  ]
})
export class XpAccountAvailableModelsComponent implements OnInit {
  readonly #service = inject(ModelAccessService)
  readonly #frameDialog = inject(Dialog)
  readonly #translate = inject(TranslateService)
  readonly #toastr = injectToastr()
  readonly #destroyRef = inject(DestroyRef)
  #catalogSubscribed = false
  readonly #stateRetry = new Subject<void>()
  readonly #providers = injectAiProviders()

  readonly state = toSignal(
    this.#stateRetry.pipe(
      startWith(undefined),
      switchMap(() =>
        combineLatest([this.#service.myRequests$, this.#service.myGrants$]).pipe(
          map(([requests, grants]) => ({ requests, grants })),
          startWith(undefined),
          catchError((error) => {
            this.#toastr.error(getErrorMessage(error))
            return of(null)
          })
        )
      )
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
  readonly allModelTypes = '__all__'
  readonly modelTypeControl = new FormControl<AiModelTypeEnum | typeof this.allModelTypes>(this.allModelTypes, {
    nonNullable: true
  })
  readonly modelType = toSignal(this.modelTypeControl.valueChanges, { initialValue: this.allModelTypes })
  readonly collapsedProviders = linkedSignal({
    source: () => ({ search: this.availableModelSearch(), type: this.modelType() }),
    computation: () => new Set<string>()
  })
  readonly modelTypes = computed(() => [...new Set(this.availableModels().map((item) => item.modelType))])
  readonly filteredAvailableModels = computed(() => {
    const search = this.availableModelSearch().trim().toLowerCase()
    const items = this.availableModels().filter(
      (item) => this.modelType() === this.allModelTypes || item.modelType === this.modelType()
    )
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
  readonly providerGroups = computed(() => {
    const providers = new Map(this.#providers()?.map((provider) => [provider.provider, provider]))
    const groups = new Map<string, AvailableModelProviderGroup>()
    for (const item of this.filteredAvailableModels()) {
      let group = groups.get(item.provider)
      if (!group) {
        const provider = providers.get(item.provider)
        group = {
          provider: item.provider,
          label: item.providerLabel ?? provider?.label,
          icon: provider?.icon_small,
          items: []
        }
        groups.set(item.provider, group)
      }
      group.items.push(item)
    }
    return [...groups.values()]
  })

  readonly requestedStatus = ModelAccessRequestStatusEnum.Requested
  readonly expandedRequestId = signal<string | null>(null)

  ngOnInit() {
    this.loadAvailableModels()
  }

  retryState() {
    this.#stateRetry.next()
    this.loadAvailableModels()
  }

  clearFilters() {
    this.availableModelSearchControl.setValue('')
    this.modelTypeControl.setValue(this.allModelTypes)
  }

  toggleRequest(request: IModelAccessRequest) {
    this.expandedRequestId.update((id) => (id === request.id ? null : request.id))
  }

  setProviderExpanded(provider: string, expanded: boolean) {
    this.collapsedProviders.update((current) => {
      const next = new Set(current)
      expanded ? next.delete(provider) : next.add(provider)
      return next
    })
  }

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
      this.#frameDialog.open<
        ModelAccessRequestDialogResult | null,
        { items: typeof items },
        ModelAccessRequestDialogComponent
      >(ModelAccessRequestDialogComponent, {
        data: { items },
        width: '560px',
        maxWidth: 'calc(100vw - 32px)',
        backdropClass: 'backdrop-blur-xs-black',
        panelClass: 'xp-overlay-pane-dialog'
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
      this.#frameDialog.open<ModelAccessWithdrawDialogResult | null, undefined, ModelAccessWithdrawDialogComponent>(
        ModelAccessWithdrawDialogComponent,
        {
          width: 'min(92vw, 520px)',
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
      await firstValueFrom(this.#service.withdrawRequest(request.id, { reason: result.reason }))
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    }
  }
}
