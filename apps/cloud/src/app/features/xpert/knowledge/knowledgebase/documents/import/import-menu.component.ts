import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { Component, DestroyRef, inject, Injector, input, output } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import {
  getErrorMessage,
  IKnowledgebase,
  IKnowledgeDocument,
  KnowledgebaseService,
  ToastrService
} from '@cloud/app/@core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'
import { firstValueFrom, takeWhile } from 'rxjs'
import { DOCUMENT_IMPORT_SOURCES, DocumentImportSource, KnowledgePipelineImportResult } from './import-model'
import { DocumentImportDialogComponent } from './import-dialog.component'
import { DocumentImportSourceDialogComponent } from './source-dialog.component'

@Component({
  standalone: true,
  selector: 'xp-document-import-menu',
  imports: [TranslateModule, CdkMenuModule, ZardButtonComponent],
  template: `
    <button z-button [disabled]="locked()" [cdkMenuTriggerFor]="menu">
      <i class="ri-folder-add-line"></i>{{ 'XP.Knowledgebase.NewUpload' | translate }}
    </button>
    <ng-template #menu>
      <div cdkMenu class="cdk-menu__large">
        @for (source of sources; track source.id) {
          <button
            cdkMenuItem
            [cdkMenuItemDisabled]="!source.available || locked() || (source.id === 'pipeline' && !hasPipeline())"
            (click)="source.id === 'files' ? fileInput.click() : open(source.id)"
          >
            <i [class]="source.icon + ' mr-2'"></i>{{ prefix + '.' + source.key | translate }}
            @if (!source.available) {
              <span class="ml-auto pl-3 text-xs text-text-tertiary">{{ prefix + '.Unavailable' | translate }}</span>
            }
            @if (source.id === 'pipeline' && !hasPipeline()) {
              <span class="ml-auto pl-3 text-xs text-text-tertiary">{{ prefix + '.NoPipeline' | translate }}</span>
            }
          </button>
        }
        <div role="separator" class="my-1 border-t border-divider-subtle"></div>
        <button cdkMenuItem [cdkMenuItemDisabled]="locked()" (click)="createFolder.emit()">
          <i class="ri-folder-add-line mr-2"></i>{{ 'XP.Knowledgebase.NewFolder' | translate }}
        </button>
      </div>
    </ng-template>
    <input #fileInput class="hidden" type="file" multiple (change)="openFiles(fileInput.files); fileInput.value = ''" />
  `
})
export class DocumentImportMenuComponent {
  readonly knowledgebase = input.required<IKnowledgebase>()
  readonly parentId = input<string | null>(null)
  readonly locked = input(false)
  readonly hasPipeline = input(false)
  readonly imported = output<void>()
  readonly createFolder = output<void>()
  readonly dialog = inject(Dialog)
  readonly injector = inject(Injector)
  readonly translate = inject(TranslateService)
  private readonly destroyRef = inject(DestroyRef)
  private readonly knowledgebaseAPI = inject(KnowledgebaseService)
  private readonly toastr = inject(ToastrService)
  readonly prefix = 'XP.Knowledgebase.Import'
  readonly sources = DOCUMENT_IMPORT_SOURCES
  private destroyed = false
  private opening = false

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true
    })
  }

  openFiles(files: FileList | null) {
    if (files?.length) void this.open('files', Array.from(files))
  }

  async open(source: DocumentImportSource, files?: File[]) {
    if (this.opening || this.locked() || !this.sources.find((item) => item.id === source)?.available) return
    if (source === 'pipeline' && !this.hasPipeline()) return
    this.opening = true
    const knowledgebase = this.knowledgebase()
    const parentId = this.parentId()
    const options = { backdropClass: 'backdrop-blur-xs-black', panelClass: 'xp-overlay-pane-dialog' }
    try {
      if (source === 'pipeline') {
        const { KnowledgeDocumentPipelineComponent } = await import('../pipeline/pipeline.component')
        if (this.destroyed || this.locked()) return
        const result = await firstValueFrom(
          this.dialog.open<KnowledgePipelineImportResult>(KnowledgeDocumentPipelineComponent, {
            ...options,
            injector: this.injector,
            data: { parentId },
            ariaLabel: this.translate.instant(this.prefix + '.Pipeline')
          }).closed
        )
        if (result && !this.destroyed) {
          this.imported.emit()
          // Submission precedes document creation; follow the task even when the table is still empty.
          this.knowledgebaseAPI
            .pollTaskStatus(knowledgebase.id, result.taskId)
            .pipe(
              takeWhile(() => this.knowledgebase().id === knowledgebase.id),
              takeUntilDestroyed(this.destroyRef)
            )
            .subscribe({
              next: () => this.imported.emit(),
              error: (error) => {
                this.imported.emit()
                this.toastr.error(getErrorMessage(error))
              }
            })
        }
        return
      }
      let documents: Partial<IKnowledgeDocument>[] = []
      if (source === 'url' || source === 'crawl' || source === 'remote') {
        documents = await firstValueFrom(
          this.dialog.open<Partial<IKnowledgeDocument>[]>(DocumentImportSourceDialogComponent, {
            ...options,
            data: source,
            ariaLabel: this.translate.instant(this.prefix + '.' + this.sources.find((item) => item.id === source).key)
          }).closed
        )
        if (!documents?.length || this.destroyed || this.locked()) return
      }
      const result = await firstValueFrom(
        this.dialog.open<boolean>(DocumentImportDialogComponent, {
          ...options,
          data: { knowledgebase, parentId, documents, files, locked: () => this.locked() },
          ariaLabel: this.translate.instant(this.prefix + '.Title')
        }).closed
      )
      if (result && !this.destroyed) this.imported.emit()
    } finally {
      this.opening = false
    }
  }
}
