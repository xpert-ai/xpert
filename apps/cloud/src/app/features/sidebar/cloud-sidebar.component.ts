import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core'
import { IUser } from '../../@core'
import { HeaderUserComponent } from '../../@theme/header'
import { CloudSidebarAssistantsComponent } from './cloud-sidebar-assistants.component'
import { CloudSidebarIdentityComponent } from './cloud-sidebar-identity.component'
import { CloudSidebarMenuComponent } from './cloud-sidebar-menu.component'
import { CloudMenuItem } from './cloud-sidebar-menu.types'

@Component({
  standalone: true,
  selector: 'pac-cloud-sidebar',
  templateUrl: './cloud-sidebar.component.html',
  styleUrl: './cloud-sidebar.component.scss',
  imports: [
    CommonModule,
    CloudSidebarIdentityComponent,
    CloudSidebarAssistantsComponent,
    HeaderUserComponent,
    CloudSidebarMenuComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CloudSidebarComponent {
  readonly collapsed = input(false)
  readonly isMobile = input(false)
  readonly menus = input.required<CloudMenuItem[]>()
  readonly user = input<IUser | null | undefined>(null)

  readonly collapsedChange = output<boolean>()
  readonly brandClick = output<void>()
  readonly entryGuideClick = output<void>()
}
