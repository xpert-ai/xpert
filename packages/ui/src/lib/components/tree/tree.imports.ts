import { ZardTreeNodeContentComponent } from './tree-node-content.component'
import { ZardTreeNodeDefDirective } from './tree-node-def.directive'
import { ZardTreeNodePaddingDirective } from './tree-node-padding.directive'
import { ZardTreeNodeToggleDirective } from './tree-node-toggle.directive'
import { ZardTreeNodeComponent } from './tree-node.component'
import { ZardTreeComponent } from './tree.component'

export const ZardTreeImports = [
  ZardTreeComponent,
  ZardTreeNodeComponent,
  ZardTreeNodeDefDirective,
  ZardTreeNodePaddingDirective,
  ZardTreeNodeToggleDirective,
  ZardTreeNodeContentComponent
] as const
