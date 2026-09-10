import { Component, DestroyRef, inject, OnInit } from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { KnowledgeDocumentsComponent } from '../documents.component'
import { KnowledgeDocumentDialogService } from '../import/document-dialog.service'

/** Keep bookmarked document settings URLs working through the shared dialog. */
@Component({ standalone: true, template: '' })
export class KnowledgeDocumentSettingsRouteComponent implements OnInit {
  private readonly route = inject(ActivatedRoute)
  private readonly router = inject(Router)
  private readonly dialogs = inject(KnowledgeDocumentDialogService)
  private readonly documents = inject(KnowledgeDocumentsComponent)
  private readonly destroyRef = inject(DestroyRef)

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')
    if (id && (await this.dialogs.edit(id, () => this.destroyRef.destroyed || this.documents.vectorMutationLocked()))) {
      if (!this.destroyRef.destroyed) this.documents.refresh()
    }
    if (!this.destroyRef.destroyed) {
      await this.router.navigate(['../../'], {
        relativeTo: this.route,
        queryParamsHandling: 'preserve',
        replaceUrl: true
      })
    }
  }
}
