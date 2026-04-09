import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { IXpertWorkspace, XpertWorkspaceService } from '@cloud/app/@core'
import { linkedModel } from '@metad/ocap-angular/core'
import { ZardTabsImports } from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import { injectQueryParams } from 'ngxtension/inject-query-params'
import { firstValueFrom } from 'rxjs'
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
    ...ZardTabsImports,
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
  readonly #workspaceService = inject(XpertWorkspaceService)

  readonly #queryMode = injectQueryParams<string>('mode')
  readonly #queryTab = injectQueryParams<string>('tab')
  readonly #querySearch = injectQueryParams('search')

  readonly loadingDefaultWorkspace = signal(false)
  readonly defaultWorkspace = signal<IXpertWorkspace | null>(null)

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

  constructor() {
    void this.loadDefaultWorkspace()
  }

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

  async loadDefaultWorkspace() {
    this.loadingDefaultWorkspace.set(true)

    try {
      this.defaultWorkspace.set(await firstValueFrom(this.#workspaceService.getMyDefault()))
    } catch (error) {
      this.defaultWorkspace.set(null)
    } finally {
      this.loadingDefaultWorkspace.set(false)
    }
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
