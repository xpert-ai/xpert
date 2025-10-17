import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, model, signal, viewChild } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatProgressBarModule } from '@angular/material/progress-bar'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ActivatedRoute, Router } from '@angular/router'
import { SafePipe } from '@metad/core'
import { NgmCheckboxComponent } from '@metad/ocap-angular/common'
import { NgmI18nPipe, TSelectOption } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { JSONSchemaFormComponent, ParameterComponent } from 'apps/cloud/src/app/@shared/forms'
import { derivedFrom } from 'ngxtension/derived-from'
import { BehaviorSubject, catchError, of, pipe, switchMap, tap, map, startWith } from 'rxjs'
import {
  getErrorMessage,
  IKnowledgeDocumentPage,
  injectHelpWebsite,
  IntegrationService,
  KDocumentSourceType,
  KDocumentWebTypeOptions,
  KnowledgeDocumentService,
  KnowledgeFileUploader,
  ParameterTypeEnum,
  StorageFileService,
  ToastrService,
  TRagWebOptions,
} from '../../../../../../../@core'
import { KnowledgebaseComponent } from '../../../knowledgebase.component'
import { KnowledgeDocumentsComponent } from '../../documents.component'
import { KnowledgeDocumentCreateComponent } from '../create.component'
import { derivedAsync } from 'ngxtension/derived-async'
import { ContentLoaderModule } from '@ngneat/content-loader'
import { isNil, uniq } from 'lodash-es'
import { KnowledgeLocalFileComponent } from 'apps/cloud/src/app/@shared/knowledge'
import { KnowledgeFileSystemComponent } from '../file-system/file-system.component'

@Component({
  standalone: true,
  selector: 'xp-knowledge-document-create-step-1',
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
    ContentLoaderModule,
    NgmI18nPipe,
    SafePipe,
    JSONSchemaFormComponent,
    ParameterComponent,
    NgmCheckboxComponent,
    KnowledgeFileSystemComponent,
    KnowledgeLocalFileComponent
  ]
})
export class KnowledgeDocumentCreateStep1Component {
  eKDocumentSourceType = KDocumentSourceType

