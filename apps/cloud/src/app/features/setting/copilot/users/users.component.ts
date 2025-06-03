import { CommonModule } from '@angular/common'
import { Component, inject, LOCALE_ID, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatDialog } from '@angular/material/dialog'
import { MatIconModule } from '@angular/material/icon'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { effectAction } from '@metad/ocap-angular/core'
import { DisplayBehaviour } from '@metad/ocap-core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { WaIntersectionObserver } from '@ng-web-apis/intersection-observer'
import { OrgAvatarComponent } from 'apps/cloud/src/app/@shared/organization'
import { UserProfileInlineComponent } from 'apps/cloud/src/app/@shared/user'
import { switchMap, tap } from 'rxjs/operators'
import {
  CopilotUsageService,
  DateRelativePipe,
  ICopilotUser,
  injectFormatRelative,
  OrderTypeEnum,
  ToastrService
} from '../../../../@core'

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
    MatTooltipModule,
    MatIconModule,
    MatButtonModule,
    WaIntersectionObserver,
    NgmCommonModule,
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
  readonly dialog = inject(MatDialog)
  readonly translate = inject(TranslateService)
  readonly formatRelative = injectFormatRelative()
  readonly locale = inject(LOCALE_ID)

  readonly usages = signal<ICopilotUser[]>([])

  readonly editId = signal<string | null>(null)
  readonly tokenLimit = model<number>(null)
  readonly priceLimit = model<number>(null)

  readonly loading = signal(false)
  readonly pageSize = 20
  readonly currentPage = signal(0)
  readonly done = signal(false)

  constructor() {
    this.loadMore()
  }

  renewToken(id: string) {
    this.editId.set(id)
  }

  save(id: string) {
    this.loading.set(true)
    this.usageService.renewUserLimit(id, this.tokenLimit(), this.priceLimit()).subscribe({
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
        return this.usageService.getUserUsages({
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
