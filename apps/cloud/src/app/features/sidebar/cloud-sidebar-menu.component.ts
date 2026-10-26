import { CloudSidebarPanelTriggerDirective } from './cloud-sidebar-panel-trigger.directive'
import { CloudSidebarModulePanelComponent } from './cloud-sidebar-module-panel.component'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  ViewContainerRef,
  viewChild
} from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { NavigationEnd, Router, RouterModule } from '@angular/router'
import { injectWorkspace, injectWorkspaceId } from '@cloud/app/@core/state'
import { ZardIconComponent, ZardMenuImports, ZardTooltipImports } from '@xpert-ai/headless-ui'
import { isNil } from '@xpert-ai/contracts'
import { TranslateService, TranslateModule } from '@ngx-translate/core'
import { distinctUntilChanged, filter, map, startWith } from 'rxjs'
import { CloudSidebarAssistantsComponent } from './cloud-sidebar-assistants.component'
import { CloudSidebarRecentTasksComponent } from './cloud-sidebar-recent-tasks.component'
import { CloudSidebarProjectsComponent } from './cloud-sidebar-projects.component'
import { CloudSidebarWorkspacesComponent } from './cloud-sidebar-workspaces.component'
import { ClawXpertConversationStartIntentService } from '../chat/clawxpert/clawxpert-conversation-start-intent.service'
import { XpertSettingsService } from '../../@core/services/xpert-settings.service'
import { CloudMenuItem } from './cloud-sidebar-menu.types'
import { modulePanelLinks } from './cloud-sidebar-module-navigation'
import { SettingsNavigationService } from '../setting/settings-navigation.service'
import {
  addWorkspaceExpertSkillsConnectorsMenuItem,
  addWorkspaceMoreMenuItem,
  buildWorkspaceModuleMenuLink,
  buildCloudSidebarMenuGroups,
  type CloudWorkspaceModuleSection,
  type CloudSidebarMenuEntry,
  getWorkspaceModuleSection,
  isCloudMenuRouteForcedActive,
  isCloudMenuRouteSuppressed,
  isCloudMarketplaceHubRoute,
  isExternalCloudMenuItem,
  isCloudWorkspaceShellMenuItem,
  isCloudWorkspaceStandaloneRoute,
  isNewClawXpertTaskMenuItem,
  normalizeMenuPath
} from './cloud-sidebar-menu.utils'

