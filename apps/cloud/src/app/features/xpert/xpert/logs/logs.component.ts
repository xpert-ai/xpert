import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, model, signal } from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { effectAction } from '@metad/ocap-angular/core'
import { WaIntersectionObserver } from '@ng-web-apis/intersection-observer'
import { TranslateModule } from '@ngx-translate/core'
import { NgmSelectComponent } from 'apps/cloud/src/app/@shared/common'
import { UserPipe } from 'apps/cloud/src/app/@shared/pipes'
import { delayWhen, filter, switchMap, tap } from 'rxjs/operators'
import { OrderTypeEnum, routeAnimations, TChatConversationLog, XpertService } from '../../../../@core'
import { XpertComponent } from '../xpert.component'
import { calcTimeRange, TimeRangeEnum, TimeRangeOptions } from '@metad/core'
import { ChatConversationPreviewComponent, ChatMessageExecutionComponent } from 'apps/cloud/src/app/@shared/chat'

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
    UserPipe,
    NgmSelectComponent,
    ChatConversationPreviewComponent,
    ChatMessageExecutionComponent
  ],
  selector: 'xpert-logs',
  templateUrl: './logs.component.html',
  styleUrl: 'logs.component.scss',
  animations: [routeAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertLogsComponent {
  TimeRanges = TimeRangeOptions
  readonly xpertService = inject(XpertService)
  readonly xpertComponent = inject(XpertComponent)

  readonly xpert = this.xpertComponent.latestXpert
  readonly xpertId = computed(() => this.xpert()?.id)
  readonly xpertId$ = toObservable(this.xpertId)

  readonly loading = signal(false)
  readonly pageSize = 20
  readonly currentPage = signal(0)
  readonly done = signal(false)

  readonly conversations = signal<TChatConversationLog[]>([])

  readonly timeRangeValue = model<TimeRangeEnum>(TimeRangeEnum.Last7Days)
  readonly timeRange = computed(() => calcTimeRange(this.timeRangeValue()))
  readonly timeRange$ = toObservable(this.timeRange)

  readonly preview = signal<string>(null)
  readonly executionId = signal<string>(null)

  constructor() {
    this.timeRange$.subscribe(() => {
      this.conversations.set([])
      this.currentPage.set(0)
      this.done.set(false)
      this.loadConversations()
    })
  }

  loadConversations = effectAction((origin$) => {
    return origin$.pipe(
      delayWhen(() => this.xpertId$.pipe(filter((id) => !!id))),
      switchMap(() => {
        this.loading.set(true)
        return this.xpertService.getConversations(this.xpertId(), {
          // select: ['id', 'threadId', 'title', 'status', 'createdById', 'fromEndUserId', 'updatedAt'],
          relations: ['createdBy'],
          order: { updatedAt: OrderTypeEnum.DESC },
          take: this.pageSize,
          skip: this.currentPage() * this.pageSize
        }, this.timeRange())
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

  togglePreview(id: string) {
    this.preview.update((state) => state === id ? null : id)
  }

  selectExecution(id: string) {
    this.executionId.set(id)
  }

  closeExecution() {
    this.executionId.set(null)
  }
}
