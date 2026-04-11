import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, model, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { RouterModule } from '@angular/router'
import { injectWorkspace } from '@xpert-ai/cloud/state'
import { NgmSpinComponent } from '@xpert-ai/ocap-angular/common'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ZardSelectImports } from '@xpert-ai/headless-ui'
import {
  getErrorMessage,
  injectToastr,
  ISkillRepositoryIndex,
  OrderTypeEnum,
  SkillPackageService,
  XpertWorkspaceService
} from '@cloud/app/@core'
import { map } from 'rxjs/operators'

@Component({
  standalone: true,
  selector: 'xp-explore-skill-install',
  imports: [CommonModule, RouterModule, TranslateModule, NgmSpinComponent, ...ZardSelectImports],
  templateUrl: './install.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-components-panel-bg px-8 py-6 text-left shadow-xl'
  }
})
export class ExploreSkillInstallComponent {
  readonly #dialogRef = inject(DialogRef)
  readonly #data = inject<ISkillRepositoryIndex>(DIALOG_DATA)
  readonly #skillPackageService = inject(SkillPackageService)
  readonly #workspaceService = inject(XpertWorkspaceService)
  readonly #toastr = injectToastr()
  readonly #translate = inject(TranslateService)
  readonly #selectedWorkspace = injectWorkspace()

  readonly item = this.#data
  readonly #workspaceTouched = signal(false)
  readonly defaultWorkspace = toSignal(this.#workspaceService.getMyDefault(), { initialValue: null })
  readonly workspace = model<string>('')
  readonly loading = signal(false)

  readonly workspaces = toSignal(
    this.#workspaceService.getAllMy({ order: { updatedAt: OrderTypeEnum.DESC } }).pipe(map(({ items }) => items)),
    { initialValue: [] }
  )

  readonly workspaceOptions = computed(() =>
    (this.workspaces() ?? []).map((workspace) => ({
      value: workspace.id,
      label: workspace.name
    }))
  )

  constructor() {
    effect(
      () => {
        const workspaces = this.workspaces()
        const preferredWorkspaceId =
          this.defaultWorkspace()?.id ?? this.#selectedWorkspace()?.id ?? workspaces?.[0]?.id ?? ''

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

  install() {
    const workspaceId = this.workspace()
    if (!workspaceId || !this.item?.id) {
      return
    }

    this.loading.set(true)
    this.#skillPackageService.installPackage(workspaceId, this.item.id).subscribe({
      next: () => {
        this.loading.set(false)
        this.#toastr.success(
          this.#translate.instant('PAC.Explore.SkillInstallSuccess', { Default: 'Skill installed successfully' })
        )
        this.#dialogRef.close(this.item)
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
