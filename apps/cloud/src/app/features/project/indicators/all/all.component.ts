import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  ViewContainerRef
} from '@angular/core'
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop'
import { MatButtonModule } from '@angular/material/button'
import { MatCheckboxModule } from '@angular/material/checkbox'
import { RouterModule } from '@angular/router'
import { convertIndicatorResult, EmbeddingStatusEnum, IndicatorsService, IndicatorStatusEnum } from '@metad/cloud/state'
import { saveAsYaml } from '@metad/core'
import { injectConfirmDelete, NgmSpinComponent, NgmTableComponent } from '@metad/ocap-angular/common'
import { AppearanceDirective, DensityDirective } from '@metad/ocap-angular/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { catchError, debounceTime, filter, map, merge, of, Subject, switchMap } from 'rxjs'
import { DateRelativePipe, getErrorMessage, IIndicator, isUUID, ToastrService } from '../../../../@core/index'
import { ProjectService } from '../../project.service'
import { ProjectIndicatorsComponent } from '../indicators.component'
import { exportIndicator, XpIndicatorFormComponent } from '@cloud/app/@shared/indicator'
import { Dialog } from '@angular/cdk/dialog'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatCheckboxModule,
    MatButtonModule,
    TranslateModule,
    DensityDirective,
    AppearanceDirective,
    NgmTableComponent,
    NgmSpinComponent,
    DateRelativePipe
  ],
  selector: 'pac-indicator-all',
  templateUrl: './all.component.html',
  styleUrls: ['./all.component.scss'],
  // changeDetection: ChangeDetectionStrategy.OnPush
})
export class AllIndicatorComponent {
  eEmbeddingStatusEnum = EmbeddingStatusEnum
  eIndicatorStatusEnum = IndicatorStatusEnum
  isUUID = isUUID
  
  private indicatorsComponent = inject(ProjectIndicatorsComponent)
  private projectService = inject(ProjectService)
  private indicatorAPI = inject(IndicatorsService)
  private toastrService = inject(ToastrService)
  readonly #cdr = inject(ChangeDetectorRef)
  readonly #translate = inject(TranslateService)
  readonly confirmDelete = injectConfirmDelete()
  readonly #destroyRef = inject(DestroyRef)
  readonly #dialog = inject(Dialog)
  readonly #viewContainerRef = inject(ViewContainerRef)

  readonly projectId = computed(() => this.projectService.project()?.id)
  readonly #indicators = toSignal(this.projectService.indicators$)
  readonly selectedIndicators = signal<IIndicator[]>([])
  readonly hasSelected = computed(() => this.selectedIndicators()?.length)
  readonly loading = signal(false)

  readonly refresh$ = this.projectService.refreshEmbedding$
  readonly delayRefresh$ = new Subject<boolean>()
  readonly total = signal(0)
  readonly _indicators = signal<IIndicator[]>([])

  // Update status of indicators
  readonly indicators = computed(() => {
    const indicators = this.#indicators()
    const _indicators = this._indicators()
    return indicators?.map((indicator) => {
      const _indicator = _indicators?.find((item) => item.id === indicator.id)
      return _indicator ? { ...indicator, ..._indicator } : indicator
    })
  })

  constructor() {
    this.#destroyRef.onDestroy(() => {
      this.indicatorsComponent.selectedIndicators.set([])
    })

    merge(this.refresh$, toObservable(this.projectId))
      .pipe(
        // startWith({}),
        filter(() => !!this.projectId()),
        debounceTime(100),
        switchMap(() => {
          this.loading.set(true)
          return this.indicatorAPI!.getByProject(this.projectService.project().id, {
            select: ['id', 'code', 'name', 'embeddingStatus']
          }).pipe(
            catchError((error) => {
              this.toastrService.error(getErrorMessage(error))
              this.loading.set(false)
              return of(null)
            })
          )
        }),
        map((data) => {
          // Flip flag to show that loading has finished.
          this.loading.set(false)

          if (data === null) {
            return []
          }
          this.total.set(data.total)
          return data.items
        })
      )
      .subscribe((data) => {
        this._indicators.set(data)
      })

    this.delayRefresh$.pipe(takeUntilDestroyed(), debounceTime(5000)).subscribe(() => this.refresh())

    effect(() => {
      if (
        this._indicators()?.some(
          (item) =>
            item.embeddingStatus === EmbeddingStatusEnum.PROCESSING ||
            item.embeddingStatus === EmbeddingStatusEnum.REQUIRED
        )
      ) {
        // this.delayRefresh$.next(true)
      }
    })
  }

  refresh() {
    this.refresh$.next(true)
  }

  onDelete(indicator: IIndicator) {
    this.loading.set(true)
    this.confirmDelete({ value: indicator.name, information: '' }, this.indicatorAPI.delete(indicator.id)).subscribe({
      next: () => {
        this.loading.set(false)
        this.toastrService.success('PAC.Messages.DeletedSuccessfully', { Default: 'Deleted Successfully' })
        this.projectService.removeIndicator(indicator.id)
      },
      error: (err) => {
        this.loading.set(false)
        this.toastrService.error(err)
      }
    })
  }

  bulkDelete(indicators: IIndicator[]) {
    this.confirmDelete(
      {
        value: '',
        information: this.#translate.instant('PAC.INDICATOR.BatchDelete', {
          Default: `Batch delete ${indicators.length} indicators`,
          value: indicators.length
        })
      },
      () => {
        this.loading.set(true)
        return this.projectService.deleteIndicators(this.selectedIndicators().map((item) => item.id))
      }
    ).subscribe({
      next: () => {
        this.loading.set(false)
        this.selectedIndicators.set([])
        this.toastrService.success('PAC.INDICATOR.DeletedSelectedIndicators', {
          Default: 'Selected indicators deleted!'
        })
      },
      error: (err) => {
        this.loading.set(false)
        this.toastrService.error(err)
      }
    })
  }

  trackByName(_: number, item: IIndicator): string {
    return item.name
  }

  groupFilterFn(list: string[], item: IIndicator) {
    return list.some((name) => item.businessAreaId === name)
  }

  codeSortFn(a: IIndicator, b: IIndicator) {
    return a.code.localeCompare(b.code)
  }

  onRowSelectionChanging(rows: any) {
    this.selectedIndicators.set([...rows])
    this.indicatorsComponent.selectedIndicators.set([...rows])
    this.#cdr.detectChanges()
  }

  export() {
    const project = this.projectService.project()
    const indicators = this.selectedIndicators().length ? this.selectedIndicators() : project.indicators
    const indicatorsFileName = this.#translate.instant('PAC.INDICATOR.Indicators', { Default: 'Indicators' })
    saveAsYaml(
      `${indicatorsFileName}.yaml`,
      indicators.map((item) => exportIndicator(convertIndicatorResult(item)))
    )
  }

  editIndicator(id: string) {
    this.#dialog.open<IIndicator>(XpIndicatorFormComponent, {
      viewContainerRef: this.#viewContainerRef,
      backdropClass: 'xp-overlay-share-sheet',
      panelClass: 'xp-overlay-pane-share-sheet',
      data: {
        id
      }
    }).closed.subscribe((result) => {
      if (result) {
      }
    })
  }
}
