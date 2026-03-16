import { Subject } from 'rxjs';

import type { ZardTreeExpansionChange } from './tree.types';

export interface ZardFlatTreeControlOptions<F, K = unknown> {
  trackBy?: (dataNode: F) => K;
}

export class ZardFlatTreeControl<F, K = unknown> {
  private readonly expansionChanges = new Subject<ZardTreeExpansionChange<F>>();

  readonly expansionModel = {
    changed: this.expansionChanges.asObservable(),
  };

  dataNodes: F[] = [];

  private readonly expandedKeys = new Set<K | F>();

  constructor(
    private readonly _getLevel: (node: F) => number,
    private readonly _isExpandable: (node: F) => boolean,
    private readonly options: ZardFlatTreeControlOptions<F, K> = {},
  ) {}

  getLevel(node: F): number {
    return this._getLevel(node);
  }

  isExpandable(node: F): boolean {
    return this._isExpandable(node);
  }

  trackBy(node: F): K | F {
    return this.options.trackBy ? this.options.trackBy(node) : node;
  }

  isExpanded(node: F): boolean {
    return this.expandedKeys.has(this.trackBy(node));
  }

  expand(node: F) {
    if (!this.isExpandable(node)) {
      return;
    }

    const key = this.trackBy(node);
    if (this.expandedKeys.has(key)) {
      return;
    }

    this.expandedKeys.add(key);
    this.expansionChanges.next({ added: [node] });
  }

  collapse(node: F) {
    const key = this.trackBy(node);
    if (!this.expandedKeys.has(key)) {
      return;
    }

    this.expandedKeys.delete(key);
    this.expansionChanges.next({ removed: [node] });
  }

  toggle(node: F) {
    if (this.isExpanded(node)) {
      this.collapse(node);
    } else {
      this.expand(node);
    }
  }

  expandAll() {
    const added = this.dataNodes.filter(node => this.isExpandable(node) && !this.isExpanded(node));
    if (!added.length) {
      return;
    }

    for (const node of added) {
      this.expandedKeys.add(this.trackBy(node));
    }

    this.expansionChanges.next({ added });
  }

  collapseAll() {
    const removed = this.dataNodes.filter(node => this.isExpanded(node));
    if (!removed.length) {
      return;
    }

    this.expandedKeys.clear();
    this.expansionChanges.next({ removed });
  }

  getDescendants(node: F): F[] {
    const startIndex = this.findNodeIndex(node);
    if (startIndex < 0) {
      return [];
    }

    const descendants: F[] = [];
    const level = this.getLevel(node);

    for (let index = startIndex + 1; index < this.dataNodes.length; index++) {
      const current = this.dataNodes[index];
      if (this.getLevel(current) <= level) {
        break;
      }
      descendants.push(current);
    }

    return descendants;
  }

  private findNodeIndex(node: F): number {
    const directIndex = this.dataNodes.indexOf(node);
    if (directIndex >= 0) {
      return directIndex;
    }

    const nodeKey = this.trackBy(node);
    return this.dataNodes.findIndex(item => this.trackBy(item) === nodeKey);
  }
}
