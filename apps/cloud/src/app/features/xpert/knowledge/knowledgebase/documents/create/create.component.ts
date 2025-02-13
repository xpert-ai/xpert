import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatProgressBarModule } from '@angular/material/progress-bar'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ActivatedRoute, Router } from '@angular/router'
import { WaIntersectionObserver } from '@ng-web-apis/intersection-observer'
import { TranslateModule } from '@ngx-translate/core'
import { BehaviorSubject } from 'rxjs'
import {
  IKnowledgeDocument,
  IStorageFile,
  KDocumentSourceType,
  KnowledgeDocumentService,
  StorageFileService,
  ToastrService
} from '../../../../../../@core'
import { KnowledgebaseComponent } from '../../knowledgebase.component'
import { KnowledgeDocumentsComponent } from '../documents.component'
import { KnowledgeDocumentCreateStep1Component } from './step-1/step.component'
import { KnowledgeDocumentCreateStep2Component } from './step-2/step.component'
import { KnowledgeDocumentCreateStep3Component } from './step-3/step.component'

export type TFileItem = {
  storageFile?: IStorageFile
  file: File
  doc?: IKnowledgeDocument
  extension: string
  loading?: boolean
  progress?: number
  error?: string
}

@Component({
  standalone: true,
  selector: 'xpert-knowledge-document-create',
  templateUrl: './create.component.html',
  styleUrls: ['./create.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    CdkMenuModule,
    CdkListboxModule,
    MatTooltipModule,
    MatProgressBarModule,
    WaIntersectionObserver,

    KnowledgeDocumentCreateStep1Component,
    KnowledgeDocumentCreateStep2Component,
    KnowledgeDocumentCreateStep3Component
  ]
})
export class KnowledgeDocumentCreateComponent {
  eKDocumentSourceType = KDocumentSourceType

  readonly knowledgeDocumentService = inject(KnowledgeDocumentService)
  readonly #toastr = inject(ToastrService)
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)
  readonly storageFileService = inject(StorageFileService)
  readonly knowledgebaseComponent = inject(KnowledgebaseComponent)
  readonly documentsComponent = inject(KnowledgeDocumentsComponent)

  readonly knowledgebase = this.knowledgebaseComponent.knowledgebase

  readonly refresh$ = new BehaviorSubject<boolean>(true)

  readonly loading = signal(false)

  readonly step = signal(0)

  readonly fileList = signal<TFileItem[]>([])

  constructor() {}

  nextStep() {
    this.step.update((state) => ++state)
  }

  close() {
    this.#router.navigate(['..'], { relativeTo: this.#route })
  }

  apply() {
    this.documentsComponent.refresh()
    this.close()
  }

  updateDocs(docs: IKnowledgeDocument[]) {
    this.fileList.update((state) => {
      docs.forEach((doc) => {
        const index = state.findIndex((_) => _.doc?.id === doc.id)
        if (index > -1) {
          state[index] = {
            ...state[index],
            doc: {
              ...state[index].doc,
              ...doc
            }
          }
        }
      })
      return Array.from(state)
    })
  }
}
