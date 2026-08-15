import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, untracked } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router'
import { AIPermissionsEnum } from '@cloud/app/@core'
import { injectActiveScope } from '@cloud/app/@core/state'
import {
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardCheckboxComponent,
  ZardComboboxComponent,
  ZardIconComponent,
  ZardTabsImports,
  type ZardComboboxOption
} from '@xpert-ai/headless-ui'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { filter, map, startWith } from 'rxjs/operators'
import { AgentEvolutionFacade } from './agent-evolution.facade'

@Component({
  standalone: true,
  selector: 'xp-agent-evolution',
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    TranslateModule,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardCheckboxComponent,
    ZardComboboxComponent,
    ZardIconComponent,
    ...ZardTabsImports
  ],
  providers: [AgentEvolutionFacade],
  templateUrl: './agent-evolution.component.html',
  host: {
    class: 'block h-full w-full min-w-0 flex-1'
  }
})
export class AgentEvolutionComponent {
  readonly facade = inject(AgentEvolutionFacade)
  readonly #router = inject(Router)
  readonly #translate = inject(TranslateService)
  readonly #activeScope = injectActiveScope()

  readonly AIPermissionsEnum = AIPermissionsEnum
  readonly currentUrl = toSignal(
    this.#router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.#router.url)
    ),
    { initialValue: this.#router.url }
  )
  readonly localeChange = toSignal(this.#translate.onLangChange.pipe(startWith(null)), { initialValue: null })
  readonly activeSubtitleKey = computed(() => {
    const url = this.currentUrl()
    if (url.includes('/learning')) {
      return 'XP.AgentEvolution.SubtitleLearning'
    }
    if (url.includes('/evaluation')) {
      return 'XP.AgentEvolution.SubtitleEvaluation'
    }
    if (url.includes('/release')) {
      return 'XP.AgentEvolution.SubtitleRelease'
    }
    return 'XP.AgentEvolution.SubtitleOverview'
  })

  readonly tabs = [
    { path: 'overview', labelKey: 'XP.AgentEvolution.TabOverview', icon: 'ri-dashboard-line' },
    { path: 'learning', labelKey: 'XP.AgentEvolution.TabLearning', icon: 'ri-lightbulb-flash-line' },
    { path: 'evaluation', labelKey: 'XP.AgentEvolution.TabEvaluation', icon: 'ri-flask-line' },
    { path: 'release', labelKey: 'XP.AgentEvolution.TabRelease', icon: 'ri-rocket-line' }
  ]

  readonly targetOptions = computed<ZardComboboxOption[]>(() => {
    this.localeChange()
    return [
      { value: 'all', label: this.#translate.instant('XP.AgentEvolution.AllTargets') },
      ...this.facade.visibleTargets().map((target) => ({
        value: target.targetId,
        label: `${target.displayName} · ${target.targetId}`
      }))
    ]
  })

  constructor() {
    effect(() => {
      this.#activeScope()
      untracked(() => {
        this.facade.resetScopeContext()
        void this.facade.load()
      })
    })
  }

  selectTarget(value: string | null) {
    this.facade.selectTarget(value || 'all')
  }

  setShowFixtures(value: boolean) {
    const selected = this.facade
      .dashboard()
      .targets.find((target) => target.targetId === this.facade.selectedTargetId())
    this.facade.showFixtures.set(value)
    if (!value && selected?.targetType === 'test_fixture') this.facade.selectTarget('all')
  }
}
