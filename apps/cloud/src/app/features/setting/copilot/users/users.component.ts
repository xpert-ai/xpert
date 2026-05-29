import { CommonModule } from '@angular/common'
import { Component, inject, LOCALE_ID, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'

import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { NgmCommonModule } from '@xpert-ai/ocap-angular/common'
import { effectAction } from '@xpert-ai/ocap-angular/core'
import { DisplayBehaviour } from '@xpert-ai/ocap-core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { WaIntersectionObserver } from '@ng-web-apis/intersection-observer'
import { OrgAvatarComponent } from 'apps/cloud/src/app/@shared/organization'
import { UserProfileInlineComponent } from 'apps/cloud/src/app/@shared/user'
import { switchMap, tap } from 'rxjs/operators'
import {
  CopilotUsageService,
  DateRelativePipe,
  ICopilotUserUsageSummary,
  injectFormatRelative,
  OrderTypeEnum,
  ToastrService
} from '../../../../@core'
import {
  ZardButtonComponent,
  ZardDialogService,
  ZardIconComponent,
  ZardInputDirective,
  ZardTableImports,
  ZardTooltipImports
} from '@xpert-ai/headless-ui'
@Component({
  standalone: true,
  selector: 'pac-settings-copilot-users',
  templateUrl: './users.component.html',
  styleUrls: ['./users.component.scss'],
  imports: [
    CommonModule,
    RouterModule,
    TranslateModule,
    FormsModule,
    ...ZardTooltipImports,
    ZardIconComponent,
    ZardButtonComponent,
    WaIntersectionObserver,
    NgmCommonModule,
    ZardInputDirective,
    ...ZardTableImports,
    OrgAvatarComponent,
    UserProfileInlineComponent,
    DateRelativePipe
  ]
})
export class CopilotUsersComponent {
  DisplayBehaviour = DisplayBehaviour

  readonly usageService = inject(CopilotUsageService)
  readonly _toastrService = inject(ToastrService)
  readonly router = inject(Router)
  readonly route = inject(ActivatedRoute)
  readonly dialog = inject(ZardDialogService)
  readonly translate = inject(TranslateService)
  readonly formatRelative = injectFormatRelative()
  readonly locale = inject(LOCALE_ID)

  readonly usages = signal<ICopilotUserUsageSummary[]>([])
  readonly expandedIds = signal<Set<string>>(new Set())
  readonly detailLoadingIds = signal<Set<string>>(new Set())

  readonly editId = signal<string | null>(null)
  readonly tokenLimit = model<number>(null)

  readonly loading = signal(false)
  readonly pageSize = 20
  readonly currentPage = signal(0)
  readonly done = signal(false)

  constructor() {
    this.loadMore()
  }

  renewToken(item: ICopilotUserUsageSummary) {
    this.tokenLimit.set(item.tokenLimit)
    this.editId.set(this.usageId(item))
  }

  setTokenLimit(value: string | number | null) {
    this.tokenLimit.set(value === null || value === '' ? null : Number(value))
  }

  save(item: ICopilotUserUsageSummary) {
    this.loading.set(true)
    this.usageService.renewUserUsageSummary(item, this.tokenLimit()).subscribe({
      next: (result) => {
        this.usages.update((records) =>
          records.map((record) => (this.usageId(record) === this.usageId(item) ? { ...record, ...result } : record))
        )
        this.tokenLimit.set(null)
        this.editId.set(null)
        this.loading.set(false)
      },
      error: (error) => {
        this.loading.set(false)
        this._toastrService.error(error, 'Error')
      }
    })
  }

  loadMore = effectAction((origin$) => {
    return origin$.pipe(
      switchMap(() => {
        this.loading.set(true)
        return this.usageService.getUserUsageSummaries({
          order: { updatedAt: OrderTypeEnum.DESC },
          take: this.pageSize,
          skip: this.currentPage() * this.pageSize
        })
      }),
      tap({
        next: ({ items, total }) => {
          this.usages.update((state) => [...state, ...items])
          this.currentPage.update((state) => ++state)
          if (items.length < this.pageSize || this.currentPage() * this.pageSize >= total) {
            this.done.set(true)
          }
          this.loading.set(false)
        },
        error: (err) => {
          this.loading.set(false)
        }
      })
    )
  })

  toggleDetails(item: ICopilotUserUsageSummary) {
    const id = this.usageId(item)
    const shouldExpand = !this.expandedIds().has(id)
    this.expandedIds.update((state) => {
      const next = new Set(state)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })

    if (shouldExpand && item.details === undefined) {
      this.loadDetails(item)
    }
  }

  isExpanded(item: ICopilotUserUsageSummary) {
    return this.expandedIds().has(this.usageId(item))
  }

  isLoadingDetails(item: ICopilotUserUsageSummary) {
    return this.detailLoadingIds().has(this.usageId(item))
  }

  loadDetails(item: ICopilotUserUsageSummary) {
    const id = this.usageId(item)
    this.setDetailLoading(id, true)
    this.usageService.getUserUsageDetails(item).subscribe({
      next: (details) => {
        this.usages.update((records) =>
          records.map((record) => (this.usageId(record) === id ? { ...record, details } : record))
        )
        this.setDetailLoading(id, false)
      },
      error: (error) => {
        this.setDetailLoading(id, false)
        this._toastrService.error(error, 'Error')
      }
    })
  }

  usageId(item: ICopilotUserUsageSummary) {
    return String(item.id)
  }

  private setDetailLoading(id: string, loading: boolean) {
    this.detailLoadingIds.update((state) => {
      const next = new Set(state)
      if (loading) {
        next.add(id)
      } else {
        next.delete(id)
      }
      return next
    })
  }

  onIntersection() {
    if (!this.loading() && !this.done()) {
      this.loadMore()
    }
  }
}
