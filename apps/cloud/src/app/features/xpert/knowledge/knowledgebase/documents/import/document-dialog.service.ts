import { Dialog } from '@angular/cdk/dialog'
import { inject, Injectable } from '@angular/core'
import {
  getErrorMessage,
  IKnowledgebase,
  injectToastr,
  KnowledgebaseService,
  KnowledgebaseStatusEnum,
  KnowledgeDocumentService
} from '@cloud/app/@core'
import { TranslateService } from '@ngx-translate/core'
import { firstValueFrom, take } from 'rxjs'

@Injectable({ providedIn: 'root' })
export class KnowledgeDocumentDialogService {
  private readonly dialog = inject(Dialog)
  private readonly api = inject(KnowledgeDocumentService)
  private readonly kbAPI = inject(KnowledgebaseService)
  private readonly toastr = injectToastr()
  private readonly translate = inject(TranslateService)
  private readonly editing = new Set<string>()
  private importing = false
  private readonly options = { backdropClass: 'backdrop-blur-xs-black', panelClass: 'xp-overlay-pane-dialog' }

  async importDocuments(
    knowledgebase: IKnowledgebase,
    parentId: string | null,
    locked: () => boolean
  ): Promise<boolean> {
    if (locked() || this.importing) return false
    this.importing = true
    try {
      const current = await firstValueFrom(this.kbAPI.getDetail(knowledgebase.id).pipe(take(1)))
      const { DocumentImportDialogComponent } = await import('./import-dialog.component')
      if (locked() || current.status === KnowledgebaseStatusEnum.REBUILDING) return false
      return !!(await firstValueFrom(
        this.dialog.open<boolean>(DocumentImportDialogComponent, {
          ...this.options,
          data: { knowledgebase: current, parentId, locked },
          ariaLabel: this.translate.instant('XP.Knowledgebase.Import.Title')
        }).closed
      ))
    } catch (error) {
      this.toastr.error(getErrorMessage(error))
      return false
    } finally {
      this.importing = false
    }
  }

  async edit(documentId: string, locked: () => boolean): Promise<boolean> {
    if (locked() || this.editing.has(documentId)) return false
    this.editing.add(documentId)
    try {
      const document = await firstValueFrom(this.api.getOneById(documentId).pipe(take(1)))
      // Model and pipeline data belong to the authorized knowledgebase detail projection.
      const knowledgebase = await firstValueFrom(this.kbAPI.getDetail(document.knowledgebaseId).pipe(take(1)))
      const { DocumentImportDialogComponent } = await import('./import-dialog.component')
      if (locked() || knowledgebase.status === KnowledgebaseStatusEnum.REBUILDING) return false
      return !!(await firstValueFrom(
        this.dialog.open<boolean>(DocumentImportDialogComponent, {
          ...this.options,
          data: { knowledgebase, parentId: null, locked, editDocument: document },
          ariaLabel: this.translate.instant('XP.Knowledgebase.ModifyProcessingSettings')
        }).closed
      ))
    } catch (error) {
      this.toastr.error(getErrorMessage(error))
      return false
    } finally {
      this.editing.delete(documentId)
    }
  }
}
