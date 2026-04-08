import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { linkedModel } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { injectQueryParams } from 'ngxtension/inject-query-params'
import { ExploreAgentsComponent } from './agents/agents.component'
import { ExploreInspirationsComponent } from './inspirations/inspirations.component'
import { ExploreSkillsComponent } from './skills/skills.component'

type ExploreMode = 'square' | 'mine'
type ExploreTab = 'skills' | 'agents' | 'inspirations'

const DEFAULT_MODE: ExploreMode = 'square'
const DEFAULT_TAB: ExploreTab = 'agents'

@Component({
  standalone: true,
  selector: 'xp-explore',
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    TranslateModule,
    ExploreAgentsComponent,
    ExploreSkillsComponent,
    ExploreInspirationsComponent
  ],
  templateUrl: './explore.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex min-h-full w-full flex-col overflow-auto bg-background-body'
  }
})
export class ExploreComponent {
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)

  readonly #queryMode = injectQueryParams<string>('mode')
  readonly #queryTab = injectQueryParams<string>('tab')
  readonly #querySearch = injectQueryParams('search')

  readonly mode = linkedModel<ExploreMode>({
    initialValue: DEFAULT_MODE,
    compute: () => normalizeMode(this.#queryMode()),
    update: (mode) => {
      this.navigate({
        mode: mode === DEFAULT_MODE ? null : mode
      })
    }
  })

  readonly tab = linkedModel<ExploreTab>({
    initialValue: DEFAULT_TAB,
    compute: () => normalizeTab(this.#queryTab()),
    update: (tab) => {
      this.navigate({
        tab: tab === DEFAULT_TAB ? null : tab
      })
    }
  })

  readonly search = linkedModel<string>({
    initialValue: '',
    compute: () => this.#querySearch() ?? '',
    update: (search) => {
      const value = search.trim()
      this.navigate({
        search: value || null
      })
    }
  })

  readonly mineTitle = computed(() => {
    switch (this.tab()) {
      case 'skills':
        return '我的技能即将开放'
      case 'inspirations':
        return '我的灵感市集即将开放'
      default:
        return '我的智能体即将开放'
    }
  })

  readonly mineDescription = computed(() => {
    switch (this.tab()) {
      case 'skills':
        return '后续这里会汇总你安装、收藏或发布的技能模板。'
      case 'inspirations':
        return '后续这里会展示你沉淀的灵感模版和知识流感资产。'
      default:
        return '后续这里会沉淀你创建、安装或收藏的智能体模版。'
    }
  })

  setMode(mode: ExploreMode) {
    this.mode.set(mode)
  }

  setTab(tab: ExploreTab) {
    this.tab.set(tab)
  }

  clearSearch() {
    this.search.set('')
  }

  resetToSquare() {
    this.mode.set(DEFAULT_MODE)
  }

  private navigate(queryParams: Record<string, string | null>) {
    this.#router.navigate([], {
      relativeTo: this.#route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true
    })
  }
}

function normalizeMode(value: string | null | undefined): ExploreMode {
  return value === 'mine' ? 'mine' : DEFAULT_MODE
}

function normalizeTab(value: string | null | undefined): ExploreTab {
  return value === 'skills' || value === 'inspirations' || value === 'agents' ? value : DEFAULT_TAB
}
