import { Dialog } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { Router } from '@angular/router'
import { DocumentInterface } from '@langchain/core/documents'
import { TranslateModule } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import {
  IKnowledgebase,
  IKnowledgeDocument,
  KDocumentSourceType,
  KnowledgebaseService,
  KnowledgeDocumentService,
  OrderTypeEnum
} from '../../../../@core'
import { XpertNewKnowledgeComponent } from '../../knowledge'
import { XpertWorkspaceHomeComponent } from '../home/home.component'

type DocumentSort = 'updatedAt' | 'name'

@Component({
  standalone: true,
  selector: 'xp-xpert-workspace-knowledges-page',
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './knowledges-page.component.html',
  styleUrl: './knowledges-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertWorkspaceKnowledgesPageComponent {
  readonly #dialog = inject(Dialog)
  readonly #router = inject(Router)
  readonly #knowledgebaseService = inject(KnowledgebaseService)
  readonly #knowledgeDocumentService = inject(KnowledgeDocumentService)
  readonly homeComponent = inject(XpertWorkspaceHomeComponent)

  readonly workspace = this.homeComponent.workspace
  readonly workspaceId = computed(() => this.workspace()?.id ?? null)
  readonly canWriteWorkspace = this.homeComponent.canWriteWorkspace

  readonly knowledgebases = signal<IKnowledgebase[]>([])
  readonly activeKnowledgebaseId = signal<string | null>(null)
  readonly activeKnowledgebase = computed(
    () => this.knowledgebases().find((item) => item.id === this.activeKnowledgebaseId()) ?? null
  )
  readonly canWriteActiveKnowledgebase = computed(
    () =>
      this.canWriteWorkspace() &&
      !!this.activeKnowledgebase()?.workspaceId &&
      this.activeKnowledgebase()?.workspaceId === this.workspaceId()
  )

  readonly documents = signal<IKnowledgeDocument[]>([])
  readonly documentSearch = signal('')
  readonly documentSort = signal<DocumentSort>('updatedAt')
  readonly visibleDocuments = computed(() => {
    const term = this.documentSearch().trim().toLowerCase()
    const items = term
      ? this.documents().filter((item) =>
          [item.name, item.type, item.mimeType].filter(Boolean).join(' ').toLowerCase().includes(term)
        )
      : [...this.documents()]

    return items.sort((left, right) => {
      if (this.documentSort() === 'name') {
        return left.name.localeCompare(right.name)
      }
      return this.toTimestamp(right.updatedAt ?? right.createdAt) - this.toTimestamp(left.updatedAt ?? left.createdAt)
    })
  })

  readonly selectedDocumentId = signal<string | null>(null)
  readonly selectedDocument = computed(
    () => this.documents().find((item) => item.id === this.selectedDocumentId()) ?? null
  )
  readonly previewChunks = signal<DocumentInterface[]>([])
  readonly previewText = computed(() =>
    this.previewChunks()
      .map((chunk) => chunk.pageContent?.trim())
      .filter(Boolean)
      .join('\n\n')
  )

  readonly loadingKnowledgebases = signal(false)
  readonly loadingDocuments = signal(false)
  readonly loadingPreview = signal(false)
  readonly loadError = signal<string | null>(null)
  readonly knowledgebaseRefreshVersion = signal(0)
  readonly documentRefreshVersion = signal(0)

  #knowledgebaseRequestVersion = 0
  #documentRequestVersion = 0
  #previewRequestVersion = 0

  constructor() {
    effect(() => {
      const workspaceId = this.workspaceId()
      this.knowledgebaseRefreshVersion()
      void this.loadKnowledgebases(workspaceId)
    })

    effect(() => {
      const knowledgebaseId = this.activeKnowledgebaseId()
      this.documentRefreshVersion()
      void this.loadDocuments(knowledgebaseId)
    })
  }

  selectKnowledgebase(id: string | null) {
    this.activeKnowledgebaseId.set(id || null)
    this.documentSearch.set('')
  }

  refresh() {
    this.knowledgebaseRefreshVersion.update((value) => value + 1)
    this.documentRefreshVersion.update((value) => value + 1)
  }

  toggleDocumentSort() {
    this.documentSort.update((value) => (value === 'updatedAt' ? 'name' : 'updatedAt'))
  }

  async selectDocument(document: IKnowledgeDocument) {
    this.selectedDocumentId.set(document.id)
    this.previewChunks.set([])

    if (this.isFolder(document)) {
      return
    }

    const requestVersion = ++this.#previewRequestVersion
    this.loadingPreview.set(true)
    try {
      const chunks = await firstValueFrom(this.#knowledgeDocumentService.previewFile(document.id))
      if (requestVersion === this.#previewRequestVersion) {
        this.previewChunks.set(chunks ?? [])
      }
    } catch {
      if (requestVersion === this.#previewRequestVersion) {
        this.previewChunks.set([])
      }
    } finally {
      if (requestVersion === this.#previewRequestVersion) {
        this.loadingPreview.set(false)
      }
    }
  }

  newKnowledgebase() {
    const workspaceId = this.workspaceId()
    if (!workspaceId || !this.canWriteWorkspace()) {
      return
    }

    this.#dialog
      .open<IKnowledgebase>(XpertNewKnowledgeComponent, {
        data: { workspaceId }
      })
      .closed.subscribe((knowledgebase) => {
        if (knowledgebase?.id) {
          void this.#router.navigate(['/xpert/knowledges', knowledgebase.id], {
            queryParams: { returnTo: this.workspaceReturnTo() }
          })
        }
      })
  }

  openKnowledgebaseSettings() {
    const id = this.activeKnowledgebaseId()
    if (id && this.canWriteActiveKnowledgebase()) {
      void this.#router.navigate(['/xpert/knowledges', id, 'configuration'], {
        queryParams: { returnTo: this.workspaceReturnTo() }
      })
    }
  }

  createDocument() {
    const id = this.activeKnowledgebaseId()
    if (id && this.canWriteActiveKnowledgebase()) {
      void this.#router.navigate(['/xpert/knowledges', id, 'documents', 'create'], {
        queryParams: { returnTo: this.workspaceReturnTo() }
      })
    }
  }

  openDocument(document: IKnowledgeDocument) {
    const knowledgebaseId = this.activeKnowledgebaseId()
    if (knowledgebaseId) {
      void this.#router.navigate(['/xpert/knowledges', knowledgebaseId, 'documents', document.id], {
        queryParams: { returnTo: this.workspaceReturnTo() }
      })
    }
  }

  isFolder(document: IKnowledgeDocument) {
    return document.sourceType === KDocumentSourceType.FOLDER
  }

  documentTypeLabel(document: IKnowledgeDocument) {
    if (this.isFolder(document)) {
      return 'FOLDER'
    }
    return (document.type || document.name.split('.').pop() || 'FILE').toUpperCase()
  }

  documentIcon(document: IKnowledgeDocument) {
    if (this.isFolder(document)) {
      return 'ri-folder-3-line'
    }

    switch (this.documentTypeLabel(document)) {
      case 'PDF':
        return 'ri-file-pdf-2-line'
      case 'DOC':
      case 'DOCX':
        return 'ri-file-word-2-line'
      case 'XLS':
      case 'XLSX':
      case 'CSV':
        return 'ri-file-excel-2-line'
      case 'PPT':
      case 'PPTX':
        return 'ri-file-ppt-2-line'
      default:
        return 'ri-file-text-line'
    }
  }

  documentIconClass(document: IKnowledgeDocument) {
    switch (this.documentTypeLabel(document)) {
      case 'PDF':
        return 'text-red-500 bg-red-50'
      case 'DOC':
      case 'DOCX':
        return 'text-blue-600 bg-blue-50'
      case 'XLS':
      case 'XLSX':
      case 'CSV':
        return 'text-emerald-600 bg-emerald-50'
      case 'PPT':
      case 'PPTX':
        return 'text-orange-600 bg-orange-50'
      case 'FOLDER':
        return 'text-amber-600 bg-amber-50'
      default:
        return 'text-text-secondary bg-background-default-subtle'
    }
  }

  private async loadKnowledgebases(workspaceId: string | null) {
    const requestVersion = ++this.#knowledgebaseRequestVersion
    if (!workspaceId) {
      this.knowledgebases.set([])
      this.activeKnowledgebaseId.set(null)
      return
    }

    this.loadingKnowledgebases.set(true)
    this.loadError.set(null)
    try {
      const result = await firstValueFrom(
        this.#knowledgebaseService.getAllByWorkspace(workspaceId, {
          relations: ['createdBy'],
          order: { updatedAt: OrderTypeEnum.DESC }
        })
      )
      const items = result.items ?? []
      if (requestVersion !== this.#knowledgebaseRequestVersion) {
        return
      }

      this.knowledgebases.set(items ?? [])
      const activeId = this.activeKnowledgebaseId()
      if (!items?.some((item) => item.id === activeId)) {
        this.activeKnowledgebaseId.set(items?.[0]?.id ?? null)
      }
    } catch {
      if (requestVersion === this.#knowledgebaseRequestVersion) {
        this.knowledgebases.set([])
        this.activeKnowledgebaseId.set(null)
        this.loadError.set('knowledgebases')
      }
    } finally {
      if (requestVersion === this.#knowledgebaseRequestVersion) {
        this.loadingKnowledgebases.set(false)
      }
    }
  }

  private async loadDocuments(knowledgebaseId: string | null) {
    const requestVersion = ++this.#documentRequestVersion
    this.selectedDocumentId.set(null)
    this.previewChunks.set([])
    if (!knowledgebaseId) {
      this.documents.set([])
      return
    }

    this.loadingDocuments.set(true)
    try {
      const { items } = await firstValueFrom(
        this.#knowledgeDocumentService.getAll({
          select: [
            'id',
            'name',
            'status',
            'sourceType',
            'type',
            'category',
            'filePath',
            'createdAt',
            'updatedAt',
            'size',
            'mimeType',
            'tokenNum',
            'chunkNum',
            'metadata'
          ],
          where: {
            knowledgebaseId,
            parent: { $isNull: true }
          } as never,
          order: { updatedAt: OrderTypeEnum.DESC }
        })
      )
      if (requestVersion === this.#documentRequestVersion) {
        this.documents.set(items ?? [])
      }
    } catch {
      if (requestVersion === this.#documentRequestVersion) {
        this.documents.set([])
        this.loadError.set('documents')
      }
    } finally {
      if (requestVersion === this.#documentRequestVersion) {
        this.loadingDocuments.set(false)
      }
    }
  }

  private toTimestamp(value: Date | string | undefined) {
    if (!value) {
      return 0
    }
    const timestamp = new Date(value).getTime()
    return Number.isNaN(timestamp) ? 0 : timestamp
  }

  private workspaceReturnTo() {
    return `/xpert/w/${this.workspaceId()}/clawxpert-knowledges`
  }
}
