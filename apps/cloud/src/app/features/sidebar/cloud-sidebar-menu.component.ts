import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { NavigationEnd, Router, RouterModule } from '@angular/router'
import { injectWorkspace, injectWorkspaceId } from '@cloud/app/@core/state'
import { ZardIconComponent, ZardMenuImports, ZardTooltipImports } from '@xpert-ai/headless-ui'
import { isNil } from '@xpert-ai/contracts'
import { TranslateModule } from '@ngx-translate/core'
import { distinctUntilChanged, filter, map, startWith } from 'rxjs'
import { CloudSidebarAssistantsComponent } from './cloud-sidebar-assistants.component'
import { CloudSidebarRecentTasksComponent } from './cloud-sidebar-recent-tasks.component'
import { ClawXpertConversationStartIntentService } from '../chat/clawxpert/clawxpert-conversation-start-intent.service'
import { CloudMenuItem } from './cloud-sidebar-menu.types'
import {
  addWorkspaceConnectorMenuItem,
  addWorkspaceMoreMenuItem,
  addWorkspaceSkillMenuItem,
  buildWorkspaceModuleMenuLink,
  buildCloudSidebarMenuGroups,
  type CloudWorkspaceModuleSection,
  type CloudSidebarMenuEntry,
  getWorkspaceModuleSection,
  isCloudMenuRouteForcedActive,
  isCloudMenuRouteSuppressed,
  isExternalCloudMenuItem,
  isNewClawXpertTaskMenuItem,
  normalizeMenuPath
} from './cloud-sidebar-menu.utils'

@Component({
  standalone: true,
  selector: 'xp-cloud-sidebar-menu',
  templateUrl: './cloud-sidebar-menu.component.html',
  styleUrl: './cloud-sidebar-menu.component.scss',
  imports: [
    CommonModule,
    RouterModule,
    TranslateModule,
    ZardIconComponent,
    CloudSidebarAssistantsComponent,
    CloudSidebarRecentTasksComponent,
    ...ZardMenuImports,
    ...ZardTooltipImports
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CloudSidebarMenuComponent {
  readonly collapsed = input(false)
  readonly isMobile = input(false)
  readonly menus = input.required<CloudMenuItem[]>()
  readonly clicked = output<void>()

  readonly #router = inject(Router)
  readonly #selectedWorkspace = injectWorkspace()
  readonly #workspaceId = injectWorkspaceId()
  readonly #conversationStartIntent = inject(ClawXpertConversationStartIntentService)

  readonly currentUrl = toSignal(
    this.#router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      startWith(null),
      map(() => this.#router.url),
      distinctUntilChanged()
    ),
    { initialValue: this.#router.url }
  )
  readonly groups = computed(() => {
    const workspaceId = this.#selectedWorkspace()?.id ?? this.#workspaceId()

    return addWorkspaceMoreMenuItem(
      addWorkspaceSkillMenuItem(
        addWorkspaceConnectorMenuItem(buildCloudSidebarMenuGroups(this.menus()), workspaceId),
        workspaceId
      ),
      workspaceId
    )
  })

  hasActiveChild(menu: CloudMenuItem) {
    this.currentUrl()

    return !!menu.children?.some((item) => this.isMenuItemActive(item, item.pathMatch !== 'prefix'))
  }

  isExternalLink(item: CloudMenuItem) {
    return isExternalCloudMenuItem(item)
  }

  isMenuItemActive(item: CloudMenuItem, exact = true) {
    const link = item.link
    if (!link || this.isExternalLink(item)) {
      return false
    }

    const currentUrl = normalizeMenuPath(this.currentUrl())
    if (isCloudMenuRouteSuppressed(currentUrl, item)) {
      return false
    }

    if (isCloudMenuRouteForcedActive(currentUrl, item)) {
      return true
    }

    return this.#router.isActive(link, {
      paths: exact ? 'exact' : 'subset',
      queryParams: 'ignored',
      fragment: 'ignored',
      matrixParams: 'ignored'
    })
  }

  isActive(item: CloudMenuItem) {
    return this.isMenuItemActive(item, item.pathMatch !== 'prefix') || this.hasActiveChild(item)
  }

  isExpanded(menu: CloudMenuItem) {
    if (!menu.children?.length) {
      return false
    }

    return isNil(menu.expanded) ? this.hasActiveChild(menu) : menu.expanded
  }

  visibleChildren(menu: CloudMenuItem) {
    return menu.children?.filter((child) => !child.hidden) ?? []
  }

  routerLinkFor(item: CloudMenuItem) {
    if (
      item.children?.length ||
      this.isExternalLink(item) ||
      getWorkspaceModuleSection(item) ||
      isNewClawXpertTaskMenuItem(item)
    ) {
      return null
    }

    return item.link ?? null
  }

  onMenuClick(event: MouseEvent, item: CloudMenuItem) {
    if (isNewClawXpertTaskMenuItem(item)) {
      event.preventDefault()
      this.#conversationStartIntent.requestNewConversation()
      void this.#router.navigateByUrl(item.link || '/chat/clawxpert/c').then((navigated) => {
        if (navigated || normalizeMenuPath(this.#router.url) === '/chat/clawxpert/c') {
          this.clicked.emit()
        }
      })
      return
    }

    const workspaceSection = getWorkspaceModuleSection(item)
    if (workspaceSection) {
      event.preventDefault()
      this.navigateToWorkspaceModule(workspaceSection)
      return
    }

    if (this.visibleChildren(item).length) {
      event.preventDefault()
      item.expanded = !this.isExpanded(item)
      return
    }

    if (this.isExternalLink(item)) {
      event.preventDefault()
      this.openExternalLink(item)
      return
    }

    this.clicked.emit()
  }

  navigateToWorkspaceModule(section: CloudWorkspaceModuleSection) {
    const workspaceId = this.#selectedWorkspace()?.id ?? this.#workspaceId()
    const link = buildWorkspaceModuleMenuLink(section, workspaceId)

    void this.#router.navigateByUrl(link).then((navigated) => {
      if (navigated) {
        this.clicked.emit()
      }
    })
  }

  onChildClick(event: MouseEvent, item: CloudMenuItem) {
    const workspaceSection = getWorkspaceModuleSection(item)
    if (workspaceSection) {
      event.preventDefault()
      this.navigateToWorkspaceModule(workspaceSection)
      return
    }

    if (this.isExternalLink(item)) {
      event.preventDefault()
      this.openExternalLink(item)
      return
    }

    this.clicked.emit()
  }

  openExternalLink(item: CloudMenuItem) {
    if (!item.link || !this.isExternalLink(item)) {
      return
    }

    globalThis.window?.open(item.link, '_blank', 'noopener,noreferrer')
    this.clicked.emit()
  }

  trackMenuItem(index: number, item: CloudMenuItem) {
    return item.link || item.title || index
  }

  trackMenuEntry(index: number, entry: CloudSidebarMenuEntry) {
    return entry.item ? this.trackMenuItem(index, entry.item) : `assistants-${index}`
  }

  menuTitleKey(item: CloudMenuItem) {
    return item.data?.translationKey ? `XP.MENU.${item.data.translationKey}` : ''
  }

  menuTitleDefault(item: CloudMenuItem) {
    return item.title || item.data?.translationKey || ''
  }

  menuSubtitle(item: CloudMenuItem) {
    return item.data?.subtitleDefault || ''
  }

  menuSubtitleKey(item: CloudMenuItem) {
    return item.data?.subtitleKey || ''
  }

  menuBadge(item: CloudMenuItem) {
    return item.data?.badge ?? null
  }
}
