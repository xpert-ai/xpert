import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { Router, RouterModule } from '@angular/router'
import { EmojiAvatarComponent } from '@cloud/app/@shared/avatar'
import { CopilotModelSelectComponent } from '@cloud/app/@shared/copilot'
import { parseYAML } from '@metad/core'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { attrModel, linkedModel, myRxResource } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  AiModelTypeEnum,
  AiProviderRole,
  getErrorMessage,
  injectCopilots,
  injectToastr,
  injectXperts,
  IXpert,
  IXpertProject,
  IXpertToolset,
  TXpertProjectDSL,
  TXpertTeamDraft,
  XpertProjectService,
  XpertService,
  XpertTemplateService,
  XpertWorkspaceService
} from 'apps/cloud/src/app/@core'
import { NgmSelectComponent } from 'apps/cloud/src/app/@shared/common'
import { of } from 'rxjs'
import { map, switchMap } from 'rxjs/operators'
import { ProjectInstallToolsetComponent } from './toolset/toolset.component'
import { ProjectInstallXpertComponent } from './xpert/xpert.component'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DragDropModule,
    TranslateModule,
    RouterModule,
    MatTooltipModule,
    EmojiAvatarComponent,
    NgmSpinComponent,
    NgmSelectComponent,
    CopilotModelSelectComponent,
    ProjectInstallXpertComponent,
    ProjectInstallToolsetComponent
  ],
  selector: 'xpert-project-install',
  templateUrl: 'install.component.html',
  styleUrl: 'install.component.scss',
  animations: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: []
})
export class XpertProjectInstallComponent {
  eModelType = AiModelTypeEnum

  readonly #data = inject<{ dsl: { project: TXpertProjectDSL }; template?: { id: string } }>(DIALOG_DATA)
  readonly #dialogRef = inject(DialogRef)
  readonly projectService = inject(XpertProjectService)
  readonly workspaceService = inject(XpertWorkspaceService)
  readonly templateService = inject(XpertTemplateService)
  readonly xpertService = inject(XpertService)
  readonly #router = inject(Router)
  readonly #toastr = injectToastr()
  readonly myXperts = injectXperts()
  readonly #copilots = injectCopilots()

  readonly #refreshWS = signal(0)
  readonly #workspaceRs = myRxResource({
    request: () => this.#refreshWS(),
    loader: ({ request }) => {
      return this.workspaceService.getAllMy().pipe(map(({ items }) => items))
    }
  })
  readonly workspaceOptions = computed(() => {
    return this.#workspaceRs.value()?.map((workspace) => ({
      value: workspace.id,
      label: workspace.name
    }))
  })

  readonly dsl = signal(this.#data.dsl)
  // Models
  readonly project = linkedModel({
    initialValue: null,
    compute: () => this.dsl()?.project,
    update: (value) => {
      //
    }
  })
  readonly name = attrModel(this.project, 'name')
  readonly avatar = attrModel(this.project, 'avatar')
  readonly workspaceId = attrModel(this.project, 'workspaceId')
  readonly copilotModel = attrModel(this.project, 'copilotModel')
  readonly createdProject = signal<IXpertProject | null>(null)
  readonly xperts = computed(() => this.project()?.xperts)
  readonly toolsets = computed(() => this.project()?.toolsets)

  readonly #loading = signal(false)

  readonly primaryCopilot = computed(
    () => this.#copilots()?.find((_) => _.role === AiProviderRole.Primary)?.copilotModel
  )

  // From Marketplace
  readonly #templateRs = myRxResource({
    request: () => this.#data.template?.id,
    loader: ({ request }) => {
      return request
        ? this.templateService
            .getTemplate(request)
            .pipe(switchMap((template) => parseYAML<{ project: TXpertProjectDSL }>(template.export_data)))
        : of(null)
    }
  })

  readonly loading = computed(() => this.#loading() || this.#templateRs.status() === 'loading')

  constructor() {
    effect(
      () => {
        const dsl = this.#templateRs.value()
        if (dsl) {
          this.dsl.set(dsl)
        }
      },
      { allowSignalWrites: true }
    )
  }

  close() {
    this.#dialogRef.close()
  }

  refreshWorkspaceOptions() {
    this.#refreshWS.update((v) => v + 1)
  }

  createProject() {
    this.#loading.set(true)
    if (this.createdProject()) {
      const entity = {
          name: this.name(),
          avatar: this.avatar(),
          workspaceId: this.workspaceId(),
          settings: this.project()?.settings,
          copilotModel: this.project()?.copilotModel
        }
      this.projectService
        .update(this.createdProject().id, entity)
        .subscribe({
          next: (project) => {
            this.#loading.set(false)
            this.createdProject.update((p) => ({ ...p, ...entity}))
            this.#toastr.success('PAC.XProject.ProjectUpdated', {Default: 'Project updated successfully'})
          },
          error: (err) => {
            this.#loading.set(false)
            this.#toastr.error(getErrorMessage(err))
          }
        })
    } else {
      this.projectService
        .create({
          name: this.name(),
          avatar: this.avatar(),
          workspaceId: this.workspaceId(),
          settings: this.project()?.settings,
          copilotModel: this.project()?.copilotModel
        })
        .subscribe({
          next: (project) => {
            this.#loading.set(false)
            this.createdProject.set(project)
            this.#toastr.success('PAC.XProject.ProjectCreated', {Default: 'Project created successfully'})
          },
          error: (err) => {
            this.#loading.set(false)
            this.#toastr.error(getErrorMessage(err))
          }
        })
    }
    
  }

  createdXpert(draft: TXpertTeamDraft, xpert: IXpert) {
    if (xpert) {
      this.#loading.set(true)
      this.projectService.addXpert(this.createdProject()?.id, xpert.id).subscribe({
        next: () => {
          this.#loading.set(false)
        },
        error: (err) => {
          this.#loading.set(false)
          this.#toastr.error(getErrorMessage(err))
        }
      })
    }
  }

  createdToolset(temp: IXpertToolset, toolset: IXpertToolset) {
    if (toolset) {
      this.#loading.set(true)
      this.projectService.addToolset(this.createdProject()?.id, toolset.id).subscribe({
        next: () => {
          this.#loading.set(false)
        },
        error: (err) => {
          this.#loading.set(false)
          this.#toastr.error(getErrorMessage(err))
        }
      })
    }
  }

  done() {
    this.#dialogRef.close(this.createdProject())
  }
}
