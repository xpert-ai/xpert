import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { Component, computed, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { Router } from '@angular/router'
import { CopilotModelSelectComponent } from '@cloud/app/@shared/copilot'
import { injectI18nService } from '@cloud/app/@shared/i18n'
import { attrModel } from '@metad/core'
import { injectConfirmDelete, NgmSpinComponent } from '@metad/ocap-angular/common'
import { linkedModel, myRxResource } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  AiModelTypeEnum,
  getErrorMessage,
  injectToastr,
  injectUser,
  IXpertProject,
  XpertProjectService
} from 'apps/cloud/src/app/@core'
import { EMPTY, switchMap } from 'rxjs'
import { ChatProjectMembersComponent } from '../members/members.component'

@Component({
  selector: 'chat-project-manage',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DragDropModule,
    TranslateModule,
    MatTooltipModule,
    CopilotModelSelectComponent,
    NgmSpinComponent,
    ChatProjectMembersComponent
  ],
  templateUrl: './manage.component.html',
  styleUrl: './manage.component.scss'
})
export class ChatProjectManageComponent {
  eModelType = AiModelTypeEnum

  readonly projectsService = inject(XpertProjectService)
  readonly #dialogRef = inject(DialogRef)
  readonly #toastr = injectToastr()
  readonly #router = inject(Router)
  readonly me = injectUser()
  readonly #data = inject<{ id: string }>(DIALOG_DATA)
  readonly confirmDelete = injectConfirmDelete()
  readonly i18nService = injectI18nService()

  // States
  readonly projectId = signal(this.#data.id)
  readonly #project = myRxResource<string, IXpertProject>({
    request: () => this.projectId(),
    loader: ({ request }) => this.projectsService.getOneById(request, {relations: ['copilotModel', 'createdBy', 'owner']}),
  })

  readonly project = linkedModel({
    initialValue: null,
    compute: () => this.#project.value(),
    update: (newValue, currentValue) => {}
  })

  readonly name = computed(() => this.project()?.name)
  readonly owner = computed(() => this.project()?.owner)
  readonly copilotModel = attrModel(this.project, 'copilotModel')

  readonly loading = signal(false)

  updateProject(project: Partial<IXpertProject>) {
    return this.projectsService.update(this.projectId(), project)
  }

  saveProject() {
    this.loading.set(true)
    this.updateProject({
      copilotModelId: this.copilotModel()?.id ?? null,
      copilotModel: this.copilotModel()
    }).subscribe({
      next: () => {
        this.loading.set(false)
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  deleteProject() {
    this.confirmDelete({
      value: this.name(),
      information: this.i18nService.instant('PAC.XProject.DeleteProjectAndAll', {
        Default: 'Delete the project and all the materials in it'
      })
    })
      .pipe(
        switchMap((confirm) => {
          if (confirm) {
            this.loading.set(true)
            return this.projectsService.delete(this.projectId())
          } else {
            return EMPTY
          }
        })
      )
      .subscribe({
        next: () => {
          this.loading.set(false)
          this.#dialogRef.close()
          this.#router.navigate(['/chat/p'])
        },
        error: (err) => {
          this.loading.set(false)
          this.#toastr.error(getErrorMessage(err))
        }
      })
  }
}
