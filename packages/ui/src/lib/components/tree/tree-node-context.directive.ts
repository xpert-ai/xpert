import { Directive, input } from '@angular/core';

import { ZardFlatTreeControl } from './tree-control';

@Directive({
  selector: '[zTreeNodeContext]',
  exportAs: 'zTreeNodeContext',
})
export class ZardTreeNodeContextDirective<F = unknown> {
  readonly node = input.required<F>({ alias: 'zTreeNodeContextNode' });
  readonly level = input.required<number>({ alias: 'zTreeNodeContextLevel' });
  readonly index = input<number>(0, { alias: 'zTreeNodeContextIndex' });
  readonly expandable = input(false, { alias: 'zTreeNodeContextExpandable' });
  readonly treeControl = input<ZardFlatTreeControl<F> | null>(null, { alias: 'zTreeNodeContextTreeControl' });
}
