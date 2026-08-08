import { ZardContextMenuDirective } from './context-menu.directive'
import { ZardMenuContentDirective } from './menu-content.directive'
import { ZardMenuItemDirective } from './menu-item.directive'
import { ZardMenuLabelComponent } from './menu-label.component'
import { ZardMenuShortcutComponent } from './menu-shortcut.component'
import { ZardMenuDirective } from './menu.directive'

export const ZardMenuImports = [
  ZardContextMenuDirective,
  ZardMenuContentDirective,
  ZardMenuItemDirective,
  ZardMenuDirective,
  ZardMenuLabelComponent,
  ZardMenuShortcutComponent
] as const
