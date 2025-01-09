import { CdkListboxModule } from '@angular/cdk/listbox'
import { CommonModule } from '@angular/common'
import { Component, effect, inject, input, model, output, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { injectConfirmDelete, NgmSpinComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import {
  getErrorMessage,
  IfAnimation,
  injectToastr,
  injectTranslate,
  injectWorkspaceService,
  IXpertWorkspace
} from 'apps/cloud/src/app/@core'

@Component({
  selector: 'xpert-workspace-settings-general',
  standalone: true,
  imports: [CommonModule, FormsModule, CdkListboxModule, TranslateModule, NgmSpinComponent],
  templateUrl: './general.component.html',
  styleUrl: './general.component.scss',
  animations: [IfAnimation]
})
export class XpertWorkspaceSettingsGeneralComponent {
  readonly workspaceService = injectWorkspaceService()
  readonly #toastr = injectToastr()
  readonly confirmDel = injectConfirmDelete()
  readonly i18n = injectTranslate('PAC.Xpert.Workspace')

  // Inputs
  readonly workspace = input<IXpertWorkspace>()

  // Outputs
  readonly deleted = output()
  readonly archived = output()

  readonly name = model<string>()

  readonly loading = signal(false)

  constructor() {
    effect(
      () => {
        if (this.workspace()) {
          this.name.set(this.workspace().name)
        }
      },
      { allowSignalWrites: true }
    )
  }

  update() {
    this.loading.set(true)
    this.workspaceService
      .update(this.workspace().id, {
        name: this.name()
      })
      .subscribe({
        next: () => {
          this.loading.set(false)
          this.#toastr.success('PAC.Messages.UpdatedSuccessfully', { Default: 'Updated successfully' })
        },
        error: (error) => {
          this.loading.set(false)
          this.#toastr.error(getErrorMessage(error))
        }
      })
  }

  archive() {
    this.loading.set(true)
    this.confirmDel({
        value: this.workspace().name,
        title: this.i18n()?.ArchiveWorkspace || 'Archive Workspace',
        information: this.i18n()?.ArchiveWorkspaceInfo || 'Things in the workspace will no longer be available'
      },
      this.workspaceService.archive(this.workspace().id)
    ).subscribe({
        next: () => {
          this.archived.emit()
          this.#toastr.success('PAC.Messages.ArchivedSuccessfully', { Default: 'Archived successfully' })
        },
        error: (error) => {
          this.loading.set(false)
          this.#toastr.error(getErrorMessage(error))
        },
        complete: () => {
          this.loading.set(false)
        }
      }) 
  }

  delete() {
    this.loading.set(true)
    this.confirmDel(
      {value: this.workspace().name, information: this.i18n()?.ConfirmDelWorkspace || 'The experts and toolsets contained in the workspace will be deleted.' },
      this.workspaceService.delete(this.workspace().id)
    ).subscribe({
        next: () => {
          this.deleted.emit()
          this.#toastr.success('PAC.Messages.DeletedSuccessfully', { Default: 'Deleted successfully' })
        },
        error: (error) => {
          this.loading.set(false)
          this.#toastr.error(getErrorMessage(error))
        },
        complete: () => {
          this.loading.set(false)
        }
      })
  }
}
