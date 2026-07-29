import { CommonModule } from '@angular/common'
import { Component, EventEmitter, Output, computed, input } from '@angular/core'
import { XpMenuGroupComponent } from '../menu-group/menu-group.component'
import { XpMenuItem } from '../types'

@Component({
  standalone: true,
  selector: 'xp-menu',
  templateUrl: 'menu.component.html',
  styleUrls: ['menu.component.scss'],
  imports: [CommonModule, XpMenuGroupComponent]
})
/**
 * @deprecated Use `CloudSidebarComponent` and `CloudSidebarMenuComponent` in
 * `apps/cloud/src/app/features/sidebar` for the cloud shell menu. This component
 * remains exported only for compatibility during auth package migration.
 */
export class XpMenuComponent {
  readonly isMobile = input<boolean>(false)
  readonly isCollapsed = input<boolean>(false)

  readonly menus = input.required<XpMenuItem[]>()

  @Output() clicked = new EventEmitter()

  readonly #menus = computed(() => this.menus().filter((menu) => !menu.hidden))
  readonly general = computed(() => this.#menus().filter((menu) => !menu.admin))
  readonly admin = computed(() => this.#menus().filter((menu) => menu.admin))
}
