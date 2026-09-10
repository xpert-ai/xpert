import { CommonModule } from '@angular/common'
import { Component, computed, inject } from '@angular/core'
import { RouterLink } from '@angular/router'
import { ZardBadgeComponent, ZardButtonComponent, ZardCardImports } from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import { AgentEvolutionFacade } from '../agent-evolution.facade'
import { percent, shortId } from '../agent-evolution.types'

interface TodoRow {
  typeKey: string
  title: string
  titleKey?: string
  titleParams?: Record<string, string>
  target: string
  status: string
  route: string
  queryParams?: { changeId: string }
  icon: string
}

@Component({
  standalone: true,
  selector: 'xp-agent-evolution-overview',
  imports: [CommonModule, RouterLink, TranslateModule, ZardBadgeComponent, ZardButtonComponent, ...ZardCardImports],
  templateUrl: './overview.component.html',
  host: { class: 'block' }
})
export class AgentEvolutionOverviewComponent {
  readonly facade = inject(AgentEvolutionFacade)
  readonly percent = percent
  readonly shortId = shortId

  readonly passedEvaluations = computed(
    () => this.facade.contextLifecycleRecords().filter((record) => record.evaluation?.passed).length
  )
  readonly passRate = computed(() => {
    const evaluations = this.facade.contextLifecycleRecords().filter((record) => !!record.evaluation)
    return evaluations.length ? this.passedEvaluations() / evaluations.length : 0
  })
  readonly severeErrors = computed(() =>
    this.facade.contextEvaluations().reduce((total, evaluation) => total + evaluation.metrics.severeErrors, 0)
  )
  readonly activeReleases = computed(
    () => this.facade.contextReleases().filter((release) => release.status === 'active').length
  )
  readonly todos = computed<TodoRow[]>(() => {
    const proposals = this.facade
      .contextProposals()
      .filter((proposal) => proposal.status === 'draft' || proposal.status === 'ready')
      .slice(0, 2)
      .map<TodoRow>((proposal) => ({
        typeKey: 'XP.AgentEvolution.Proposal',
        title: proposal.title,
        target: proposal.targetId,
        status: proposal.status === 'ready' ? 'waiting_build' : 'needs_details',
        route: '../learning',
        icon: 'ri-lightbulb-flash-line'
      }))
    const changes = this.facade
      .contextLifecycleRecords()
      .filter((record) => !['effective', 'closed'].includes(record.phase))
      .slice(0, 4)
      .map<TodoRow>((record) => ({
        typeKey: record.phase === 'publication' ? 'XP.AgentEvolution.Release' : 'XP.AgentEvolution.Candidate',
        title: record.presentation?.title || record.title,
        target: record.targetId,
        status: record.status,
        route: record.phase === 'publication' ? '../release' : '../evaluation',
        queryParams: { changeId: record.id },
        icon: record.phase === 'publication' ? 'ri-rocket-line' : 'ri-flask-line'
      }))
    return [...proposals, ...changes]
  })

  readonly loopStages = computed(() => {
    return [
      {
        labelKey: 'XP.AgentEvolution.LearningSignals',
        value: this.facade.contextEvents().length,
        icon: 'ri-radar-line',
        tone: 'text-text-accent'
      },
      {
        labelKey: 'XP.AgentEvolution.ImprovementProposals',
        value: this.facade.contextProposals().length,
        icon: 'ri-lightbulb-flash-line',
        tone: 'text-text-warning'
      },
      {
        labelKey: 'XP.AgentEvolution.CandidateVersions',
        value: this.facade.contextLifecycleRecords().filter((record) => !!record.candidate).length,
        icon: 'ri-flask-line',
        tone: 'text-text-accent'
      },
      {
        labelKey: 'XP.AgentEvolution.ReleaseRuns',
        value: this.facade.contextLifecycleRecords().filter((record) => !!record.publication).length,
        icon: 'ri-rocket-line',
        tone: 'text-text-success'
      },
      {
        labelKey: 'XP.AgentEvolution.ProductionPointers',
        value: this.facade.contextPointers().length,
        icon: 'ri-focus-3-line',
        tone: 'text-text-primary'
      }
    ]
  })
}
