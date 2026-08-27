import { HttpEventType, HttpResponse } from '@angular/common/http'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild
} from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { ZardTooltipImports, injectConfirmUnique } from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import { catchError, filter, firstValueFrom, from, map, of, switchMap, take } from 'rxjs'
import {
  IKnowledgebase,
  IKnowledgeDocument,
  KDocumentSourceType,
  KnowledgeDocumentService,
  KnowledgebasePermission,
  KnowledgebaseService,
  KnowledgebaseStatusEnum,
  OrderTypeEnum,
  Store,
  ToastrService,
  XpertWorkspaceService,
  classificateDocumentCategory,
  getErrorMessage,
  injectTranslate,
  routeAnimations,
  uuid
} from '../../../@core'
import { EmojiAvatarComponent } from '../../../@shared/avatar'
import { DocxEditorComponent, MarkdownEditorComponent, SpreadsheetEditorComponent } from '../../../@shared/files'
import { ClawXpertBindingTargetService } from '../../chat/clawxpert/clawxpert-binding-target.service'
import {
  KnowledgeDocumentEditorKind,
  createBlankDocxFile,
  createBlankSpreadsheetFile,
  ensureFileExtension,
  isKnowledgeFolder,
  knowledgeDocumentEditorKind,
  knowledgeDocumentExtension,
  splitKnowledgebases
} from './home.utils'

type UploadedKnowledgeFile = {
  filePath: string
  fileUrl?: string
  mimeType?: string
}

