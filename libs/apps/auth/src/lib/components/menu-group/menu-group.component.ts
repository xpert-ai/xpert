import { CommonModule } from '@angular/common'
import { Component, EventEmitter, HostBinding, Input, Output, inject, input, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'

import { CdkMenuModule } from '@angular/cdk/menu'
import { NavigationEnd, Router, RouterModule } from '@angular/router'
import { DensityDirective } from '@xpert-ai/ocap-angular/core'
import { isNil } from '@xpert-ai/ocap-core'
import { PacMenuItem } from '../types'
import { OverlayModule } from '@angular/cdk/overlay'
import { ZardButtonComponent, ZardIconComponent, ZardTooltipImports } from '@xpert-ai/headless-ui'
import { distinctUntilChanged, filter, map, startWith } from 'rxjs'
@Component({
  standalone: true,
  selector: 'pac-menu-group',
  templateUrl: './menu-group.component.html',
  styleUrls: ['menu-group.component.scss'],
  imports: [
    CommonModule,
    CdkMenuModule,
    OverlayModule,
    ZardButtonComponent,
    ZardIconComponent,
    ...ZardTooltipImports,
    RouterModule,
    DensityDirective
  ]
})
export class PacMenuGroupComponent {
  isNil = isNil
  readonly #router = inject(Router)

  @HostBinding('class.collapsed')
  @Input()
  isCollapsed = false

  readonly isMobile = input<boolean>(false)

  readonly menus = input.required<PacMenuItem[]>()

  @Output() clicked = new EventEmitter()

  readonly menuOpen = signal<Record<string, boolean>>({})
  readonly delayClose = signal<Record<string, number>>({})
  readonly currentUrl = toSignal(
    this.#router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      startWith(null),
      map(() => this.#router.url),
      distinctUntilChanged()
    ),
    { initialValue: this.#router.url }
  )

  hasActiveChild(menu: PacMenuItem) {
    this.currentUrl()

    return !!menu.children?.some((item) => this.isMenuItemActive(item))
  }

  isMenuItemActive(item: PacMenuItem, exact = true) {
    const link = item.link
    if (!link) {
      return false
    }

    return this.#router.isActive(link, {
      paths: exact ? 'exact' : 'subset',
      queryParams: 'ignored',
      fragment: 'ignored',
      matrixParams: 'ignored'
    })
  }

  isExpanded(menu: PacMenuItem) {
    if (!menu.children?.length) {
      return false
    }

    return isNil(menu.expanded) ? this.hasActiveChild(menu) : menu.expanded
  }

  toggleMenu(menu: PacMenuItem) {
    if (!menu.children?.length) {
      return
    }

    menu.expanded = !this.isExpanded(menu)
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
    this.menuOpen.update((state) => ({ ...state, [item.link]: true }))
  }

  closeSubMenu(item: PacMenuItem) {
    this.delayClose.update((state) => {
      if (state[item.link]) {
        clearTimeout(state[item.link])
      }
      const handler = setTimeout(() => {
        this.menuOpen.update((state) => ({ ...state, [item.link]: false }))
      }, 500) as unknown as number

      return {
        ...state,
        [item.link]: handler
      }
    })
  }
}
