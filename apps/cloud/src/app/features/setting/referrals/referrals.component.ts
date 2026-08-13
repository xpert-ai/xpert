import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core'
import { FormBuilder, ReactiveFormsModule } from '@angular/forms'
import { ReferralService } from '@cloud/app/@core/state'
import { IReferralRelationView } from '@xpert-ai/contracts'
import { ZardButtonComponent, ZardIconComponent, ZardInputDirective, ZardTableImports } from '@xpert-ai/headless-ui'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { getErrorMessage } from '../../../@core/types'
import { injectToastr } from '../../../@core/services/toastr.service'

@Component({
  standalone: true,
  selector: 'xp-referral-relations',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex min-w-0 w-full max-w-full flex-1'
  },
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    ZardButtonComponent,
    ZardIconComponent,
    ZardInputDirective,
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
  readonly pageSize = 20
  readonly pageIndex = signal(0)
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize)))
  readonly filterForm = this.formBuilder.nonNullable.group({
    search: ''
  })

  ngOnInit() {
    void this.load()
  }

  async load(pageIndex = this.pageIndex()) {
    this.loading.set(true)
    this.loadFailed.set(false)
    try {
      const result = await this.referralService.getRelations({
        search: this.filterForm.controls.search.value.trim() || undefined,
        skip: pageIndex * this.pageSize,
        take: this.pageSize
      })
      this.relations.set(result.items)
      this.total.set(result.total)
      this.pageIndex.set(pageIndex)
      return true
    } catch (error) {
      this.loadFailed.set(true)
      this.toastr.error(getErrorMessage(error))
      return false
    } finally {
      this.loading.set(false)
    }
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
    void this.load(this.pageIndex() - 1)
  }

  nextPage() {
    if (this.loading() || this.pageIndex() + 1 >= this.pageCount()) {
      return
    }
    void this.load(this.pageIndex() + 1)
  }

  accountLabel(account: IReferralRelationView['referrer']) {
    return account.deleted
      ? this.translateService.instant('XP.Referral.DeletedAccount', { Default: 'Deleted account' })
      : account.name || account.email || '-'
  }
}
