import { CommonModule } from '@angular/common'
import { Component, computed, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { getErrorMessage, injectToastr } from '@cloud/app/@core'
import type { LearningEvent } from '@xpert-ai/contracts'
import {
  ZardAlertDialogService,
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardCardImports,
  ZardInputDirective
} from '@xpert-ai/headless-ui'
import { TranslateService } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import { AgentEvolutionFacade } from '../agent-evolution.facade'
import { percent, shortId } from '../agent-evolution.types'

@Component({
  standalone: true,
  selector: 'xp-agent-evolution-learning',
  imports: [CommonModule, FormsModule, ZardBadgeComponent, ZardButtonComponent, ZardInputDirective, ...ZardCardImports],
  templateUrl: './learning.component.html',
  host: { class: 'block' }
})
export class AgentEvolutionLearningComponent {
  readonly facade = inject(AgentEvolutionFacade)
  readonly #alertDialog = inject(ZardAlertDialogService)
  readonly #translate = inject(TranslateService)
  readonly #toastr = injectToastr()

  readonly percent = percent
  readonly shortId = shortId
  readonly query = signal('')
  readonly targetId = signal('all')
  readonly queueTab = signal<'pending' | 'grouped' | 'ignored'>('pending')
  readonly selectedEventId = signal<string | null>(null)
  readonly ignoredEventIds = signal<Set<string>>(new Set())
  readonly goldenEventIds = signal<Set<string>>(new Set())

  readonly filteredEvents = computed(() => {
    const query = this.query().trim().toLocaleLowerCase()
    const targetId = this.targetId()
    const ignoredIds = this.ignoredEventIds()
    return this.facade.dashboard().events.filter((event) => {
      if (this.queueTab() === 'ignored') {
        return ignoredIds.has(event.eventId)
      }
      if (ignoredIds.has(event.eventId)) {
        return false
      }
      if (targetId !== 'all' && event.targetId !== targetId) {
        return false
      }
      if (!query) {
        return true
      }
      return [event.predictionSummary, event.finalOutcomeSummary, event.targetId, event.subjectRef]
        .join(' ')
        .toLocaleLowerCase()
        .includes(query)
    })
  })

  readonly selectedEvent = computed<LearningEvent | null>(() => {
    const events = this.filteredEvents()
    return events.find((event) => event.eventId === this.selectedEventId()) ?? events[0] ?? null
  })

  readonly selectedProposal = computed(() => {
    const event = this.selectedEvent()
    const proposals = this.facade.dashboard().proposals
    return (
      proposals.find((proposal) => event && proposal.evidenceEventIds.includes(event.eventId)) ??
      proposals.find((proposal) => !event || proposal.targetId === event.targetId) ??
      proposals[0] ??
      null
    )
  })

  readonly averageConfidence = computed(() => {
    const events = this.filteredEvents()
    return events.length ? events.reduce((sum, event) => sum + event.confidence, 0) / events.length : 0
  })

  select(event: LearningEvent) {
    this.selectedEventId.set(event.eventId)
  }

  ignoreSelected() {
    const event = this.selectedEvent()
    if (!event) {
      return
    }
    this.ignoredEventIds.update((current) => new Set(current).add(event.eventId))
    this.selectedEventId.set(null)
    this.#toastr.success('XP.AgentEvolution.SignalIgnored', { Default: '该学习信号已在当前视图中忽略' })
  }

  toggleGolden() {
    const event = this.selectedEvent()
    if (!event) {
      return
    }
    this.goldenEventIds.update((current) => {
      const next = new Set(current)
      if (next.has(event.eventId)) {
        next.delete(event.eventId)
      } else {
        next.add(event.eventId)
      }
      return next
    })
    this.#toastr.success('XP.AgentEvolution.GoldenDatasetUpdated', { Default: '黄金数据集选择已更新' })
  }

  async generateProposal() {
    const confirmed = await firstValueFrom(
      this.#alertDialog.confirm({
        title: this.#translate.instant('XP.AgentEvolution.GenerateProposalTitle', {
          Default: '从证据信号生成并验证建议？'
        }),
        description: this.#translate.instant('XP.AgentEvolution.GenerateProposalDescription', {
          Default: '当前服务以一致性场景执行完整闭环；建议生成后将继续构建候选、评测、审批并灰度激活。'
        }),
        actionText: this.#translate.instant('XP.AgentEvolution.RunCompleteFlow', { Default: '执行完整流程' }),
        cancelText: this.#translate.instant('XP.ACTIONS.Cancel', { Default: '取消' })
      })
    )
    if (!confirmed) {
      return
    }
    try {
      await this.facade.runSimulation()
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    }
  }
}
