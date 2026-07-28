import { CommonModule } from '@angular/common'
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormBuilder, ReactiveFormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import {
  AiModelTypeEnum,
  AIPermissionsEnum,
  IModelAccessEvent,
  IModelAccessRequest,
  IUserModelGrant,
  ModelAccessChannelEnum,
  ModelAccessRequestStatusEnum,
  UserModelGrantStatusEnum
} from '@xpert-ai/contracts'
import {
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardDatePickerComponent,
  ZardDialogService,
  ZardFormImports,
  ZardInputDirective,
  ZardPaginationImports,
  ZardSelectImports,
  ZardTableImports,
  ZardTabsImports
} from '@xpert-ai/headless-ui'
import { NgmSpinComponent } from '@xpert-ai/ocap-angular/common'
import { NgmI18nPipe } from '@xpert-ai/ocap-angular/core'
import { format } from 'date-fns'
import { firstValueFrom } from 'rxjs'
import { Store } from '@xpert-ai/cloud/state'
import { ModelAccessService } from '../../../@core/services/model-access.service'
import { injectToastr } from '../../../@core/services/toastr.service'
import { getErrorMessage } from '../../../@core/types'
import {
  ModelAccessActionDialogComponent,
  ModelAccessActionDialogResult,
  ModelAccessActionMode
} from './model-access-action-dialog.component'
import { getGrantUnavailableReason } from './model-access-status'

type ModelAccessAdminTab = 'requests' | 'grants' | 'audit'

@Component({
  standalone: true,
  selector: 'pac-model-access-admin',
  templateUrl: './model-access.component.html',
  host: {
    class: 'flex min-w-0 w-full max-w-full flex-1'
  },
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    NgmSpinComponent,
    NgmI18nPipe,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardDatePickerComponent,
    ZardInputDirective,
    ...ZardFormImports,
    ...ZardPaginationImports,
    ...ZardSelectImports,
    ...ZardTableImports,
    ...ZardTabsImports
  ]
})
export class ModelAccessAdminComponent implements OnInit {
  readonly #service = inject(ModelAccessService)
  readonly #store = inject(Store)
  readonly #destroyRef = inject(DestroyRef)
  readonly #dialog = inject(ZardDialogService)
  readonly #toastr = injectToastr()
  readonly #formBuilder = inject(FormBuilder)

  readonly activeTab = signal<ModelAccessAdminTab>('requests')
  readonly requests = signal<IModelAccessRequest[]>([])
  readonly grants = signal<IUserModelGrant[]>([])
  readonly events = signal<IModelAccessEvent[]>([])
  readonly requestTotal = signal(0)
  readonly grantTotal = signal(0)
  readonly eventTotal = signal(0)
  readonly loading = signal(false)
  readonly pageSize = signal(20)
  readonly requestPageIndex = signal(0)
  readonly grantPageIndex = signal(0)
  readonly eventPageIndex = signal(0)

