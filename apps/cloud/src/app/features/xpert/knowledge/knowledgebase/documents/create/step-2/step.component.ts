import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatProgressBarModule } from '@angular/material/progress-bar'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ActivatedRoute, Router } from '@angular/router'
import { linkedModel } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { omit } from 'lodash-es'
import { BehaviorSubject } from 'rxjs'
import {
  getErrorMessage,
  IKnowledgeDocument,
  KBDocumentCategoryEnum,
  KDocumentSourceType,
  KnowledgeDocumentService,
  StorageFileService,
  ToastrService
} from '../../../../../../../@core'
import { KnowledgebaseComponent } from '../../../knowledgebase.component'
import { KnowledgeDocumentsComponent } from '../../documents.component'
import { KnowledgeDocumentCreateComponent } from '../create.component'
import { KnowledgeDocumentCreateSettingsComponent } from '../settings/settings.component'

@Component({
  standalone: true,
  selector: 'xp-knowledge-document-create-step-2',
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
    KnowledgeDocumentCreateSettingsComponent
  ]
})
export class KnowledgeDocumentCreateStep2Component {
  eKDocumentSourceType = KDocumentSourceType

  readonly knowledgeDocumentService = inject(KnowledgeDocumentService)
  readonly #toastr = inject(ToastrService)
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)
  readonly storageFileService = inject(StorageFileService)
  readonly knowledgebaseComponent = inject(KnowledgebaseComponent)
  readonly documentsComponent = inject(KnowledgeDocumentsComponent)
  readonly createComponent = inject(KnowledgeDocumentCreateComponent)

  readonly knowledgebase = this.knowledgebaseComponent.knowledgebase

  readonly refresh$ = new BehaviorSubject<boolean>(true)

  readonly loading = signal(false)

  // File documents
  readonly files = this.createComponent.files
  readonly webResult = this.createComponent.webResult
  readonly selectedWebPages = this.createComponent.selectedWebPages
  // Webpage documents
  readonly webDocs = computed(() =>
    this.selectedWebPages().map((id) => this.webResult()?.docs.find((doc) => doc.metadata.scrapeId === id))
  )

  readonly documents = linkedModel({
    initialValue: [] as Partial<IKnowledgeDocument>[],
    compute: () => {
      const docs: Partial<IKnowledgeDocument>[] =
        this.files()?.map((item) => ({
          ...omit(item.document(), 'id'),
          knowledgebaseId: this.knowledgebase().id,
          sourceType: KDocumentSourceType.LocalFile,
          parserConfig: this.parserConfig(),
          // storageFileId: item.doc.storageFile.id,
          // parserConfig: item.doc.parserConfig ?? this.parserConfig(),
          // name: item.document().or,
          category: item.document().category,
          // type: item.doc.type,
          parent: this.createComponent.parentId()
            ? ({ id: this.createComponent.parentId() } as IKnowledgeDocument)
            : null
        })) ?? []
      if (this.webDocs()?.length) {
        docs.push({
          knowledgebaseId: this.knowledgebase().id,
          parserConfig: this.parserConfig(),
          sourceType: KDocumentSourceType.WebCrawl,
          name: this.createComponent.webOptions().url,
          options: this.createComponent.webOptions(),
          metadata: {
            // title: this.createComponent.webOptions().url,
            url: this.createComponent.webOptions().url,
          },
          pages: this.webDocs().map((doc) => ({
            ...doc,
            status: 'finish'
          })),
          parent: this.createComponent.parentId()
            ? ({ id: this.createComponent.parentId() } as IKnowledgeDocument)
            : null
        })
      }
      return docs
    },
    update: (value) => {
      //
    }
  })

  readonly parserConfig = this.createComponent.parserConfig

  saveAndProcess() {
    this.knowledgeDocumentService
      .createBulk(
        this.documents().map((doc) => {
          return {
            ...doc,
            parserConfig: doc.category === KBDocumentCategoryEnum.Sheet ? doc.parserConfig : this.parserConfig()
          }
        }),
        true
      )
      .subscribe({
        next: (docs) => {
          this.createComponent.documents.set(docs)
          this.createComponent.step.set(2)
        },
        error: (error) => {
          this.#toastr.error(getErrorMessage(error))
        }
      })
  }

  prevStep() {
    this.createComponent.prevStep()
  }
}
