import { NgClass } from '@angular/common'
import { Component, computed, effect, inject, input, signal } from '@angular/core'
import { RouterLink } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { KnowledgeWikiDocumentProgress, KnowledgeWikiDocumentStageState } from '@xpert-ai/contracts'
import { ZardButtonComponent, ZardIconComponent, ZardStepperImports } from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import { KnowledgeWikiService, ToastrService } from '../../../../../@core'

@Component({
  selector: 'xp-document-wiki-progress',
  standalone: true,
  imports: [NgClass, RouterLink, TranslateModule, ZardButtonComponent, ZardIconComponent, ZardStepperImports],
  templateUrl: './document-wiki-progress.component.html'
})
export class DocumentWikiProgressComponent {
  readonly knowledgebaseId = input.required<string>()
  readonly progress = input<KnowledgeWikiDocumentProgress>()
  readonly details = input(false)
  readonly busy = signal(false)
  readonly retriedJobId = signal<string | null>(null)
  readonly state = computed(() => this.progress()?.state ?? 'unknown')
  readonly failureKey = computed(() => {
    const keys: Record<string, string> = {
      knowledge_wiki_empty_sources: 'EmptySources',
      knowledge_wiki_empty_publication: 'EmptyPublication',
      knowledge_wiki_index_failed: 'IndexFailed',
      knowledge_wiki_publication_conflict: 'PublicationConflict'
    }
    const key = keys[this.progress()?.errorCode ?? '']
    return `XP.Knowledgebase.Wiki.DocumentProgress.${key ?? 'FailureHint'}`
  })
  readonly stageKeys = ['generation', 'indexing', 'publication'] as const
  readonly stageIndex = computed(() => {
    const stages = this.progress()?.stages
    const index = stages ? this.stageKeys.findIndex((key) => stages[key] !== 'complete') : 0
    return index < 0 ? 2 : index
  })
  readonly stageClasses: Record<KnowledgeWikiDocumentStageState, string> = {
    pending: 'text-text-tertiary',
    running: 'text-text-accent',
    complete: 'text-text-success',
    failed: 'text-text-destructive',
    skipped: 'text-text-tertiary'
  }
  readonly stateClass = computed(() => {
    switch (this.state()) {
      case 'ready':
        return 'text-text-success'
      case 'failed':
        return 'text-text-destructive'
      case 'generating':
      case 'indexing':
      case 'publishing':
        return 'text-text-accent'
      default:
        return 'text-text-tertiary'
    }
  })
  readonly active = computed(() => ['generating', 'indexing', 'publishing'].includes(this.state()))
  readonly #api = inject(KnowledgeWikiService)
  readonly #translate = inject(TranslateService)
  readonly #toastr = inject(ToastrService)

  constructor() {
    effect(() => {
      // A later poll can already contain another failure of the same job; allow that attempt to be retried.
      this.progress()
      this.retriedJobId.set(null)
    })
  }

  async retry() {
    const action = this.progress()?.retry
    if (!action || this.busy() || this.retriedJobId() === action.jobId) return
    const id = this.knowledgebaseId()
    if (
      action.requiresAdditionalChargeConfirmation &&
      !window.confirm(this.#translate.instant('XP.Knowledgebase.Wiki.RetryChargeConfirm'))
    )
      return
    this.busy.set(true)
    try {
      await firstValueFrom(this.#api.retryJob(id, action.jobId, action.requiresAdditionalChargeConfirmation))
      if (this.knowledgebaseId() === id) this.retriedJobId.set(action.jobId)
    } catch (error) {
      this.#toastr.danger(error)
    } finally {
      this.busy.set(false)
    }
  }
}
