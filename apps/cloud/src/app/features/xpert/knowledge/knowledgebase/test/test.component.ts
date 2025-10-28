import { CommonModule } from '@angular/common'
import { Component, computed, inject, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { CdkMenuModule } from '@angular/cdk/menu'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import { KnowledgeChunkComponent, KnowledgeRetrievalSettingsComponent } from '@cloud/app/@shared/knowledge'
import { DocumentInterface } from '@langchain/core/documents'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { myRxResource } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  AiModelTypeEnum,
  DateRelativePipe,
  DocumentMetadata,
  IKnowledgeRetrievalLog,
  KnowledgebaseService,
  OrderTypeEnum,
  ToastrService,
  getErrorMessage,
  injectHelpWebsite,
  routeAnimations
} from '../../../../../@core'
import { KnowledgebaseComponent } from '../knowledgebase.component'


@Component({
  standalone: true,
  selector: 'xp-knowledgebase-test',
  templateUrl: './test.component.html',
  styleUrls: ['./test.component.scss'],
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    TranslateModule,
    CdkMenuModule,
    MatTooltipModule,
    NgmCommonModule,
    DateRelativePipe,
    KnowledgeChunkComponent,
    KnowledgeRetrievalSettingsComponent
  ],
  animations: [routeAnimations]
})
export class KnowledgeTestComponent {
  eAiModelTypeEnum = AiModelTypeEnum

  readonly knowledgebaseAPI = inject(KnowledgebaseService)
  readonly _toastrService = inject(ToastrService)
  readonly knowledgebaseComponent = inject(KnowledgebaseComponent)
  readonly helpUrl = injectHelpWebsite('/docs/ai/knowledge/retrieval')
  

  readonly knowledgebase = this.knowledgebaseComponent.knowledgebase

  readonly recall = computed(() => this.knowledgebase()?.recall)
  readonly score = computed(() => this.recall()?.score)
  readonly topK = computed(() => this.recall()?.topK)

  readonly query = model<string>('')
  readonly results = signal<DocumentInterface<DocumentMetadata>[]>(null)
  readonly error = signal<string>(null)

  readonly #loading = signal<boolean>(false)

  readonly #logs = myRxResource({
    request: () => ({
      id: this.knowledgebase()?.id,
      params: {
        order: {
          createdAt: OrderTypeEnum.DESC
        },
        skip: 0,
        take: 20,
      }
    }),
    loader: ({ request }) => {
      return request.id ? this.knowledgebaseAPI.getLogs(request.id, request.params) : null
    }
  })
  readonly logs = computed(() => this.#logs.value()?.items)

  readonly loading = computed(() => this.#loading() || this.#logs.status() === 'loading')

  test() {
    this.#loading.set(true)
    this.error.set(null)
    this.knowledgebaseAPI
      .test(this.knowledgebase().id, { query: this.query(), k: this.topK() ?? 10, score: this.score() })
      .subscribe({
        next: (results) => {
          this.results.set(results)
          this.#loading.set(false)
        },
        error: (err) => {
          this.results.set(null)
          this.error.set(getErrorMessage(err))
          this.#loading.set(false)
        },
        complete: () => {
          this.#logs.reload()
        }
      })
  }

  selectLog(log: IKnowledgeRetrievalLog) {
    this.query.set(log.query)
    this.results.set(null)
  }

  onClose(reload?: boolean | void) {
    if (reload) {
      this.knowledgebaseComponent.refresh()
    }
  }
}
