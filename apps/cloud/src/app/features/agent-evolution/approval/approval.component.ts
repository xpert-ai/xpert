import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
  ViewContainerRef
} from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { ActivatedRoute, RouterLink } from '@angular/router'
import { map } from 'rxjs'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { AIPermissionsEnum, Store } from '@cloud/app/@core'
import { injectActiveScope } from '@cloud/app/@core/state'
import { resolveI18nText, type I18nText, type EvolutionChange } from '@xpert-ai/contracts'
import { ZardButtonComponent, ZardDialogService, ZardDialogRef } from '@xpert-ai/headless-ui'
import { AgentEvolutionFacade } from '../agent-evolution.facade'
import { sameEvolutionScope } from '../agent-evolution.types'
import { compactId } from '../evaluation/replay-presentation'
import { changeWorkbenchLink, selectedReplayEvaluation } from '../shared/evolution-change-presentation'
import { targetLabel } from '../targets/target-directory'
import { ApprovalEvidenceDialog, type ApprovalEvidenceData, type EvidenceView } from './evidence-dialog.component'

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, TranslateModule, ZardButtonComponent],
  templateUrl: './approval.component.html',
  host: { class: '@container/review flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground' }
})
export class EvolutionApprovalComponent {
  readonly p = 'XP.AgentEvolution.Approval.'
  readonly f = inject(AgentEvolutionFacade)
  private readonly route = inject(ActivatedRoute)
  private readonly i18n = inject(TranslateService)
  private readonly store = inject(Store)
  private readonly scope = injectActiveScope()
  private readonly dialogs = inject(ZardDialogService)
  private readonly container = inject(ViewContainerRef)
  private dialog?: ZardDialogRef<ApprovalEvidenceDialog>
  readonly locale = toSignal(this.i18n.onLangChange)
  readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap })
  readonly query = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap })
  readonly backQuery = computed(() => ({ target: this.query().get('target') }))
  readonly change = computed(() => {
    const id = this.params().get('changeId'),
      target = this.query().get('target')
    return this.f
      .changes()
      .find(
        (c) =>
          c.changeId === id &&
          (!target || c.targetId === target) &&
          (this.f.showFixtures() ||
            !this.f.dashboard().targets.some((t) => t.targetId === c.targetId && t.targetType === 'test_fixture'))
      )
  })
  readonly record = computed(() => this.f.lifecycleRecords().find((r) => r.id === this.change()?.changeId))
  readonly target = computed(() => this.f.visibleTargets().find((t) => t.targetId === this.change()?.targetId))
  readonly targetName = computed(() => {
    this.locale()
    const t = this.target()
    return t ? targetLabel(t, this.i18n.currentLang) : this.change()?.targetId
  })
  readonly proposal = computed(() => {
    const c = this.change(),
      candidate = this.f.dashboard().candidates.find((x) => x.candidateId === c?.changeId)
    return (
      c &&
      candidate &&
      this.f
        .dashboard()
        .proposals.find(
          (x) =>
            x.targetId === c.targetId &&
            sameEvolutionScope(x.scope, c.scope) &&
            x.proposalId === candidate.proposalId &&
            x.revision === candidate.proposalRevision
        )
    )
  })
  readonly replay = computed(() =>
    selectedReplayEvaluation(this.f.dashboard().evaluations, this.change()?.evaluation, this.change()?.changeId)
  )
  readonly release = computed(() =>
    this.f.dashboard().releases.find((r) => r.releasePackageId === this.record()?.releasePackageId)
  )
  readonly business = computed(() => this.change()?.presentation?.business)
  readonly title = computed(
    () =>
      this.txt(this.business()?.title) ||
      this.proposal()?.title ||
      this.change()?.presentation?.title ||
      this.change()?.candidate?.summary ||
      this.targetName()
  )
  readonly deltas = computed(() => {
    const domain = this.business()?.changes
    if (domain?.length)
      return domain.map((x) => ({ label: this.txt(x.label), before: this.txt(x.before), after: this.txt(x.after) }))
    const proposal = this.proposal()
    if (proposal) return [{ label: '', before: proposal.problemStatement, after: proposal.changeHypothesis }]
    return (this.change()?.candidate?.changes ?? []).map((x) => ({
      label: x.summary || x.path,
      before: x.before,
      after: x.after
    }))
  })
  readonly changedFields = computed(() =>
    (this.change()?.candidate?.changes ?? []).map((row) => ({
      key: row.path,
      label:
        this.txt(this.target()?.candidateForm?.fields.find((field) => field.key === row.path)?.label) ||
        row.summary ||
        row.path,
      value: row.after
    }))
  )
  readonly stats = computed(() => {
    const e = this.change()?.evaluation,
      required = e?.checks.filter((c) => c.blocking) ?? []
    return {
      passed: e?.checks.filter((c) => c.passed).length,
      required,
      requiredPassed: required.filter((c) => c.passed).length,
      concerns: e?.checks.filter((c) => !c.passed && !c.blocking) ?? []
    }
  })
  readonly replayCounts = computed(() => {
    const rows = this.replay()?.caseResults ?? []
    return {
      baseline: rows.filter((r) => r.baselinePassed).length,
      improved: rows.filter((r) => !r.baselinePassed && r.candidatePassed).length,
      regressed: rows.filter((r) => r.baselinePassed && !r.candidatePassed).length
    }
  })
  readonly direct = computed(() => this.change()?.strategy.definition.publication.mode === 'version_write')
  readonly link = computed(() => {
    const c = this.change()
    return c && changeWorkbenchLink(c, c.receipt ? 'release' : 'evaluation')
  })
  readonly canManage = toSignal(
    this.store.userRolePermissions$.pipe(map(() => this.store.hasPermission(AIPermissionsEnum.EVOLUTION_MANAGE))),
    { initialValue: this.store.hasPermission(AIPermissionsEnum.EVOLUTION_MANAGE) }
  )
  readonly decisions = computed(() => {
    const c = this.change(),
      r = this.record()
    if (!c?.evaluation) return []
    const all = [...(this.f.dashboard().approvals ?? []), ...(r?.approvals ?? []), ...(c.approval ? [c.approval] : [])]
    return [
      ...new Map(
        all
          .filter(
            (a) =>
              a.candidateId === c.changeId &&
              a.candidateHash === c.candidate?.artifact?.hash &&
              a.evaluationRunId === c.evaluation?.runId &&
              (!a.strategyHash || a.strategyHash === c.strategy.hash)
          )
          .map((a) => [a.approvalId, a])
      ).values()
    ].sort((a, b) => a.decidedAt.localeCompare(b.decidedAt))
  })
  readonly ownDecision = computed(() => this.decisions().some((a) => a.actorId === this.store.userId))
  readonly allowed = computed(() => {
    const c = this.change()
    return !!(
      this.canManage() &&
      !this.ownDecision() &&
      !this.f.providerError() &&
      c?.evaluation?.runId &&
      c.candidate?.artifact?.hash &&
      c.candidate.artifact.hash === c.evaluation.candidateHash &&
      c.strategy.hash === c.evaluation.strategyHash &&
      this.record()?.evaluation?.runId === c.evaluation.runId &&
      this.record()?.candidate?.artifact?.hash === c.candidate.artifact.hash &&
      this.record()?.capabilities.decide
    )
  })
  readonly canApprove = computed(
    () => this.allowed() && this.change()?.status === 'pending_approval' && this.change()?.evaluation?.passed
  )
  readonly canReject = computed(
    () => this.allowed() && ['test_failed', 'pending_approval'].includes(this.change()?.status ?? '')
  )
  readonly canPublish = computed(
    () =>
      this.canManage() &&
      !this.f.providerError() &&
      this.record()?.capabilities.publish &&
      !!this.change()?.evaluation?.passed
  )
  readonly draft = signal('')
  private opinionBinding = ''
  setOpinion(value: string) {
    this.opinionBinding = this.binding()
    this.draft.set(value)
  }
  readonly short = compactId
  txt(value?: I18nText) {
    this.locale()
    return resolveI18nText(value, this.i18n.currentLang) || ''
  }
  shortHash(hash?: string) {
    return hash?.replace(/^sha256:/, '').slice(0, 12) || '—'
  }
  checkLabel(id: string, fallback: string) {
    return this.localized('CheckNames.' + id, fallback)
  }
  concernNote(id: string, value: string) {
    return this.localized('ConcernNotes.' + id, this.checkDetail(value))
  }
  checkDetail(value: string) {
    return this.localized('ReasonCodes.' + value, value)
  }
  private localized(suffix: string, fallback: string) {
    const key = this.p + suffix
    const result = this.i18n.instant(key)
    return result === key ? fallback : result
  }
  readonly binding = computed(() => {
    const c = this.change()
    return JSON.stringify([
      this.scope(),
      c?.scope,
      c?.changeId,
      c?.candidate?.artifact?.hash,
      c?.evaluation?.runId,
      c?.strategy.hash,
      c?.status
    ])
  })
  constructor() {
    let previous = ''
    effect(() => {
      const next = this.binding()
      if (next !== previous) {
        previous = next
        untracked(() => {
          this.draft.set('')
          this.dialog?.close()
        })
      }
    })
    inject(DestroyRef).onDestroy(() => this.dialog?.close())
  }
  open(view: EvidenceView) {
    const change = this.change()
    if (!change || this.dialog) return
    const ref = this.dialogs.create<ApprovalEvidenceDialog, ApprovalEvidenceData>({
      zContent: ApprovalEvidenceDialog,
      zTitle: this.i18n.instant(this.p + { identity: 'Identity', checks: 'Evaluation', source: 'Evidence' }[view]),
      zWidth: 'min(660px, calc(100vw - 24px))',
      zHideFooter: true,
      zViewContainerRef: this.container,
      zData: {
        view,
        change,
        record: this.record(),
        proposal: this.proposal(),
        replay: this.replay(),
        target: this.target()
      }
    })
    this.dialog = ref
    ref.closed.subscribe(() => {
      if (this.dialog === ref) this.dialog = undefined
    })
  }
  async decide(decision: 'approved' | 'rejected') {
    const c = this.change(),
      reason = this.draft().trim(),
      binding = this.binding()
    if (
      !c ||
      !reason ||
      binding !== this.opinionBinding ||
      this.f.mutating() ||
      !(decision === 'approved' ? this.canApprove() : this.canReject())
    )
      return
    const result = await this.f.decideChange(c, decision, reason)
    if (result && binding === this.binding()) this.draft.set('')
  }
  publish(c: EvolutionChange) {
    if (this.f.mutating() || !this.canPublish() || c !== this.change() || !c.evaluation) return
    if (this.direct()) return this.f.publishApprovedChange(c)
    return this.f.packageRelease(c)
  }
}
