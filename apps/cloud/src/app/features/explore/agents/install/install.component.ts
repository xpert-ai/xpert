import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { TextFieldModule } from '@angular/cdk/text-field'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, model, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { Router, RouterModule } from '@angular/router'
import { injectWorkspace } from '@metad/cloud/state'
import { parseYAML } from '@metad/core'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { ZardSelectImports } from '@xpert-ai/headless-ui'
import {
  getErrorMessage,
  ICopilotModel,
  injectToastr,
  OrderTypeEnum,
  TAvatar,
  TXpertTeamDraft,
  TXpertTemplate,
  XpertAPIService,
  XpertTemplateService,
  XpertWorkspaceService
} from '@cloud/app/@core'
import { XpertBasicFormComponent } from '@cloud/app/@shared/xpert'
import { map, switchMap } from 'rxjs/operators'

@Component({
  standalone: true,
  selector: 'xp-explore-agent-install',
  imports: [
    CommonModule,
    TranslateModule,
    RouterModule,
    TextFieldModule,
    NgmSpinComponent,
    ...ZardSelectImports,
    XpertBasicFormComponent
  ],
  templateUrl: './install.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-components-panel-bg px-8 py-6 text-left shadow-xl'
  }
})
export class ExploreAgentInstallComponent {
  readonly #data = inject<TXpertTemplate>(DIALOG_DATA)
  readonly #dialogRef = inject(DialogRef)
  readonly #router = inject(Router)
  readonly #toastr = injectToastr()

  readonly workspaceService = inject(XpertWorkspaceService)
  readonly templateService = inject(XpertTemplateService)
  readonly xpertService = inject(XpertAPIService)
  readonly selectedWorkspace = injectWorkspace()
  readonly #workspaceTouched = signal(false)

  readonly workspaces = toSignal(
    this.workspaceService.getAllMy({ order: { updatedAt: OrderTypeEnum.DESC } }).pipe(map(({ items }) => items)),
    { initialValue: [] }
  )
  readonly defaultWorkspace = toSignal(this.workspaceService.getMyDefault(), { initialValue: null })
  readonly workspaceOptions = computed(() =>
    (this.workspaces() ?? []).map((workspace) => ({
      value: workspace.id,
      label: workspace.name
    }))
  )

  readonly originName = this.#data.name

  readonly workspace = model<string>('')
  readonly name = model<string>(this.#data.name)
  readonly description = model<string>(this.#data.description)
  readonly avatar = model<TAvatar>(this.#data.avatar)
  readonly title = model<string>(this.#data.title)
  readonly copilotModel = model<ICopilotModel>(this.#data.copilotModel)

  readonly loading = signal(false)

  constructor() {
    effect(
      () => {
        const workspaces = this.workspaces()
        const preferredWorkspaceId =
          this.defaultWorkspace()?.id ?? this.selectedWorkspace()?.id ?? workspaces?.[0]?.id ?? ''

        if (!preferredWorkspaceId) {
          return
        }

        if (this.#workspaceTouched() && this.workspace()) {
          return
        }

        if (this.workspace() !== preferredWorkspaceId) {
          this.workspace.set(preferredWorkspaceId)
        }
      },
      { allowSignalWrites: true }
    )
  }

  close() {
    this.#dialogRef.close()
  }

  selectWorkspace(value: string | number | Array<string | number>) {
    this.#workspaceTouched.set(true)
    this.workspace.set(normalizeWorkspaceValue(value))
  }

  create() {
    const xpert = {
      workspaceId: this.workspace(),
      avatar: this.avatar(),
      name: this.name(),
      description: this.description(),
      title: this.title(),
      copilotModel: this.copilotModel()
    }

    this.loading.set(true)
    this.templateService
      .getTemplate(this.#data.id)
      .pipe(
        switchMap(async (data) => parseYAML<TXpertTeamDraft>(data.export_data)),
        switchMap((draft) =>
          this.xpertService.importDSL({
            ...draft,
            team: {
              ...draft.team,
              ...xpert
            }
          })
        )
      )
      .subscribe({
        next: (xpert) => {
          this.loading.set(false)
          this.close()
          this.#router.navigate(['/xpert/x/', xpert.id])
        },
        error: (error) => {
          this.loading.set(false)
          this.#toastr.error(getErrorMessage(error))
        }
    })
  }
}

function normalizeWorkspaceValue(value: string | number | Array<string | number>): string {
  const normalized = Array.isArray(value) ? value[0] : value
  return typeof normalized === 'number' ? `${normalized}` : normalized || ''
}
