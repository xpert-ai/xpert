import {
  ZardTabComponent,
  ZardTabContentDirective,
  ZardTabGroupComponent,
  ZardTabLabelDirective,
  ZardTabNavBarDirective,
  ZardTabNavLinkDirective,
  ZardTabNavPanelComponent,
} from './tabs.component';

export const ZardTabsImports = [
  ZardTabGroupComponent,
  ZardTabComponent,
  ZardTabLabelDirective,
  ZardTabContentDirective,
  ZardTabNavBarDirective,
  ZardTabNavLinkDirective,
  ZardTabNavPanelComponent,
] as const;