@Component({
  standalone: true,
  selector: 'xp-cloud-sidebar-menu',
  templateUrl: './cloud-sidebar-menu.component.html',
  styleUrl: './cloud-sidebar-menu.component.scss',
  imports: [
    CloudSidebarPanelTriggerDirective,
    CloudSidebarModulePanelComponent,
    CommonModule,
    RouterModule,
    TranslateModule,
    ZardIconComponent,
    CloudSidebarAssistantsComponent,
    CloudSidebarRecentTasksComponent,
    CloudSidebarProjectsComponent,
    CloudSidebarWorkspacesComponent,
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

  private readonly settings = inject(XpertSettingsService)
  private readonly settingsNavigation = inject(SettingsNavigationService)
  private readonly viewContainerRef = inject(ViewContainerRef)
  readonly #router = inject(Router)
  readonly #selectedWorkspace = injectWorkspace()
  readonly #workspaceId = injectWorkspaceId()
  readonly #conversationStartIntent = inject(ClawXpertConversationStartIntentService)
  private readonly assistants = viewChild(CloudSidebarAssistantsComponent)

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

    const groups = addWorkspaceExpertSkillsConnectorsMenuItem(buildCloudSidebarMenuGroups(this.menus()))
    return this.assistants()?.isClawXpertConfigured() ? addWorkspaceMoreMenuItem(groups, workspaceId) : groups
  })

  private readonly translate = inject(TranslateService)
  bosiActive() {
    return (
      this.groups()
        .find((group) => group.key === 'work')
        ?.items.some((item) => this.isActive(item)) ?? false
    )
  }

  matchesQuery(item: CloudMenuItem, query: string) {
    return (
      !query.trim() ||
      this.translate
        .instant(this.menuTitleKey(item), { Default: item.title })
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase())
    )
  }

  hasActiveChild(menu: CloudMenuItem) {
    this.currentUrl()

    return !!menu.children?.some((item) => this.isMenuItemActive(item, item.pathMatch !== 'prefix'))
  }

  isExternalLink(item: CloudMenuItem) {
    return isExternalCloudMenuItem(item)
  }

  isMenuItemActive(item: CloudMenuItem, exact = true) {
    const link = item.link
    if (!link || item.data?.action === 'openAssistantSettings' || this.isExternalLink(item)) {
      return false
    }

    const currentUrl = normalizeMenuPath(this.currentUrl())
    if (isNewClawXpertTaskMenuItem(item)) {
      return currentUrl === '/chat/clawxpert/c' || currentUrl.startsWith('/chat/clawxpert/c/')
    }
    if (item.data?.translationKey === 'ExpertSkillsConnectors' && isCloudMarketplaceHubRoute(currentUrl)) {
      return true
    }

    if (isCloudWorkspaceShellMenuItem(item)) {
      if (isCloudWorkspaceStandaloneRoute(currentUrl) || this.isMoreMenuExpanded()) {
        return false
      }
    }

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
    return (
      this.isMenuItemActive(item, item.pathMatch !== 'prefix') ||
      this.hasActiveChild(item) ||
      (item.data?.translationKey === 'More' && this.isExpanded(item))
    )
  }

  private isMoreMenuExpanded() {
    return this.groups()
      .flatMap((group) => group.items)
      .some((item) => item.data?.translationKey === 'More' && this.isExpanded(item))
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
      item.data?.action === 'openAssistantSettings' ||
      item.children?.length ||
      this.isExternalLink(item) ||
      getWorkspaceModuleSection(item) ||
      isNewClawXpertTaskMenuItem(item)
    ) {
      return null
    }

    return item.link ?? null
  }

  openBosi(event: Event) {
    const first = this.groups()
      .find((group) => group.key === 'work')
      ?.items.find((item) => !item.hidden)
    if (first) this.openPrimaryMenu(event, first)
  }

  openPrimaryMenu(event: Event, item: CloudMenuItem) {
    if (item.hidden) return
    if (isNewClawXpertTaskMenuItem(item) || getWorkspaceModuleSection(item) || item.data?.action) {
      this.onMenuClick(event, item)
      return
    }
    // Each module's first entry is available whenever its primary menu is authorized.
    const destination = modulePanelLinks(item.data?.panel, {
      resourceAdmin: false,
      monitoring: false,
      usage: false
    })[0]
    const settingsPage = item.data?.panel === 'settings' ? this.settingsNavigation.groups()[0]?.items[0]?.path : null
    const path =
      item.data?.panel === 'settings'
        ? settingsPage
          ? '/settings/' + settingsPage
          : null
        : (destination?.path ?? item.link)
    if (!path) return
    const target = destination?.queryParams
      ? this.#router.createUrlTree([path], { queryParams: destination.queryParams })
      : path
    void this.#router.navigateByUrl(target).then((navigated) => {
      if (navigated) this.clicked.emit()
    })
  }

  onMenuClick(event: Event, item: CloudMenuItem) {
    if (item.data?.action === 'openAssistantSettings') {
      event.preventDefault()
      this.openSettings()
      return
    }
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

  private openSettings() {
    this.clicked.emit()
    void this.settings.openBoundAssistant(this.viewContainerRef)
  }

  navigateToWorkspaceModule(section: CloudWorkspaceModuleSection) {
    if (section === 'settings') {
      this.openSettings()
      return
    }
    const workspaceId = this.#selectedWorkspace()?.id ?? this.#workspaceId()
    const link = buildWorkspaceModuleMenuLink(section, workspaceId)

    void this.#router.navigateByUrl(link).then((navigated) => {
      if (navigated) {
        this.clicked.emit()
      }
    })
  }

  onChildClick(event: MouseEvent, item: CloudMenuItem) {
    if (item.data?.action === 'openAssistantSettings') {
      event.preventDefault()
      this.openSettings()
      return
    }
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
    // Keep the assistant state instance when the conditional More entry is inserted or removed.
    return entry.item ? this.trackMenuItem(index, entry.item) : entry.kind
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
