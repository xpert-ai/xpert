import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, model, signal } from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { SemanticModelServerService } from '@metad/cloud/state'
import { calcTimeRange, TimeRangeEnum, TimeRangeOptions } from '@metad/core'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { effectAction } from '@metad/ocap-angular/core'
import { WaIntersectionObserver } from '@ng-web-apis/intersection-observer'
import { TranslateModule } from '@ngx-translate/core'
import { Copy2Component, NgmSelectComponent } from 'apps/cloud/src/app/@shared/common'
import { UserPipe } from 'apps/cloud/src/app/@shared/pipes'
import { delayWhen, filter, switchMap, tap } from 'rxjs/operators'
import { DateRelativePipe, ISemanticModelQueryLog, OrderTypeEnum, QueryStatusEnum, routeAnimations } from '../../../../@core'
import { ModelComponent } from '../model.component'
import { NgxJsonViewerModule } from 'ngx-json-viewer';

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
    DateRelativePipe,
    NgmSelectComponent,
    NgxJsonViewerModule,
    Copy2Component,
  ],
  selector: 'semanctic-model-logs',
  templateUrl: './logs.component.html',
  styleUrl: 'logs.component.scss',
  animations: [routeAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SemancticModelLogsComponent {
  TimeRanges = TimeRangeOptions
  eQueryStatusEnum = QueryStatusEnum

  readonly semanticModelService = inject(SemanticModelServerService)
  readonly modelComponent = inject(ModelComponent)

  readonly loading = signal(false)
  readonly pageSize = 20
  readonly currentPage = signal(0)
  readonly done = signal(false)

  readonly modelId$ = this.modelComponent.id$

  readonly logs = signal<ISemanticModelQueryLog[]>([])

  readonly timeRangeValue = model<TimeRangeEnum>(TimeRangeEnum.Last7Days)
  readonly timeRange = computed(() => calcTimeRange(this.timeRangeValue()))
  readonly timeRange$ = toObservable(this.timeRange)

  readonly preview = signal<ISemanticModelQueryLog>(null)

  constructor() {
    this.timeRange$.subscribe(() => {
      this.logs.set([])
      this.currentPage.set(0)
      this.done.set(false)
      this.loadLogs()
    })
  }

  loadLogs = effectAction((origin$) => {
    return origin$.pipe(
      delayWhen(() => this.modelId$.pipe(filter((id) => !!id))),
      switchMap(() => {
        this.loading.set(true)
        return this.semanticModelService.getLogs(
          this.modelComponent.model.id,
          {
            relations: ['createdBy'],
            order: { updatedAt: OrderTypeEnum.DESC },
            take: this.pageSize,
            skip: this.currentPage() * this.pageSize
          },
          this.timeRange()
        )
      }),
      tap({
        next: ({ items, total }) => {
          this.logs.update((state) => [...state, ...items])
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
      this.loadLogs()
    }
  }
}
