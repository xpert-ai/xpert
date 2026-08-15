import { CommonModule } from '@angular/common'
import { Component, EventEmitter, HostBinding, Input, Output, inject, input, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'

import { CdkMenuModule } from '@angular/cdk/menu'
import { NavigationEnd, Router, RouterModule } from '@angular/router'
import { isNil } from '@xpert-ai/contracts'
import { XpMenuItem } from '../types'
import { OverlayModule } from '@angular/cdk/overlay'
import { ZardButtonComponent, ZardIconComponent, ZardTooltipImports } from '@xpert-ai/headless-ui'
import { distinctUntilChanged, filter, map, startWith } from 'rxjs'
@Component({
  standalone: true,
  selector: 'xp-menu-group',
  templateUrl: './menu-group.component.html',
  styleUrls: ['menu-group.component.scss'],
  imports: [
    CommonModule,
    CdkMenuModule,
    OverlayModule,
    ZardButtonComponent,
    ZardIconComponent,
    ...ZardTooltipImports,
    RouterModule
  ]
})
/**
 * @deprecated Use `CloudSidebarMenuComponent` in
 * `apps/cloud/src/app/features/sidebar` for the cloud shell menu. This component
 * remains exported only for compatibility during auth package migration.
 */
export class XpMenuGroupComponent {
  isNil = isNil
  readonly #router = inject(Router)

  @HostBinding('class.collapsed')
  @Input()
  isCollapsed = false

  readonly isMobile = input<boolean>(false)

  readonly menus = input.required<XpMenuItem[]>()

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

  hasActiveChild(menu: XpMenuItem) {
    this.currentUrl()

    return !!menu.children?.some((item) => this.isMenuItemActive(item))
  }

  isExternalLink(item: XpMenuItem) {
    return item.external === true || /^https?:\/\//i.test(item.link ?? '')
  }

  isMenuItemActive(item: XpMenuItem, exact = true) {
    const link = item.link
    if (!link || this.isExternalLink(item)) {
      return false
    }

    const currentUrl = this.currentUrl().split('?')[0]
    const inactivePathPrefixes = item.data?.inactivePathPrefixes
    if (
      Array.isArray(inactivePathPrefixes) &&
      inactivePathPrefixes.some(
        (prefix) => typeof prefix === 'string' && (currentUrl === prefix || currentUrl.startsWith(`${prefix}/`))
      )
    ) {
      return false
    }

    return this.#router.isActive(link, {
      paths: exact ? 'exact' : 'subset',
      queryParams: 'ignored',
      fragment: 'ignored',
      matrixParams: 'ignored'
    })
  }

  openExternalLink(item: XpMenuItem) {
    if (item.children?.length || !item.link || !this.isExternalLink(item)) {
      return
    }

    window.open(item.link, '_blank', 'noopener,noreferrer')
    this.clicked.emit()
  }

  isExpanded(menu: XpMenuItem) {
    if (!menu.children?.length) {
      return false
    }

    return isNil(menu.expanded) ? this.hasActiveChild(menu) : menu.expanded
  }

  toggleMenu(menu: XpMenuItem) {
    if (!menu.children?.length) {
      return
    }

    menu.expanded = !this.isExpanded(menu)
  }

  openSubMenu(item: XpMenuItem) {
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

  closeSubMenu(item: XpMenuItem) {
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
