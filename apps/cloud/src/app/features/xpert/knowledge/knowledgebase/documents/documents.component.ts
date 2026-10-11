import { animate, state, style, transition, trigger } from '@angular/animations'
import { DialogRef } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { NgTemplateOutlet } from '@angular/common'
import { Component, TemplateRef } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import {
  XpCommonModule,
  XpDialogActionGroupDirective,
  XpDialogFrameImports,
  XpI18nPipe,
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardCheckboxComponent,
  ZardIconComponent,
  ZardInputDirective,
  ZardInputGroupComponent,
  ZardStepperImports,
  ZardSwitchComponent,
  ZardTableImports,
  ZardTooltipImports
} from '@xpert-ai/headless-ui'
import { combineLatest, EMPTY, finalize, firstValueFrom, forkJoin, Observable, startWith, switchMap, take } from 'rxjs'
import {
  getErrorMessage,
  IKnowledgeDocument,
  IXpert,
  KBDocumentStatusEnum,
  KBMetadataFieldDef,
  KDocumentSourceType,
  MetadataFieldType,
  OrderTypeEnum
} from '../../../../../@core'
import { KnowledgeDocIdComponent, KnowledgeTaskComponent } from '../../../../../@shared/knowledge'
import { openWorkbenchFilePreviewDialog } from '../../../../assistant/workbench-file-preview-dialog.component'
import { DocumentTagsCellComponent } from '../../tags/document-tags-cell.component'
import { KnowledgeDocumentCoverPreviewComponent } from './document-cover-preview.component'
import { DocumentGraphProgressComponent } from './document-graph-progress.component'
import { DocumentProgressWidthDirective } from './document-progress-column'
import {
  DocumentStatusFilter,
  getOriginalFileName,
  getOriginalFilesZipName,
  isSystemManagedDocument,
  mergeFolderBrowserItems,
  normalizeMoveFolderPath,
  triggerOriginalFileDownload,
  withoutSetValue,
  withSetValue
} from './document-view-model'
import { DocumentViewState } from './document-view-state'
import { DocumentWikiProgressComponent } from './document-wiki-progress.component'
import { DocumentImportMenuComponent } from './import/import-menu.component'
import { KnowledgeDocumentInspectorComponent } from './knowledge-document-inspector'
import { validateOriginalFileResponse } from './original-file-preview'
import { ParserCoverageComponent } from './parser-coverage.component'

@Component({
  standalone: true,
  selector: 'xp-knowledgebase-documents',
  templateUrl: './documents.component.html',
  styleUrls: ['./documents.component.scss'],
  imports: [
    ...XpDialogFrameImports,
    XpDialogActionGroupDirective,
    KnowledgeDocumentInspectorComponent,
    ParserCoverageComponent,
    DocumentTagsCellComponent,
    DocumentImportMenuComponent,
    RouterModule,
    FormsModule,
    NgTemplateOutlet,
    TranslateModule,
    CdkMenuModule,
    ...ZardTooltipImports,
    ...ZardTableImports,
    ...ZardStepperImports,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardCheckboxComponent,
    ZardIconComponent,
    ZardInputDirective,
    ZardInputGroupComponent,
    ZardSwitchComponent,
    XpCommonModule,
    KnowledgeDocIdComponent,
    XpI18nPipe,
    KnowledgeDocumentCoverPreviewComponent,
    DocumentWikiProgressComponent,
    DocumentGraphProgressComponent,
    DocumentProgressWidthDirective
  ],
  animations: [
    trigger('detailExpand', [
      state('collapsed,void', style({ height: '0px', minHeight: '0' })),
      state('expanded', style({ height: '*' })),
      transition('expanded <=> collapsed', animate('225ms cubic-bezier(0.4, 0.0, 0.2, 1)'))
    ])
  ]
})
export class KnowledgeDocumentsComponent extends DocumentViewState {
  setStatusFilter(filter: DocumentStatusFilter) {
    this.statusFilter.set(filter)
  }

  isStatusFilterActive(filter: DocumentStatusFilter) {
    return this.statusFilter() === filter
  }

  folderChildCount(documentId: string) {
    return this.folderChildCounts()[documentId] ?? { documentCount: 0, folderCount: 0 }
  }

