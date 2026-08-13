import { CommonModule } from '@angular/common'
import { Component, computed, inject } from '@angular/core'
import { RouterLink } from '@angular/router'
import { ZardBadgeComponent, ZardButtonComponent, ZardCardImports } from '@xpert-ai/headless-ui'
import { AgentEvolutionFacade } from '../agent-evolution.facade'
import { percent, shortId } from '../agent-evolution.types'

interface TodoRow {
  type: '建议' | '候选' | '发布'
  title: string
  target: string
  status: string
  route: string
  icon: string
}

@Component({
  standalone: true,
  selector: 'xp-agent-evolution-overview',
  imports: [CommonModule, RouterLink, ZardBadgeComponent, ZardButtonComponent, ...ZardCardImports],
  templateUrl: './overview.component.html',
  host: { class: 'block' }
})
export class AgentEvolutionOverviewComponent {
  readonly facade = inject(AgentEvolutionFacade)
  readonly percent = percent
  readonly shortId = shortId

  readonly passedEvaluations = computed(
    () => this.facade.dashboard().evaluations.filter((evaluation) => evaluation.gate.passed).length
  )
  readonly passRate = computed(() => {
    const evaluations = this.facade.dashboard().evaluations
    return evaluations.length ? this.passedEvaluations() / evaluations.length : 0
  })
  readonly severeErrors = computed(() =>
    this.facade.dashboard().evaluations.reduce((total, evaluation) => total + evaluation.metrics.severeErrors, 0)
  )
  readonly activeReleases = computed(
    () => this.facade.dashboard().releases.filter((release) => release.status === 'active').length
  )
  readonly todos = computed<TodoRow[]>(() => {
    const dashboard = this.facade.dashboard()
    const proposals = dashboard.proposals
      .filter((proposal) => proposal.status === 'draft' || proposal.status === 'ready')
      .slice(0, 2)
      .map<TodoRow>((proposal) => ({
        type: '建议',
        title: proposal.title,
        target: proposal.targetId,
        status: proposal.status === 'ready' ? '待构建' : '待完善',
        route: '../learning',
        icon: 'ri-lightbulb-flash-line'
      }))
    const candidates = dashboard.candidates
      .filter((candidate) => !['packaged', 'rejected', 'expired'].includes(candidate.status))
      .slice(0, 2)
      .map<TodoRow>((candidate) => ({
        type: '候选',
        title: `候选 ${shortId(candidate.candidateId)}`,
        target: candidate.targetId,
        status: candidate.status,
        route: '../evaluation',
        icon: 'ri-flask-line'
      }))
    const releases = dashboard.releases
      .filter((release) => !['active', 'rolled_back', 'superseded'].includes(release.status))
      .slice(0, 2)
      .map<TodoRow>((release) => ({
        type: '发布',
        title: `发布 ${shortId(release.releasePackageId)}`,
        target: release.targetId,
        status: release.status,
        route: '../release',
        icon: 'ri-rocket-line'
      }))
    return [...proposals, ...candidates, ...releases]
  })

  readonly loopStages = computed(() => {
    const dashboard = this.facade.dashboard()
    return [
      { label: '学习信号', value: dashboard.events.length, icon: 'ri-radar-line', tone: 'text-text-accent' },
      {
        label: '改进建议',
        value: dashboard.proposals.length,
        icon: 'ri-lightbulb-flash-line',
        tone: 'text-text-warning'
      },
      { label: '候选版本', value: dashboard.candidates.length, icon: 'ri-flask-line', tone: 'text-text-accent' },
      { label: '发布运行', value: dashboard.releases.length, icon: 'ri-rocket-line', tone: 'text-text-success' },
      { label: '生产指针', value: dashboard.pointers.length, icon: 'ri-focus-3-line', tone: 'text-text-primary' }
    ]
  })
}
