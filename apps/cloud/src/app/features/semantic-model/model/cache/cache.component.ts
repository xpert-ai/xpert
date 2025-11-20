import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, model, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { ISemanticModelCache, SemanticModelServerService } from '@metad/cloud/state'
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
  getErrorMessage,
  injectToastr,
  OrderTypeEnum,
  QueryStatusEnum,
  routeAnimations
} from '../../../../@core'
import { ModelComponent } from '../model.component'
import { SemanticModelService } from '../model.service'
import { injectI18nService } from '@cloud/app/@shared/i18n'
import { MatTooltipModule } from '@angular/material/tooltip'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatTooltipModule,
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
  selector: 'semanctic-model-cache',
  templateUrl: './cache.component.html',
  styleUrl: 'cache.component.scss',
  animations: [routeAnimations, ...OverlayAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SemancticModelCacheComponent {
  TimeRanges = TimeRangeOptions
  eQueryStatusEnum = QueryStatusEnum

  readonly semanticModelAPI = inject(SemanticModelServerService)
  readonly modelComponent = inject(ModelComponent)
  readonly modelService = inject(SemanticModelService)
  readonly i18nService = injectI18nService()
  readonly #toastr = injectToastr()

  readonly loading = signal(false)
  readonly pageSize = 20
  readonly currentPage = signal(0)
  readonly done = signal(false)

  readonly modelId$ = this.modelComponent.id$

  readonly caches = signal<ISemanticModelCache[]>([])

  readonly timeRangeValue = model<TimeRangeEnum>(TimeRangeEnum.Last7Days)
  readonly timeRange = computed(() => calcTimeRange(this.timeRangeValue()))
  readonly cubes = this.modelService.cubes
  readonly language = model<string>(null)
  readonly total = signal<number>(null)

  readonly preview = signal<ISemanticModelCache>(null)

  constructor() {
    effect(() => {
      const timeRange = this.timeRange()
      const language = this.language()
      this.caches.set([])
      this.currentPage.set(0)
      this.done.set(false)
      this.loadLogs({ language, timeRange, currentPage: 0 })
    }, { allowSignalWrites: true })
  }

  loadLogs = effectAction((origin$: Observable<{ language: string; timeRange: string[]; currentPage: number }>) => {
    return origin$.pipe(
      delayWhen(() => this.modelId$.pipe(filter((id) => !!id))),
      switchMap(({ language, timeRange, currentPage }) => {
        this.loading.set(true)
        return this.semanticModelAPI.getCaches(
          this.modelComponent.model.id,
          {
            where: { language: language || undefined },
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
          this.total.set(total)
          this.caches.update((state) => [...state, ...items])
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
      this.loadLogs({ timeRange: this.timeRange(), language: this.language(), currentPage: this.currentPage() })
    }
  }

  removeCache(cache: ISemanticModelCache) {
    this.loading.set(true)
    this.semanticModelAPI.deleteCache(this.modelComponent.model.id, cache.id).subscribe(() => {
      this.caches.update((state) => state.filter((item) => item.id !== cache.id))
      this.loading.set(false)
    })
  }

  clearCache() {
    this.loading.set(true)
    this.semanticModelAPI.clearCache(this.modelComponent.model.id).subscribe({
      next: () => {
        this.caches.set([])
        this.loading.set(false)
        this.#toastr.success('PAC.MODEL.ClearServerCache', {Default: 'Clear server cache successfully'})
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error('PAC.MODEL.ClearServerCache', getErrorMessage(err), {Default: 'Clear server cache failed'})
      }
    })
  }
}
