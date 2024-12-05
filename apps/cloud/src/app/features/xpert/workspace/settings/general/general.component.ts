import { CdkListboxModule } from '@angular/cdk/listbox'
import { CommonModule } from '@angular/common'
import { Component, effect, input, model, output, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import {
  getErrorMessage,
  IfAnimation,
  injectToastr,
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
    this.workspaceService.archive(this.workspace().id)
      .subscribe({
        next: () => {
          this.loading.set(false)
          this.archived.emit()
          this.#toastr.success('PAC.Messages.ArchivedSuccessfully', { Default: 'Archived successfully' })
        },
        error: (error) => {
          this.loading.set(false)
          this.#toastr.error(getErrorMessage(error))
        }
      }) 
  }

  delete() {
    this.loading.set(true)
    this.workspaceService.delete(this.workspace().id)
      .subscribe({
        next: () => {
          this.loading.set(false)
          this.deleted.emit()
          this.#toastr.success('PAC.Messages.DeletedSuccessfully', { Default: 'Deleted successfully' })
        },
        error: (error) => {
          this.loading.set(false)
          this.#toastr.error(getErrorMessage(error))
        }
      })
  }
}
