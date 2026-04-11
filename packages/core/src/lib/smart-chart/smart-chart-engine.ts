import { ComponentStore } from '@xpert-ai/store'
import { Observable } from 'rxjs'
import { ChartAnnotation } from '../annotations'
import { EntityType, QueryReturn } from '../models'
import { NxChartEngine } from './chart'
import { ChartOptions, ChartSettings } from './types'

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface SmartChartEngineState {
  chartAnnotation: ChartAnnotation
  entityType: EntityType
  data: QueryReturn<unknown>
  settings: ChartSettings
  options: ChartOptions
}

export abstract class SmartChartEngine<T extends SmartChartEngineState = SmartChartEngineState>
  extends ComponentStore<T>
  implements NxChartEngine
{
  get chartAnnotation() {
    return this.get((state) => state.chartAnnotation)
  }
  set chartAnnotation(value) {
    this.patchState({chartAnnotation: value} as Partial<T>)
  }
  readonly chartAnnotation$ = this.select(state => state.chartAnnotation)

  get entityType() {
    return this.get(state => state.entityType)
  }
  set entityType(value) {
    this.patchState({entityType: value} as T)
  }
  public readonly entityType$ = this.select(state => state.entityType)

  get data() {
    return this.get(state => state.data)
  }
  set data(value) {
    this.patchState({data: value} as Partial<T>)
  }
  readonly data$ = this.select(state => state.data)

  get setttings() {
    return this.get(state => state.settings)
  }
  set settings(value) {
    this.patchState({settings: value} as Partial<T>)
  }
  readonly settings$ = this.select(state => state.settings)

  get options() {
    return this.get(state => state.options)
  }
  set options(value) {
    this.patchState({options: value} as Partial<T>)
  }
  readonly options$ = this.select(state => state.options)


  selectChartOptions(items: any[]): Observable<any> {
    throw new Error('Method not implemented.')
  }
  changeData(data: any): void {
    throw new Error('Method not implemented.')
  }
  processData(data: any) {
    throw new Error('Method not implemented.')
  }
  onChartOptions(): Observable<any> {
    throw new Error('Method not implemented.')
  }

  override onDestroy(): void {
    super.onDestroy()
  }
}