  folderBrowserPath(document: IKnowledgeDocument) {
    return normalizeMoveFolderPath([document.folder, document.name].filter(Boolean).join('/')) || document.name
  }

  isFolderBrowserExpanded(documentId: string) {
    return this.folderBrowserExpandedIds().has(documentId)
  }

  isFolderBrowserNodeLoading(documentId: string) {
    return this.folderBrowserLoadingIds().has(documentId)
  }

  async toggleFolderBrowserNode(document: IKnowledgeDocument) {
    if (document.sourceType !== KDocumentSourceType.FOLDER) {
      await this.selectFolderBrowserDocument(document)
      return
    }

    if (this.folderBrowserExpandedIds().has(document.id)) {
      this.folderBrowserExpandedIds.update((ids) => withoutSetValue(ids, document.id))
      return
    }

    this.folderBrowserExpandedIds.update((ids) => withSetValue(ids, document.id))
    if (this.folderBrowserLoadedIds().has(document.id)) {
      return
    }

    this.folderBrowserLoadingIds.update((ids) => withSetValue(ids, document.id))
    try {
      const children = await this.getFolderBrowserChildren(document.id)
      if (!this.folderBrowserRootId()) {
        return
      }
      this.folderBrowserItems.update((items) => mergeFolderBrowserItems(items, children))
      this.folderBrowserLoadedIds.update((ids) => withSetValue(ids, document.id))
    } catch (err) {
      this._toastr.error(getErrorMessage(err))
      this.folderBrowserExpandedIds.update((ids) => withoutSetValue(ids, document.id))
    } finally {
      this.folderBrowserLoadingIds.update((ids) => withoutSetValue(ids, document.id))
    }
  }

  openFolder(document: IKnowledgeDocument) {
    this._router.navigate(['.'], { relativeTo: this._route, queryParams: { parentId: document.id } })
  }

  async uploadIntoFolder(document: IKnowledgeDocument) {
    if (this.vectorMutationLocked()) {
      return
    }
    if (
      await this.documentDialogs.importDocuments(this.knowledgebase(), document.id, () => this.vectorMutationLocked())
    ) {
      this.refresh()
    }
  }

  async selectFolderBrowserDocument(document: IKnowledgeDocument) {
    this.documentInspectorDismissed.set(false)
    this.folderBrowserSelectedDocument.set(document)
    this.selectedDocumentId.set(document.id)
    try {
      const completeDocument = await firstValueFrom(
        this.knowledgeDocumentAPI.getById(document.id, { relations: ['parent', 'storageFile'] }).pipe(take(1))
      )
      if (this.selectedDocumentId() === document.id) {
        this.folderBrowserSelectedDocument.set(completeDocument)
      }
    } catch (err) {
      this._toastr.error(getErrorMessage(err))
    }
  }

  async loadFolderBrowser(folder: IKnowledgeDocument) {
    const rootId = folder.id
    this.folderBrowserRootId.set(rootId)
    this.folderBrowserItems.set([])
    this.folderBrowserExpandedIds.set(new Set())
    this.folderBrowserLoadedIds.set(new Set([rootId]))
    this.folderBrowserLoadingIds.set(new Set())
    this.folderBrowserLoading.set(true)
    try {
      const children = await this.getFolderBrowserChildren(rootId)
      if (this.folderBrowserRootId() === rootId) {
        this.folderBrowserItems.set(children)
      }
    } catch (err) {
      if (this.folderBrowserRootId() === rootId) {
        this.folderBrowserItems.set([])
        this._toastr.error(getErrorMessage(err))
      }
    } finally {
      if (this.folderBrowserRootId() === rootId) {
        this.folderBrowserLoading.set(false)
      }
    }
  }

  async getFolderBrowserChildren(parentId: string) {
    const knowledgebaseId = this.knowledgebase()?.id
    if (!knowledgebaseId) {
      return []
    }

    const { items } = await firstValueFrom(
      this.knowledgeDocumentAPI
        .getAll({
          select: ['id', 'name', 'sourceType', 'type', 'status', 'folder', 'updatedAt', 'version'],
          where: {
            knowledgebaseId,
            parent: { id: parentId } as IKnowledgeDocument
          },
          relations: ['parent'],
          order: { name: OrderTypeEnum.ASC }
        })
        .pipe(take(1))
    )
    return items
  }

