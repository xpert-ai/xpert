import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute, Router } from '@angular/router'
import { AiFeatureEnum, IXpertWorkspace, Store, XpertWorkspaceService } from '@cloud/app/@core'
import { linkedModel } from '@xpert-ai/ocap-angular/core'
import {
  ZardButtonComponent,
  ZardIconComponent,
  ZardInputDirective,
  ZardInputGroupComponent,
  ZardMenuImports
} from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import { injectQueryParams } from 'ngxtension/inject-query-params'
import { firstValueFrom } from 'rxjs'
import { ExploreAgentSquareComponent } from './agent-square/agent-square.component'
import { ExploreSkillsComponent } from './skills/skills.component'

type ExploreMode = 'square' | 'mine'
type ExploreTab = 'skills' | 'agent-square'

const DEFAULT_MODE: ExploreMode = 'square'
const DEFAULT_TAB: ExploreTab = 'skills'

@Component({
  standalone: true,
  selector: 'xp-explore',
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    ZardButtonComponent,
    ZardIconComponent,
    ZardInputDirective,
    ZardInputGroupComponent,
    ...ZardMenuImports,
    ExploreAgentSquareComponent,
    ExploreSkillsComponent
  ],
  templateUrl: './explore.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex min-h-full w-full flex-col overflow-auto bg-(--background)'
  }
})
export class ExploreComponent {
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)
  readonly #store = inject(Store)
  readonly #workspaceService = inject(XpertWorkspaceService)

  readonly #queryMode = injectQueryParams<string>('mode')
  readonly #queryTab = injectQueryParams<string>('tab')
  readonly #querySearch = injectQueryParams('search')

  readonly defaultWorkspace = signal<IXpertWorkspace | null>(null)
  readonly installFromRepositoryNonce = signal(0)
  readonly featureContextHydrated = toSignal(this.#store.featureContextHydrated$, {
    initialValue: this.#store.featureContextHydrated
  })
  readonly agentMarketplaceEnabled = computed(
    () =>
      this.featureContextHydrated() === true && this.#store.hasFeatureEnabled(AiFeatureEnum.FEATURE_XPERT_MARKETPLACE)
  )

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
    compute: () => normalizeTab(this.#queryTab(), this.agentMarketplaceEnabled()),
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

  setTab(tab: ExploreTab) {
    if (tab === 'agent-square' && !this.agentMarketplaceEnabled()) {
      return
    }

    this.tab.set(tab)
  }

  clearSearch() {
    this.search.set('')
  }

  openSkillManagement() {
    const workspaceId = this.defaultWorkspace()?.id
    this.#router.navigate(workspaceId ? ['/xpert/w', workspaceId, 'skills'] : ['/xpert/w'])
  }

  openSkillSquare() {
    this.mode.set(DEFAULT_MODE)
    this.tab.set('skills')
  }

  openInstallFromRepository() {
    this.openSkillSquare()
    this.installFromRepositoryNonce.update((value) => value + 1)
  }

  async loadDefaultWorkspace() {
    try {
      this.defaultWorkspace.set(await firstValueFrom(this.#workspaceService.getMyDefault({ purpose: 'authoring' })))
    } catch {
      this.defaultWorkspace.set(null)
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

function normalizeTab(value: string | null | undefined, agentMarketplaceEnabled: boolean): ExploreTab {
  if (agentMarketplaceEnabled && (value === 'agent-square' || value === 'agents')) {
    return 'agent-square'
  }
  return DEFAULT_TAB
}
