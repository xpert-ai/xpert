import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { CommonModule } from '@angular/common'
import { Component, computed, inject, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { IfAnimation, XpertWorkspaceService } from 'apps/cloud/src/app/@core'
import { derivedAsync } from 'ngxtension/derived-async'
import { XpertWorkspaceSettingsGeneralComponent } from './general/general.component'
import { XpertWorkspaceMembersComponent } from './members/members.component'
import { XpertWorkspaceModelsComponent } from './models/models.component'

@Component({
  selector: 'xpert-workspace-settings',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CdkListboxModule,
    DragDropModule,
    TranslateModule,
    XpertWorkspaceModelsComponent,
    XpertWorkspaceMembersComponent,
    XpertWorkspaceSettingsGeneralComponent
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
  animations: [IfAnimation]
})
export class XpertWorkspaceSettingsComponent {
  readonly workspaceService = inject(XpertWorkspaceService)

  readonly #data = inject<{ id: string }>(DIALOG_DATA)
  readonly #dialogRef = inject(DialogRef)

  readonly workspaceId = signal(this.#data.id)

  readonly workspace = derivedAsync(() => {
    return this.workspaceId()
      ? this.workspaceService.getOneById(this.workspaceId(), { relations: ['owner', 'members'] })
      : null
  })

  readonly owner = computed(() => this.workspace()?.owner)

  readonly selectedMenus = model<Array<'general' | 'models' | 'members'>>(['general'])
  readonly menu = computed(() => this.selectedMenus()[0])

  close(reason?: string) {
    this.#dialogRef.close(reason)
  }

  onDeleted() {
    this.close('deleted')
  }

  onArchived() {
    this.close('archived')
  }
}
