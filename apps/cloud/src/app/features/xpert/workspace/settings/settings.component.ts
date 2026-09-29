import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkListboxModule } from '@angular/cdk/listbox'

import { Component, computed, inject, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { ApiKeyBindingType, IfAnimation, IXpertWorkspace, XpertWorkspaceService } from 'apps/cloud/src/app/@core'
import { derivedAsync } from 'ngxtension/derived-async'
import { XpertDevelopApiKeyComponent } from '../../xpert/develop'
import { XpertWorkspaceSettingsGeneralComponent } from './general/general.component'
import { XpertWorkspaceMembersComponent } from './members/members.component'

@Component({
  selector: 'xpert-workspace-settings',
  standalone: true,
  imports: [
    FormsModule,
    CdkListboxModule,
    DragDropModule,
    TranslateModule,
    XpertWorkspaceMembersComponent,
    XpertWorkspaceSettingsGeneralComponent,
    XpertDevelopApiKeyComponent
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
  animations: [IfAnimation]
})
export class XpertWorkspaceSettingsComponent {
  readonly workspaceService = inject(XpertWorkspaceService)
  readonly apiKeyBindingType = ApiKeyBindingType

  readonly #data = inject<{ id: string }>(DIALOG_DATA)
  readonly #dialogRef = inject(DialogRef)

  readonly workspaceId = signal(this.#data.id)

  readonly workspaceRevision = signal(0)

  readonly workspace = derivedAsync(() => {
    this.workspaceRevision()
    return this.workspaceId()
      ? this.workspaceService.getOneById(this.workspaceId(), { relations: ['owner', 'members'] })
      : null
  })

  readonly owner = computed(() => this.workspace()?.owner)

  readonly selectedMenus = model<Array<'general' | 'members' | 'apiKeys'>>(['general'])
  readonly menu = computed(() => this.selectedMenus()[0])

  close(reason?: string) {
    this.#dialogRef.close(reason)
  }

  onUpdated(workspace: IXpertWorkspace) {
    if (workspace.capabilities?.canRead === false) {
      this.close('updated')
      return
    }
    this.workspaceRevision.update((revision) => revision + 1)
  }

  onDeleted() {
    this.close('deleted')
  }

  onArchived() {
    this.close('archived')
  }
}
