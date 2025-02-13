import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'
import { HttpEventType } from '@angular/common/http'
import { Component, effect, inject, model, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { MatProgressBarModule } from '@angular/material/progress-bar'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ActivatedRoute, Router } from '@angular/router'
import { NgmDndDirective, SafePipe } from '@metad/core'
import { NgmCheckboxComponent, NgmInputComponent, NgmSpinComponent } from '@metad/ocap-angular/common'
import { NgmI18nPipe, TSelectOption } from '@metad/ocap-angular/core'
import { WaIntersectionObserver } from '@ng-web-apis/intersection-observer'
import { TranslateModule } from '@ngx-translate/core'
import { NgmSelectComponent } from 'apps/cloud/src/app/@shared/common'
import { Document } from 'langchain/document'
import { compact } from 'lodash-es'
import { derivedFrom } from 'ngxtension/derived-from'
import {
  BehaviorSubject,
  catchError,
  combineLatest,
  debounceTime,
  EMPTY,
  map,
  of,
  pipe,
  Subject,
  switchMap,
  tap
} from 'rxjs'
import {
  DocumentParserConfig,
  getErrorMessage,
  IKnowledgeDocument,
  IStorageFile,
  KDocumentSourceType,
  KDocumentWebTypeEnum,
  KDocumentWebTypeOptions,
  KnowledgeDocumentService,
  StorageFileService,
  ToastrService
} from '../../../../../../../@core'
import { KnowledgebaseComponent } from '../../../knowledgebase.component'
import { KnowledgeDocumentsComponent } from '../../documents.component'
import { CommonModule } from '@angular/common'
import { ParameterComponent } from 'apps/cloud/src/app/@shared/forms'
import { KnowledgeDocumentCreateComponent, TFileItem } from '../create.component'

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
  ]
})
export class KnowledgeDocumentCreateStep3Component {
  eKDocumentSourceType = KDocumentSourceType

  readonly knowledgeDocumentService = inject(KnowledgeDocumentService)
  readonly #toastr = inject(ToastrService)
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)
  readonly createComponent = inject(KnowledgeDocumentCreateComponent)

  readonly refresh$ = new BehaviorSubject<boolean>(true)

  readonly loading = signal(false)

  readonly fileList = this.createComponent.fileList
  
  // Waiting job
  readonly delayRefresh$ = new Subject<boolean>()

  constructor() {
    effect(() => {
      if (this.fileList()?.some((item) => item.doc?.status === 'running')) {
        this.delayRefresh$.next(true)
      }
    })

    this.delayRefresh$.pipe(takeUntilDestroyed(), debounceTime(5000)).subscribe(() => this.refresh())
  }

  refresh() {
    this.knowledgeDocumentService
      .getStatus(compact(this.fileList().map((item) => (item.doc?.status === 'running' ? item.doc.id : null))))
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
