import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, model, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { SemanticModelServerService } from '@metad/cloud/state'
import { calcTimeRange, OverlayAnimations, TimeRangeEnum, TimeRangeOptions } from '@metad/core'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { effectAction } from '@metad/ocap-angular/core'
import { WaIntersectionObserver } from '@ng-web-apis/intersection-observer'
import { TranslateModule } from '@ngx-translate/core'
import { Copy2Component, NgmSelectComponent } from 'apps/cloud/src/app/@shared/common'
import { UserPipe } from 'apps/cloud/src/app/@shared/pipes'
import { NgxJsonViewerModule } from 'ngx-json-viewer'
import { Observable } from 'rxjs'
import { delayWhen, filter, map, switchMap, tap } from 'rxjs/operators'
import {
  DateRelativePipe,
  ISemanticModelQueryLog,
  OrderTypeEnum,
  QueryStatusEnum,
  routeAnimations
} from '../../../../@core'
import { ModelComponent } from '../model.component'
import { SemanticModelService } from '../model.service'
import { injectI18nService } from '@cloud/app/@shared/i18n'

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
    Copy2Component
  ],
  selector: 'semanctic-model-logs',
  templateUrl: './logs.component.html',
  styleUrl: 'logs.component.scss',
  animations: [routeAnimations, ...OverlayAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SemancticModelLogsComponent {
  TimeRanges = TimeRangeOptions
  eQueryStatusEnum = QueryStatusEnum

  readonly semanticModelService = inject(SemanticModelServerService)
  readonly modelComponent = inject(ModelComponent)
  readonly modelService = inject(SemanticModelService)
  readonly i18nService = injectI18nService()

  readonly loading = signal(false)
  readonly pageSize = 20
  readonly currentPage = signal(0)
  readonly done = signal(false)

  readonly modelId$ = this.modelComponent.id$

  readonly logs = signal<ISemanticModelQueryLog[]>([])

  readonly timeRangeValue = model<TimeRangeEnum>(TimeRangeEnum.Last7Days)
  readonly timeRange = computed(() => calcTimeRange(this.timeRangeValue()))
  // readonly timeRange$ = toObservable(this.timeRange)
  readonly cubes = this.modelService.cubes
  readonly cubesOptions = computed(() => this.cubes().map((cube) => ({ label: cube.caption, value: cube.name })))
  readonly cube = model<string>(null)

  readonly statusOptions = [
    {
      label: this.i18nService.instant('PAC.MODEL.QueryLog.Status_Pending', { Default: 'Pending' }),
      value: QueryStatusEnum.PENDING
    },
    {
      label: this.i18nService.instant('PAC.MODEL.QueryLog.Status_Running', { Default: 'Running' }),
      value: QueryStatusEnum.RUNNING
    },
    {
      label: this.i18nService.instant('PAC.MODEL.QueryLog.Status_Success', { Default: 'Success' }),
      value: QueryStatusEnum.SUCCESS
    },
    {
      label: this.i18nService.instant('PAC.MODEL.QueryLog.Status_Failed', { Default: 'Failed' }),
      value: QueryStatusEnum.FAILED
    }
  ]
  readonly status = model<QueryStatusEnum>(null)

  readonly preview = signal<ISemanticModelQueryLog>(null)

  constructor() {
    effect(() => {
      const timeRange = this.timeRange()
      const cube = this.cube()
      const status = this.status()
      this.logs.set([])
      this.currentPage.set(0)
      this.done.set(false)
      this.loadLogs({ cube, status, timeRange, currentPage: 0 })
    }, { allowSignalWrites: true })
  }

  loadLogs = effectAction((origin$: Observable<{ cube: string; status: QueryStatusEnum; timeRange: string[]; currentPage: number }>) => {
    return origin$.pipe(
      delayWhen(() => this.modelId$.pipe(filter((id) => !!id))),
      switchMap(({ cube, status, timeRange, currentPage }) => {
        this.loading.set(true)
        return this.semanticModelService.getLogs(
          this.modelComponent.model.id,
          {
            where: { cube: cube || undefined, status: status || undefined },
            relations: ['createdBy'],
            order: { updatedAt: OrderTypeEnum.DESC },
            take: this.pageSize,
            skip: currentPage * this.pageSize
          },
          timeRange
        ).pipe(
          map(({ items, total }) => ({ items, total, currentPage }))
        )
      }),
      tap({
        next: ({ items, total, currentPage }) => {
          this.logs.update((state) => [...state, ...items])
          this.currentPage.update((state) => ++state)
          if (items.length < this.pageSize || currentPage * this.pageSize >= total) {
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
      this.loadLogs({ timeRange: this.timeRange(), cube: this.cube(), status: this.status(), currentPage: this.currentPage() })
    }
  }
}
