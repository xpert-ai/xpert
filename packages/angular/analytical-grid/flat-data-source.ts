import { DataSource } from '@angular/cdk/collections'
import { BehaviorSubject, Observable } from 'rxjs'
import { extractHierarchyFromUniqueName } from '@xpert-ai/ocap-core'

/**
 * @deprecated Analytical grid now manages flat sorting and paging in component state.
 * This data source remains as a lightweight compatibility wrapper for downstream imports.
 */
export class NgmFlatTableDataSource<T> extends DataSource<T> {
  private readonly dataSubject = new BehaviorSubject<T[]>([])

  constructor(initialData: T[] = []) {
    super()
    this.data = initialData
  }

  get data(): T[] {
    return this.dataSubject.value
  }

  set data(data: T[]) {
    this.dataSubject.next(Array.isArray(data) ? [...data] : [])
  }

  sortingDataAccessor: (data: T, sortHeaderId: string) => string | number = (data: T, sortHeaderId: string) => {
    const hierarchy = extractHierarchyFromUniqueName(sortHeaderId)
    const cell = (data as { [key: string]: unknown })[hierarchy]
    const value = typeof cell === 'string' ? cell : (cell as { value?: string | number } | null)?.value

    return typeof value === 'number' ? value : String(value ?? '')
  }

  connect(): Observable<T[]> {
    return this.dataSubject.asObservable()
  }

  disconnect(): void {
    this.dataSubject.complete()
  }
}
