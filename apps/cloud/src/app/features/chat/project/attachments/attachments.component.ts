import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { Router, RouterModule } from '@angular/router'
import { getErrorMessage, injectProjectService, injectToastr, IXpertProjectFile } from '@cloud/app/@core'
import { injectI18nService } from '@cloud/app/@shared/i18n'
import { linkedModel } from '@metad/core'
import { injectConfirmDelete, NgmSpinComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { EMPTY } from 'rxjs'
import { map, switchMap } from 'rxjs/operators'
import { ChatProjectHomeComponent } from '../home/home.component'
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
    NgmSpinComponent
  ],
  selector: 'chat-project-attachments',
  templateUrl: './attachments.component.html',
  styleUrl: 'attachments.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatProjectAttachmentsComponent {
  readonly #router = inject(Router)
  readonly #dialog = inject(Dialog)
  readonly projectSercice = injectProjectService()
  readonly #projectComponent = inject(ChatProjectComponent)
  readonly #projectHomeComponent = inject(ChatProjectHomeComponent)
  readonly #toastr = injectToastr()
  readonly confirmDelete = injectConfirmDelete()
  readonly i18n = injectI18nService()

  readonly project = this.#projectComponent.project

  readonly files = toSignal(this.#projectHomeComponent.files$.pipe(map(({ files }) => files)))
  readonly #loading = toSignal(this.#projectHomeComponent.files$.pipe(map(({ loading }) => loading)))

  readonly loading = linkedModel({
    initialValue: null,
    compute: () => this.#loading(),
    update: () => {}
  })

  deleteFile(file: IXpertProjectFile) {
    this.confirmDelete({
      value: file.filePath,
      information: this.i18n.translate('PAC.XProject.DeleteFileFromProject', { Default: 'Delete file from project?' })
    })
      .pipe(
        switchMap((confirm) => {
          if (confirm) {
            this.loading.set(true)
            return this.projectSercice.deleteFile(this.project().id, file.id)
          }
          return EMPTY
        })
      )
      .subscribe({
        next: () => {
          this.loading.set(false)
          this.#projectHomeComponent.refreshFiles$.next()
        },
        error: (err) => {
          this.loading.set(false)
          this.#toastr.error(getErrorMessage(err))
        }
      })
  }
}
