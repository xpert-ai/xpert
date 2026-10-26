import { matchesSidebarSearch } from './search/sidebar-search.types'
import { Component, computed, inject, input } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { NavigationEnd, Router, RouterModule } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ZardIconComponent } from '@xpert-ai/headless-ui'
import { filter, map, startWith } from 'rxjs'

export interface SidebarPanelLink {
  id: string
  label: string
  translationKey: string
  path: string
  icon?: string
  queryParams?: { [key: string]: string | null }
  queryParamDefaults?: { [key: string]: string }
  exact?: boolean
  preserveQueryParams?: boolean
}

@Component({
  standalone: true,
  selector: 'xp-sidebar-panel-links',
  imports: [RouterModule, TranslateModule, ZardIconComponent],
  template: `
    @for (item of visibleItems(); track item.id) {
      <a
        class="flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-base text-text-secondary hover:text-text-primary focus-visible:text-text-primary transition-colors duration-150 motion-reduce:transition-none hover:bg-hover-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        [routerLink]="item.path"
        [queryParams]="item.queryParams"
        [queryParamsHandling]="item.preserveQueryParams ? 'preserve' : ''"
        [class]="isActive(item) ? 'bg-components-list-option-active-bg font-medium text-text-primary!' : ''"
        [attr.aria-current]="isActive(item) ? 'page' : null"
      >
        @if (item.icon) {
          <z-icon class="size-[18px] text-[18px]" [zType]="item.icon" />
        }
        <span class="min-w-0 truncate">{{ item.translationKey | translate: { Default: item.label } }}</span>
      </a>
    } @empty {
      @if (query() && showEmpty()) {
        <p role="status" class="px-3 py-4 text-base text-muted-foreground">
          {{ 'XP.SettingsShell.NoResults' | translate }}
        </p>
      }
    }
  `
})
export class CloudSidebarPanelLinksComponent {
  readonly items = input.required<SidebarPanelLink[]>()
  readonly showEmpty = input(true)
  readonly query = input('')
  private readonly translate = inject(TranslateService)
  private readonly router = inject(Router)
  private readonly language = toSignal(this.translate.onLangChange)
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      startWith(null),
      map(() => this.router.url)
    )
  )
  readonly visibleItems = computed(() => {
    this.language()
    const query = this.query().trim().toLocaleLowerCase()
    return this.items().filter(
      (item) =>
        !query ||
        matchesSidebarSearch(query, this.translate.instant(item.translationKey, { Default: item.label }), item.label)
    )
  })

  isActive(item: SidebarPanelLink) {
    this.url()
    const target = this.router.createUrlTree([item.path], { queryParams: item.queryParams })
    const current = this.router.parseUrl(this.router.url)
    for (const key of target.queryParamMap.keys) {
      const actual = current.queryParamMap.get(key) ?? item.queryParamDefaults?.[key]
      if (actual !== target.queryParamMap.get(key)) return false
    }
    return this.router.isActive(target, {
      paths: item.exact === false ? 'subset' : 'exact',
      queryParams: 'ignored',
      fragment: 'ignored',
      matrixParams: 'ignored'
    })
  }
}
