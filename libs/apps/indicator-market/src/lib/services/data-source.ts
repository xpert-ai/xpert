import { CollectionViewer, DataSource } from '@angular/cdk/collections'
import { Indicator } from '@xpert-ai/ocap-core'
import { BehaviorSubject, Observable, Subject } from 'rxjs'
import { takeUntil } from 'rxjs/operators'
import { IndicatorsStore } from './store'

/**
 * @deprecated
 */
export class MyDataSource extends DataSource<Indicator> {
  private pageSize = 10
  private cachedData: Indicator[] = []
  private fetchedPages = new Set<number>()
  private dataStream = new BehaviorSubject<Indicator[]>(this.cachedData)
  private complete$ = new Subject<void>()
  private disconnect$ = new Subject<void>()

  constructor(private store: IndicatorsStore) {
    super()
  }

  completed(): Observable<void> {
    return this.complete$.asObservable()
  }

  connect(collectionViewer: CollectionViewer): Observable<Indicator[]> {
    this.setup(collectionViewer)
    return this.store.indicators$ as Observable<Indicator[]>
  }

  disconnect(): void {
    this.disconnect$.next()
    this.disconnect$.complete()
  }

  private async setup(collectionViewer: CollectionViewer) {
    this.store.fetchAll()

    collectionViewer.viewChange.pipe(takeUntil(this.complete$), takeUntil(this.disconnect$)).subscribe((range) => {
      if (this.cachedData.length >= 50) {
        this.complete$.next()
        this.complete$.complete()
      } else {
        const endPage = this.getPageForIndex(range.end)
        this.store.fetchPage(endPage + 1)
      }
    })
  }

  private getPageForIndex(index: number): number {
    return Math.floor(index / this.pageSize)
  }

  public isEmpty() {
    return this.store.isEmpty()
  }
}
