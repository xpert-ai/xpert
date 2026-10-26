import { matchesSidebarSearch, SidebarSearchSource } from './search/sidebar-search.types'
import { SidebarSearchResultsComponent } from './search/sidebar-search-results.component'
import { changeFilter } from '../agent-evolution/shared/evolution-change-presentation'
import { Component, computed, inject, input } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { NavigationEnd, Router } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { filter, map, startWith } from 'rxjs'
import { AiFeatureEnum, AIPermissionsEnum, RequestScopeLevel, RolesEnum, Store } from '../../@core'
import { SettingsNavigationService } from '../setting/settings-navigation.service'
import { CloudMenuItem } from './cloud-sidebar-menu.types'
import { CloudSidebarPanelLinksComponent } from './cloud-sidebar-panel-links.component'
import { modulePanelLinks } from './cloud-sidebar-module-navigation'

@Component({
  standalone: true,
  selector: 'xp-sidebar-module-panel',
  imports: [SidebarSearchResultsComponent, CloudSidebarPanelLinksComponent, TranslateModule],
  template: `
    @if (menu().data.panel === 'settings') {
      @for (group of settingsGroups(); track group.key) {
        <h3 class="mb-1 mt-4 px-3 text-sm font-medium text-muted-foreground">
          {{ 'XP.SettingsShell.' + group.key | translate: { Default: group.label } }}
        </h3>
        <xp-sidebar-panel-links [items]="group.links" />
      } @empty {
        @if (query()) {
          <p role="status" class="px-3 py-4 text-base text-muted-foreground">
            {{ 'XP.SettingsShell.NoResults' | translate }}
          </p>
        }
      }
    } @else {
      <xp-sidebar-panel-links [items]="links()" [query]="query()" [showEmpty]="!query().trim()" />
      @if (query().trim()) {
        @for (source of searchSources(); track source) {
          <xp-sidebar-search-results [source]="source" [query]="query()" />
        }
      }
    }
  `
})
export class CloudSidebarModulePanelComponent {
  readonly menu = input.required<CloudMenuItem>()
  readonly query = input('')
  private readonly store = inject(Store)
  private readonly settings = inject(SettingsNavigationService)
  private readonly router = inject(Router)
  private readonly translate = inject(TranslateService)
  private readonly language = toSignal(this.translate.onLangChange)
  private readonly user = toSignal(this.store.user$, { initialValue: this.store.user })
  private readonly scope = toSignal(this.store.selectActiveScope(), { initialValue: this.store.activeScope })
  private readonly permissions = toSignal(this.store.userRolePermissions$)
  private readonly hydrated = toSignal(this.store.featureContextHydrated$, {
    initialValue: this.store.featureContextHydrated
  })
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      startWith(null),
      map(() => this.router.url)
    )
  )
  readonly searchSources = computed<SidebarSearchSource[]>(() => {
    switch (this.menu().data.panel) {
      case 'plugins':
        return this.links().some((item) => item.id === 'agent-plugins')
          ? ['plugins', 'marketplace', 'agentPlugins']
          : ['plugins', 'marketplace']
      case 'models':
        return ['models']
      case 'mcp':
        return ['publications', 'runtimes']
      case 'evolution':
        return ['targets', 'learning', 'candidates', 'evaluations', 'deployments']
      case 'approvals':
        return ['approvals']
      default:
        return []
    }
  })
  readonly settingsGroups = computed(() => {
    this.language()
    const query = this.query().trim().toLocaleLowerCase()
    return this.settings
      .groups()
      .map((group) => ({
        ...group,
        links: group.items
          .filter(
            (item) =>
              !query ||
              matchesSidebarSearch(
                query,
                this.translate.instant(item.translationKey, { Default: item.label }),
                item.label,
                this.translate.instant('XP.SettingsShell.' + group.key, { Default: group.label })
              )
          )
          .map((item) => ({ ...item, id: item.path, path: '/settings/' + item.path, exact: false }))
      }))
      .filter((group) => group.links.length)
  })
  readonly links = computed(() => {
    this.permissions()
    const links = modulePanelLinks(this.menu().data.panel, {
      resourceAdmin: [RolesEnum.ADMIN, RolesEnum.SUPER_ADMIN].some((role) => role === this.user()?.role?.name),
      monitoring:
        !this.hydrated() ||
        this.scope().level === RequestScopeLevel.TENANT ||
        this.store.hasFeatureEnabled(AiFeatureEnum.FEATURE_COPILOT_MONITORING),
      usage: this.store.hasPermission(AIPermissionsEnum.MODEL_USAGE_MONITOR)
    })
    if (this.menu().data.panel !== 'evolution') return links
    const query = this.router.parseUrl(this.url() || '/').queryParams
    return links.map((item) =>
      item.id === 'evaluation' || item.id === 'release'
        ? {
            ...item,
            queryParams: {
              changeId: typeof query['changeId'] === 'string' ? query['changeId'] : null,
              changeStatus: changeFilter(typeof query['changeStatus'] === 'string' ? query['changeStatus'] : null)
            }
          }
        : item
    )
  })
}
