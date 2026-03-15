import { NgTemplateOutlet } from '@angular/common';
import { CdkFixedSizeVirtualScroll, CdkVirtualForOf, CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  contentChildren,
  effect,
  ElementRef,
  inject,
  input,
  numberAttribute,
  output,
  signal,
  type TemplateRef,
  ViewEncapsulation,
} from '@angular/core';

import type { ClassValue } from 'clsx';
import { NEVER } from 'rxjs';

import { mergeClasses } from '@/shared/utils/merge-classes';

import { ZardFlatTreeControl } from './tree-control';
import { ZardTreeNodeContextDirective } from './tree-node-context.directive';
import { ZardTreeNodeDefDirective } from './tree-node-def.directive';
import { ZardTreeNodeComponent } from './tree-node.component';
import { ZardTreeService } from './tree.service';
import type {
  FlatTreeNode,
  TreeNode,
  TreeNodeTemplateContext,
  ZardTreeCompatibleDataSource,
  ZardTreeNodeOutletContext,
} from './tree.types';
import { treeVariants } from './tree.variants';

@Component({
  selector: 'z-tree',
  imports: [
    NgTemplateOutlet,
    ZardTreeNodeComponent,
    ZardTreeNodeContextDirective,
    CdkVirtualScrollViewport,
    CdkFixedSizeVirtualScroll,
    CdkVirtualForOf,
  ],
  template: `
    @if (hasProjectedNodeDefs()) {
      @for (node of renderedNodes(); track trackByNode($index, node); let index = $index) {
        <div
          class="contents"
          zTreeNodeContext
          [zTreeNodeContextNode]="node"
          [zTreeNodeContextLevel]="getNodeLevel(node)"
          [zTreeNodeContextIndex]="index"
          [zTreeNodeContextExpandable]="isNodeExpandable(node)"
          [zTreeNodeContextTreeControl]="resolvedTreeControl()"
          [attr.data-tree-node-index]="index"
        >
          <ng-container
            [ngTemplateOutlet]="resolveNodeTemplate(index, node)"
            [ngTemplateOutletContext]="createTemplateContext(index, node)"
          />
        </div>
      }
    } @else if (zVirtualScroll()) {
      <cdk-virtual-scroll-viewport [itemSize]="zVirtualItemSize()" class="size-full">
        <z-tree-node
          *cdkVirtualFor="let flatNode of flattenedNodes(); trackBy: trackByKey"
          [node]="flatNode.node"
          [level]="flatNode.level"
          [flat]="true"
          [selectable]="zSelectable()"
          [checkable]="zCheckable()"
          [nodeTemplate]="customNodeTemplate() ?? null"
          role="treeitem"
          [attr.aria-expanded]="flatNode.expandable ? treeService.isExpanded(flatNode.node.key) : null"
          [attr.aria-level]="flatNode.level + 1"
          [attr.aria-selected]="zSelectable() ? treeService.isSelected(flatNode.node.key) : null"
          [attr.aria-disabled]="flatNode.node.disabled || null"
          [attr.data-key]="flatNode.node.key"
        />
      </cdk-virtual-scroll-viewport>
    } @else {
      @for (node of zData(); track node.key; let i = $index) {
        <z-tree-node
          [node]="node"
          [level]="0"
          [selectable]="zSelectable()"
          [checkable]="zCheckable()"
          [nodeTemplate]="customNodeTemplate() ?? null"
          role="treeitem"
          [attr.aria-expanded]="node.children?.length ? treeService.isExpanded(node.key) : null"
          [attr.aria-level]="1"
          [attr.aria-setsize]="zData().length"
          [attr.aria-posinset]="i + 1"
          [attr.aria-selected]="zSelectable() ? treeService.isSelected(node.key) : null"
          [attr.aria-disabled]="node.disabled || null"
          [attr.data-key]="node.key"
        />
      }
    }
  `,
  providers: [ZardTreeService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    role: 'tree',
    'data-slot': 'tree',
    '[class]': 'classes()',
    '(keydown)': 'onKeydown($event)',
  },
  exportAs: 'zTree',
})
export class ZardTreeComponent<T = any, F = unknown> {
  readonly treeService = inject(ZardTreeService<T>);
  private readonly elementRef = inject(ElementRef);
  private readonly nodeDefs = contentChildren(ZardTreeNodeDefDirective, { descendants: true });

  readonly class = input<ClassValue>('');
  readonly dataSource = input<ZardTreeCompatibleDataSource<F> | F[] | null>(null);
  readonly treeControl = input<ZardFlatTreeControl<F> | null>(null);
  readonly zData = input<TreeNode<T>[]>([]);
  readonly zSelectable = input(false, { transform: booleanAttribute });
  readonly zCheckable = input(false, { transform: booleanAttribute });
  readonly zExpandAll = input(false, { transform: booleanAttribute });
  readonly zVirtualScroll = input(false, { transform: booleanAttribute });
  readonly zVirtualItemSize = input(32, { transform: numberAttribute });

  readonly zNodeClick = output<TreeNode<T>>();
  readonly zNodeExpand = output<TreeNode<T>>();
  readonly zNodeCollapse = output<TreeNode<T>>();
  readonly zSelectionChange = output<TreeNode<T>[]>();
  readonly zCheckChange = output<TreeNode<T>[]>();

