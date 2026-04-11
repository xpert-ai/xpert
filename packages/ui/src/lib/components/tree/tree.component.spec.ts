import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import {
  ZardFlatTreeControl,
  ZardTreeFlatDataSource,
  ZardTreeFlattener,
  ZardTreeImports,
  ZardTreeNodeDefDirective,
  ZardTreeNodePaddingDirective,
  ZardTreeNodeToggleDirective,
} from '../../../public-api';

type ExampleTreeNode = {
  key: string;
  label: string;
  children?: ExampleTreeNode[];
};

type ExampleFlatNode = {
  key: string;
  label: string;
  level: number;
  expandable: boolean;
  raw: ExampleTreeNode;
};

const TREE_DATA: ExampleTreeNode[] = [
  {
    key: 'alpha',
    label: 'Alpha',
    children: [
      {
        key: 'alpha-child',
        label: 'Alpha Child',
      },
    ],
  },
  {
    key: 'beta',
    label: 'Beta',
  },
];

function createTreeHarness() {
  const transformer = (node: ExampleTreeNode, level: number): ExampleFlatNode => ({
    key: node.key,
    label: node.label,
    level,
    expandable: !!node.children?.length,
    raw: node,
  });

  const treeControl = new ZardFlatTreeControl<ExampleFlatNode, string>(
    node => node.level,
    node => node.expandable,
    { trackBy: node => node.key },
  );
  const treeFlattener = new ZardTreeFlattener<ExampleTreeNode, ExampleFlatNode, string>(
    transformer,
    node => node.level,
    node => node.expandable,
    node => node.children,
  );
  const dataSource = new ZardTreeFlatDataSource(treeControl, treeFlattener, TREE_DATA);

  return { dataSource, transformer, treeControl, treeFlattener };
}

@Component({
  imports: [...ZardTreeImports],
  template: `
    <z-tree [dataSource]="dataSource" [treeControl]="treeControl" class="tree-host">
      <div
        *zTreeNodeDef="let node"
        zTreeNodePadding
        [zTreeNodePaddingIndent]="12"
        class="leaf-node"
      >
        {{ node.label }}
      </div>

      <div
        *zTreeNodeDef="let node; when: hasChild"
        zTreeNodePadding
        [zTreeNodePaddingIndent]="12"
        class="branch-node"
      >
        <button type="button" zTreeNodeToggle class="branch-toggle">
          {{ node.label }}
        </button>
      </div>
    </z-tree>
  `,
})
class TreeHostComponent {
  readonly hasChild = (_index: number, node: ExampleFlatNode) => node.expandable;
  private readonly harness = createTreeHarness();

  readonly treeControl = this.harness.treeControl;
  readonly dataSource = this.harness.dataSource;
}

describe('tree public API', () => {
  it('exports the flat-tree primitives through the public API', () => {
    expect(ZardFlatTreeControl).toBeDefined();
    expect(ZardTreeFlattener).toBeDefined();
    expect(ZardTreeFlatDataSource).toBeDefined();
    expect(ZardTreeNodeDefDirective).toBeDefined();
    expect(ZardTreeNodePaddingDirective).toBeDefined();
    expect(ZardTreeNodeToggleDirective).toBeDefined();
  });

  it('flattens nested data, expands nodes, and returns descendants', () => {
    const { treeControl, treeFlattener } = createTreeHarness();
    const flattened = treeFlattener.flattenNodes(TREE_DATA);
    treeControl.dataNodes = flattened;

    expect(flattened.map(node => `${node.key}:${node.level}`)).toEqual(['alpha:0', 'alpha-child:1', 'beta:0']);
    expect(treeControl.getDescendants(flattened[0]).map(node => node.key)).toEqual(['alpha-child']);

    const changes: string[] = [];
    treeControl.expansionModel.changed.subscribe(change => {
      if (change.added?.length) {
        changes.push(`expand:${change.added[0].key}`);
      }
      if (change.removed?.length) {
        changes.push(`collapse:${change.removed[0].key}`);
      }
    });

    treeControl.expand(flattened[0]);
    expect(treeControl.isExpanded(flattened[0])).toBe(true);

    treeControl.collapse(flattened[0]);
    expect(treeControl.isExpanded(flattened[0])).toBe(false);
    expect(changes).toEqual(['expand:alpha', 'collapse:alpha']);
  });

  it('renders only expanded nodes from the datasource', () => {
    const { dataSource, treeControl } = createTreeHarness();
    let latestKeys: string[] = [];

    const subscription = dataSource.connect().subscribe(nodes => {
      latestKeys = nodes.map(node => node.key);
    });

    expect(latestKeys).toEqual(['alpha', 'beta']);

    treeControl.expand(treeControl.dataNodes[0]);
    expect(latestKeys).toEqual(['alpha', 'alpha-child', 'beta']);

    treeControl.collapseAll();
    expect(latestKeys).toEqual(['alpha', 'beta']);

    subscription.unsubscribe();
  });

  it('uses projected node defs, toggle behavior, and padding markers', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [TreeHostComponent],
    }).createComponent(TreeHostComponent);

    fixture.componentInstance.dataSource.data = TREE_DATA;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const tree = fixture.nativeElement.querySelector('z-tree') as HTMLElement;
    let nodes = Array.from(fixture.nativeElement.querySelectorAll('[data-slot="tree-node"]')) as HTMLElement[];

    expect(tree.dataset.slot).toBe('tree');
    expect(nodes.map(node => node.textContent?.trim())).toEqual(['Alpha', 'Beta']);
    expect(nodes[0].classList.contains('branch-node')).toBe(true);
    expect(nodes[0].style.paddingLeft).toBe('0px');

    const toggle = fixture.nativeElement.querySelector('.branch-toggle') as HTMLButtonElement;
    toggle.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    nodes = Array.from(fixture.nativeElement.querySelectorAll('[data-slot="tree-node"]')) as HTMLElement[];

    expect(fixture.componentInstance.treeControl.isExpanded(fixture.componentInstance.treeControl.dataNodes[0])).toBe(true);
    expect(nodes.map(node => node.textContent?.trim())).toEqual(['Alpha', 'Alpha Child', 'Beta']);
    expect(nodes[1].classList.contains('leaf-node')).toBe(true);
    expect(nodes[1].style.paddingLeft).toBe('12px');
    expect(nodes[0].dataset.slot).toBe('tree-node');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });
});
