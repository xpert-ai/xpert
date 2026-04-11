import { CommonModule } from '@angular/common'
import { Component, Input } from '@angular/core'
import type { ZardDrawerMode } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  imports: [CommonModule],
  selector: 'pac-sidenav-navigator',
  templateUrl: 'sidenav-navigator.component.svg'
})
export class SidenavNavigatorComponent {
  @Input() mode: ZardDrawerMode
}
