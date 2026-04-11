import { BehaviorSubject, merge, of } from 'rxjs';
import { map, startWith } from 'rxjs/operators';

import { ZardFlatTreeControl } from './tree-control';
import { ZardTreeFlattener } from './tree-flattener';

export class ZardTreeFlatDataSource<T, F, K = unknown> {
  readonly treeControl: ZardFlatTreeControl<F, K>;

  private readonly dataChange = new BehaviorSubject<T[]>([]);
  private readonly renderedData = new BehaviorSubject<F[]>([]);

  constructor(
    treeControl: ZardFlatTreeControl<F, K>,
    private readonly treeFlattener: ZardTreeFlattener<T, F, K>,
    initialData: T[] = [],
  ) {
    this.treeControl = treeControl;
    this.data = initialData;
  }

  get data(): T[] {
    return this.dataChange.value;
  }

  set data(value: T[]) {
    this.dataChange.next(value ?? []);
    this.updateRenderedData();
  }

  connect(viewer?: { viewChange?: import('rxjs').Observable<unknown> }) {
    return merge(
      this.dataChange,
      this.treeControl.expansionModel.changed.pipe(startWith(null)),
      viewer?.viewChange ?? of(null),
    ).pipe(
      map(() => {
        const renderedData = this.treeFlattener.expandFlattenedNodes(this.treeControl.dataNodes, this.treeControl);
        this.renderedData.next(renderedData);
        return renderedData;
      }),
    );
  }

  disconnect() {
    // Intentionally left blank so the data source can be reused across reconnects.
  }

  private updateRenderedData() {
    const flattenedData = this.treeFlattener.flattenNodes(this.data);
    this.treeControl.dataNodes = flattenedData;
    this.renderedData.next(this.treeFlattener.expandFlattenedNodes(flattenedData, this.treeControl));
  }
}
