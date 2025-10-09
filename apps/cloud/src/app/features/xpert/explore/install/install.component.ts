import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { TextFieldModule } from '@angular/cdk/text-field'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, model, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { Router, RouterModule } from '@angular/router'
import { injectWorkspace } from '@metad/cloud/state'
import { parseYAML } from '@metad/core'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import {
  getErrorMessage,
  ICopilotModel,
  injectToastr,
  TXpertTemplate,
  TAvatar,
  TXpertTeamDraft,
  XpertAPIService,
  XpertTemplateService,
  XpertWorkspaceService,
  OrderTypeEnum
} from 'apps/cloud/src/app/@core'
import { NgmSelectComponent } from 'apps/cloud/src/app/@shared/common'
import { XpertBasicFormComponent } from 'apps/cloud/src/app/@shared/xpert'
import { map, switchMap } from 'rxjs/operators'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    RouterModule,
    TextFieldModule,
    NgmSpinComponent,
    NgmSelectComponent,
    XpertBasicFormComponent
  ],
  selector: 'xpert-install',
  templateUrl: 'install.component.html',
  styleUrl: 'install.component.scss',
  animations: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: []
})
export class XpertInstallComponent {
  readonly #data = inject<TXpertTemplate>(DIALOG_DATA)
  readonly #dialogRef = inject(DialogRef)
  readonly workspaceService = inject(XpertWorkspaceService)
  readonly templateService = inject(XpertTemplateService)
  readonly xpertService = inject(XpertAPIService)
  readonly #router = inject(Router)
  readonly #toastr = injectToastr()
  readonly selectedWorkspace = injectWorkspace()

  readonly workspaces = toSignal(this.workspaceService.getAllMy({ order: { updatedAt: OrderTypeEnum.DESC } }).pipe(map(({ items }) => items)))
  readonly workspaceOptions = computed(() => {
    return this.workspaces()?.map((workspace) => ({
      value: workspace.id,
      label: workspace.name
    }))
  })

  readonly originName = this.#data.name

  // Models
  readonly workspace = model<string>(this.selectedWorkspace()?.id)
  readonly name = model<string>(this.#data.name)
  readonly description = model<string>(this.#data.description)
  readonly avatar = model<TAvatar>(this.#data.avatar)
  readonly title = model<string>(this.#data.title)
  readonly copilotModel = model<ICopilotModel>(this.#data.copilotModel)

  readonly loading = signal(false)


  close() {
    this.#dialogRef.close()
  }

  async create() {
    const xpert = {
      workspaceId: this.workspace(),
      avatar: this.avatar(),
      name: this.name(),
      description: this.description(),
      title: this.title(),
      copilotModel: this.copilotModel(),
    }

    this.loading.set(true)
    this.templateService
      .getTemplate(this.#data.id)
      .pipe(
        switchMap(async (data) => {
          return await parseYAML<TXpertTeamDraft>(data.export_data)
        }),
        switchMap((draft) => {
          return this.xpertService.importDSL({
            ...draft,
            team: {
              ...draft.team,
              ...xpert
            }
          })
        })
      )
      .subscribe({
        next: (xpert) => {
          this.loading.set(false)
          this.close()
          this.#router.navigate(['/xpert/x/', xpert.id])
        },
        error: (err) => {
          this.loading.set(false)
          this.#toastr.error(getErrorMessage(err))
        }
      })
  }
}
