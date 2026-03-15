import { DataSource } from '@angular/cdk/collections'
import { type ZardPageEvent, type ZardPaginatorLike, type ZardTableSortDirection } from '@xpert-ai/headless-ui'
import get from 'lodash-es/get'
import { BehaviorSubject, merge, Observable, of, ReplaySubject, Subscription } from 'rxjs'

type TableSortLike = {
  active: string | null
  direction: ZardTableSortDirection
  sortChange?: Observable<unknown>
  initialized?: Observable<unknown>
}

export class TableVirtualScrollDataSource<T> extends DataSource<T> {
  readonly dataToRender$ = new ReplaySubject<T[]>(1)
  readonly dataOfRange$ = new ReplaySubject<T[]>(1)

  private readonly dataSubject = new BehaviorSubject<T[]>([])
  private readonly filterSubject = new BehaviorSubject('')
  private readonly renderDataSubject = new BehaviorSubject<T[]>([])
  private readonly subscriptions = new Subscription()

  private paginatorState: ZardPaginatorLike | null = null
  private sortState: TableSortLike | null = null

  sortingDataAccessor: (data: T, sortHeaderId: string) => string | number = (data, sortHeaderId) => {
    const value = get(data as Record<string, unknown>, sortHeaderId)
    return typeof value === 'number' ? value : String(value ?? '')
  }

  constructor(initialData: T[] = []) {
    super()
    this.data = initialData
    this.subscriptions.add(
      this.dataOfRange$.subscribe((data) => {
        this.renderDataSubject.next(data)
      })
    )
  }

  get data(): T[] {
    return this.dataSubject.value
  }

  set data(data: T[]) {
    this.dataSubject.next(Array.isArray(data) ? [...data] : [])
    this.updateRenderedData()
  }

  get filter(): string {
    return this.filterSubject.value
  }

  set filter(filter: string) {
    this.filterSubject.next(filter?.trim().toLowerCase() ?? '')
    this.updateRenderedData()
  }

  get paginator(): ZardPaginatorLike | null {
    return this.paginatorState
  }

  set paginator(paginator: ZardPaginatorLike | null) {
    this.paginatorState = paginator
    this.bindPaginator()
    this.updateRenderedData()
  }

  get sort(): TableSortLike | null {
    return this.sortState
  }

  set sort(sort: TableSortLike | null) {
    this.sortState = sort
    this.bindSort()
    this.updateRenderedData()
  }

  connect(): Observable<T[]> {
    this.updateRenderedData()
    return this.renderDataSubject.asObservable()
  }

  disconnect(): void {
    this.subscriptions.unsubscribe()
    this.dataSubject.complete()
    this.filterSubject.complete()
    this.renderDataSubject.complete()
    this.dataToRender$.complete()
    this.dataOfRange$.complete()
  }

  private bindPaginator() {
    const page$ = (this.paginatorState?.page as Observable<unknown> | undefined) ?? of(null)
    const initialized$ = (this.paginatorState?.initialized as Observable<unknown> | undefined) ?? of(null)
    this.subscriptions.add(
      merge(page$, initialized$).subscribe(() => {
        this.updateRenderedData()
      })
    )
  }

  private bindSort() {
    const sortChange$ = this.sortState?.sortChange ?? of(null)
    const initialized$ = this.sortState?.initialized ?? of(null)
    this.subscriptions.add(
      merge(sortChange$, initialized$).subscribe(() => {
        this.updateRenderedData()
      })
    )
  }

  private updateRenderedData() {
    const filteredData = this.filterData(this.dataSubject.value, this.filterSubject.value)
    const orderedData = this.orderData(filteredData)
    const pagedData = this.pageData(orderedData)

    if (this.paginatorState) {
      this.paginatorState.length = orderedData.length
    }

    this.dataToRender$.next(orderedData)
    this.dataOfRange$.next(pagedData)
  }

  private filterData(data: T[], filter: string) {
    if (!filter) {
      return data
    }

    return data.filter((row) => JSON.stringify(row).toLowerCase().includes(filter))
  }

  private orderData(data: T[]) {
    if (!this.sortState?.active || !this.sortState.direction) {
      return data
    }

    return [...data].sort((left, right) => {
      const result = compareTableValues(
        this.sortingDataAccessor(left, this.sortState.active),
        this.sortingDataAccessor(right, this.sortState.active)
      )
      return this.sortState.direction === 'asc' ? result : -result
    })
  }

  private pageData(data: T[]) {
    if (!this.paginatorState) {
      return data
    }

    const event = this.paginatorState as ZardPaginatorLike & Partial<ZardPageEvent>
    const startIndex = (event.pageIndex ?? 0) * (event.pageSize ?? data.length)
    const endIndex = startIndex + (event.pageSize ?? data.length)
    return data.slice(startIndex, endIndex)
  }
}

function compareTableValues(left: string | number, right: string | number) {
  if (left === right) {
    return 0
  }

  if (typeof left === 'number' && typeof right === 'number') {
    return left - right
  }

  return String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: 'base'
  })
}
