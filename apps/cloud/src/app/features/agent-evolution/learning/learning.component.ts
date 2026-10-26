import { ActivatedRoute } from '@angular/router'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { injectActiveScope } from '@cloud/app/@core/state'
import { findLearningEvent } from '../evolution-resource-lookup'
import { AgentEvolutionApiService } from '../agent-evolution-api.service'
import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import type { EvolutionCandidateChangeFieldDescriptor, LearningEvent } from '@xpert-ai/contracts'
import {
  ZardAlertDialogService,
  XpI18nPipe,
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardCardImports,
  ZardCheckboxComponent,
  ZardInputDirective,
  ZardSearchInputComponent,
  ZardSelectImports,
  type ZardSelectValue
} from '@xpert-ai/headless-ui'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { catchError, firstValueFrom, map, of, startWith, switchMap } from 'rxjs'
import { AgentEvolutionFacade } from '../agent-evolution.facade'
import { evolutionSummaryPresentation, learningEventPresentation, percent, shortId } from '../agent-evolution.types'

type EventLookupState = { item: LearningEvent | null; loading: boolean; error: boolean }

@Component({
  standalone: true,
  selector: 'xp-agent-evolution-learning',
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    XpI18nPipe,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardCheckboxComponent,
    ZardInputDirective,
    ZardSearchInputComponent,
    ...ZardSelectImports,
    ...ZardCardImports
  ],
  templateUrl: './learning.component.html',
  host: { class: 'block' }
})
export class AgentEvolutionLearningComponent {
  readonly facade = inject(AgentEvolutionFacade)
  readonly #alertDialog = inject(ZardAlertDialogService)
  readonly #translate = inject(TranslateService)

  readonly percent = percent
  readonly shortId = shortId
  readonly eventPresentation = learningEventPresentation
  readonly summaryPresentation = evolutionSummaryPresentation
  readonly query = signal('')
  readonly queueTab = signal<'pending' | 'grouped' | 'ignored'>('pending')
  readonly selectedEventId = signal<string | null>(null)
  readonly candidateDraft = signal<Record<string, string | number | boolean | string[]>>({})

  private readonly route = inject(ActivatedRoute, { optional: true })
  private readonly requestedEventId = toSignal(
    this.route?.queryParamMap.pipe(map((params) => params.get('eventId'))) ?? of(null)
  )
  private readonly scope = injectActiveScope()
  private readonly api = inject(AgentEvolutionApiService)
  private readonly lookupRevision = signal(0)
  private readonly eventRequest = computed(() => ({
    id: this.requestedEventId(),
    scope: this.scope(),
    revision: this.lookupRevision()
  }))
  readonly isSearchDestination = computed(
    () => !!this.requestedEventId() && this.requestedEventId() === this.query().trim()
  )
  readonly eventLookup = toSignal(
    toObservable(this.eventRequest).pipe(
      switchMap(({ id }) =>
        id
          ? findLearningEvent(this.api, id).pipe(
              map((item): EventLookupState => ({ item, loading: false, error: false })),
              catchError(() => of<EventLookupState>({ item: null, loading: false, error: true })),
              startWith<EventLookupState>({ item: null, loading: true, error: false })
            )
          : of<EventLookupState>({ item: null, loading: false, error: false })
      )
    ),
    { initialValue: { item: null, loading: false, error: false } }
  )
  readonly searchedEvent = computed(() => this.eventLookup().item)

  constructor() {
    effect(() => {
      const id = this.requestedEventId()
      if (id) {
        this.query.set(id)
        this.selectedEventId.set(id)
      }
    })
    effect(() => {
      const event = this.searchedEvent()
      if (event) this.queueTab.set(event.reviewStatus === 'ignored' ? 'ignored' : 'pending')
    })
  }

