import { NgClass } from '@angular/common'
import { Component, computed, inject, input } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { RouterLink } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import {
  IKnowledgebase,
  IKnowledgeDocument,
  KnowledgeGraphDocumentProgress,
  KnowledgeGraphDocumentStageState
} from '@xpert-ai/contracts'
import { ZardButtonComponent, ZardIconComponent, ZardStepperImports } from '@xpert-ai/headless-ui'
import { catchError, distinctUntilChanged, exhaustMap, map, of, switchMap, take, timer } from 'rxjs'
import { KnowledgebaseService } from '../../../../../@core/services/knowledgebase.service'
import type { DocumentGraphProgressSnapshot } from './document-graph-status'

@Component({
  selector: 'xp-document-graph-progress',
  standalone: true,
  imports: [NgClass, RouterLink, TranslateModule, ZardButtonComponent, ZardIconComponent, ZardStepperImports],
  templateUrl: './document-graph-progress.component.html'
})
export class DocumentGraphProgressComponent {
  readonly knowledgebase = input.required<IKnowledgebase>()
  readonly document = input.required<IKnowledgeDocument>()
  readonly details = input(true)
  readonly snapshot = input<DocumentGraphProgressSnapshot>()
  readonly #api = inject(KnowledgebaseService)
  readonly #request = computed(() => {
    const kb = this.knowledgebase()
    const doc = this.document()
    return {
      knowledgebaseId: kb.id,
      documentId: doc.id,
      enabled: !!kb.graphRag?.enabled,
      managed: this.snapshot() !== undefined,
      key: JSON.stringify([
        this.snapshot() !== undefined,
        kb.id,
        kb.graphRag?.enabled,
        kb.graphRevision,
        kb.graphStatus,
        doc.id,
        doc.version,
        doc.updatedAt,
        doc.status,
        doc.disabled,
        doc.contentHash,
        doc.publicationEpoch
      ])
    }
  })
  readonly #response = toSignal(
    toObservable(this.#request).pipe(
      distinctUntilChanged((left, right) => left.key === right.key),
      switchMap(({ knowledgebaseId, documentId, enabled, managed, key }) => {
        if (managed || !enabled || !knowledgebaseId || !documentId) return of({ key, progress: null })
        return timer(0, 5000).pipe(
          exhaustMap(() =>
            this.#api.getGraphDocumentProgress(knowledgebaseId, documentId).pipe(
              take(1),
              map((progress) => ({ key, progress })),
              catchError(() => of({ key, progress: null }))
            )
          )
        )
      })
    )
  )
  readonly progress = computed<KnowledgeGraphDocumentProgress | null>(() => {
    const request = this.#request()
    if (!request.enabled) return { documentId: request.documentId, state: 'disabled' }
    const snapshot = this.snapshot()
    if (snapshot) return snapshot.progress?.documentId === request.documentId ? snapshot.progress : null
    const response = this.#response()
    return response?.key === request.key && response.progress?.documentId === request.documentId
      ? response.progress
      : null
  })
  readonly state = computed(() => {
    const progress = this.progress()
    if (progress) return progress.state
    const snapshot = this.snapshot()
    if (snapshot) return snapshot.progress === null ? 'unknown' : 'loading'
    return this.#response()?.key === this.#request().key ? 'unknown' : 'loading'
  })
  readonly stageKeys = ['extraction', 'persistence', 'indexing'] as const
  readonly stageIndex = computed(() => {
    const stages = this.progress()?.stages
    const index = stages ? this.stageKeys.findIndex((stage) => stages[stage] !== 'complete') : 0
    return index < 0 ? 2 : index
  })
  readonly stageClasses: Record<KnowledgeGraphDocumentStageState, string> = {
    pending: 'text-text-tertiary',
    running: 'text-text-accent',
    complete: 'text-text-success',
    failed: 'text-text-destructive'
  }
  readonly stateClass = computed(() => {
    switch (this.state()) {
      case 'ready':
        return 'text-text-success'
      case 'failed':
        return 'text-text-destructive'
      case 'running':
        return 'text-text-accent'
      default:
        return 'text-text-tertiary'
    }
  })
}
