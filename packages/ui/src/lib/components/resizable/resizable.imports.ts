import { ZardResizableHandleComponent } from '@/src/lib/components/resizable/resizable-handle.component';
import { ZardResizablePanelComponent } from '@/src/lib/components/resizable/resizable-panel.component';
import { ZardResizableComponent } from '@/src/lib/components/resizable/resizable.component';

export const ZardResizableImports = [
  ZardResizableComponent,
  ZardResizableHandleComponent,
  ZardResizablePanelComponent,
] as const;
