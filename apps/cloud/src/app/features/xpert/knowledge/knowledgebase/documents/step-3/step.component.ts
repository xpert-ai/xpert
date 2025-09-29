import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, input, model, signal } from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { MatProgressBarModule } from '@angular/material/progress-bar'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ActivatedRoute, Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { KnowledgeDocIdComponent } from 'apps/cloud/src/app/@shared/knowledge'
import { compact } from 'lodash-es'
import { BehaviorSubject, debounceTime, map, Subject } from 'rxjs'
import {
  DocumentTextParserConfig,
  getErrorMessage,
  IKnowledgeDocument,
  KBDocumentStatusEnum,
  KDocumentSourceType,
  KnowledgebaseService,
  KnowledgeDocumentService,
  ToastrService
} from '../../../../../../@core'
import { KnowledgebaseComponent } from '../../knowledgebase.component'
import { KnowledgeDocumentsComponent } from '../documents.component'
import { derivedAsync } from 'ngxtension/derived-async'
import { linkedModel } from '@metad/ocap-angular/core'

@Component({
  standalone: true,
  selector: 'xp-knowledge-document-create-step-3',
  templateUrl: './step.component.html',
  styleUrls: ['./step.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    CdkMenuModule,
    CdkListboxModule,
    MatTooltipModule,
    MatProgressBarModule,
    KnowledgeDocIdComponent
  ]
})
export class KnowledgeDocumentCreateStep3Component {
  eKDocumentSourceType = KDocumentSourceType

  readonly knowledgebaseAPI = inject(KnowledgebaseService)
  readonly knowledgeDocumentService = inject(KnowledgeDocumentService)
  readonly #toastr = inject(ToastrService)
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)
  readonly kbComponent = inject(KnowledgebaseComponent)
  readonly documentsComponent = inject(KnowledgeDocumentsComponent)

  // Inputs
  readonly parserConfig = input<DocumentTextParserConfig>()
  readonly docs = input<IKnowledgeDocument[]>()
  readonly taskId = input<string>()

  readonly refresh$ = new BehaviorSubject<boolean>(true)

  readonly loading = signal(false)

  readonly knowledgebase = this.kbComponent.knowledgebase
  readonly workspaceId = computed(() => this.knowledgebase()?.workspaceId ?? '')

  readonly chunkModeStandard = computed(() => {
    return !this.parserConfig()?.chunkOverlap && !this.parserConfig()?.chunkSize && !this.parserConfig()?.delimiter
  })

  readonly knowledgebaseId = computed(() => this.knowledgebase()?.id)
  readonly #task = derivedAsync(() => {
    return this.taskId() ? this.knowledgebaseAPI.getTask(this.knowledgebaseId(), this.taskId(), { relations: ['documents'] }) : null
  })
  readonly documents = linkedModel({
    initialValue: null,
    compute: () => this.docs() || this.#task()?.documents,
    update: (docs) => {
    }
  })
  
  // Waiting job
  readonly waited = computed(() => this.documents()?.some((_) => _.status === KBDocumentStatusEnum.WAITED))
  readonly running = computed(() => this.documents()?.some((_) => _.status === KBDocumentStatusEnum.RUNNING))
  readonly cancel = computed(() => this.documents()?.some((_) => _.status === KBDocumentStatusEnum.CANCEL))
  readonly delayRefresh$ = new Subject<boolean>()

  constructor() {
    effect(() => {
      if (
        this.documents()?.some(
          (item) => item.status === KBDocumentStatusEnum.WAITED || item.status === KBDocumentStatusEnum.RUNNING
        )
      ) {
        this.delayRefresh$.next(true)
      }
    })

    this.delayRefresh$.pipe(takeUntilDestroyed(), debounceTime(5000)).subscribe(() => this.refresh())
  }

  refresh() {
    this.knowledgeDocumentService
      .getStatus(
        compact(
          this.documents().map((item) =>
            [KBDocumentStatusEnum.WAITED, KBDocumentStatusEnum.RUNNING].includes(item.status) ? item.id : null
          )
        )
      )
      .subscribe({
        next: (docs) => {
          this.documents.update((state) => {
            return state.map((item) => {
              const doc = docs.find((d) => d.id === item.id)
              return doc ? { ...item, ...doc } : item
            })
          })
        }
      })
  }

  stopJob() {
    const doc = this.documents().find((_) => _.status === 'running')
    if (doc) {
      this.documents.update((docs) => {
        return docs.map((_) => {
          if (_.jobId === doc.jobId) {
            return {
              ..._,
              status: KBDocumentStatusEnum.CANCEL,
              progress: 0
            }
          }
          return _
        })
      })
      this.knowledgeDocumentService.stopParsing(doc.id).subscribe({
        next: () => {},
        error: (err) => {
          this.#toastr.error(getErrorMessage(err))
        }
      })
    }
  }

  apply() {
    this.documentsComponent.refresh()
    this.#router.navigate(['..'], {
      relativeTo: this.#route,
      queryParams: { parentId: this.documentsComponent.parentId() }
    })
  }
}
