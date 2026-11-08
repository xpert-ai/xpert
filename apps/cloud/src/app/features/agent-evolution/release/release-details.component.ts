import { CommonModule } from '@angular/common'
import { Component, computed, input } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import type {
  ActiveCapabilityPointer,
  EvolutionChange,
  EvolutionLifecycleRecord,
  ReleaseDeployment,
  ReleasePackage
} from '@xpert-ai/contracts'
import { EvolutionChangePanelComponent } from '../changes/change-panel.component'
import { evolutionScopeLabel } from '../agent-evolution.types'
import { isServing } from './release-presentation'
import { releaseDecisionVerified } from './release-inspection'
@Component({
  standalone: true,
  selector: 'xp-release-details',
  imports: [CommonModule, TranslateModule, EvolutionChangePanelComponent],
  templateUrl: './release-details.component.html'
})
export class ReleaseDetailsComponent {
  readonly release = input.required<ReleasePackage>()
  readonly pointer = input<ActiveCapabilityPointer>()
  readonly stages = input.required<ReleaseDeployment[]>()
  readonly record = input.required<EvolutionLifecycleRecord>()
  readonly change = input<EvolutionChange>()
  readonly prefix = 'XP.AgentEvolution.ReleaseWorkbench.'
  readonly scopeLabel = evolutionScopeLabel
  readonly serving = computed(() => isServing(this.release(), this.pointer()))
  readonly verified = computed(() =>
    releaseDecisionVerified(this.release(), this.pointer(), this.record().evaluation, this.stages())
  )
  readonly gates = computed(() => {
    const p = this.release().gatePolicy
    return p
      ? [
          { label: 'Shadow', n: p.shadowMinimumSamples, h: p.shadowMinimumDurationHours },
          { label: 'CanaryPromotion', n: p.canaryMinimumSamples, h: p.canaryMinimumDurationHours },
          { label: 'action_activate', n: p.productionCanaryMinimumSamples, h: p.productionCanaryMinimumDurationHours },
          { label: 'action_experience', n: p.experienceMinimumSamples, h: p.experienceMinimumDurationHours }
        ]
      : []
  })
  readonly fields = computed(() => {
    const r = this.release(),
      p = this.pointer()
    return [
      ['Release', r.releasePackageId],
      ['Candidate', r.candidateId],
      ['Evaluation', r.evaluationRunId],
      ['ArtifactHash', r.artifactHash],
      ['Provider', r.providerKey + '@' + r.providerVersion],
      ['Scope', this.scopeLabel(r.scope)],
      ['TargetVersion', r.targetVersionId],
      ['RollbackTarget', r.rollbackVersionId],
      ['ActiveVersion', p?.activeVersionId],
      ['RollbackVersion', p?.rollbackVersionId],
      ['PointerId', p?.pointerId],
      ['PointerRevision', p?.revision]
    ].map(([key, value]) => ({ key, value }))
  })
}
