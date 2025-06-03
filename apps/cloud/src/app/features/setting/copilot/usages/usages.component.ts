import { Component, inject, model, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatDialog } from '@angular/material/dialog'
import { MatIconModule } from '@angular/material/icon'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { effectAction } from '@metad/ocap-angular/core'
import { DisplayBehaviour } from '@metad/ocap-core'
import { WaIntersectionObserver } from '@ng-web-apis/intersection-observer'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { OrgAvatarComponent } from 'apps/cloud/src/app/@shared/organization'
import { switchMap, tap } from 'rxjs/operators'
import {
  CopilotUsageService,
  DateRelativePipe,
  ICopilotOrganization,
  injectFormatRelative,
  OrderTypeEnum,
  ToastrService
} from '../../../../@core'
import { CommonModule } from '@angular/common'

@Component({
  standalone: true,
  selector: 'pac-settings-copilot-usages',
  templateUrl: './usages.component.html',
  styleUrls: ['./usages.component.scss'],
  imports: [
    CommonModule,
    RouterModule,
    TranslateModule,
    FormsModule,
    ReactiveFormsModule,
    MatTooltipModule,
    MatButtonModule,
    MatIconModule,
    WaIntersectionObserver,
    NgmCommonModule,
    OrgAvatarComponent,
    DateRelativePipe
  ]
})
export class CopilotUsagesComponent {
  DisplayBehaviour = DisplayBehaviour

  readonly usageService = inject(CopilotUsageService)
  readonly _toastrService = inject(ToastrService)
  readonly router = inject(Router)
  readonly route = inject(ActivatedRoute)
  readonly dialog = inject(MatDialog)
  readonly translate = inject(TranslateService)
  readonly formatRelative = injectFormatRelative()

  readonly usages = signal<ICopilotOrganization[]>([])

  readonly editId = signal<string | null>(null)
  readonly tokenLimit = model<number>(null)
  readonly priceLimit = model<number>(null)

  readonly loading = signal(false)
  readonly pageSize = 20
  readonly currentPage = signal(0)
  readonly done = signal(false)

  // private dataSub = this.usageService
  //   .getOrgUsages({})
  //   .pipe(takeUntilDestroyed())
  //   .subscribe((usages) => {
  //     this.usages.set(usages)
  //   })

  // _formatNumber(value: number): string {
  //   return isNil(value) ? '' : isNumber(value) ? formatNumber(Number(value), this.translate.currentLang, '0.0-0') : ''
  // }
  // formatNumber = this._formatNumber.bind(this)

  // _formatPrice(value: number): string {
  //   return isNil(value) ? '' : isNumber(value) ? formatNumber(Number(value), this.translate.currentLang, '0.0-7') : ''
  // }
  // formatPrice = this._formatPrice.bind(this)

  constructor() {
    this.loadMore()
  }

  renewToken(id: string) {
    this.editId.set(id)
  }

  save(id: string) {
    this.loading.set(true)
    this.usageService.renewOrgLimit(id, this.tokenLimit(), this.priceLimit()).subscribe({
      next: (result) => {
        this.usages.update((records) => records.map((item) => (item.id === id ? { ...item, ...result } : item)))
        this.tokenLimit.set(null)
        this.priceLimit.set(null)
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
        return this.usageService.getOrgUsages({
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

  onIntersection() {
    if (!this.loading() && !this.done()) {
      this.loadMore()
    }
  }
}
