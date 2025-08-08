import { Dialog } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, ViewContainerRef } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import { XpIndicatorFormComponent } from '@cloud/app/@shared/indicator'
import { NgmDSCoreService } from '@metad/ocap-angular/core'
import { NgmIndicatorComponent, NgmIndicatorExplorerComponent } from '@metad/ocap-angular/indicator'
import { DataSettings, IndicatorTagEnum, IndicatorType, TimeGranularity } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { derivedAsync } from 'ngxtension/derived-async'
import { combineLatest, map, of } from 'rxjs'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    DragDropModule,
    CdkMenuModule,
    RouterModule,
    TranslateModule,
    MatTooltipModule,

    NgmIndicatorComponent,
    NgmIndicatorExplorerComponent,
  ],
  selector: 'chat-component-indicators',
  templateUrl: './indicators.component.html',
  styleUrl: 'indicators.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatComponentIndicatorsComponent {
  eTimeGranularity = TimeGranularity

  readonly dsCoreService = inject(NgmDSCoreService)
  readonly #dialog = inject(Dialog)
  readonly viewContainerRef = inject(ViewContainerRef)

  // Inputs
  readonly indicators =
    input<Array<Pick<DataSettings, 'dataSource'> & Pick<DataSettings, 'entitySet'> & { id: string; indicatorCode: string }>>()

  // States
  // Collect dataSources of indicators
  readonly dataSources = derivedAsync(() => {
    const names = this.indicators()?.map(({ dataSource }) => dataSource)
    if (names) {
      return combineLatest(
        names.map((name) => this.dsCoreService.getDataSource(name).pipe(map((dataSource) => ({ name, dataSource }))))
      ).pipe(
        map((dataSources) =>
          dataSources.reduce((acc, curr) => {
            acc[curr.name] = curr.dataSource
            return acc
          }, {})
        )
      )
    }
    return of(null)
  })

  // Processing indicators: If it is a measurement, add a temporary equivalent indicator
  readonly _indicators = computed(() => {
    const indicators = this.indicators()
    if (indicators && this.dataSources()) {
      return indicators.map((indicator) => {
        const dataSource = this.dataSources()[indicator.dataSource]
        if (dataSource) {
          const _indicator = dataSource.getIndicator(indicator.indicatorCode)
          if (!_indicator) {
            dataSource.upsertIndicator({
              name: indicator.indicatorCode,
              code: `Measure_${indicator.indicatorCode}`,
              entity: indicator.entitySet,
              type: IndicatorType.BASIC,
              measure: indicator.indicatorCode,
              visible: true
            })

            return {
              ...indicator,
              indicatorCode: `Measure_${indicator.indicatorCode}`
            }
          }
        }

        return indicator
      })
    }
    return indicators
  })
  readonly pageSize = signal(5)
  readonly pageNo = signal(0)

  readonly showIndicators = computed(() => {
    return this._indicators()?.slice(0, (this.pageNo() + 1) * this.pageSize())
  })

  readonly hasMore = computed(() => this._indicators().length > (this.pageNo() + 1) * this.pageSize())

  readonly indicatorExplorer = signal<string>(null)
  readonly indicatorTagType = signal<IndicatorTagEnum>(IndicatorTagEnum.MOM)

  constructor() {
    // effect(() => {
    // })
  }

  toggleIndicatorTagType() {
    this.indicatorTagType.update((tagType) => {
      if (IndicatorTagEnum[tagType + 1]) {
        return tagType + 1
      } else {
        return IndicatorTagEnum[IndicatorTagEnum[0]] // Ensure to start from 0
      }
    })
  }

  toggleIndicator(indicator: string) {
    this.indicatorExplorer.update((state) => (state === indicator ? null : indicator))
  }

  showMore() {
    this.pageNo.update((currentPage) => currentPage + 1)
  }

  showLess() {
    this.pageNo.update((currentPage) => currentPage - 1)
  }

  editIndicator(id: string) {
    this.#dialog.open(XpIndicatorFormComponent, {
      viewContainerRef: this.viewContainerRef,
      backdropClass: 'xp-overlay-share-sheet',
      panelClass: 'xp-overlay-pane-share-sheet',
      data: {
        id
      }
    }).closed.subscribe((result) => {
      if (result) {
        // Handle the result of the dialog, e.g., refresh indicators or show a message
        console.log('Indicator edited:', result)
      }
    })
  }
}
