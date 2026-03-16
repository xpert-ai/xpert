import { CollectionViewer } from '@angular/cdk/collections'
import { type ZardPaginatorLike, ZardTreeFlatDataSource } from '@xpert-ai/headless-ui'
import { BehaviorSubject, Observable, Subject, combineLatestWith, distinctUntilChanged, map, merge, of, switchMap } from 'rxjs'

export class NgmTreeFlatDataSource<
  T,
  F,
  P extends ZardPaginatorLike = ZardPaginatorLike
> extends ZardTreeFlatDataSource<T, F> {
  get paginator(): P | null {
    return this._paginator.value
  }

  set paginator(paginator: P | null) {
    this._paginator.next(paginator)
  }

  private _paginator = new BehaviorSubject<P | null>(null)

  /** Used to react to internal changes of the paginator that are made by the data source itself. */
  private readonly _internalPageChanges = new Subject<void>();

  override connect(collectionViewer: CollectionViewer): Observable<F[]> {
    return super.connect(collectionViewer).pipe(
      combineLatestWith(this._paginator.pipe(
        distinctUntilChanged(),
        switchMap((_paginator) => _paginator ? (merge(
            _paginator.page,
            this._internalPageChanges,
            _paginator.initialized,
          ) as Observable<void>)
        : of(null)))
      ),
      map(([data]: [F[], void]) => {

        if (this.paginator) {
          this._updatePaginator(data.length);
        }

        return this._pageData(data)
      })
    )
  }

  _pageData(data: F[]): F[] {
    if (!this.paginator) {
      return data
    }

    const startIndex = this.paginator.pageIndex * this.paginator.pageSize
    return data.slice(startIndex, startIndex + this.paginator.pageSize)
  }

  /**
   * Updates the paginator to reflect the length of the filtered data, and makes sure that the page
   * index does not exceed the paginator's last page. Values are changed in a resolved promise to
   * guard against making property changes within a round of change detection.
   */
  _updatePaginator(filteredDataLength: number) {
    Promise.resolve().then(() => {
      const paginator = this.paginator;

      if (!paginator) {
        return;
      }

      paginator.length = filteredDataLength;

      // If the page index is set beyond the page, reduce it to the last page.
      if (paginator.pageIndex > 0) {
        const lastPageIndex = Math.ceil(paginator.length / paginator.pageSize) - 1 || 0;
        const newPageIndex = Math.min(paginator.pageIndex, lastPageIndex);

        if (newPageIndex !== paginator.pageIndex) {
          paginator.pageIndex = newPageIndex;

          // Since the paginator only emits after user-generated changes,
          // we need our own stream so we know to should re-render the data.
          this._internalPageChanges.next();
        }
      }
    });
  }
}