  resetFolderBrowser() {
    this.folderBrowserRootId.set(null)
    this.folderBrowserItems.set([])
    this.folderBrowserLoading.set(false)
    this.folderBrowserExpandedIds.set(new Set())
    this.folderBrowserLoadedIds.set(new Set())
    this.folderBrowserLoadingIds.set(new Set())
  }

  refreshFolderChildCounts(documents: IKnowledgeDocument[]) {
    const knowledgebaseId = this.knowledgebase()?.id
    const folderIds = documents
      .filter((document) => document.sourceType === KDocumentSourceType.FOLDER)
      .map((document) => document.id)
    this.folderChildCounts.set({})
    if (!knowledgebaseId || !folderIds.length) {
      return
    }

    const requestedFolderIds = new Set(folderIds)
    this.knowledgeDocumentAPI
      .getFolderChildCounts(knowledgebaseId, folderIds)
      .pipe(take(1))
      .subscribe({
        next: (counts) => {
          // Ignore a response from a folder that is no longer visible after navigation or refresh.
          const currentFolderIds = new Set(
            this._data()
              .filter((document) => document.sourceType === KDocumentSourceType.FOLDER)
              .map((document) => document.id)
          )
          if (
            requestedFolderIds.size !== currentFolderIds.size ||
            [...requestedFolderIds].some((folderId) => !currentFolderIds.has(folderId))
          ) {
            return
          }
          this.folderChildCounts.set(
            Object.fromEntries(
              counts.map((count) => [
                count.folderId,
                { documentCount: count.documentCount, folderCount: count.folderCount }
              ])
            )
          )
        },
        error: () => this.folderChildCounts.set({})
      })
  }

  refresh() {
    this.refresh$.next(true)
  }

  canDownloadOriginalFile(doc: IKnowledgeDocument) {
    return doc.sourceType !== KDocumentSourceType.FOLDER && !isSystemManagedDocument(doc) && !!doc.filePath
  }

  canViewOriginalFile(doc: IKnowledgeDocument) {
    return this.canDownloadOriginalFile(doc)
  }

  isOriginalFileViewing(id: string) {
    return this.viewingOriginalFileIds().has(id)
  }

  viewOriginalFile(doc: IKnowledgeDocument, event?: MouseEvent) {
    event?.stopPropagation()
    if (!this.canViewOriginalFile(doc) || this.isOriginalFileViewing(doc.id)) {
      return
    }

    this.markOriginalFileViewing(doc.id, true)
    this.knowledgeDocumentAPI
      .downloadOriginalFile(doc.id)
      .pipe(
        switchMap((blob) => validateOriginalFileResponse(blob, doc)),
        finalize(() => this.markOriginalFileViewing(doc.id, false))
      )
      .subscribe({
        next: (blob) => {
          const objectUrl = URL.createObjectURL(blob)
          try {
            const dialogRef = openWorkbenchFilePreviewDialog(this._dialog, {
              id: doc.id,
              name: getOriginalFileName(doc),
              mimeType: blob.type || doc.storageFile?.mimetype,
              url: objectUrl,
              previewUrl: objectUrl
            })
            dialogRef.closed.pipe(take(1)).subscribe(() => URL.revokeObjectURL(objectUrl))
          } catch (err) {
            URL.revokeObjectURL(objectUrl)
            this._toastr.error(getErrorMessage(err))
          }
        },
        error: (err) => {
          this._toastr.error(getErrorMessage(err))
        }
      })
  }

  isOriginalFileDownloading(id: string) {
    return this.downloadingOriginalFileIds().has(id)
  }

  selectedDownloadableOriginalFileDocuments() {
    return this._data().filter((doc) => this.selectionModel.isSelected(doc.id) && this.canDownloadOriginalFile(doc))
  }

  hasSelectedDownloadableOriginalFiles() {
    return this.selectedDownloadableOriginalFileDocuments().length > 0
  }

