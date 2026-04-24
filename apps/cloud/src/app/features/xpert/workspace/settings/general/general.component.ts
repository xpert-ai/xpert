import { CdkListboxModule } from '@angular/cdk/listbox'

import { Component, computed, effect, inject, input, model, output, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { injectConfirmDelete, NgmSpinComponent } from '@xpert-ai/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import {
  getErrorMessage,
  IfAnimation,
  injectToastr,
  injectTranslate,
  injectWorkspaceService,
  IXpertWorkspace,
  TXpertWorkspaceVisibility
} from 'apps/cloud/src/app/@core'

@Component({
  selector: 'xpert-workspace-settings-general',
  standalone: true,
  imports: [FormsModule, CdkListboxModule, TranslateModule, NgmSpinComponent],
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
  readonly tenantShared = model(false)

  readonly loading = signal(false)
  readonly savedVisibility = signal<TXpertWorkspaceVisibility>('private')
  readonly isTenantWorkspace = computed(() => {
    const workspace = this.workspace()
    return !!workspace && !workspace.organizationId
  })
  readonly canManageWorkspace = computed(() => this.workspaceService.canManage(this.workspace()))
  readonly canEditVisibility = computed(() => this.canManageWorkspace() && this.isTenantWorkspace())
  readonly currentVisibility = computed(() => this.savedVisibility())

  constructor() {
    effect(
      () => {
        const workspace = this.workspace()
        if (workspace) {
          const visibility: TXpertWorkspaceVisibility =
            this.isTenantWorkspace() && this.workspaceService.isTenantShared(workspace) ? 'tenant-shared' : 'private'

          this.name.set(workspace.name)
          this.savedVisibility.set(visibility)
          this.tenantShared.set(visibility === 'tenant-shared')
        }
      }
    )
  }

  async update() {
    const workspace = this.workspace()
    if (!workspace?.id || !this.canManageWorkspace()) {
      return
    }

    this.loading.set(true)
    try {
      if (this.name() !== workspace.name) {
        await firstValueFrom(
          this.workspaceService.update(workspace.id, {
            name: this.name()
          })
        )
      }

      const visibility: TXpertWorkspaceVisibility = this.tenantShared() ? 'tenant-shared' : 'private'
      if (this.canEditVisibility() && visibility !== this.currentVisibility()) {
        const updatedWorkspace = await firstValueFrom(this.workspaceService.updateVisibility(workspace.id, visibility))
        const updatedVisibility: TXpertWorkspaceVisibility = this.workspaceService.isTenantShared(updatedWorkspace)
          ? 'tenant-shared'
          : 'private'
        this.savedVisibility.set(updatedVisibility)
        this.tenantShared.set(updatedVisibility === 'tenant-shared')
      }

      this.workspaceService.refresh()
      this.#toastr.success('PAC.Messages.UpdatedSuccessfully', { Default: 'Updated successfully' })
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.loading.set(false)
    }
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
