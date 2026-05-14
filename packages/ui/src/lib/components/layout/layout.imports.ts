import { ContentComponent } from './content.component'
import { FooterComponent } from './footer.component'
import { HeaderComponent } from './header.component'
import { LayoutComponent } from './layout.component'
import { SidebarComponent, SidebarGroupComponent, SidebarGroupLabelComponent } from './sidebar.component'

export const LayoutImports = [
  LayoutComponent,
  HeaderComponent,
  FooterComponent,
  ContentComponent,
  SidebarComponent,
  SidebarGroupComponent,
  SidebarGroupLabelComponent
] as const
