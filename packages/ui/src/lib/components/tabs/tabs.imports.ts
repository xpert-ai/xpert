import {
  ZardTabComponent,
  ZardTabContentDirective,
  ZardTabGroupComponent,
  ZardTabLabelDirective,
  ZardTabNavBarDirective,
  ZardTabNavLinkDirective,
  ZardTabNavPanelComponent
} from './tabs.component'
import { ZardTabNavScrollComponent } from './tab-nav-scroll.component'

export const ZardTabsImports = [
  ZardTabGroupComponent,
  ZardTabComponent,
  ZardTabLabelDirective,
  ZardTabContentDirective,
  ZardTabNavBarDirective,
  ZardTabNavLinkDirective,
  ZardTabNavPanelComponent,
  ZardTabNavScrollComponent
] as const
