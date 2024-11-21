import { CommonModule } from '@angular/common'
import { Component, EventEmitter, HostBinding, Input, Output, input, signal } from '@angular/core'
import { MatButtonModule } from '@angular/material/button'
import { MatIconModule } from '@angular/material/icon'
import { MatTooltipModule } from '@angular/material/tooltip'
import {CdkMenuModule} from '@angular/cdk/menu'
import { RouterModule } from '@angular/router'
import { DensityDirective } from '@metad/ocap-angular/core'
import { isNil } from '@metad/ocap-core'
import { PacMenuItem } from '../types'
import { OverlayModule } from '@angular/cdk/overlay'

@Component({
  standalone: true,
  selector: 'pac-menu-group',
  templateUrl: './menu-group.component.html',
  styleUrls: ['menu-group.component.scss'],
  imports: [
    CommonModule,
    CdkMenuModule,
    OverlayModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    RouterModule,
    DensityDirective
  ]
})
export class PacMenuGroupComponent {
  isNil = isNil

  @HostBinding('class.collapsed')
  @Input() isCollapsed = false

  readonly isMobile = input<boolean>(false)

  readonly menus = input.required<PacMenuItem[]>()

  @Output() clicked = new EventEmitter()

  readonly menuOpen = signal<Record<string, boolean>>({})
  readonly delayClose = signal<Record<string, number>>({})

  isActive(menu: PacMenuItem) {
    return isNil(menu.expanded) ? menu.children?.some((item) => item.isActive) : menu.expanded
  }

  openSubMenu(item: PacMenuItem) {
    this.delayClose.update((state) => {
      if (state[item.link]) {
        clearTimeout(state[item.link])
      }

      return {
        ...state,
        [item.link]: null
      }
    })
    this.menuOpen.update((state) => ({...state, [item.link]: true}))
  }

  closeSubMenu(item: PacMenuItem) {
    this.delayClose.update((state) => {
      if (state[item.link]) {
        clearTimeout(state[item.link])
      }
      const handler = setTimeout(() => {
        this.menuOpen.update((state) => ({...state, [item.link]: false}))
      }, 500) as unknown as number

      return {
        ...state,
        [item.link]: handler
      }
    })
  }

}
