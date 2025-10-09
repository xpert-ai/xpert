import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { Component, computed, inject, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { Router } from '@angular/router'
import { CopilotModelSelectComponent } from '@cloud/app/@shared/copilot'
import { injectI18nService } from '@cloud/app/@shared/i18n'
import { IntegrationSelectComponent } from '@cloud/app/@shared/integration'
import { PAC_API_BASE_URL } from '@metad/cloud/auth'
import { attrModel } from '@metad/core'
import { injectConfirmDelete, NgmSpinComponent } from '@metad/ocap-angular/common'
import { linkedModel, myRxResource } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  AiModelTypeEnum,
  AiProviderRole,
  getErrorMessage,
  IIntegration,
  injectCopilots,
  injectToastr,
  injectUser,
  IXpertProject,
  XpertProjectService
} from 'apps/cloud/src/app/@core'
import { EMPTY, map, switchMap } from 'rxjs'
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
    ChatProjectMembersComponent,
    IntegrationSelectComponent
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
  readonly #copilots = injectCopilots()
  // readonly integrationAPI = injectIntegrationAPI()
  readonly API_BASE_URL = inject(PAC_API_BASE_URL)

  // States
  readonly projectId = signal(this.#data.id)
  readonly #project = myRxResource<string, IXpertProject>({
    request: () => this.projectId(),
    loader: ({ request }) =>
      this.projectsService.getOneById(request, { relations: ['copilotModel', 'createdBy', 'owner', 'vcs'] })
  })

  readonly project = linkedModel({
    initialValue: null,
    compute: () => this.#project.value(),
    update: (newValue, currentValue) => {}
  })

  readonly name = computed(() => this.project()?.name)
  readonly owner = computed(() => this.project()?.owner)
  readonly copilotModel = attrModel(this.project, 'copilotModel')
  readonly primaryCopilot = computed(
    () => this.#copilots()?.find((_) => _.role === AiProviderRole.Primary)?.copilotModel
  )

  readonly integrations = model<IIntegration[]>(null)
  // readonly integrations = toSignal(this.integrationAPI.getAllInOrg().pipe(map(({ items }) => items)))
  readonly vcs = attrModel(this.project, 'vcs')
  readonly integrationId = attrModel(this.vcs, 'integrationId')

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

  cancel() {
    this.#dialogRef.close()
  }

  connectIntegration() {
    if (!this.integrationId()) {
      this.#toastr.error(this.i18nService.instant('PAC.XProject.PleaseSelectIntegration'))
      return
    }
    const integration = this.integrations().find((i) => i.id === this.integrationId())
    const openLogin = () => {
      window.location.href = `/api/${integration.provider.toLowerCase()}/${this.integrationId()}/login?projectId=${this.projectId()}&redirectUri=${encodeURIComponent(window.location.href)}`
    }
    if (this.integrationId() === this.#project.value().vcs?.integrationId) {
      openLogin()
      return
    }
    this.loading.set(true)
    this.projectsService.updateVCS(this.projectId(), {integrationId: this.integrationId()}).subscribe({
      next: () => {
        this.loading.set(false)
        openLogin()
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }
}
