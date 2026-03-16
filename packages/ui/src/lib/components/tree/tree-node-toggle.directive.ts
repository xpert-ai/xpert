import { Directive, ElementRef, HostListener, Renderer2, effect, inject, input } from '@angular/core';

import { ZardTreeComponent } from './tree.component';
import { ZardTreeNodeContextDirective } from './tree-node-context.directive';
import { ZardTreeNodePaddingDirective } from './tree-node-padding.directive';

@Directive({
  selector: '[zTreeNodeToggle]',
  host: {
    'class': 'z-tree-toggle',
    '[attr.aria-expanded]': 'ariaExpanded()',
  },
  exportAs: 'zTreeNodeToggle',
})
export class ZardTreeNodeToggleDirective<F = unknown> {
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly renderer = inject(Renderer2);
  private readonly tree = inject(ZardTreeComponent<any, F>, { optional: true });
  private readonly context = inject(ZardTreeNodeContextDirective<F>, { optional: true });
  private readonly nodePadding = inject(ZardTreeNodePaddingDirective, { optional: true });

  readonly zTreeNodeToggle = input<unknown>(undefined);

  readonly ariaExpanded = () => {
    const treeControl = this.getTreeControl();
    const node = this.getNode();

    if (!treeControl || !node || !treeControl.isExpandable(node)) {
      return null;
    }

    return treeControl.isExpanded(node);
  };

  constructor() {
    effect(() => {
      if (!this.nodePadding) {
        this.renderer.setAttribute(this.elementRef.nativeElement, 'data-slot', 'tree-toggle');
      }
    });
  }

  @HostListener('click')
  onClick() {
    const treeControl = this.getTreeControl();
    const node = this.getNode();

    if (treeControl && node && treeControl.isExpandable(node)) {
      treeControl.toggle(node);
    }
  }

  private getNode() {
    if (this.context) {
      return this.context.node();
    }

    const index = this.closestTreeNodeIndex();
    return index === null ? undefined : this.tree?.getRenderedNode(index);
  }

  private getTreeControl() {
    if (this.context) {
      return this.context.treeControl();
    }

    return this.tree?.getRenderedTreeControl();
  }

  private closestTreeNodeIndex() {
    const parentNode = this.elementRef.nativeElement.closest('[data-tree-node-index]') as HTMLElement | null;
    const rawIndex = parentNode?.dataset['treeNodeIndex'];
    return rawIndex ? Number(rawIndex) : null;
  }
}
