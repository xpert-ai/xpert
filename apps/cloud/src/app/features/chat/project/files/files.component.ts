import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { Router, RouterModule } from '@angular/router'
import { injectProjectService, injectToastr } from '@cloud/app/@core'
import { ChatFileListComponent } from '@cloud/app/@shared/chat/'
import { injectI18nService } from '@cloud/app/@shared/i18n'
import { NgmDndDirective } from '@metad/core'
import { injectConfirmDelete, NgmSpinComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { NGXLogger } from 'ngx-logger'
import { ChatProjectComponent } from '../project.component'

/**
 *
 */
@Component({
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    FormsModule,
    CdkMenuModule,
    TranslateModule,
    MatTooltipModule,
    NgmSpinComponent,
    NgmDndDirective,
    ChatFileListComponent
  ],
  selector: 'chat-project-files',
  templateUrl: './files.component.html',
  styleUrl: 'files.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatProjectFilesComponent {
  readonly #logger = inject(NGXLogger)
  readonly #router = inject(Router)
  readonly #dialog = inject(Dialog)
  readonly projectService = injectProjectService()
  readonly #projectComponent = inject(ChatProjectComponent)
  readonly #toastr = injectToastr()
  readonly confirmDelete = injectConfirmDelete()
  readonly i18n = injectI18nService()

  readonly project = this.#projectComponent.project
  readonly projectId = computed(() => this.project()?.id)
  readonly refresh = signal({})

  // Uploading
  readonly loading = signal(false)

  /**
   * on file drop handler
   */
  async onFileDropped(event: FileList) {
    const filesArray = Array.from(event)
    for await (const file of filesArray) {
      this.uploadFile(file)
    }
  }

  /**
   * handle file from browsing
   */
  fileBrowseHandler(event: EventTarget & { files?: FileList }) {
    this.onFileDropped(event.files)
  }

  uploadFile(file: File) {
    this.loading.set(true)
    this.projectService.uploadFile(this.projectId(), file).subscribe({
      next: (event) => {
        if (event.type === 1) {
          // Upload progress
          const progress = Math.round((100 * event.loaded) / event.total)
          this.#logger.debug(`File upload progress: ${progress}%`)
        } else if (event.type === 4) {
          // Upload complete
          this.#logger.debug('File upload complete')
          this.loading.set(false)
          this.refresh.set({})
        }
      },
      error: (error) => {
        this.loading.set(false)
        this.#logger.error('File upload failed', error)
      }
    })
  }
}
