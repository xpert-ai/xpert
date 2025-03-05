import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, computed, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { RouterModule } from '@angular/router'
import { convertIndicatorResult, IndicatorsService } from '@metad/cloud/state'
import { injectConfirmDelete, NgmSpinComponent, NgmTableComponent } from '@metad/ocap-angular/common'
import { AppearanceDirective, DensityDirective } from '@metad/ocap-angular/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ProjectService } from '../../project.service'
import { ProjectIndicatorsComponent } from '../indicators.component'
import { MatCheckboxModule } from '@angular/material/checkbox'
import { MatButtonModule } from '@angular/material/button'
import { IIndicator, ToastrService, isUUID } from '../../../../@core/index'
import { combineLatest, tap } from 'rxjs'
import { saveAsYaml } from '@metad/core'
import { exportIndicator } from '../../types'

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
    NgmSpinComponent
  ],
  selector: 'pac-indicator-all',
  templateUrl: './all.component.html',
  styleUrls: ['./all.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AllIndicatorComponent implements OnDestroy {
  isUUID = isUUID
  private indicatorsComponent = inject(ProjectIndicatorsComponent)
  private projectService = inject(ProjectService)
  private indicatorsService = inject(IndicatorsService)
  private toastrService = inject(ToastrService)
  readonly #cdr = inject(ChangeDetectorRef)
  readonly #translate = inject(TranslateService)
  readonly confirmDelete = injectConfirmDelete()

  readonly indicators = toSignal(this.projectService.indicators$)
  readonly selectedIndicators = signal<IIndicator[]>([])
  readonly hasSelected = computed(() => this.selectedIndicators()?.length)
  readonly loading = signal(false)

  onDelete(indicator: IIndicator) {
    this.loading.set(true)
    this.confirmDelete({ value: indicator.name, information: '' }, this.indicatorsService.delete(indicator.id)).subscribe({
      next: () => {
        this.loading.set(false)
        this.toastrService.success('PAC.Messages.DeletedSuccessfully', {Default: 'Deleted Successfully'})
        this.projectService.removeIndicator(indicator.id)
      },
      error: (err) => {
        this.loading.set(false)
        this.toastrService.error(err)
      }
    })
  }

  bulkDelete(indicators: IIndicator[]) {
    this.loading.set(true)
    this.confirmDelete({ value: '', information: this.#translate.instant('PAC.INDICATOR.BatchDelete', {
        Default: `Batch delete ${indicators.length} indicators`,
        value: indicators.length
      }) }, this.projectService.deleteIndicators(this.selectedIndicators().map((item) => item.id))
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

  ngOnDestroy(): void {
    this.indicatorsComponent.selectedIndicators.set([])
  }
}
