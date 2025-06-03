import { CommonModule } from '@angular/common'
import { Component, EventEmitter, Output, computed, input } from '@angular/core'
import { PacMenuGroupComponent } from '../menu-group/menu-group.component'
import { PacMenuItem } from '../types'

@Component({
  standalone: true,
  selector: 'pac-menu',
  templateUrl: 'menu.component.html',
  styleUrls: ['menu.component.scss'],
  imports: [CommonModule, PacMenuGroupComponent]
})
export class PacMenuComponent {

  readonly isMobile = input<boolean>(false)
  readonly isCollapsed = input<boolean>(false)

  readonly menus = input.required<PacMenuItem[]>()

  @Output() clicked = new EventEmitter()

  readonly #menus = computed(() => this.menus().filter((menu) => !menu.hidden))
  readonly general = computed(() => this.#menus().filter((menu) => !menu.admin))
  readonly admin = computed(() => this.#menus().filter((menu) => menu.admin))

}
