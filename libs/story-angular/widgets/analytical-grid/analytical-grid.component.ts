import { ChangeDetectionStrategy, Component, HostBinding, ViewChild, computed, inject } from '@angular/core'
import {
  AnalyticalGridColumnOptions,
  AnalyticalGridComponent,
  AnalyticalGridOptions,
  IColumnSelectionEventArgs
} from '@metad/ocap-angular/analytical-grid'
import { effectAction } from '@metad/ocap-angular/core'
import { ISlicer } from '@metad/ocap-core'
import { AbstractStoryWidget, StoryWidgetState } from '@metad/core'
import { WidgetComponentType } from '@metad/story/core'
import { NxSettingsPanelService } from '@metad/story/designer'
import { EMPTY, Observable } from 'rxjs'
import { map, switchMap, tap } from 'rxjs/operators'
import { SlicersCapacity } from '@metad/ocap-angular/selection'

export interface WidgetAnalyticalGridOptions extends AnalyticalGridOptions {
  strip: boolean
  paging: boolean
  columns?: Record<string, AnalyticalGridColumnOptions>
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface AnalyticalGridState extends StoryWidgetState<WidgetAnalyticalGridOptions> {
  //
}

@Component({
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'pac-widget-analytical-grid',
  templateUrl: 'analytical-grid.component.html',
  styleUrls: ['analytical-grid.component.scss']
})
export class WidgetAnalyticalGridComponent extends AbstractStoryWidget<
  WidgetAnalyticalGridOptions,
  AnalyticalGridState
> {
  SlicersCapacity = SlicersCapacity
  
  @HostBinding('class.pac-widget-analytical-grid') readonly isAnalyticalGridComponent = true

  private readonly settingsService? = inject(NxSettingsPanelService, { optional: true })

  @ViewChild(AnalyticalGridComponent) analyticalGrid!: AnalyticalGridComponent<any>

  public readonly columns = computed(() => this.optionsSignal()?.columns)
  get analytics() {
    return this.dataSettings?.analytics
  }

  public readonly placeholder$ = this.dataSettings$.pipe(
    map((dataSettings) => !(dataSettings?.dataSource && dataSettings?.entitySet))
  )

  onColumnSelectionChanging(event: IColumnSelectionEventArgs) {
    if (event.newSelection.length) {
      this.onSelectColumn({event:event.event, name: event.newSelection[0].name, caption:event.newSelection[0].caption})
    }
  }

  refresh(force = false) {
    // 强制刷新
    this.analyticalGrid.refresh(force)
  }

  onSlicersChanging(slicers: ISlicer[]) {
    // this.slicersChange.emit(slicers)
    this.linkSlicersChange.emit(slicers)

    // Pin this table to be not filterd by outer slicers if selected item
    this.pin = !!slicers?.length
  }

  unlinkAnalysis() {
    this.onSlicersChanging([])
  }

  readonly updateColumnOptions = this.updater(
    (state, { name, options }: { name: string; options: AnalyticalGridColumnOptions }) => {
      state.options.columns = state.options.columns ?? {}
      state.options.columns[name] = options
    }
  )

  readonly onSelectColumn = effectAction((origin$: Observable<{ event: any; name: string; caption?: string }>) => {
    return origin$.pipe(
      switchMap(({ event, name, caption }) => {
        if (this.editable) {
          event?.stopPropagation()
          event?.preventDefault()
        }

        return (
          this.settingsService
            ?.openDesigner(
              WidgetComponentType.AnalyticalGrid + '/Column',
              {
                name,
                caption,
                options: this.columns()?.[name] ?? {}
              },
              `${this.key}/${name}`
            )
            .pipe(
              tap(({ options }: { options: AnalyticalGridColumnOptions }) => this.updateColumnOptions({ name, options })),
              tap(() => this.refresh()),
            ) ?? EMPTY
        )
      })
    )
  })
}