  downloadOriginalFile(doc: IKnowledgeDocument, event?: MouseEvent) {
    event?.stopPropagation()
    if (!this.canDownloadOriginalFile(doc) || this.isOriginalFileDownloading(doc.id)) {
      return
    }

    this.markOriginalFileDownloading(doc.id, true)
    this.knowledgeDocumentAPI
      .downloadOriginalFile(doc.id)
      .pipe(finalize(() => this.markOriginalFileDownloading(doc.id, false)))
      .subscribe({
        next: (blob) => {
          triggerOriginalFileDownload(blob, getOriginalFileName(doc))
        },
        error: (err) => {
          this._toastr.error(getErrorMessage(err))
        }
      })
  }

  downloadSelectedOriginalFiles() {
    const docs = this.selectedDownloadableOriginalFileDocuments()
    if (!docs.length || this.downloadingSelectedOriginalFiles()) {
      this._toastr.warning(
        this._translate.instant('XP.Knowledgebase.NoOriginalFilesToDownload', {
          Default: 'No downloadable original files are available.'
        })
      )
      return
    }

    this.downloadingSelectedOriginalFiles.set(true)
    this.knowledgeDocumentAPI
      .downloadOriginalFiles(docs.map((doc) => doc.id))
      .pipe(finalize(() => this.downloadingSelectedOriginalFiles.set(false)))
      .subscribe({
        next: (blob) => {
          triggerOriginalFileDownload(blob, getOriginalFilesZipName(this.knowledgebase()?.name))
        },
        error: (err) => {
          this._toastr.error(getErrorMessage(err))
        }
      })
  }

  markOriginalFileDownloading(id: string, downloading: boolean) {
    this.downloadingOriginalFileIds.update((ids) => {
      const next = new Set(ids)
      if (downloading) {
        next.add(id)
      } else {
        next.delete(id)
      }
      return next
    })
  }

  markOriginalFileViewing(id: string, viewing: boolean) {
    this.viewingOriginalFileIds.update((ids) => {
      const next = new Set(ids)
      if (viewing) {
        next.add(id)
      } else {
        next.delete(id)
      }
      return next
    })
  }

  backHome() {
    this._router.navigate(['.'], { relativeTo: this._route, queryParams: { parentId: null } })
  }

  createFolder() {
    if (this.vectorMutationLocked()) {
      return
    }
    this.confirmUnique<IKnowledgeDocument>(
      {
        title: this._translate.instant('XP.Knowledgebase.NewFolder', { Default: 'New Folder' })
      },
      (name: string) => {
        return name
          ? this.knowledgeDocumentAPI.create({
              sourceType: KDocumentSourceType.FOLDER,
              name: name,
              knowledgebaseId: this.knowledgebase().id,
              parent: this.parentId() ? ({ id: this.parentId() } as IKnowledgeDocument) : null
            })
          : EMPTY
      }
    ).subscribe({
      next: (doc) => {
        this.refresh()
      },
      error: (err) => {
        this.handleMutationError(err)
      }
    })
  }

  deleteDocument(doc: IKnowledgeDocument) {
    if (this.vectorMutationLocked()) {
      return
    }
    this.confirmDelete(
      {
        value: doc.id,
        information: doc.name
      },
      this.knowledgeDocumentAPI.delete(doc.id, doc.version)
    ).subscribe({
      next: () => {
        this.knowledgebaseComponent.documentNum.update((num) => num - 1)
        this.refresh()
      },
      error: (err) => {
        this.handleMutationError(err)
      }
    })
  }

  updateParserConfig(document: IKnowledgeDocument, config: Partial<IKnowledgeDocument['parserConfig']>) {
    this.knowledgeDocumentAPI
      .update(document.id, {
        version: document.version,
        parserConfig: { ...(document.parserConfig ?? {}), ...config } as IKnowledgeDocument['parserConfig']
      })
      .subscribe({
        next: () => {
          this.refresh()
        },
        error: (err) => {
          this.handleMutationError(err)
        }
      })
  }

