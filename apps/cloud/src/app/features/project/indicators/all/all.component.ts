import { Dialog } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectorRef,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  ViewContainerRef
} from '@angular/core'
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatCheckboxModule } from '@angular/material/checkbox'
import { RouterModule } from '@angular/router'
import { exportIndicator, XpIndicatorFormComponent } from '@cloud/app/@shared/indicator'
import { EmbeddingStatusEnum, IndicatorsService, IndicatorStatusEnum } from '@metad/cloud/state'
import { saveAsYaml } from '@metad/core'
import { injectConfirmDelete, NgmSpinComponent } from '@metad/ocap-angular/common'
import { myRxResource } from '@metad/ocap-angular/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { catchError, debounceTime, filter, map, merge, of, Subject, switchMap } from 'rxjs'
import {
  DateRelativePipe,
  getErrorMessage,
  IIndicator,
  isUUID,
  ProjectAPIService,
  ToastrService
} from '../../../../@core/index'
import { ProjectService } from '../../project.service'
import { ProjectIndicatorsComponent } from '../indicators.component'
import { MatTooltipModule } from '@angular/material/tooltip'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatCheckboxModule,
    MatButtonModule,
    MatTooltipModule,
    TranslateModule,
    NgmSpinComponent,
    DateRelativePipe
  ],
  selector: 'pac-indicator-all',
  templateUrl: './all.component.html',
  styleUrls: ['./all.component.scss']
})
export class AllIndicatorComponent {
  eEmbeddingStatusEnum = EmbeddingStatusEnum
  eIndicatorStatusEnum = IndicatorStatusEnum
  isUUID = isUUID

  private projectService = inject(ProjectService)
  private projectAPI = inject(ProjectAPIService)
  private indicatorAPI = inject(IndicatorsService)
  private toastrService = inject(ToastrService)
  readonly #cdr = inject(ChangeDetectorRef)
  readonly #translate = inject(TranslateService)
  readonly confirmDelete = injectConfirmDelete()
  readonly #destroyRef = inject(DestroyRef)
  readonly #dialog = inject(Dialog)
  readonly #viewContainerRef = inject(ViewContainerRef)
  readonly parentComponent = inject(ProjectIndicatorsComponent)

  readonly projectId = computed(() => this.projectService.project()?.id)
  readonly #indicators = myRxResource({
    request: () => this.projectId(),
    loader: ({ request }) => {
      return this.projectAPI
        .getOne(request ?? null, ['indicators', 'indicators.businessArea'])
        .pipe(map((project) => project?.indicators ?? []))
    }
  })
  // readonly #indicators = toSignal(this.projectService.indicators$)
  readonly selectedIndicators = signal<IIndicator[]>([])
  readonly hasSelected = computed(() => this.selectedIndicators()?.length)
  readonly allSelected = computed(() => this.selectedIndicators()?.length === this.indicators()?.length)
  readonly loading = signal(false)

  // Refresh embedding status
  readonly refresh$ = this.projectService.refreshEmbedding$
  readonly delayRefresh$ = new Subject<boolean>()
  readonly total = signal(0)
  readonly _indicators = signal<IIndicator[]>([])

  // Update status of indicators
  readonly indicators = computed(() => {
    const indicators = this.#indicators.value()
    const _indicators = this._indicators()
    return indicators?.map((indicator) => {
      const _indicator = _indicators?.find((item) => item.id === indicator.id)
      return _indicator ? { ...indicator, ..._indicator } : indicator
    })
  })

  constructor() {
    // Refresh the embedding status periodically
    merge(this.refresh$, toObservable(this.projectId))
      .pipe(
        filter(() => !!this.projectId()),
        debounceTime(100),
        switchMap(() => {
          this.loading.set(true)
          return this.indicatorAPI.getByProject(this.projectService.project().id, {
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

    this.projectService.refresh$.pipe(takeUntilDestroyed()).subscribe(() => this.#indicators.reload())
    this.parentComponent.reload$.pipe(takeUntilDestroyed()).subscribe(() => this.#indicators.reload())
  }

  refresh() {
    this.refresh$.next(true)
  }

  onDelete(indicator: IIndicator) {
    this.confirmDelete({ value: indicator.name, information: '' }, () => {
      this.loading.set(true)
      return this.indicatorAPI.delete(indicator.id)
    }).subscribe({
      next: () => {
        this.loading.set(false)
        this.toastrService.success('PAC.Messages.DeletedSuccessfully', { Default: 'Deleted Successfully' })
        this.#indicators.reload()
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
        this.#indicators.reload()
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

  /**
   * Export Selected Indicators
   */
  exportSelected() {
    const project = this.projectService.project()
    const indicators = this.selectedIndicators().length ? this.selectedIndicators() : project.indicators
    const indicatorsFileName = this.#translate.instant('PAC.INDICATOR.Indicators', { Default: 'Indicators' })
    saveAsYaml(
      `${indicatorsFileName}.yaml`,
      indicators.map((item) => exportIndicator(item))
    )
  }

  editIndicator(id: string) {
    this.#dialog
      .open<IIndicator>(XpIndicatorFormComponent, {
        viewContainerRef: this.#viewContainerRef,
        backdropClass: 'xp-overlay-share-sheet',
        panelClass: 'xp-overlay-pane-share-sheet',
        data: {
          id,
          models: this.projectService.models(),
          certifications: this.projectService.project().certifications,
          projectId: this.projectService.project().id
        }
      })
      .closed.subscribe((result) => {
        if (result) {
          this.#indicators.reload()
        }
      })
  }

  publish(indicator: IIndicator) {
    if (indicator.draft) {
      this.loading.set(true)
      this.indicatorAPI.publish(indicator.id).subscribe({
        next: () => {
          this.loading.set(false)
          this.#indicators.reload()
        },
        error: (err) => {
          this.loading.set(false)
          this.toastrService.error(getErrorMessage(err))
        }
      })
    }
  }

  embedding(indicator: IIndicator) {
    if (indicator.status === IndicatorStatusEnum.RELEASED) {
      this.loading.set(true)
      this.indicatorAPI.embedding(indicator.id).subscribe({
        next: () => {
          this.loading.set(false)
          this.toastrService.success('PAC.Project.EmbeddingStarted', { Default: 'Embedding started' })
          this.refresh$.next(true)
        },
        error: (err) => {
          this.loading.set(false)
          this.toastrService.error(getErrorMessage(err))
        }
      })
    }
  }

  isSelected(row: IIndicator) {
    return this.selectedIndicators().some((item) => item.id === row.id)
  }

  toggleSelection(row: IIndicator, event: boolean) {
    if (event) {
      this.selectedIndicators.set([...this.selectedIndicators(), row])
    } else {
      this.selectedIndicators.set(this.selectedIndicators().filter((item) => item.id !== row.id))
    }
  }

  toggleAllSelection(event: boolean) {
    if (event) {
      this.selectedIndicators.set(this.indicators())
    } else {
      this.selectedIndicators.set([])
    }
  }
}
