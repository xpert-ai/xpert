import { ComponentStore } from '@xpert-ai/store'
import { BehaviorSubject, Observable, of, Subject } from 'rxjs'
import { distinctUntilChanged, filter, map, takeUntil, withLatestFrom } from 'rxjs/operators'
import { putFilter, removeFilter } from '../filter'
import { ISlicer } from '../types'
import { isEqual, nonNullable } from '../utils'

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface SmartFilterBarState {
  // today: {
  //   enable: boolean
  //   granularity: TimeGranularity
  // }
}

/**
 * * 点击搜索事件, Filters变化的实时事件
 * * 全局 Filters
 * * FilterBar 内的联合过滤 ValueHelp
 * * 往里面增加 Filters
 * * 删除 Filters
 */
export class SmartFilterBarService extends ComponentStore<SmartFilterBarState> {
  /**
   * Filters in this Filter Bar,
   */
  private _filters$ = new BehaviorSubject<Array<ISlicer>>([])
  public readonly slicers$ = this._filters$.asObservable()

  /**
   * Merged parent's filters
   */
  private _model$ = new BehaviorSubject<Array<ISlicer>>(null)
  get slicers() {
    return this._model$.value
  }

  // Filters 改变的事件
  private _go$ = new Subject<void>()
  private _goWithDistinct$ = new Subject<void>()

  constructor(
    // 上级的同类实例
    private _parent?: SmartFilterBarService
  ) {
    super({} as SmartFilterBarState)

    this._parent?.onGo().pipe(takeUntil(this.destroy$)).subscribe(this._go$)

    this._go$
      .pipe(
        withLatestFrom(this._filters$, this._parent?.slicers$ ?? of(null)),
        map(([, slicers, pSlicers]) => {
          pSlicers?.forEach((item) => (slicers = putFilter(slicers, item)))
          return slicers
        }),
        takeUntil(this.destroy$)
      )
      .subscribe(this._model$)

    this._goWithDistinct$
      .pipe(
        withLatestFrom(this._filters$, this._parent?.slicers$ ?? of(null)),
        map(([, slicers, pSlicers]) => {
          pSlicers?.forEach((item) => (slicers = putFilter(slicers, item)))
          return slicers
        }),
        distinctUntilChanged(isEqual),
        takeUntil(this.destroy$)
      )
      .subscribe(this._model$)
  }

  /**
   * Explicit call go method to send when slicers changed
   */
  go() {
    this._go$.next()
  }

  /**
   * Go when slicers distinct until changed
   */
  distinctGo() {
    this._goWithDistinct$.next()
  }

  onGo(): Observable<void> {
    return this._go$
  }

  change(ftrs: Array<ISlicer>) {
    this._filters$.next(ftrs)
  }

  onChange() {
    return this._model$.pipe(filter(nonNullable))
  }

  getFilters() {
    return this._model$.getValue()
  }

  put(...value: ISlicer[]) {
    const slicers = this._model$.value ?? []
    
    this.change(
      value.reduce((slicers, item) => {
        return putFilter(slicers, item)
      }, slicers)
    )
  }

  remove(value: ISlicer | string) {
    this.change(removeFilter(this._model$.getValue() ?? [], value))
  }
}
