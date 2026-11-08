import { Component, ElementRef, afterNextRender, computed, inject, viewChild } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { RouterLink } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardComboboxComponent,
  ZardMenuImports,
  ZardSearchInputComponent
} from '@xpert-ai/headless-ui'
import { AgentEvolutionFacade } from '../agent-evolution.facade'
import {
  defaultTargetFilters,
  directoryRows,
  shortTargetVersion,
  targetLabel,
  type TargetFilters,
  type TargetGroup
} from './target-directory'

@Component({
  standalone: true,
  selector: 'xp-agent-evolution-targets',
  imports: [
    TranslateModule,
    RouterLink,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardComboboxComponent,
    ZardSearchInputComponent,
    ...ZardMenuImports
  ],
  templateUrl: './targets.component.html',
  host: { class: 'flex min-h-0 min-w-0 flex-1 overflow-hidden' }
})
export class AgentEvolutionTargetsComponent {
  readonly facade = inject(AgentEvolutionFacade)
  private readonly translate = inject(TranslateService)
  private readonly languageChange = toSignal(this.translate.onLangChange)
  readonly filters = this.facade.directoryFilters
  readonly scroll = viewChild<ElementRef<HTMLElement>>('scroll')
  readonly shortVersion = shortTargetVersion
  readonly statuses = ['all', 'active', 'disabled', 'provider_unavailable'] as const
  readonly sorts = ['displayName', 'targetId'] as const
  readonly groups: TargetGroup[] = ['all', 'live', 'unversioned']
  readonly targetOptions = computed(() => {
    this.languageChange()
    return [
      { value: 'all', label: this.translate.instant('XP.AgentEvolution.Overview.AllTargets') },
      ...this.facade
        .visibleTargets()
        .map((target) => ({ value: target.targetId, label: targetLabel(target, this.translate.currentLang) }))
    ]
  })
  readonly matching = computed(() => {
    this.languageChange()
    return directoryRows(
      this.facade.contextTargets(),
      this.facade.contextPointers(),
      this.filters(),
      this.translate.currentLang
    )
  })
  readonly counts = computed(() => {
    const rows = this.matching()
    const live = rows.filter((row) => row.versions.length).length
    return { all: rows.length, live, unversioned: rows.length - live }
  })
  readonly rows = computed(() => {
    const group = this.filters().group
    return this.matching().filter((row) => group === 'all' || (group === 'live') === row.versions.length > 0)
  })
  readonly filtered = computed(() => {
    const { group, query, status, sort } = this.filters()
    return !!query || group !== 'all' || status !== 'all' || sort !== 'displayName'
  })

  constructor() {
    afterNextRender(() => {
      const scroll = this.scroll()?.nativeElement
      if (scroll) scroll.scrollTop = this.facade.directoryScrollTop
    })
  }
  update(filters: Partial<TargetFilters>) {
    this.facade.directoryFilters.update((current) => ({ ...current, ...filters }))
    this.resetScroll()
  }
  resetFilters() {
    this.update(defaultTargetFilters)
  }
  selectTarget(id: string | null) {
    this.facade.selectTarget(id || 'all')
    this.resetScroll()
  }
  rememberScroll() {
    this.facade.directoryScrollTop = this.scroll()?.nativeElement.scrollTop ?? 0
  }
  private resetScroll() {
    const scroll = this.scroll()?.nativeElement
    if (scroll) scroll.scrollTop = 0
    this.facade.directoryScrollTop = 0
  }
}
