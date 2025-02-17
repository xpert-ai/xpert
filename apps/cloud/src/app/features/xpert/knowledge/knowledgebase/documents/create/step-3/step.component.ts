import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { MatProgressBarModule } from '@angular/material/progress-bar'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ActivatedRoute, Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { compact } from 'lodash-es'
import { BehaviorSubject, debounceTime, Subject } from 'rxjs'
import { KDocumentSourceType, KnowledgeDocumentService, ToastrService } from '../../../../../../../@core'
import { KnowledgeDocumentCreateComponent } from '../create.component'
import { KnowledgeDocIdComponent } from 'apps/cloud/src/app/@shared/knowledge'
import { KnowledgebaseComponent } from '../../../knowledgebase.component'

@Component({
  standalone: true,
  selector: 'xpert-knowledge-document-create-step-3',
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

  readonly knowledgeDocumentService = inject(KnowledgeDocumentService)
  readonly #toastr = inject(ToastrService)
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)
  readonly createComponent = inject(KnowledgeDocumentCreateComponent)
  readonly kbComponent = inject(KnowledgebaseComponent)

  readonly refresh$ = new BehaviorSubject<boolean>(true)

  readonly loading = signal(false)

  readonly knowledgebase = this.kbComponent.knowledgebase
  readonly workspaceId = computed(() => this.knowledgebase()?.workspaceId ?? '')
  readonly documents = this.createComponent.documents
  readonly parserConfig = this.createComponent.parserConfig

  readonly chunkModeStandard = computed(() => {
    return !this.parserConfig()?.chunkOverlap && !this.parserConfig()?.chunkSize && !this.parserConfig()?.delimiter
  })

  // Waiting job
  readonly running = computed(() => this.documents()?.some((_) => _.status === 'running'))
  readonly delayRefresh$ = new Subject<boolean>()

  constructor() {
    effect(() => {
      console.log(this.documents())
      if (this.documents()?.some((item) => item.status === 'running')) {
        this.delayRefresh$.next(true)
      }
    })

    this.delayRefresh$.pipe(takeUntilDestroyed(), debounceTime(5000)).subscribe(() => this.refresh())
  }

  refresh() {
    this.knowledgeDocumentService
      .getStatus(compact(this.documents().map((item) => (item.status === 'running' ? item.id : null))))
      .subscribe({
        next: (docs) => {
          this.createComponent.updateDocs(docs)
        }
      })
  }

  apply() {
    this.createComponent.apply()
  }
}
