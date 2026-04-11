import { Dialog } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  ViewContainerRef
} from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { XpIndicatorFormComponent } from '@cloud/app/@shared/indicator'
import { XpertOcapService } from '@cloud/app/xpert/ocap.service'
import { IIndicator } from '@xpert-ai/contracts'
import { NgmDSCoreService } from '@xpert-ai/ocap-angular/core'
import { NgmIndicatorComponent, NgmIndicatorExplorerComponent } from '@xpert-ai/ocap-angular/indicator'
import { DataSettings, IndicatorTagEnum, IndicatorType, TimeGranularity } from '@xpert-ai/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { derivedAsync } from 'ngxtension/derived-async'
import { isEqual } from 'lodash-es'
import { combineLatest, map, of } from 'rxjs'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
@Component({
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    DragDropModule,
    CdkMenuModule,
    RouterModule,
    TranslateModule,
    ...ZardTooltipImports,
    NgmIndicatorComponent,
    NgmIndicatorExplorerComponent
],
  selector: 'chat-component-indicators',
  templateUrl: './indicators.component.html',
  styleUrl: 'indicators.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatComponentIndicatorsComponent {
  eTimeGranularity = TimeGranularity

  readonly dsCoreService = inject(NgmDSCoreService)
  readonly xpertOcapService = inject(XpertOcapService)
  readonly #dialog = inject(Dialog)
  readonly viewContainerRef = inject(ViewContainerRef)

  // Inputs
  readonly indicators =
    input<
      Array<Pick<DataSettings, 'dataSource'> & Pick<DataSettings, 'entitySet'> & { id: string; indicatorCode: string }>
    >()

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

  readonly temporaryIndicatorRequests = computed(
    () => {
      const indicators = this.indicators()
      const dataSources = this.dataSources()

      if (!indicators?.length || !dataSources) {
        return []
      }

      return indicators.flatMap((indicator) => {
        const dataSource = dataSources[indicator.dataSource]
        if (!dataSource) {
          return []
        }

        const temporaryCode = getTemporaryIndicatorCode(indicator.indicatorCode)
        const existingIndicator = dataSource.getIndicator(indicator.indicatorCode, indicator.entitySet)
        const existingTemporaryIndicator = dataSource.getIndicator(temporaryCode, indicator.entitySet)

        if (existingIndicator || existingTemporaryIndicator) {
          return []
        }

        return [
          {
            dataSource: indicator.dataSource,
            indicator: {
              name: indicator.indicatorCode,
              code: temporaryCode,
              entity: indicator.entitySet,
              type: IndicatorType.BASIC,
              measure: indicator.indicatorCode,
              visible: true
            }
          }
        ]
      })
    },
    { equal: isEqual }
  )

  // Processing indicators: If it is a measurement, add a temporary equivalent indicator
  readonly _indicators = computed(
    () => {
      const indicators = this.indicators()
      const dataSources = this.dataSources()
      if (indicators && dataSources) {
        return indicators.map((indicator) => {
          const dataSource = dataSources[indicator.dataSource]
          if (dataSource) {
            const existingIndicator = dataSource.getIndicator(indicator.indicatorCode, indicator.entitySet)
            if (existingIndicator) {
              return indicator
            }

            return {
              ...indicator,
              indicatorCode: getTemporaryIndicatorCode(indicator.indicatorCode)
            }
          }

          return indicator
        })
      }
      return indicators
    },
    { equal: isEqual }
  )
  readonly pageSize = signal(5)
  readonly pageNo = signal(0)

  readonly showIndicators = computed(() => {
    return this._indicators()?.slice(0, (this.pageNo() + 1) * this.pageSize())
  })

  readonly hasMore = computed(() => (this._indicators()?.length ?? 0) > (this.pageNo() + 1) * this.pageSize())

  readonly indicatorExplorer = signal<string>(null)
  readonly indicatorTagType = signal<IndicatorTagEnum>(IndicatorTagEnum.MOM)

  constructor() {
    effect(() => {
      const requests = this.temporaryIndicatorRequests()
      const dataSources = this.dataSources()

      if (!requests.length || !dataSources) {
        return
      }

      requests.forEach(({ dataSource: dataSourceName, indicator }) => {
        dataSources[dataSourceName]?.upsertIndicator(indicator)
      })
    })
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
    this.#dialog
      .open<IIndicator>(XpIndicatorFormComponent, {
        viewContainerRef: this.viewContainerRef,
        backdropClass: 'xp-overlay-share-sheet',
        panelClass: 'xp-overlay-pane-share-sheet',
        data: {
          id
        }
      })
      .closed.subscribe((result) => {
        if (result) {
          this.xpertOcapService.refreshModel(result.modelId, true)
        }
      })
  }
}

function getTemporaryIndicatorCode(indicatorCode: string) {
  return `Measure_${indicatorCode}`
}
