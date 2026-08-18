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
    () => this.facade.contextEvaluations().filter((evaluation) => evaluation.gate.passed).length
  )
  readonly passRate = computed(() => {
    const evaluations = this.facade.contextEvaluations()
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
    const candidates = this.facade
      .contextCandidates()
      .filter((candidate) => !['packaged', 'rejected', 'expired'].includes(candidate.status))
      .slice(0, 2)
      .map<TodoRow>((candidate) => ({
        typeKey: 'XP.AgentEvolution.Candidate',
        title: shortId(candidate.candidateId),
        titleKey: 'XP.AgentEvolution.CandidateTodoTitle',
        titleParams: { id: shortId(candidate.candidateId) },
        target: candidate.targetId,
        status: candidate.status,
        route: '../evaluation',
        icon: 'ri-flask-line'
      }))
    const releases = this.facade
      .contextReleases()
      .filter((release) => !['active', 'rolled_back', 'superseded'].includes(release.status))
      .slice(0, 2)
      .map<TodoRow>((release) => ({
        typeKey: 'XP.AgentEvolution.Release',
        title: shortId(release.releasePackageId),
        titleKey: 'XP.AgentEvolution.ReleaseTodoTitle',
        titleParams: { id: shortId(release.releasePackageId) },
        target: release.targetId,
        status: release.status,
        route: '../release',
        icon: 'ri-rocket-line'
      }))
    return [...proposals, ...candidates, ...releases]
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
        value: this.facade.contextCandidates().length,
        icon: 'ri-flask-line',
        tone: 'text-text-accent'
      },
      {
        labelKey: 'XP.AgentEvolution.ReleaseRuns',
        value: this.facade.contextReleases().length,
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