  startParsing(row: IKnowledgeDocument) {
    if (this.vectorMutationLocked()) {
      return
    }
    row.status = KBDocumentStatusEnum.RUNNING
    this.knowledgeDocumentAPI.startParsing(row.id).subscribe({
      next: () => {
        this.refresh()
      },
      error: (err) => {
        this._toastr.error(getErrorMessage(err))
      }
    })
  }

  openXpert(xpert: IXpert) {
    window.open(['/xpert/x', xpert.id, 'agents'].join('/'), '_blank')
  }

  isAllSelected() {
    const numSelected = this.selectionModel.selected.length
    const numRows = this.selectableDocuments().length
    return numRows > 0 && numSelected === numRows
  }

  isPartialSelected() {
    return (
      this.selectionModel.selected.length > 0 && this.selectionModel.selected.length < this.selectableDocuments().length
    )
  }

  selectAll(checked: boolean) {
    if (checked) {
      this.selectionModel.select(...this.selectableDocuments().map((row) => row.id))
    } else {
      this.selectionModel.clear()
    }
  }

  selectedDocuments() {
    return this.selectionModel.selected
      .map((id) => this._data().find((document) => document.id === id))
      .filter((document): document is IKnowledgeDocument => !!document && !isSystemManagedDocument(document))
  }

  openMoveSelectedDialog(template: TemplateRef<unknown>) {
    const knowledgebaseId = this.knowledgebase()?.id
    if (!knowledgebaseId || !this.selectionModel.hasValue() || this.vectorMutationLocked()) {
      return
    }

    this.moveTargetFolderId.set(this.parentId() ?? null)
    this.moveFolderSearch.set('')
    this.moveFolderOptions.set([])
    this.moveFolderLoading.set(true)
    this._moveDialogRef = this._dialog.open(template, {
      width: '32rem',
      maxWidth: 'calc(100vw - 2rem)',
      disableClose: true,
      backdropClass: 'xp-overlay-share-sheet',
      panelClass: 'xp-overlay-pane-card'
    })
    this._moveDialogRef.closed.pipe(take(1)).subscribe(() => {
      this._moveDialogRef = null
      this.moveFolderSearch.set('')
    })

    this.knowledgeDocumentAPI
      .getAll({
        select: ['id', 'name', 'sourceType', 'folder'],
        where: {
          knowledgebaseId,
          sourceType: KDocumentSourceType.FOLDER
        },
        order: { folder: OrderTypeEnum.ASC, name: OrderTypeEnum.ASC }
      })
      .pipe(
        take(1),
        finalize(() => this.moveFolderLoading.set(false))
      )
      .subscribe({
        next: ({ items }) => {
          this.moveFolderOptions.set(
            items
              .map((folder) => {
                const parentPath = normalizeMoveFolderPath(folder.folder)
                const path = normalizeMoveFolderPath([parentPath, folder.name].filter(Boolean).join('/'))
                return {
                  id: folder.id,
                  name: folder.name,
                  path,
                  depth: parentPath ? parentPath.split('/').length : 0
                }
              })
              .sort((left, right) => left.path.localeCompare(right.path, this._translate.currentLanguage))
          )
        },
        error: (err) => {
          this._toastr.error(getErrorMessage(err))
          this.closeMoveSelectedDialog()
        }
      })
  }

  closeMoveSelectedDialog() {
    this._moveDialogRef?.close()
    this._moveDialogRef = null
  }

  moveSelectedDocuments() {
    const knowledgebaseId = this.knowledgebase()?.id
    const documents = this.selectedDocuments()
    if (
      !knowledgebaseId ||
      !documents.length ||
      !this.moveDestinationChanged() ||
      this.movingSelectedDocuments() ||
      this.vectorMutationLocked()
    ) {
      return
    }

    this.movingSelectedDocuments.set(true)
    forkJoin(
      documents.map((document) =>
        this.knowledgeDocumentAPI.move(document.id, {
          knowledgebaseId,
          parentId: this.moveTargetFolderId(),
          version: document.version
        })
      )
    )
      .pipe(finalize(() => this.movingSelectedDocuments.set(false)))
      .subscribe({
        next: () => {
          const movedCount = documents.length
          this.selectionModel.clear()
          this.closeMoveSelectedDialog()
          this.refresh()
          this._toastr.success(
            this._translate.instant('XP.Knowledgebase.DocumentsMoved', {
              Default: `${movedCount} document(s) moved`,
              count: movedCount
            })
          )
        },
        error: (err) => {
          this.handleMutationError(err)
          // A concurrent batch can partially succeed before one item returns a conflict.
          // Refresh so the list always reflects the server's actual folder membership.
          this.refresh()
        }
      })
  }

