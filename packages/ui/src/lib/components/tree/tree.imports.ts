import { ZardTreeNodeContentComponent } from '@/shared/components/tree/tree-node-content.component';
import { ZardTreeNodeDefDirective } from '@/shared/components/tree/tree-node-def.directive';
import { ZardTreeNodePaddingDirective } from '@/shared/components/tree/tree-node-padding.directive';
import { ZardTreeNodeToggleDirective } from '@/shared/components/tree/tree-node-toggle.directive';
import { ZardTreeNodeComponent } from '@/shared/components/tree/tree-node.component';
import { ZardTreeComponent } from '@/shared/components/tree/tree.component';

export const ZardTreeImports = [
  ZardTreeComponent,
  ZardTreeNodeComponent,
  ZardTreeNodeDefDirective,
  ZardTreeNodePaddingDirective,
  ZardTreeNodeToggleDirective,
  ZardTreeNodeContentComponent,
] as const;
