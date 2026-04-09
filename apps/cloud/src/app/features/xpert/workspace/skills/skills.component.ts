import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, model, signal, TemplateRef, viewChild } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { IconComponent } from '@cloud/app/@shared/avatar'
import {
  FileWorkbenchComponent,
  FileWorkbenchFileLoader,
  FileWorkbenchFilesLoader,
  FileWorkbenchFileSaver
} from '@cloud/app/@shared/files'
import { XpertSkillIndexesComponent, XpertSkillRepositoriesComponent } from '@cloud/app/@shared/skills'
import { OverlayAnimation1 } from '@metad/core'
import { injectConfirmDelete, NgmSpinComponent } from '@metad/ocap-angular/common'
import { myRxResource, NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { firstValueFrom, forkJoin } from 'rxjs'
import {
  getErrorMessage,
  IconDefinition,
  injectSkillPackageAPI,
  injectToastr,
  ISkillPackage,
  ISkillRepository,
  ISkillRepositoryIndex
} from '../../../../@core'
import { XpertWorkspaceHomeComponent } from '../home/home.component'
import { XpertSkillUploadDialogComponent } from './skill-upload-dialog.component'
import { cx } from '@xpert-ai/headless-ui'

type MobilePane = 'skills' | 'tree' | 'file'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    CdkMenuModule,
    NgmI18nPipe,
    NgmSpinComponent,
    IconComponent,
    FileWorkbenchComponent,
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
  readonly cx = cx
  
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
  readonly #compactNumber = new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1
  })

  readonly registerRepositoryDialog = viewChild<TemplateRef<unknown>>('registerRepositoryDialog')
  readonly fileWorkbench = viewChild(FileWorkbenchComponent)

  readonly workspace = this.homeComponent.workspace
  readonly #skillsResource = myRxResource({
    request: () => ({
      workspaceId: this.workspace()?.id
    }),
    loader: ({ request }) =>
      request.workspaceId
        ? this.skillPackageAPI.getAllByWorkspace(request.workspaceId, {
            relations: ['skillIndex', 'skillIndex.repository']
          })
        : null
  })

  readonly #loading = signal(false)
  readonly loading = computed(() => this.#skillsResource.status() === 'loading' || this.#loading())
  readonly skills = computed(() => this.#skillsResource.value()?.items ?? [])
  readonly search = model<string>('')
  readonly selectedRepository = model<ISkillRepository | null>(null)
  readonly mobilePane = model<MobilePane>('skills')
  readonly workbenchPane = computed<'tree' | 'file'>(() => (this.mobilePane() === 'file' ? 'file' : 'tree'))

  readonly selectedSkillIds = signal<Set<string>>(new Set())
  readonly activeSkillId = signal<string | null>(null)
  readonly activeSkill = computed(() => this.skills().find((skill) => skill.id && skill.id === this.activeSkillId()) ?? null)
  readonly filteredSkills = computed(() => {
    const term = this.search().trim().toLowerCase()
    if (!term) {
      return this.skills()
    }

    return this.skills().filter((skill) =>
      [
        this.displayName(skill),
        this.skillSummary(skill),
        this.repositoryLabel(skill),
        this.providerLabel(skill),
        this.publisherLabel(skill),
        ...(skill.metadata?.tags ?? []),
        skill.skillIndex?.skillId,
        skill.packagePath
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term)
    )
  })
  readonly hasSelection = computed(() => this.selectedSkillIds().size > 0)
  readonly allSelected = computed(() => this.skills().length > 0 && this.selectedSkillIds().size === this.skills().length)
  readonly partialSelected = computed(() => {
    const total = this.skills().length
    const selected = this.selectedSkillIds().size
    return selected > 0 && selected < total
  })

  readonly registering = signal(false)
  #registerDialogRef: any = null

  readonly loadActiveSkillFiles: FileWorkbenchFilesLoader = (path?: string) => {
    const workspaceId = this.workspace()?.id
    const skillId = this.activeSkillId()
    if (!workspaceId || !skillId) {
      return []
    }
    return this.skillPackageAPI.getFiles(workspaceId, skillId, path)
  }

  readonly loadActiveSkillFile: FileWorkbenchFileLoader = (path: string) => {
    const workspaceId = this.workspace()?.id
    const skillId = this.activeSkillId()
    if (!workspaceId || !skillId) {
      throw new Error('Active skill is required')
    }
    return this.skillPackageAPI.getFile(workspaceId, skillId, path)
  }

  readonly saveActiveSkillFile: FileWorkbenchFileSaver = (path: string, content: string) => {
    const workspaceId = this.workspace()?.id
    const skillId = this.activeSkillId()
    if (!workspaceId || !skillId) {
      throw new Error('Active skill is required')
    }
    return this.skillPackageAPI.saveFile(workspaceId, skillId, path, content)
  }

  readonly #syncSelectionWithData = effect(
    () => {
      const ids = new Set(this.skills().map((skill) => skill.id).filter((id): id is string => !!id))
      this.selectedSkillIds.update((selected) => {
        const next = new Set<string>()
        selected.forEach((id) => {
          if (ids.has(id)) {
            next.add(id)
          }
        })
        return next
      })
    },
    { allowSignalWrites: true }
  )

  readonly #syncActiveSkillWithData = effect(
    () => {
      const skills = this.skills()
      const activeId = this.activeSkillId()

      if (!skills.length) {
        this.activeSkillId.set(null)
        return
      }

      if (!activeId || !skills.some((skill) => skill.id === activeId)) {
        this.activeSkillId.set(skills[0]?.id ?? null)
      }
    },
    { allowSignalWrites: true }
  )

  getSkillIcon(skill: ISkillPackage | null | undefined): IconDefinition {
    return skill?.metadata?.icon ?? this.defaultSkillIcon
  }

  displayName(skill: ISkillPackage | null | undefined): string {
    return readI18nText(skill?.metadata?.displayName) || skill?.name || skill?.metadata?.name || '-'
  }

  skillSummary(skill: ISkillPackage | null | undefined): string {
    return readI18nText(skill?.metadata?.summary) || readI18nText(skill?.metadata?.description) || '-'
  }

  repositoryLabel(skill: ISkillPackage | null | undefined): string {
    return skill?.skillIndex?.repository?.name || this.translateDefault('PAC.Skill.DirectUpload', 'Direct Upload')
  }

  providerLabel(skill: ISkillPackage | null | undefined): string {
    return skill?.skillIndex?.repository?.provider || this.translateDefault('PAC.Skill.LocalProvider', 'local')
  }

  publisherLabel(skill: ISkillPackage | null | undefined): string {
    return (
      skill?.skillIndex?.publisher?.displayName ||
      skill?.skillIndex?.publisher?.name ||
      skill?.skillIndex?.publisher?.handle ||
      skill?.metadata?.author?.name ||
      this.translateDefault('PAC.Skill.LocalAuthor', 'Local upload')
    )
  }

  formatStat(value?: number | null): string {
    return typeof value === 'number' && Number.isFinite(value) ? this.#compactNumber.format(value) : '--'
  }

  async onInstalling(skill: ISkillRepositoryIndex) {
    const workspaceId = this.workspace()?.id
    const indexId = skill.id
    if (!workspaceId || !indexId) {
      return
    }

    this.registering.set(true)
    try {
      await firstValueFrom(this.skillPackageAPI.installPackage(workspaceId, indexId))
      this.#toastr.success(
        this.#translate.instant('PAC.Skill.SkillPackageInstalled', {
          Default: 'Skill Package Installed'
        })
      )
      this.#skillsResource.reload()
    } catch (error) {
      this.#toastr.danger(getErrorMessage(error))
    } finally {
      this.registering.set(false)
    }
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
    const dialogTemplate = this.registerRepositoryDialog()
    if (!dialogTemplate) {
      return
    }

    this.#registerDialogRef = this.#dialog.open(dialogTemplate, {
      maxWidth: '80vw',
      maxHeight: '80vh',
      disableClose: true,
      backdropClass: 'xp-overlay-share-sheet',
      panelClass: 'xp-overlay-pane-share-sheet'
    })

    this.#registerDialogRef.closed?.subscribe({
      next: () => {
        this.selectedRepository.set(null)
      }
    })
  }

  closeRegisterDialog() {
    this.#registerDialogRef?.close()
  }

  async activateSkill(skill: ISkillPackage) {
    const skillId = skill.id
    if (!skillId) {
      return
    }

    if (skillId === this.activeSkillId()) {
      this.mobilePane.set('tree')
      return
    }

    const run = async () => {
      this.activeSkillId.set(skillId)
      this.mobilePane.set('tree')
    }

    const fileWorkbench = this.fileWorkbench()
    if (fileWorkbench) {
      await fileWorkbench.guardDirtyBefore(run)
    } else {
      await run()
    }
  }

  deleteSkill(skill: ISkillPackage) {
    const skillId = skill.id
    const workspaceId = this.workspace()?.id
    if (!skillId) {
      return
    }
    if (!workspaceId) {
      return
    }

    this.confirmDelete(
      {
        title: this.#translate.instant('PAC.Skill.DeleteSkillPackageTitle', {
          Default: 'Delete Skill Package'
        }),
        value: skill.name,
        information: this.#translate.instant('PAC.Skill.DeleteSkillPackageInfo', {
          Default: 'Are you sure you want to delete this skill package? This action cannot be undone.'
        })
      },
      () => {
        this.#loading.set(true)
        return this.skillPackageAPI.uninstallPackageInWorkspace(workspaceId, skillId)
      }
    ).subscribe({
      next: () => {
        this.#loading.set(false)
        this.#toastr.success(
          this.#translate.instant('PAC.Skill.SkillPackageDeleted', {
            Default: 'Skill Package Deleted'
          })
        )
        this.#skillsResource.reload()
      },
      error: (error) => {
        this.#loading.set(false)
        this.#toastr.danger(getErrorMessage(error))
      }
    })
  }

  toggleSelectAll(event: Event) {
    const checked = (event.target as HTMLInputElement).checked
    this.selectedSkillIds.set(
      checked ? new Set(this.skills().map((skill) => skill.id).filter((id): id is string => !!id)) : new Set()
    )
  }

  toggleSkillSelection(skillId: string | null | undefined, event: Event) {
    if (!skillId) {
      return
    }

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
    const workspaceId = this.workspace()?.id
    if (!workspaceId) {
      return
    }

    const ids = Array.from(this.selectedSkillIds())
    if (!ids.length) {
      return
    }

    this.confirmDelete(
      {
        title: this.#translate.instant('PAC.Skill.DeleteSkillPackageTitle', {
          Default: 'Delete Skill Package'
        }),
        value: this.#translate.instant('PAC.Skill.SelectedSkillPackages', {
          Default: `${ids.length} selected`,
          count: ids.length
        }),
        information: this.#translate.instant('PAC.Skill.DeleteSkillPackageInfo', {
          Default: 'Are you sure you want to delete this skill package? This action cannot be undone.'
        })
      },
      () => {
        this.#loading.set(true)
        return forkJoin(ids.map((id) => this.skillPackageAPI.uninstallPackageInWorkspace(workspaceId, id)))
      }
    ).subscribe({
      next: () => {
        this.#loading.set(false)
        this.selectedSkillIds.set(new Set())
        this.#toastr.success(
          this.#translate.instant('PAC.Skill.SkillPackagesDeleted', {
            Default: 'Selected Skill Packages Deleted'
          })
        )
        this.#skillsResource.reload()
      },
      error: (error) => {
        this.#loading.set(false)
        this.#toastr.danger(getErrorMessage(error))
      }
    })
  }

  private translateDefault(key: string, fallback: string) {
    const result = this.#translate.instant(key, { Default: fallback })
    return !result || result === key ? fallback : result
  }

  setWorkbenchPane(pane: 'tree' | 'file') {
    this.mobilePane.set(pane)
  }
}

function readI18nText(value: unknown) {
  if (!value) {
    return ''
  }
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'object') {
    const text = value as { en_US?: string; zh_Hans?: string }
    return text.zh_Hans || text.en_US || ''
  }
  return ''
}