  readonly knowledgeDocumentAPI = inject(KnowledgeDocumentService)
  readonly integrationService = inject(IntegrationService)
  readonly #toastr = inject(ToastrService)
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)
  readonly storageFileService = inject(StorageFileService)
  readonly knowledgebaseComponent = inject(KnowledgebaseComponent)
  readonly documentsComponent = inject(KnowledgeDocumentsComponent)
  readonly createComponent = inject(KnowledgeDocumentCreateComponent)
  readonly website = injectHelpWebsite()

  readonly knowledgebase = this.knowledgebaseComponent.knowledgebase
  readonly knowledgebaseId = this.knowledgebaseComponent.paramId
  readonly parentId = this.createComponent.parentId
  readonly files = this.createComponent.files

  // Children
  readonly fileSystemForm = viewChild('fileSystemForm', {read: JSONSchemaFormComponent})

  readonly refresh$ = new BehaviorSubject<boolean>(true)

  readonly loading = signal(false)

  readonly step = signal(0)
  readonly sourceType = this.createComponent.sourceType

  readonly fileTypeOptions: TSelectOption[] = [
    {
      value: KDocumentSourceType.FILE,
      label: {
        zh_Hans: '文件',
        en_US: 'File'
      },
      description: {
        zh_Hans: '上传本地文档',
        en_US: 'Upload local files'
      }
    },
    {
      value: KDocumentSourceType.REMOTE_FILE,
      label: {
        zh_Hans: '远程文件',
        en_US: 'Remote File'
      },
      description: {
        zh_Hans: '读取远程文档',
        en_US: 'Read remote files'
      }
    },
    {
      value: KDocumentSourceType.WEB,
      label: {
        zh_Hans: '网络',
        en_US: 'Web'
      },
      description: {
        zh_Hans: '抓取网络页面文本',
        en_US: 'Scrape web page text'
      }
    }
  ]

  readonly webTypeOptions: TSelectOption[] = KDocumentWebTypeOptions
  readonly webTypes = this.createComponent.webTypes

  readonly webOptionSchema = derivedFrom(
    [this.webTypes],
    pipe(
      switchMap(([types]) => {
        if (types[0]) {
          return this.knowledgeDocumentAPI.getWebOptions(types[0].value)
        }
        return of(null)
      })
    ),
    { initialValue: null }
  )

  // readonly fileList = this.createComponent.fileList
  // readonly previewFile = signal<TFileItem>(null)
  // readonly selectedFile = signal<TFileItem>(null)
  readonly selectedFile = model<KnowledgeFileUploader | null>(null)
  readonly previewDoc = signal<IKnowledgeDocumentPage>(null)
  // readonly previewFileDocs = derivedAsync<{docs?: Document[]; loading: boolean;}>(() => {
  //   return this.previewFile()?.doc?.storageFile?.id ? this.knowledgeDocumentAPI.previewFile(this.previewFile().doc.storageFile.id).pipe(
  //     map((docs) => ({docs, loading: false})),
  //     startWith({loading: true}),
  //   ) : of(null)
  // })

  readonly expand = signal(false)

  readonly webParams = computed(() => {
    // Params value or default values
    const parametersValue = this.parametersValue()
    return this.webOptionSchema()?.options?.filter((option) => {
      if (option.when) {
        return Object.keys(option.when).every((key) => {
          const value = parametersValue?.[key]
          return option.when[key].includes(value)
        })
      }
      return true
    }).map((option) => ({...option, span: option.type === ParameterTypeEnum.BOOLEAN ? 2 : 1}))
  })

  readonly integrationProvider = computed(() => this.webOptionSchema()?.integrationProvider)
  readonly integrations = derivedAsync(() => {
    return this.integrationProvider() ? this.integrationService.getAllInOrg({
      where: {
        provider: this.integrationProvider(),
      }
    }).pipe(map(({items}) => items)) : of(null)
  })

  readonly integration = this.createComponent.integration

  readonly sourceConfig = this.createComponent.sourceConfig
  readonly webOptions = this.createComponent.webOptions
  /**
   * Actual value or default value
   */
  readonly parametersValue = computed(() => this.webOptions()?.params
    ?? this.webOptionSchema()?.options?.reduce((params, curr) => {
      if (!isNil(curr.default)) {
        params[curr.name] = curr.default
      }
      return params
    }, {}))
  readonly loadingWeb = signal(false)

  readonly webResult = this.createComponent.webResult
  readonly selectedWebPages = this.createComponent.selectedWebPages
  readonly webDocs = computed(() => this.webResult()?.docs)
  readonly duration = computed(() => this.webResult()?.duration)
  readonly webError = signal('')

  // Available
  readonly nextStepAvailable = computed(() => {
    return this.sourceType()[0] === KDocumentSourceType.FILE 
      ? this.files()?.length > 0 
      : this.sourceType()[0] === KDocumentSourceType.WEB 
        ? this.webDocs()?.length > 0 
        : this.sourceType()[0] === KDocumentSourceType.REMOTE_FILE ? !this.fileSystemForm()?.invalid : false
  })

  // File system
   readonly documentSourceStrategies = computed(() => this.createComponent.documentSourceStrategies()?.map((strategy) => ({
    value: strategy.meta.name,
    label: strategy.meta.label,
    description: strategy.meta.description,
    icon: strategy.meta.icon
  })))

  readonly fileSystemStrategy = computed(() => this.createComponent.documentSourceStrategies()?.find((strategy) => strategy.meta.name === 'file-system'))

  // readonly files = signal<FileSystemItem[]>([])

  constructor() {
    effect(() => {
      // console.log(this.parametersValue(), this.webParams())
    })
  }

  webTypeCompareWith(a, b) {
    return a?.value === b?.value
  }

  // /**
  //  * on file drop handler
  //  */
  // async onFileDropped(event) {
  //   await this.uploadStorageFile(event)
  // }

  // /**
  //  * handle file from browsing
  //  */
  // async fileBrowseHandler(event: EventTarget & { files?: FileList }) {
  //   await this.uploadStorageFile(event.files)
  // }

  // async uploadStorageFile(files: FileList) {
  //   const items = Array.from(files).map((file) => ({ file, extension: file.name.split('.').pop().toLowerCase() }))
  //   this.fileList.update((state) => [...state, ...items])

  //   await Promise.all(items.map((item) => this.upload(item)))
  // }

  // async upload(item: TFileItem) {
  //   let storageFile: IStorageFile = null
  //   item.loading = true
  //   this.storageFileService
  //     .uploadFile(item.file)
  //     .pipe(
  //       tap((event) => {
  //         switch (event.type) {
  //           case HttpEventType.UploadProgress:
  //             item.progress = (event.loaded / event.total) * 100
  //             this.fileList.update((state) => [...state])
  //             break
  //           case HttpEventType.Response:
  //             item.progress = 100
  //             storageFile = event.body
  //             break
  //         }
  //       }),
  //       catchError((error) => {
  //         item.error = getErrorMessage(error)
  //         item.loading = false
  //         this.fileList.update((state) => [...state])
  //         return of(null)
  //       })
  //     )
  //     .subscribe({
  //       complete: () => {
  //         const type = item.file.name.split('.').pop().toLowerCase()
  //         item.loading = false
  //         item.doc = {
  //           storageFile,
  //           sourceType: KDocumentSourceType.FILE,
  //           type,
  //           category: isDocumentSheet(type) ? KBDocumentCategoryEnum.Sheet : KBDocumentCategoryEnum.Text
  //         } as IKnowledgeDocument
  //         this.fileList.update((state) => state.map((_) => {
  //           if (_ === item) { // Refresh current item
  //             return {..._}
  //           }
  //           return _
  //         }))
  //       }
  //     })
  // }

  // removeFile(item: TFileItem) {
  //   item.loading = true
  //   this.fileList.update((state) => [...state])
  //   this.storageFileService.delete(item.doc.storageFile.id).subscribe({
  //     next: () => {
  //       this.fileList.update((state) => {
  //         const index = state.indexOf(item)
  //         if (index > -1) {
  //           state.splice(index, 1)
  //         }
  //         return [...state]
  //       })
  //     }
  //   })
  // }

  // selectFile(item: TFileItem) {
  //   // this.previewFile.set(item)
  // }

  closePreview() {
    this.selectedFile.set(null)
  }

  nextStep() {
    this.createComponent.nextStep()
  }

  toggleExpand() {
    this.expand.update((state) => !state)
  }

  updateParamValue(name: string, value) {
    this.webOptions.update((state) => {
      return {
        ...(state ?? {}),
        params: {
          ...this.parametersValue(),
          [name]: value
        }
      } as TRagWebOptions
    })
  }

  updateWebUrl(value: string) {
    this.webOptions.update((state) => ({...(state ?? {}), url: value}))
  }

  loadRagWebPages() {
    this.webError.set(null)
    this.loadingWeb.set(true)
    this.knowledgeDocumentAPI.loadRagWebPages(this.webTypes()[0].value, this.webOptions(), this.integration())
      .subscribe({
        next: (result) => {
          this.loadingWeb.set(false)
          this.webResult.set(result)
          this.selectedWebPages.set(result.docs.map((doc) => doc.metadata.scrapeId))
        },
        error: (err) => {
          this.webError.set(getErrorMessage(err))
          this.loadingWeb.set(false)
        }
      })
  }

  closePreviewWeb() {
    this.previewDoc.set(null)
  }

  isSelectedPage(page: IKnowledgeDocumentPage) {
    return this.selectedWebPages().includes(page.metadata.scrapeId)
  }

  togglePage(page: IKnowledgeDocumentPage, value: boolean) {
    this.selectedWebPages.update((state) => {
      return value ? uniq([...state, page.metadata.scrapeId]) : state.filter((id) => id !== page.metadata.scrapeId)
    })
  }

  connectRemoteFiles() {
    this.knowledgeDocumentAPI.connect(this.fileSystemStrategy()?.meta.name, this.sourceConfig()).subscribe({
      next: (res) => {
        this.files.set(res)
      },
      error: (err) => {
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }
}