  handleMutationError(err: { status?: number }) {
    this._toastr.error(getErrorMessage(err))
    if (err?.status === 409) {
      this.refresh()
    }
  }

  updateDocument(id: string, changes: Partial<IKnowledgeDocument>) {
    const document = this._data().find((item) => item.id === id)
    this.isLoading.set(true)
    this.knowledgeDocumentAPI.update(id, { ...changes, version: changes.version ?? document?.version }).subscribe({
      next: () => {
        this.isLoading.set(false)
        this.refresh()
      },
      error: (err) => {
        this.isLoading.set(false)
        this.handleMutationError(err)
      }
    })
  }

  deleteSelected() {
    if (this.vectorMutationLocked()) {
      return
    }
    this.isLoading.set(true)
    this.knowledgeDocumentAPI.deleteBulk(this.selectedDocuments()).subscribe({
      next: () => {
        this.isLoading.set(false)
        this.knowledgebaseComponent.documentNum.update((num) => num - this.selectionModel.selected.length)
        this.selectionModel.clear()
        this.refresh()
      },
      error: (err) => {
        this.isLoading.set(false)
        this.handleMutationError(err)
      }
    })
  }

  enableSelected() {
    this.isLoading.set(true)
    this.knowledgeDocumentAPI
      .updateBulk(
        this.selectedDocuments().map((document) => ({ id: document.id, disabled: false, version: document.version }))
      )
      .subscribe({
        next: () => {
          this.isLoading.set(false)
          this.selectionModel.clear()
          this.refresh()
        },
        error: (err) => {
          this.isLoading.set(false)
          this.handleMutationError(err)
        }
      })
  }

  disableSelected() {
    this.isLoading.set(true)
    this.knowledgeDocumentAPI
      .updateBulk(
        this.selectedDocuments().map((document) => ({ id: document.id, disabled: true, version: document.version }))
      )
      .subscribe({
        next: () => {
          this.isLoading.set(false)
          this.selectionModel.clear()
          this.refresh()
        },
        error: (err) => {
          this.isLoading.set(false)
          this.handleMutationError(err)
        }
      })
  }

  renameDoc(doc: IKnowledgeDocument) {
    this.confirmUnique(
      {
        title: this._translate.instant('XP.ACTIONS.Rename', { Default: 'Rename' }),
        value: doc.name
      },
      (name: string) => {
        return name ? this.knowledgeDocumentAPI.update(doc.id, { name, version: doc.version }) : EMPTY
      }
    ).subscribe({
      next: () => {
        this.refresh()
      },
      error: (err) => {
        this.handleMutationError(err)
      }
    })
  }

  enableDoc(doc: IKnowledgeDocument) {
    this.isLoading.set(true)
    this.knowledgeDocumentAPI.update(doc.id, { disabled: false, version: doc.version }).subscribe({
      next: () => {
        this.isLoading.set(false)
        this.refresh()
      },
      error: (err) => {
        this.isLoading.set(false)
        this.handleMutationError(err)
      }
    })
  }

  disableDoc(doc: IKnowledgeDocument) {
    this.isLoading.set(true)
    this.knowledgeDocumentAPI.update(doc.id, { disabled: true, version: doc.version }).subscribe({
      next: () => {
        this.isLoading.set(false)
        this.refresh()
      },
      error: (err) => {
        this.isLoading.set(false)
        this.handleMutationError(err)
      }
    })
  }

