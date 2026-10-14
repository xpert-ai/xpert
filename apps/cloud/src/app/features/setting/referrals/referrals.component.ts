import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core'
import { FormBuilder, ReactiveFormsModule } from '@angular/forms'
import { ReferralService } from '@cloud/app/@core/state'
import { IReferralRelationView } from '@xpert-ai/contracts'
import {
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardIconComponent,
  ZardSearchInputComponent,
  ZardTableImports
} from '@xpert-ai/headless-ui'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { getErrorMessage } from '../../../@core/types'
import { injectToastr } from '../../../@core/services/toastr.service'

@Component({
  standalone: true,
  selector: 'xp-referral-relations',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block min-w-0 w-full'
  },
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    ZardButtonComponent,
    ZardIconComponent,
    ZardSearchInputComponent,
    ZardBadgeComponent,
    ...ZardTableImports
  ],
  templateUrl: './referrals.component.html'
})
export class ReferralRelationsComponent implements OnInit {
  private readonly referralService = inject(ReferralService)
  private readonly formBuilder = inject(FormBuilder)
  private readonly translateService = inject(TranslateService)
  private readonly toastr = injectToastr()

  readonly relations = signal<IReferralRelationView[]>([])
  readonly total = signal(0)
  readonly loading = signal(false)
  readonly loadFailed = signal(false)
  readonly appliedSearch = signal('')
  private requestId = 0
  private lastRequest = { pageIndex: 0, search: '' }
  readonly pageSize = 20
  readonly pageIndex = signal(0)
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize)))
  readonly filterForm = this.formBuilder.nonNullable.group({
    search: ''
  })

  ngOnInit() {
    void this.load()
  }

  async load(pageIndex = this.pageIndex(), search = this.filterForm.controls.search.value.trim()) {
    const requestId = ++this.requestId
    this.lastRequest = { pageIndex, search }
    this.loading.set(true)
    this.loadFailed.set(false)
    try {
      const result = await this.referralService.getRelations({
        search: search || undefined,
        skip: pageIndex * this.pageSize,
        take: this.pageSize
      })
      if (requestId !== this.requestId) return false
      this.appliedSearch.set(search)
      this.relations.set(result.items)
      this.total.set(result.total)
      this.pageIndex.set(pageIndex)
      return true
    } catch (error) {
      if (requestId !== this.requestId) return false
      this.loadFailed.set(true)
      this.toastr.error(getErrorMessage(error))
      return false
    } finally {
      if (requestId === this.requestId) this.loading.set(false)
    }
  }

  retry() {
    void this.load(this.lastRequest.pageIndex, this.lastRequest.search)
  }

  refresh() {
    void this.load(this.pageIndex(), this.appliedSearch())
  }

  onSearchInput(value: string) {
    if (!value && this.appliedSearch()) this.clearSearch()
  }

  search() {
    void this.load(0)
  }

  clearSearch() {
    this.filterForm.controls.search.reset()
    void this.load(0)
  }

  previousPage() {
    if (this.loading() || this.pageIndex() === 0) {
      return
    }
    void this.load(this.pageIndex() - 1, this.appliedSearch())
  }

  nextPage() {
    if (this.loading() || this.pageIndex() + 1 >= this.pageCount()) {
      return
    }
    void this.load(this.pageIndex() + 1, this.appliedSearch())
  }

  accountLabel(account: IReferralRelationView['referrer']) {
    return account.deleted
      ? this.translateService.instant('XP.Referral.DeletedAccount', { Default: 'Deleted account' })
      : account.name || account.email || '-'
  }
}