  readonly filteredEvents = computed(() => {
    const query = this.query().trim().toLocaleLowerCase()
    const searched = this.searchedEvent()
    const events = this.isSearchDestination() ? (searched ? [searched] : []) : this.facade.contextEvents()
    return events.filter((event) => {
      if (this.queueTab() === 'ignored') {
        return event.reviewStatus === 'ignored'
      }
      if (event.reviewStatus === 'ignored') {
        return false
      }
      if (
        this.queueTab() === 'grouped' &&
        !this.facade.dashboard().clusters.some((cluster) => cluster.eventIds.includes(event.eventId))
      )
        return false
      if (!query) {
        return true
      }
      return [event.eventId, event.predictionSummary, event.finalOutcomeSummary, event.targetId, event.subjectRef]
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
    const proposals = this.facade.contextProposals()
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
  readonly goldenEventCount = computed(
    () => this.facade.contextEvents().filter((event) => event.reviewStatus === 'golden').length
  )
  readonly candidateTarget = computed(() => {
    const proposal = this.selectedProposal()
    return this.facade.dashboard().targets.find((target) => target.targetId === proposal?.targetId) ?? null
  })
  readonly candidateFields = computed(() => this.candidateTarget()?.candidateForm?.fields ?? [])
  readonly canBuildCandidate = computed(
    () =>
      this.selectedProposal()?.status === 'ready' &&
      this.candidateTarget()?.capabilities.candidateBuild === true &&
      this.candidateFields().length > 0
  )
  readonly candidateDraftValid = computed(() =>
    this.candidateFields().every((field) => !field.required || hasFieldValue(this.candidateDraft()[field.key]))
  )

  readonly #candidateDraftEffect = effect(() => {
    const fields = this.candidateFields()
    this.candidateDraft.set(
      Object.fromEntries(fields.map((field) => [field.key, cloneDefaultValue(field.defaultValue)])) as Record<
        string,
        string | number | boolean | string[]
      >
    )
  })

  select(event: LearningEvent) {
    this.selectedEventId.set(event.eventId)
  }

  refreshSearchDestination() {
    this.lookupRevision.update((revision) => revision + 1)
  }

  async ignoreSelected() {
    const event = this.selectedEvent()
    if (!event) {
      return
    }
    if (await this.facade.reviewEvent(event.eventId, 'ignored')) {
      this.selectedEventId.set(null)
      this.refreshSearchDestination()
    }
  }

  async toggleGolden() {
    const event = this.selectedEvent()
    if (!event) {
      return
    }
    if (await this.facade.reviewEvent(event.eventId, event.reviewStatus === 'golden' ? 'pending' : 'golden')) {
      this.refreshSearchDestination()
    }
  }

  async generateProposal() {
    const confirmed = await firstValueFrom(
      this.#alertDialog.confirm({
        layout: 'standard',
        title: this.#translate.instant('XP.AgentEvolution.GenerateProposalTitle', {
          Default: 'Generate a proposal from reviewed evidence?'
        }),
        description: this.#translate.instant('XP.AgentEvolution.GenerateProposalDescription', {
          Default:
            'This creates an auditable Proposal only. It does not build a Candidate or change a Production capability version.'
        }),
        actionText: this.#translate.instant('XP.AgentEvolution.CreateProposal', { Default: 'Create proposal' }),
        cancelText: this.#translate.instant('XP.ACTIONS.Cancel', { Default: 'Cancel' })
      })
    )
    if (!confirmed) {
      return
    }
    const event = this.selectedEvent()
    if (event) await this.facade.createProposalForEvent(event)
  }

  reasonLabel(reason: string) {
    return this.#translate.instant(`XP.AgentEvolution.ReasonCode.${reason}`, { Default: reason })
  }

  proposalRootCause(rootCause: string) {
    const repeated = /^(?:Repeated correction signature|repeated_correction_signature):\s*(.+)$/i.exec(rootCause)
    if (repeated?.[1]) {
      const reasons = repeated[1]
        .split(',')
        .map((reason) => this.reasonLabel(reason.trim()))
        .filter(Boolean)
        .join(this.#translate.instant('XP.AgentEvolution.ListSeparator'))
      return this.#translate.instant('XP.AgentEvolution.RepeatedFeedbackRootCause', { reasons })
    }
    if (/^(?:Unclassified repeated correction|unclassified_repeated_correction)$/i.test(rootCause)) {
      return this.#translate.instant('XP.AgentEvolution.UnclassifiedRepeatedFeedback')
    }
    return rootCause
  }

  candidateValue(field: EvolutionCandidateChangeFieldDescriptor) {
    return this.candidateDraft()[field.key] ?? cloneDefaultValue(field.defaultValue)
  }

  candidateSelectValue(field: EvolutionCandidateChangeFieldDescriptor): string | number {
    const value = this.candidateValue(field)
    return typeof value === 'string' || typeof value === 'number' ? value : ''
  }

  setCandidateValue(field: EvolutionCandidateChangeFieldDescriptor, value: string | number | boolean) {
    const normalized = field.type === 'number' ? Number(value) : field.type === 'boolean' ? Boolean(value) : `${value}`
    this.candidateDraft.update((current) => ({ ...current, [field.key]: normalized }))
  }

  setCandidateSelectValue(field: EvolutionCandidateChangeFieldDescriptor, value: ZardSelectValue | ZardSelectValue[]) {
    const selected = Array.isArray(value) ? value[0] : value
    if (selected !== undefined) this.setCandidateValue(field, selected)
  }

  setCandidateArrayValue(field: EvolutionCandidateChangeFieldDescriptor, value: string) {
    this.candidateDraft.update((current) => ({
      ...current,
      [field.key]: value
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean)
    }))
  }

  candidateArrayText(field: EvolutionCandidateChangeFieldDescriptor) {
    const value = this.candidateValue(field)
    return Array.isArray(value) ? value.join('\n') : ''
  }

  async buildCandidate() {
    const proposal = this.selectedProposal()
    if (!proposal || !this.canBuildCandidate() || !this.candidateDraftValid()) return
    const confirmed = await firstValueFrom(
      this.#alertDialog.confirm({
        layout: 'standard',
        title: this.#translate.instant('XP.AgentEvolution.BuildIsolatedCandidateTitle'),
        description: this.#translate.instant('XP.AgentEvolution.BuildIsolatedCandidateDescription'),
        actionText: this.#translate.instant('XP.AgentEvolution.BuildCandidate'),
        cancelText: this.#translate.instant('XP.ACTIONS.Cancel', { Default: 'Cancel' })
      })
    )
    if (confirmed) await this.facade.buildCandidate(proposal, this.candidateDraft())
  }
}

function cloneDefaultValue(value: EvolutionCandidateChangeFieldDescriptor['defaultValue']) {
  return Array.isArray(value) ? [...value] : (value ?? '')
}

function hasFieldValue(value: string | number | boolean | string[] | undefined) {
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'string') return value.trim().length > 0
  return value !== undefined && value !== null && !Number.isNaN(value)
}