  readonly canEdit = computed(() => this.#store.hasPermission(AIPermissionsEnum.MODEL_ACCESS_REQUEST_EDIT))
  readonly activeTotal = computed(() => {
    switch (this.activeTab()) {
      case 'requests':
        return this.requestTotal()
      case 'grants':
        return this.grantTotal()
      case 'audit':
        return this.eventTotal()
    }
  })
  readonly activePageIndex = computed(() => {
    switch (this.activeTab()) {
      case 'requests':
        return this.requestPageIndex()
      case 'grants':
        return this.grantPageIndex()
      case 'audit':
        return this.eventPageIndex()
    }
  })
  readonly activePageCount = computed(() => Math.max(1, Math.ceil(this.activeTotal() / this.pageSize())))
  readonly activePageNumber = computed(() => Math.min(this.activePageIndex() + 1, this.activePageCount()))
  readonly paginationPages = computed(() => {
    const pageCount = this.activePageCount()
    if (pageCount <= 7) {
      return Array.from({ length: pageCount }, (_, index) => index + 1)
    }

    const current = this.activePageNumber()
    const middleStart = Math.max(2, Math.min(current - 1, pageCount - 3))
    return [1, middleStart, middleStart + 1, middleStart + 2, pageCount].filter(
      (page, index, pages) => pages.indexOf(page) === index
    )
  })
  readonly modelTypes = Object.values(AiModelTypeEnum)
  readonly channels = Object.values(ModelAccessChannelEnum)
  readonly requestStatuses = Object.values(ModelAccessRequestStatusEnum)
  readonly grantStatuses = Object.values(UserModelGrantStatusEnum)
  readonly grantUnavailableReason = getGrantUnavailableReason
  readonly statusOptions = computed(() =>
    this.activeTab() === 'requests' ? this.requestStatuses : this.activeTab() === 'grants' ? this.grantStatuses : []
  )

  readonly filterForm = this.#formBuilder.nonNullable.group({
    channel: '',
    search: '',
    modelType: '',
    status: '',
    expiresBefore: this.#formBuilder.control<Date | null>(null)
  })

  ngOnInit() {
    this.#store
      .selectActiveScope()
      .pipe(takeUntilDestroyed(this.#destroyRef))
      .subscribe(() => {
        this.resetPageIndexes()
        void this.load()
      })
  }

  setTab(tab: ModelAccessAdminTab) {
    this.activeTab.set(tab)
    this.filterForm.controls.status.setValue('')
  }

  async load() {
    this.loading.set(true)
    const raw = this.filterForm.getRawValue()
    const common = {
      channel: this.channels.find((value) => value === raw.channel),
      search: raw.search.trim() || undefined,
      modelType: this.modelTypes.find((value) => value === raw.modelType)
    }
    const pageSize = this.pageSize()
    const requestStatus = this.requestStatuses.find((value) => value === raw.status)
    const grantStatus = this.grantStatuses.find((value) => value === raw.status)
    try {
      const [requests, grants, events] = await Promise.all([
        firstValueFrom(
          this.#service.getAdminRequests({
            ...common,
            status: requestStatus,
            take: pageSize,
            skip: this.requestPageIndex() * pageSize
          })
        ),
        firstValueFrom(
          this.#service.getAdminGrants({
            ...common,
            status: grantStatus,
            expiresBefore: raw.expiresBefore ? format(raw.expiresBefore, 'yyyy-MM-dd') : undefined,
            take: pageSize,
            skip: this.grantPageIndex() * pageSize
          })
        ),
        firstValueFrom(
          this.#service.getAdminEvents({
            ...common,
            take: pageSize,
            skip: this.eventPageIndex() * pageSize
          })
        )
      ])
      this.requests.set(requests.items)
      this.requestTotal.set(requests.total)
      this.grants.set(grants.items)
      this.grantTotal.set(grants.total)
      this.events.set(events.items)
      this.eventTotal.set(events.total)
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.loading.set(false)
    }
  }

  applyFilters() {
    this.resetPageIndexes()
    void this.load()
  }

  resetFilters() {
    this.filterForm.reset()
    this.resetPageIndexes()
    void this.load()
  }

  onPage(pageNumber: number) {
    if (pageNumber < 1 || pageNumber > this.activePageCount() || pageNumber === this.activePageNumber()) {
      return
    }

    const pageIndex = pageNumber - 1
    switch (this.activeTab()) {
      case 'requests':
        this.requestPageIndex.set(pageIndex)
        break
      case 'grants':
        this.grantPageIndex.set(pageIndex)
        break
      case 'audit':
        this.eventPageIndex.set(pageIndex)
        break
    }

    void this.load()
  }

  formatValidUntil(value: Date | string) {
    return this.#service.formatValidUntil(value)
  }

  eventScope(event: Pick<IModelAccessEvent, 'organizationId'>) {
    return event.organizationId ? 'organization' : 'tenant'
  }

  async approve(request: IModelAccessRequest) {
    const result = await this.openAction('approve')
    if (!result) {
      return
    }
    await this.runMutation(() =>
      firstValueFrom(
        this.#service.approveRequest(request.id, {
          validUntil: result.validUntil,
          note: result.note
        })
      )
    )
  }

  async reject(request: IModelAccessRequest) {
    const result = await this.openAction('reject')
    if (!result?.reason) {
      return
    }
    await this.runMutation(() => firstValueFrom(this.#service.rejectRequest(request.id, { reason: result.reason })))
  }

  async extend(grant: IUserModelGrant) {
    const result = await this.openAction('extend')
    if (!result) {
      return
    }
    await this.runMutation(() =>
      firstValueFrom(
        this.#service.extendGrant(grant.id, {
          validUntil: result.validUntil ?? null,
          note: result.note
        })
      )
    )
  }

  async revoke(grant: IUserModelGrant) {
    const result = await this.openAction('revoke')
    if (!result?.reason) {
      return
    }
    await this.runMutation(() => firstValueFrom(this.#service.revokeGrant(grant.id, { reason: result.reason })))
  }

  private openAction(mode: ModelAccessActionMode) {
    return firstValueFrom(
      this.#dialog.open<
        ModelAccessActionDialogComponent,
        { mode: ModelAccessActionMode },
        ModelAccessActionDialogResult | null
      >(ModelAccessActionDialogComponent, {
        data: { mode },
        width: 'min(92vw, 520px)'
      }).closed
    )
  }

  private async runMutation(action: () => Promise<unknown>) {
    this.loading.set(true)
    try {
      await action()
      await this.load()
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
      this.loading.set(false)
    }
  }

  private resetPageIndexes() {
    this.requestPageIndex.set(0)
    this.grantPageIndex.set(0)
    this.eventPageIndex.set(0)
  }
}