@Component({
  standalone: true,
  selector: 'xpert-workspace-knowledgebases',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    TranslateModule,
    CdkMenuModule,
    ...ZardTooltipImports,
    EmojiAvatarComponent,
    MarkdownEditorComponent,
    SpreadsheetEditorComponent,
    DocxEditorComponent
  ],
  animations: [routeAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class KnowledgebaseHomeComponent {
  readonly KnowledgebasePermission = KnowledgebasePermission

  readonly knowledgebaseService = inject(KnowledgebaseService)
  readonly knowledgeDocumentService = inject(KnowledgeDocumentService)
  readonly #toastr = inject(ToastrService)
  readonly #store = inject(Store)
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)
  readonly #clawXpertBindingTargetService = inject(ClawXpertBindingTargetService)
  readonly #workspaceService = inject(XpertWorkspaceService)
  readonly confirmUnique = injectConfirmUnique()
  readonly newKnowledgebaseTitle = injectTranslate('XP.Knowledgebase.NewKnowledgebase', {
    Default: 'New knowledge base'
  })
  readonly newDocumentTitle = injectTranslate('XP.Knowledgebase.NewOnlineDocument', {
    Default: 'New document'
  })
  readonly newSpreadsheetTitle = injectTranslate('XP.Knowledgebase.NewSpreadsheet', {
    Default: 'New spreadsheet'
  })
  readonly newFolderTitle = injectTranslate('XP.Knowledgebase.NewFolder', { Default: 'New folder' })
  readonly discardChangesText = injectTranslate('XP.Knowledgebase.DiscardUnsavedChanges', {
    Default: 'Discard unsaved changes?'
  })

  readonly #clawXpertContext = toSignal(
    this.#store.selectOrganizationId().pipe(
      switchMap(() =>
        this.#clawXpertBindingTargetService.getCurrentUserTarget().pipe(
          switchMap((target) =>
            target
              ? this.#workspaceService.getAllMy(undefined, { purpose: 'authoring' }).pipe(
                  map(({ items }) => ({
                    target,
                    workspace: items.find((workspace) => workspace.id === target.workspaceId) ?? null
                  }))
                )
              : of({ target: null, workspace: null })
          ),
          catchError(() => of({ target: null, workspace: null }))
        )
      )
    ),
    { initialValue: undefined }
  )
  readonly workspaceId = computed(() => this.#clawXpertContext()?.target?.workspaceId ?? null)
  readonly canWriteWorkspace = computed(() => {
    const workspace = this.#clawXpertContext()?.workspace
    return !!workspace && this.#workspaceService.canWrite(workspace)
  })
  readonly uploadInput = viewChild.required<ElementRef<HTMLInputElement>>('uploadInput')
  readonly spreadsheetEditor = viewChild(SpreadsheetEditorComponent)
  readonly docxEditor = viewChild(DocxEditorComponent)

  readonly knowledgebases = signal<IKnowledgebase[]>([])
  readonly knowledgebaseGroups = computed(() => splitKnowledgebases(this.knowledgebases()))
  readonly personalKnowledgebases = computed(() => this.knowledgebaseGroups().personal)
  readonly teamKnowledgebases = computed(() => this.knowledgebaseGroups().team)
  readonly activeKnowledgebaseId = signal<string | null>(null)
  readonly activeKnowledgebase = computed(
    () => this.knowledgebases().find((item) => item.id === this.activeKnowledgebaseId()) ?? null
  )
  readonly vectorMutationLocked = computed(
    () => this.activeKnowledgebase()?.status === KnowledgebaseStatusEnum.REBUILDING
  )

  readonly parentStack = signal<IKnowledgeDocument[]>([])
  readonly parentId = computed(() => this.parentStack().at(-1)?.id ?? null)
  readonly documents = signal<IKnowledgeDocument[]>([])
  readonly documentSearch = signal('')
  readonly visibleDocuments = computed(() => {
    const search = this.documentSearch().trim().toLocaleLowerCase()
    const items = search
      ? this.documents().filter((document) => document.name?.toLocaleLowerCase().includes(search))
      : [...this.documents()]

    return items.sort((left, right) => {
      const folderOrder = Number(isKnowledgeFolder(right)) - Number(isKnowledgeFolder(left))
      if (folderOrder) {
        return folderOrder
      }
      return this.toTimestamp(right.updatedAt ?? right.createdAt) - this.toTimestamp(left.updatedAt ?? left.createdAt)
    })
  })

  readonly loadingKnowledgebases = signal(false)
  readonly loadingDocuments = signal(false)
  readonly mutating = signal(false)
  readonly loadError = signal<string | null>(null)

  readonly editorDocument = signal<IKnowledgeDocument | null>(null)
  readonly editorKind = signal<KnowledgeDocumentEditorKind | null>(null)
  readonly editorLoading = signal(false)
  readonly editorSaving = signal(false)
  readonly editorDirty = signal(false)
  readonly markdownContent = signal('')
  readonly docxBuffer = signal<ArrayBuffer | null>(null)
  readonly spreadsheetSourceUrl = computed(() => {
    const document = this.editorDocument()
    return document && this.editorKind() === 'spreadsheet'
      ? this.knowledgeDocumentService.originalFilePreviewSource(document.id).url
      : ''
  })

  #knowledgebaseRequestVersion = 0
  #documentRequestVersion = 0

  constructor() {
    effect(() => {
      const clawXpertContext = this.#clawXpertContext()
      if (clawXpertContext === undefined) {
        return
      }

      this.workspaceId()
      void this.loadKnowledgebases()
    })
  }

  async loadKnowledgebases(preferredId?: string) {
    const requestVersion = ++this.#knowledgebaseRequestVersion
    this.loadingKnowledgebases.set(true)
    this.loadError.set(null)

    try {
      const options = {
        relations: ['createdBy'],
        order: { updatedAt: OrderTypeEnum.DESC }
      }
      const workspaceId = this.workspaceId()
      if (!workspaceId) {
        this.knowledgebases.set([])
        this.activeKnowledgebaseId.set(null)
        this.documents.set([])
        return
      }

      const result = await firstValueFrom(this.knowledgebaseService.getAllByWorkspaceOnly(workspaceId, options))
      if (requestVersion !== this.#knowledgebaseRequestVersion) {
        return
      }

      const items = result.items ?? []
      this.knowledgebases.set(items)
      const queryId = this.#route.snapshot.queryParamMap.get('knowledgebaseId')
      const currentId = preferredId ?? queryId ?? this.activeKnowledgebaseId()
      const nextId = items.some((item) => item.id === currentId) ? currentId : (items[0]?.id ?? null)

      if (nextId) {
        await this.selectKnowledgebase(nextId)
      } else {
        this.activeKnowledgebaseId.set(null)
        this.documents.set([])
      }
    } catch (error) {
      if (requestVersion === this.#knowledgebaseRequestVersion) {
        this.loadError.set(getErrorMessage(error))
        this.knowledgebases.set([])
        this.activeKnowledgebaseId.set(null)
        this.documents.set([])
      }
    } finally {
      if (requestVersion === this.#knowledgebaseRequestVersion) {
        this.loadingKnowledgebases.set(false)
      }
    }
  }

  async selectKnowledgebase(id: string) {
    if (!id || !this.knowledgebases().some((item) => item.id === id)) {
      return
    }
    if (!this.closeEditor()) {
      return
    }

    this.activeKnowledgebaseId.set(id)
    this.parentStack.set([])
    this.documentSearch.set('')
    await this.#router.navigate([], {
      relativeTo: this.#route,
      queryParams: { knowledgebaseId: id },
      queryParamsHandling: 'merge',
      replaceUrl: true
    })
    await this.loadDocuments()
  }

  openConfiguration() {
    const knowledgebaseId = this.activeKnowledgebaseId()
    if (!knowledgebaseId || !this.canWriteWorkspace()) {
      return
    }

    void this.#router.navigate(['/xpert/knowledges', knowledgebaseId, 'configuration'])
  }

  async loadDocuments() {
    const knowledgebaseId = this.activeKnowledgebaseId()
    if (!knowledgebaseId) {
      this.documents.set([])
      return
    }

    const requestVersion = ++this.#documentRequestVersion
    this.loadingDocuments.set(true)
    this.loadError.set(null)
    try {
      const result = await firstValueFrom(
        this.knowledgeDocumentService.getAll({
          select: [
            'id',
            'name',
            'sourceType',
            'type',
            'category',
            'filePath',
            'fileUrl',
            'mimeType',
            'size',
            'status',
            'progress',
            'processMsg',
            'chunkNum',
            'createdAt',
            'updatedAt',
            'version',
            'folder'
          ],
          where: {
            knowledgebaseId,
            parent: this.parentId() ? ({ id: this.parentId() } as IKnowledgeDocument) : { $isNull: true }
          },
          relations: ['parent'],
          order: { updatedAt: OrderTypeEnum.DESC }
        })
      )
      if (requestVersion === this.#documentRequestVersion) {
        this.documents.set(result.items ?? [])
      }
    } catch (error) {
      if (requestVersion === this.#documentRequestVersion) {
        this.documents.set([])
        this.loadError.set(getErrorMessage(error))
      }
    } finally {
      if (requestVersion === this.#documentRequestVersion) {
        this.loadingDocuments.set(false)
      }
    }
  }

  async openFolder(document: IKnowledgeDocument) {
    this.parentStack.update((items) => [...items, document])
    this.documentSearch.set('')
    await this.loadDocuments()
  }

  async openBreadcrumb(index: number) {
    this.parentStack.update((items) => (index < 0 ? [] : items.slice(0, index + 1)))
    this.documentSearch.set('')
    await this.loadDocuments()
  }

  newKnowledgebase(permission: KnowledgebasePermission) {
    const workspaceId = this.workspaceId()
    if (!workspaceId || !this.canWriteWorkspace()) {
      return
    }

    this.confirmUnique<IKnowledgebase>({ title: this.newKnowledgebaseTitle() }, (name) =>
      this.knowledgebaseService.create({ name, permission, workspaceId })
    ).subscribe({
      next: (knowledgebase) => {
        this.#toastr.success('XP.Messages.CreatedSuccessfully', { Default: 'Created successfully!' })
        void this.loadKnowledgebases(knowledgebase.id)
      },
      error: (error) => this.#toastr.error(getErrorMessage(error))
    })
  }

  createFolder() {
    const knowledgebaseId = this.activeKnowledgebaseId()
    if (!knowledgebaseId || this.vectorMutationLocked() || !this.canWriteWorkspace()) {
      return
    }

    this.confirmUnique<IKnowledgeDocument>({ title: this.newFolderTitle() }, (name) =>
      this.knowledgeDocumentService.create({
        knowledgebaseId,
        sourceType: KDocumentSourceType.FOLDER,
        type: KDocumentSourceType.FOLDER,
        name,
        parent: this.parentId() ? ({ id: this.parentId() } as IKnowledgeDocument) : null
      })
    ).subscribe({
      next: () => void this.loadDocuments(),
      error: (error) => this.#toastr.error(getErrorMessage(error))
    })
  }

  createOnlineDocument(kind: 'document' | 'spreadsheet') {
    if (!this.activeKnowledgebaseId() || this.vectorMutationLocked() || !this.canWriteWorkspace()) {
      return
    }

    const title = kind === 'document' ? this.newDocumentTitle() : this.newSpreadsheetTitle()
    this.confirmUnique<IKnowledgeDocument>({ title }, (name) => from(this.createOnlineFile(kind, name))).subscribe({
      next: async (document) => {
        await this.loadDocuments()
        await this.openDocument(document)
      },
      error: (error) => this.#toastr.error(getErrorMessage(error))
    })
  }

  openUploadPicker() {
    if (!this.activeKnowledgebaseId() || this.vectorMutationLocked() || !this.canWriteWorkspace()) {
      return
    }
    this.uploadInput().nativeElement.click()
  }

  async uploadLocalDocuments(event: Event) {
    const input = event.target as HTMLInputElement
    const files = Array.from(input.files ?? [])
    input.value = ''
    if (!files.length || !this.activeKnowledgebaseId() || this.vectorMutationLocked()) {
      return
    }

    this.mutating.set(true)
    try {
      for (const file of files) {
        await this.uploadAndCreateDocument(file, true)
      }
      await this.loadDocuments()
      this.#toastr.success('XP.Messages.UploadSuccessfully', { Default: 'Uploaded successfully' })
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.mutating.set(false)
    }
  }

  async openDocument(document: IKnowledgeDocument) {
    const knowledgebaseId = this.activeKnowledgebaseId()
    if (isKnowledgeFolder(document)) {
      await this.openFolder(document)
      return
    }

    const kind = knowledgeDocumentEditorKind(document)
    if (!kind && knowledgebaseId) {
      void this.#router.navigate(['/xpert/knowledges', knowledgebaseId, 'documents', document.id], {
        queryParams: { parentId: this.parentId() }
      })
      return
    }

    this.editorDocument.set(document)
    this.editorKind.set(kind)
    this.editorDirty.set(false)
    this.markdownContent.set('')
    this.docxBuffer.set(null)

    if (kind === 'spreadsheet') {
      return
    }

    this.editorLoading.set(true)
    try {
      const file = await firstValueFrom(this.knowledgeDocumentService.downloadOriginalFile(document.id).pipe(take(1)))
      if (kind === 'markdown') {
        this.markdownContent.set(await file.text())
      } else {
        this.docxBuffer.set(await file.arrayBuffer())
      }
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
      this.closeEditor(true)
    } finally {
      this.editorLoading.set(false)
    }
  }

  updateMarkdownContent(content: string) {
    this.markdownContent.set(content)
    this.editorDirty.set(true)
  }

  async saveEditor() {
    const document = this.editorDocument()
    const kind = this.editorKind()
    if (!document || !kind || this.editorSaving() || this.vectorMutationLocked()) {
      return
    }

    try {
      let file: File | null = null
      if (kind === 'markdown') {
        file = new File([this.markdownContent()], document.name, { type: document.mimeType || 'text/markdown' })
      } else if (kind === 'spreadsheet') {
        file = await this.spreadsheetEditor()?.exportFile()
      } else {
        file = await this.docxEditor()?.save()
      }

      if (file) {
        await this.saveEditorFile(file)
      }
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    }
  }

  async saveEditorFile(file: File) {
    const document = this.editorDocument()
    if (!document || this.editorSaving()) {
      return
    }

    this.editorSaving.set(true)
    try {
      const uploaded = await this.uploadKnowledgeFile(file, document.parent?.id ?? this.parentId())
      const type = knowledgeDocumentExtension({ name: file.name, type: document.type })
      await firstValueFrom(
        this.knowledgeDocumentService
          .updateBulk(
            [
              {
                id: document.id,
                version: document.version,
                name: file.name,
                filePath: uploaded.filePath,
                fileUrl: uploaded.fileUrl,
                mimeType: uploaded.mimeType || file.type,
                size: `${file.size}`,
                type,
                category: classificateDocumentCategory({ type }),
                sourceType: KDocumentSourceType.LocalFile
              }
            ],
            true
          )
          .pipe(take(1))
      )
      await this.loadDocuments()
      const refreshed = this.documents().find((item) => item.id === document.id)
      if (refreshed) {
        this.editorDocument.set(refreshed)
      }
      this.editorDirty.set(false)
      this.spreadsheetEditor()?.markSaved()
      this.#toastr.success('XP.Messages.SavedSuccessfully', { Default: 'Saved successfully' })
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.editorSaving.set(false)
    }
  }

  closeEditor(force = false) {
    if (!force && this.editorDirty() && !window.confirm(this.discardChangesText())) {
      return false
    }
    this.editorDocument.set(null)
    this.editorKind.set(null)
    this.editorDirty.set(false)
    this.markdownContent.set('')
    this.docxBuffer.set(null)
    return true
  }

  documentIcon(document: IKnowledgeDocument) {
    if (isKnowledgeFolder(document)) {
      return 'ri-folder-3-line'
    }
    switch (knowledgeDocumentExtension(document)) {
      case 'pdf':
        return 'ri-file-pdf-2-line'
      case 'doc':
      case 'docx':
        return 'ri-file-word-2-line'
      case 'csv':
      case 'xls':
      case 'xlsx':
        return 'ri-file-excel-2-line'
      case 'ppt':
      case 'pptx':
        return 'ri-file-ppt-2-line'
      case 'md':
      case 'markdown':
      case 'mdx':
        return 'ri-file-text-line'
      default:
        return 'ri-file-line'
    }
  }

  documentIconClass(document: IKnowledgeDocument) {
    if (isKnowledgeFolder(document)) {
      return 'folder'
    }
    switch (knowledgeDocumentExtension(document)) {
      case 'pdf':
        return 'pdf'
      case 'doc':
      case 'docx':
      case 'md':
      case 'markdown':
      case 'mdx':
        return 'document'
      case 'csv':
      case 'xls':
      case 'xlsx':
        return 'spreadsheet'
      case 'ppt':
      case 'pptx':
        return 'presentation'
      default:
        return 'file'
    }
  }

  private async createOnlineFile(kind: 'document' | 'spreadsheet', name: string) {
    this.mutating.set(true)
    try {
      const fileName = kind === 'document' ? ensureFileExtension(name, 'docx') : ensureFileExtension(name, 'xlsx')
      const file =
        kind === 'document' ? await createBlankDocxFile(fileName) : await createBlankSpreadsheetFile(fileName)
      return await this.uploadAndCreateDocument(file, false)
    } finally {
      this.mutating.set(false)
    }
  }

  private async uploadAndCreateDocument(file: File, process: boolean) {
    const knowledgebaseId = this.activeKnowledgebaseId()
    if (!knowledgebaseId) {
      throw new Error('Knowledgebase is required')
    }

    const uploaded = await this.uploadKnowledgeFile(file, this.parentId())
    const type = knowledgeDocumentExtension({ name: file.name, type: file.type })
    const metadata = {
      chunkId: uuid(),
      title: file.name,
      originalFileName: file.name,
      originalFileSize: `${file.size}`,
      uploadTime: new Date().toISOString(),
      source: 'Local File'
    }
    const documents = await firstValueFrom(
      this.knowledgeDocumentService
        .createBulk(
          [
            {
              knowledgebaseId,
              parent: this.parentId() ? ({ id: this.parentId() } as IKnowledgeDocument) : null,
              sourceType: KDocumentSourceType.LocalFile,
              name: file.name,
              filePath: uploaded.filePath,
              fileUrl: uploaded.fileUrl,
              mimeType: uploaded.mimeType || file.type,
              size: `${file.size}`,
              type,
              category: classificateDocumentCategory({ type }),
              metadata
            }
          ],
          process
        )
        .pipe(take(1))
    )
    return documents[0]
  }

  private async uploadKnowledgeFile(file: File, parentId: string | null) {
    const knowledgebaseId = this.activeKnowledgebaseId()
    if (!knowledgebaseId) {
      throw new Error('Knowledgebase is required')
    }

    return await firstValueFrom(
      this.knowledgebaseService.uploadFile(knowledgebaseId, file, { parentId: parentId ?? '', path: '' }).pipe(
        filter((event): event is HttpResponse<UploadedKnowledgeFile> => event.type === HttpEventType.Response),
        map((event) => event.body),
        filter((body): body is UploadedKnowledgeFile => !!body?.filePath),
        take(1)
      )
    )
  }

  private toTimestamp(value: Date | string | null | undefined) {
    return value ? new Date(value).getTime() || 0 : 0
  }
}
