import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { effectAction } from '@metad/ocap-angular/core'
import { WaIntersectionObserver } from '@ng-web-apis/intersection-observer'
import { TranslateModule } from '@ngx-translate/core'
import { UserPipe } from 'apps/cloud/src/app/@shared/pipes'
import { delayWhen, filter, switchMap, tap } from 'rxjs/operators'
import { IChatConversation, OrderTypeEnum, routeAnimations, XpertService } from '../../../../@core'
import { XpertComponent } from '../xpert.component'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    RouterModule,
    WaIntersectionObserver,
    NgmSpinComponent,
    UserPipe
  ],
  selector: 'xpert-logs',
  templateUrl: './logs.component.html',
  styleUrl: 'logs.component.scss',
  animations: [routeAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertLogsComponent {
  readonly xpertService = inject(XpertService)
  readonly xpertComponent = inject(XpertComponent)

  readonly xpert = this.xpertComponent.latestXpert
  readonly xpertId = computed(() => this.xpert()?.id)
  readonly xpertId$ = toObservable(this.xpertId)

  readonly loading = signal(false)
  readonly pageSize = 20
  readonly currentPage = signal(0)
  readonly done = signal(false)

  readonly conversations = signal<IChatConversation[]>([])

  loadConversations = effectAction((origin$) => {
    return origin$.pipe(
      delayWhen(() => this.xpertId$.pipe(filter((id) => !!id))),
      switchMap(() => {
        this.loading.set(true)
        return this.xpertService.getConversations(this.xpertId(), {
          select: ['id', 'threadId', 'title', 'status', 'createdById', 'fromEndUserId', 'updatedAt'],
          relations: ['createdBy'],
          order: { updatedAt: OrderTypeEnum.DESC },
          take: this.pageSize,
          skip: this.currentPage() * this.pageSize
        })
      }),
      tap({
        next: ({ items, total }) => {
          this.conversations.update((state) => [...state, ...items])
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
      this.loadConversations()
    }
  }
}
