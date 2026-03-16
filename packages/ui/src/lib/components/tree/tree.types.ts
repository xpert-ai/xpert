export interface TreeNode<T = any> {
  key: string;
  label: string;
  data?: T;
  icon?: string;
  children?: TreeNode<T>[];
  expanded?: boolean;
  selected?: boolean;
  checked?: boolean;
  disabled?: boolean;
  leaf?: boolean;
}

export interface TreeNodeTemplateContext<T = unknown> {
  $implicit: TreeNode<T>;
  level: number;
}

export type TreeCheckState = 'checked' | 'unchecked' | 'indeterminate';

export interface FlatTreeNode<T = any> {
  node: TreeNode<T>;
  level: number;
  expandable: boolean;
  index: number;
}

export interface ZardTreeNodeOutletContext<F = unknown> {
  $implicit: F;
  index: number;
  level: number;
  expandable: boolean;
}

export type ZardTreeNodePredicate<F = unknown> = (index: number, nodeData: F) => boolean;

export interface ZardTreeExpansionChange<F = unknown> {
  added?: F[];
  removed?: F[];
}

export interface ZardTreeCompatibleDataSource<F = unknown> {
  connect(viewer?: { viewChange?: import('rxjs').Observable<unknown> }): import('rxjs').Observable<F[]>;
  disconnect?(viewer?: { viewChange?: import('rxjs').Observable<unknown> }): void;
}
