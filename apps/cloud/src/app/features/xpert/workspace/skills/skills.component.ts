import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, model, signal, TemplateRef, viewChild } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { NgmSelectComponent } from '@cloud/app/@shared/common'
import { IconComponent } from '@cloud/app/@shared/avatar'
import { XpertSkillIndexesComponent, XpertSkillRepositoriesComponent } from '@cloud/app/@shared/skills'
import { OverlayAnimation1 } from '@metad/core'
import { injectConfirmDelete, NgmSpinComponent } from '@metad/ocap-angular/common'
import { myRxResource, NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  getErrorMessage,
  IconDefinition,
  injectSkillPackageAPI,
  injectToastr,
  ISkillPackage,
  ISkillRepository,
  ISkillRepositoryIndex,
  XpertTableStatus
} from '../../../../@core'
import { XpertWorkspaceHomeComponent } from '../home/home.component'
import { XpertSkillUploadDialogComponent } from './skill-upload-dialog.component'


@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    RouterModule,
    CdkMenuModule,
    NgmI18nPipe,
    NgmSpinComponent,
    NgmSelectComponent,
    IconComponent,
    XpertSkillRepositoriesComponent,
    XpertSkillIndexesComponent
  ],
  selector: 'xp-workspace-skills',
  templateUrl: './skills.component.html',
  styleUrls: ['skills.component.css'],
  animations: [OverlayAnimation1],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertWorkspaceSkillsComponent {
  eXpertTableStatus = XpertTableStatus
  readonly defaultSkillIcon: IconDefinition = {
    type: 'emoji',
    value: '🧩',
    size: 20
  }

  readonly #translate = inject(TranslateService)
  readonly #dialog = inject(Dialog)
  readonly #toastr = injectToastr()
  readonly homeComponent = inject(XpertWorkspaceHomeComponent)
  readonly skillPackageAPI = injectSkillPackageAPI()
  readonly confirmDelete = injectConfirmDelete()

  // Children
  readonly registerRepositoryDialog = viewChild<TemplateRef<unknown>>('registerRepositoryDialog')

  readonly workspace = this.homeComponent.workspace
  readonly #skillsResource = myRxResource({
    request: () => {
      return {
        workspaceId: this.workspace()?.id
      }
    },
    loader: ({ request }) => {
      return request.workspaceId
        ? this.skillPackageAPI.getAllByWorkspace(request.workspaceId, {
            relations: ['skillIndex', 'skillIndex.repository']
          })
        : null
    }
  })

  readonly #loading = signal(false)
  readonly loading = computed(() => this.#skillsResource.status() === 'loading' || this.#loading())
  readonly skills = computed(() => this.#skillsResource.value()?.items)
  readonly search = model<string>('')
  readonly selectedRepository = model<ISkillRepository | null>(null)
  // Selection
  readonly selectedSkillIds = signal<Set<string>>(new Set())
  readonly hasSelection = computed(() => this.selectedSkillIds().size > 0)
  readonly allSelected = computed(() => {
    const skillList = this.skills() ?? []
    return skillList.length > 0 && this.selectedSkillIds().size === skillList.length
  })
  readonly partialSelected = computed(() => {
    const selected = this.selectedSkillIds().size
    const total = this.skills()?.length ?? 0
    return selected > 0 && selected < total
  })

  readonly registering = signal(false)
  #registerDialogRef = null

  getSkillIcon(skill: ISkillPackage | null | undefined): IconDefinition {
    return skill?.metadata?.icon ?? this.defaultSkillIcon
  }

  readonly #syncSelectionWithData = effect(() => {
    const ids = new Set((this.skills() ?? []).map((skill) => skill.id))
    this.selectedSkillIds.update((selected) => {
      const next = new Set<string>()
      selected.forEach((id) => {
        if (ids.has(id)) {
          next.add(id)
        }
      })
      return next
    })
  }, { allowSignalWrites: true })

  onInstalling(skill: ISkillRepositoryIndex) {
    this.registering.set(true)
    this.skillPackageAPI.installPackage(this.workspace()?.id, skill.id).subscribe({
      next: () => {
        this.registering.set(false)
        this.#toastr.success(
          this.#translate.instant('Pro.SkillPackageInstalled', {
            Default: 'Skill Package Installed'
          })
        )
        this.#skillsResource.reload()
      },
      error: (err) => {
        this.registering.set(false)
        this.#toastr.danger(getErrorMessage(err))
      }
    })
  }

  openUploadDialog() {
    const workspaceId = this.workspace()?.id
    if (!workspaceId) {
      return
    }

    this.#dialog
      .open<ISkillPackage[] | null>(XpertSkillUploadDialogComponent, {
        data: { workspaceId }
      })
      .closed.subscribe((result) => {
        if (result?.length) {
          this.#skillsResource.reload()
        }
      })
  }

  registerFromRepository() {
    this.#registerDialogRef = this.#dialog.open(this.registerRepositoryDialog(), {
      maxWidth: '80vw',
      maxHeight: '80vh',
      disableClose: true,
      backdropClass: 'xp-overlay-share-sheet',
      panelClass: 'xp-overlay-pane-share-sheet',
    })
    
    this.#registerDialogRef.closed.subscribe({
      next: () => {
        this.selectedRepository.set(null)
      }
    })
  }

  closeRegisterDialog() {
    this.#registerDialogRef?.close()
  }

  deleteSkill(skill: ISkillPackage) {
    this.confirmDelete({
      title: this.#translate.instant('Pro.DeleteSkillPackageTitle', {
        Default: 'Delete Skill Package'
      }),
      value: skill.name,
      information: this.#translate.instant('Pro.DeleteSkillPackageInfo', {
        Default: 'Are you sure you want to delete this skill package? This action cannot be undone.'
      })
    }, () => {
      this.#loading.set(true)
      return this.skillPackageAPI.delete(skill.id)
    }).subscribe({
      next: () => {
        this.#loading.set(false)
        this.#toastr.success(
          this.#translate.instant('Pro.SkillPackageDeleted', {
            Default: 'Skill Package Deleted'
          })
        )
        this.#skillsResource.reload()
      },
      error: (err) => {
        this.#loading.set(false)
        this.#toastr.danger(getErrorMessage(err))
      }
    })
  }

  toggleSelectAll(event: Event) {
    const checked = (event.target as HTMLInputElement).checked
    if (checked) {
      this.selectedSkillIds.set(new Set((this.skills() ?? []).map((skill) => skill.id)))
    } else {
      this.selectedSkillIds.set(new Set())
    }
  }

  toggleSkillSelection(skillId: string, event: Event) {
    const checked = (event.target as HTMLInputElement).checked
    this.selectedSkillIds.update((selected) => {
      const next = new Set(selected)
      if (checked) {
        next.add(skillId)
      } else {
        next.delete(skillId)
      }
      return next
    })
  }

  deleteSelectedSkills() {
    const ids = Array.from(this.selectedSkillIds())
    if (!ids.length) {
      return
    }

    this.confirmDelete(
      {
        title: this.#translate.instant('Pro.DeleteSkillPackageTitle', {
          Default: 'Delete Skill Package'
        }),
        value: this.#translate.instant('Pro.SelectedSkillPackages', {
          Default: `${ids.length} selected`,
          count: ids.length
        }),
        information: this.#translate.instant('Pro.DeleteSkillPackageInfo', {
          Default: 'Are you sure you want to delete this skill package? This action cannot be undone.'
        })
      },
      () => {
        this.#loading.set(true)
        return this.skillPackageAPI.uninstallPackages(ids)
      }
    ).subscribe({
      next: () => {
        this.#loading.set(false)
        this.selectedSkillIds.set(new Set())
        this.#toastr.success(
          this.#translate.instant('Pro.SkillPackagesDeleted', {
            Default: 'Selected Skill Packages Deleted'
          })
        )
        this.#skillsResource.reload()
      },
      error: (err) => {
        this.#loading.set(false)
        this.#toastr.danger(getErrorMessage(err))
      }
    })
  }
}