  readonly customNodeTemplate = contentChild<TemplateRef<TreeNodeTemplateContext<T>>>('nodeTemplate');

  protected readonly classes = computed(() => mergeClasses(treeVariants(), this.class()));
  protected readonly flattenedNodes = computed(() => this.treeService.flattenedNodes());
  protected readonly renderedNodes = signal<F[]>([]);
  protected readonly hasProjectedNodeDefs = computed(() => this.nodeDefs().length > 0);
  protected readonly resolvedTreeControl = computed(() => this.treeControl());

  private focusedIndex = 0;

  constructor() {
    effect(() => {
      this.treeService.setData(this.zData());
    });

    effect(() => {
      if (this.zExpandAll()) {
        this.treeService.expandAll();
      }
    });

    effect(() => {
      const clicked = this.treeService.clickedNode();
      if (clicked) {
        this.zNodeClick.emit(clicked.node);
      }
    });

    effect(() => {
      const keys = this.treeService.selectedKeys();
      if (keys.size > 0) {
        this.zSelectionChange.emit(this.treeService.getSelectedNodes());
      }
    });

    effect(() => {
      const keys = this.treeService.checkedKeys();
      if (keys.size > 0) {
        this.zCheckChange.emit(this.treeService.getCheckedNodes());
      }
    });

    effect(onCleanup => {
      const dataSource = this.dataSource();
      if (!dataSource) {
        this.renderedNodes.set([]);
        return;
      }

      if (Array.isArray(dataSource)) {
        this.renderedNodes.set(dataSource);
        return;
      }

      const subscription = dataSource.connect({ viewChange: NEVER }).subscribe(nodes => {
        this.renderedNodes.set(nodes ?? []);
      });

      onCleanup(() => {
        subscription.unsubscribe();
        dataSource.disconnect?.({ viewChange: NEVER });
      });
    });
  }

  trackByKey(_index: number, item: FlatTreeNode<T>): string {
    return item.node.key;
  }

  trackByNode(index: number, node: F) {
    return this.resolvedTreeControl()?.trackBy(node) ?? index;
  }

  getRenderedNode(index: number): F | undefined {
    return this.renderedNodes()[index];
  }

  getRenderedTreeControl() {
    return this.resolvedTreeControl();
  }

  getNodeLevel(node: F): number {
    return this.resolvedTreeControl()?.getLevel(node) ?? 0;
  }

  isNodeExpandable(node: F): boolean {
    return this.resolvedTreeControl()?.isExpandable(node) ?? false;
  }

  resolveNodeTemplate(index: number, node: F) {
    const definitions = this.nodeDefs();
    return (
      definitions.find(definition => definition.when()?.(index, node))?.template ??
      definitions.find(definition => !definition.when())?.template ??
      null
    );
  }

  createTemplateContext(index: number, node: F): ZardTreeNodeOutletContext<F> {
    return {
      $implicit: node,
      index,
      level: this.getNodeLevel(node),
      expandable: this.isNodeExpandable(node),
    };
  }

  onKeydown(event: KeyboardEvent) {
    const nodes = this.treeService.flattenedNodes();
    if (!nodes.length) {
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.moveFocus(Math.min(this.focusedIndex + 1, nodes.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.moveFocus(Math.max(this.focusedIndex - 1, 0));
        break;
      case 'ArrowRight':
        event.preventDefault();
        this.expandFocusedNode();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        this.collapseFocusedNode();
        break;
      case 'Home':
        event.preventDefault();
        this.moveFocus(0);
        break;
      case 'End':
        event.preventDefault();
        this.moveFocus(nodes.length - 1);
        break;
      case 'Enter':
        event.preventDefault();
        this.activateFocusedNode();
        break;
      case ' ':
        event.preventDefault();
        this.checkFocusedNode();
        break;
    }
  }

  private getFocusedNode(): FlatTreeNode<T> | undefined {
    return this.treeService.flattenedNodes()[this.focusedIndex];
  }

  private moveFocus(index: number) {
    this.focusedIndex = index;
    const node = this.getFocusedNode();
    if (node) {
      this.focusDomNode(node.node.key);
    }
  }

  private expandFocusedNode() {
    const current = this.getFocusedNode();
    if (current?.expandable && !this.treeService.isExpanded(current.node.key)) {
      this.treeService.expand(current.node.key);
      this.zNodeExpand.emit(current.node);
    }
  }

  private collapseFocusedNode() {
    const current = this.getFocusedNode();
    if (current && this.treeService.isExpanded(current.node.key)) {
      this.treeService.collapse(current.node.key);
      this.zNodeCollapse.emit(current.node);
    }
  }

  private activateFocusedNode() {
    const current = this.getFocusedNode();
    if (current && !current.node.disabled) {
      this.treeService.notifyNodeClick(current.node);
      if (this.zSelectable()) {
        this.treeService.select(current.node.key, 'single');
      }
    }
  }

  private checkFocusedNode() {
    const current = this.getFocusedNode();
    if (current && !current.node.disabled && this.zCheckable()) {
      this.treeService.toggleCheck(current.node);
    }
  }

  private focusDomNode(key: string) {
    const element = (this.elementRef.nativeElement as HTMLElement).querySelector<HTMLElement>(`[data-key="${key}"]`);
    element?.focus();
  }
}
