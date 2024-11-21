import { CommonModule } from '@angular/common'
import { Component, EventEmitter, HostBinding, Input, Output, input, signal } from '@angular/core'
import { MatButtonModule } from '@angular/material/button'
import { MatIconModule } from '@angular/material/icon'
import { MatTooltipModule } from '@angular/material/tooltip'
import {CdkMenuModule} from '@angular/cdk/menu'
import { RouterModule } from '@angular/router'
import { DensityDirective, effectAction } from '@metad/ocap-angular/core'
import { isNil } from '@metad/ocap-core'
import { PacMenuItem } from '../types'
import { OverlayModule } from '@angular/cdk/overlay'
import { delay, Observable, tap } from 'rxjs'

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

  readonly sunMenuOpen = signal(false)

  isActive(menu: PacMenuItem) {
    return isNil(menu.expanded) ? menu.children?.some((item) => item.isActive) : menu.expanded
  }

  closeSubMenu = effectAction((origin$: Observable<PacMenuItem>) => {
    return origin$.pipe(
      delay(300),
      tap((item) => {
        item.expanded = false
      })
    )
  })
}
