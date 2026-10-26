import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core'
import { IUser, ScopeService } from '../../@core'
import { HeaderUserComponent } from '../../@theme/header'
import { CloudSidebarIdentityComponent } from './cloud-sidebar-identity.component'
import { CloudSidebarMenuComponent } from './cloud-sidebar-menu.component'
import { CloudMenuItem } from './cloud-sidebar-menu.types'
import { CloudSidebarHoverPanelDirective } from './cloud-sidebar-hover-panel.directive'
import { CloudSidebarMembershipComponent } from './cloud-sidebar-membership.component'

@Component({
  standalone: true,
  selector: 'xp-cloud-sidebar',
  templateUrl: './cloud-sidebar.component.html',
  styleUrl: './cloud-sidebar.component.scss',
  imports: [
    CommonModule,
    CloudSidebarIdentityComponent,
    HeaderUserComponent,
    CloudSidebarMenuComponent,
    CloudSidebarMembershipComponent,
    CloudSidebarHoverPanelDirective
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CloudSidebarComponent {
  private readonly scope = inject(ScopeService).activeScope
  readonly panelScope = computed(() => JSON.stringify([this.user()?.id, this.user()?.tenantId, this.scope()]))
  readonly collapsed = input(false)
  readonly isMobile = input(false)
  readonly hoverPanelEnabled = input(true)
  readonly menus = input.required<CloudMenuItem[]>()
  readonly user = input<IUser | null | undefined>(null)

  readonly collapsedChange = output<boolean>()
  readonly pinnedPanelWidthChange = output<number>()
  readonly panelResizingChange = output<boolean>()
  readonly brandClick = output<void>()
  readonly entryGuideClick = output<void>()
}
