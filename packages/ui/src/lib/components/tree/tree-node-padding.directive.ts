import { Directive, ElementRef, Renderer2, effect, inject, input } from '@angular/core';

import { ZardTreeComponent } from './tree.component';
import { ZardTreeNodeContextDirective } from './tree-node-context.directive';

@Directive({
  selector: '[zTreeNodePadding]',
  host: {
    'class': 'z-tree-node flex w-full items-center',
    'data-slot': 'tree-node',
    'role': 'treeitem',
    '[attr.aria-level]': 'ariaLevel()',
  },
  exportAs: 'zTreeNodePadding',
})
export class ZardTreeNodePaddingDirective {
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly renderer = inject(Renderer2);
  private readonly tree = inject(ZardTreeComponent<any, any>, { optional: true });
  private readonly context = inject(ZardTreeNodeContextDirective, { optional: true });

  readonly zTreeNodePadding = input<unknown>(undefined);
  readonly indent = input<string | number>(40, { alias: 'zTreeNodePaddingIndent' });

  readonly ariaLevel = () => this.resolveLevel() + 1;

  constructor() {
    effect(() => {
      const element = this.elementRef.nativeElement;
      this.renderer.setStyle(element, 'padding-left', resolveIndent(this.resolveLevel(), this.indent()));
    });
  }

  private resolveLevel() {
    if (this.context) {
      return this.context.level();
    }

    const index = this.closestTreeNodeIndex();
    const node = index === null ? undefined : this.tree?.getRenderedNode(index);
    return node ? this.tree?.getNodeLevel(node) ?? 0 : 0;
  }

  private closestTreeNodeIndex() {
    const parentNode = this.elementRef.nativeElement.closest('[data-tree-node-index]') as HTMLElement | null;
    const rawIndex = parentNode?.dataset['treeNodeIndex'];
    return rawIndex ? Number(rawIndex) : null;
  }
}

function resolveIndent(level: number, indent: string | number) {
  if (typeof indent === 'number') {
    return `${level * indent}px`;
  }

  const parsed = /^(-?\d*\.?\d+)([a-z%]*)$/i.exec(indent.trim());
  if (parsed) {
    const value = Number(parsed[1]);
    const unit = parsed[2] || 'px';
    return `${level * value}${unit}`;
  }

  return `calc(${level} * (${indent}))`;
}
