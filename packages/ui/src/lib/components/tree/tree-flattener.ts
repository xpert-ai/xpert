import { ZardFlatTreeControl } from './tree-control';

export class ZardTreeFlattener<T, F, K = unknown> {
  constructor(
    private readonly transformFunction: (node: T, level: number) => F,
    private readonly getLevel: (node: F) => number,
    private readonly isExpandable: (node: F) => boolean,
    private readonly getChildren: (node: T) => T[] | null | undefined,
  ) {}

  flattenNodes(structuredData: T[]): F[] {
    const result: F[] = [];

    const flatten = (nodes: T[], level: number) => {
      for (const node of nodes ?? []) {
        const flatNode = this.transformFunction(node, level);
        result.push(flatNode);

        const children = this.getChildren(node);
        if (children?.length) {
          flatten(children, level + 1);
        }
      }
    };

    flatten(structuredData ?? [], 0);
    return result;
  }

  expandFlattenedNodes(nodes: F[], treeControl: ZardFlatTreeControl<F, K>): F[] {
    const results: F[] = [];
    const currentExpand: boolean[] = [];

    for (const node of nodes ?? []) {
      const level = this.getLevel(node);
      let shouldRender = true;

      for (let index = 0; index < level; index++) {
        shouldRender = shouldRender && currentExpand[index] !== false;
      }

      if (shouldRender) {
        results.push(node);
      }

      if (this.isExpandable(node)) {
        currentExpand[level] = treeControl.isExpanded(node);
      }
    }

    return results;
  }
}