  reprocess(docs: string[]) {
    if (this.vectorMutationLocked()) {
      return
    }
    const calls: Observable<any>[] = []
    const documents = docs
      .map((id) => this._data().find((doc) => doc.id === id))
      .filter((doc) => !!doc) as IKnowledgeDocument[]
    const standDocs = documents.filter((doc) => !doc.sourceConfig)
    if (standDocs.length) {
      calls.push(this.knowledgeDocumentAPI.startParsing(standDocs.map((doc) => doc.id)))
    }
    const pipelineDocs = documents.filter((doc) => !!doc.sourceConfig)
    if (pipelineDocs.length) {
      const knowledgebaseId = this.knowledgebase().id
      calls.push(
        this.kbAPI
          .createTask(knowledgebaseId, {
            taskType: 'document_reprocess',
            status: 'running', // Start processing immediately
            documents: pipelineDocs.map((doc) => ({ id: doc.id }) as IKnowledgeDocument)
          })
          .pipe(switchMap((task) => this.kbAPI.pollTaskStatus(knowledgebaseId, task.id).pipe(startWith(task))))
      )
    }
    if (calls.length > 0) {
      combineLatest(calls)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (task) => {
            this.refresh()
          },
          error: (err) => {
            this._toastr.error(getErrorMessage(err))
          }
        })
    }
  }

  openTask(doc: IKnowledgeDocument) {
    this._dialog.open(KnowledgeTaskComponent, {
      width: '800px',
      data: {
        knowledgebase: this.knowledgebase(),
        documentId: doc.id
      },
      backdropClass: 'backdrop-blur-xs-black',
      panelClass: 'xp-overlay-pane-dialog',
      maxWidth: 'calc(100vw - 32px)'
    })
  }

  async openChunkSettings(document: IKnowledgeDocument) {
    if (this.vectorMutationLocked()) {
      return
    }
    if (await this.documentDialogs.edit(document.id, () => this.vectorMutationLocked())) {
      this.refresh()
    }
  }

  openMetadataDialog(template: TemplateRef<unknown>) {
    this._dialog.open(template, {
      width: '900px',
      maxWidth: 'calc(100vw - 32px)',
      backdropClass: 'backdrop-blur-xs-black',
      panelClass: 'xp-overlay-pane-dialog'
    })
  }

  addMetadataField() {
    this.metadataSchema.update((schema) => {
      const newField: KBMetadataFieldDef = {
        key: 'new_field_' + (schema?.length ?? 0),
        type: 'string',
        scope: 'document'
      }
      return [...(schema ?? []), newField]
    })
  }

  removeMetadata(index: number) {
    this.metadataSchema.update((schema) => {
      const updatedSchema = [...(schema ?? [])]
      updatedSchema.splice(index, 1)
      return updatedSchema
    })
  }

  updateMetadataField(index: number, key: keyof KBMetadataFieldDef, value: any) {
    this.metadataSchema.update((schema) => {
      const updatedSchema = [...(schema ?? [])]
      updatedSchema[index] = {
        ...updatedSchema[index],
        [key]: value
      }
      return updatedSchema
    })
  }

  updateMetadataType(index: number, type: MetadataFieldType) {
    this.metadataSchema.update((schema) => {
      const updatedSchema = [...(schema ?? [])]
      updatedSchema[index] = {
        ...updatedSchema[index],
        type,
        ...(type === 'enum'
          ? { enumValues: updatedSchema[index].enumValues?.length ? updatedSchema[index].enumValues : ['value'] }
          : { enumValues: undefined })
      }
      return updatedSchema
    })
  }

  updateMetadataEnumValues(index: number, value: string) {
    this.updateMetadataField(
      index,
      'enumValues',
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    )
  }

  saveMetadataSchema(ref: DialogRef<unknown>) {
    this.isLoading.set(true)
    this.knowledgebaseComponent.knowledgebaseAPI
      .update(this.knowledgebase().id, {
        metadataSchema: (this.metadataSchema() ?? []).map((field) => ({
          ...field,
          key: field.key.trim(),
          scope: field.scope ?? 'document'
        }))
      })
      .subscribe({
        next: () => {
          this.isLoading.set(false)
          this._toastrService.success(
            this._translate.instant('XP.Knowledgebase.MetadataSchemaSaved', {
              Default: 'Metadata schema saved successfully'
            })
          )
          ref.close()
          this.knowledgebaseComponent.refresh()
        },
        error: (err) => {
          this.isLoading.set(false)
          this._toastrService.error(getErrorMessage(err))
        }
      })
  }
}
