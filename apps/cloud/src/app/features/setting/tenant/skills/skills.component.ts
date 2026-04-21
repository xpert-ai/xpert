import { Dialog } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { Component, computed, inject, signal, viewChild } from '@angular/core'
import {
  getErrorMessage,
  ISkillRepository,
  ISkillRepositoryIndex,
  ISkillPackage,
  WORKSPACE_PUBLIC_SKILL_SOURCE_PROVIDER
} from '@cloud/app/@core'
import {
  ITemplateSkillSyncItemSummary,
  ITemplateSkillSyncRefResult,
  ITemplateSkillSyncResult,
  TemplateSkillSyncMode
} from '@xpert-ai/contracts'
import { XpertSkillRepositoriesComponent, XpertSkillRepositoryRegisterComponent } from '@cloud/app/@shared/skills'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import { SkillRepositoryService, ToastrService, XpertTemplateService } from '../../../../@core/services'
import { XpertSkillUploadDialogComponent } from '../../../xpert/workspace/skills/skill-upload-dialog.component'

@Component({
  standalone: true,
  selector: 'pac-tenant-skills',
  imports: [CommonModule, TranslateModule, XpertSkillRepositoriesComponent],
  templateUrl: './skills.component.html'
})
export class TenantSkillsComponent {
  readonly #dialog = inject(Dialog)
  readonly #skillRepositoryService = inject(SkillRepositoryService)
  readonly #toastr = inject(ToastrService)
  readonly #translate = inject(TranslateService)
  readonly #xpertTemplateService = inject(XpertTemplateService)

  readonly repositoriesRef = viewChild('repositories', { read: XpertSkillRepositoriesComponent })

  readonly publicRepository = signal<ISkillRepository | null>(null)
  readonly selectedRepositoryId = signal<string | null>(null)
  readonly loadingPublicRepository = signal(true)
  readonly initializingPublicRepository = signal(false)
  readonly syncingTemplateAssets = signal(false)
  readonly syncResult = signal<ITemplateSkillSyncResult | null>(null)

  readonly syncSummaryCards = computed(() => {
    const result = this.syncResult()
    if (!result) {
      return []
    }

    return [
      {
        key: 'repositories',
        label: 'Pro.SkillSync.Repositories',
        defaultLabel: 'Repositories',
        summary: result.summary.repositories
      },
      {
        key: 'indexes',
        label: 'Pro.SkillSync.Indexes',
        defaultLabel: 'Indexes',
        summary: result.summary.indexes
      },
      {
        key: 'bundles',
        label: 'Pro.SkillSync.Bundles',
        defaultLabel: 'Bundles',
        summary: result.summary.bundles
      },
      {
        key: 'featuredRefs',
        label: 'Pro.SkillSync.FeaturedSkills',
        defaultLabel: 'Featured refs',
        summary: result.summary.featuredRefs
      },
      {
        key: 'workspaceDefaults',
        label: 'Pro.SkillSync.WorkspaceDefaults',
        defaultLabel: 'Workspace defaults',
        summary: result.summary.workspaceDefaults
      }
    ] satisfies Array<{
      key: string
      label: string
      defaultLabel: string
      summary: ITemplateSkillSyncItemSummary
    }>
  })

  readonly unresolvedSkillRefs = computed(() => {
    const result = this.syncResult()
    if (!result) {
      return []
    }

    return [...result.featuredRefs, ...result.workspaceDefaults].filter(
      (item): item is ITemplateSkillSyncRefResult => item.status === 'missing' || item.status === 'failed'
    )
  })

  async initializePublicRepository() {
    await this.ensurePublicRepository()
  }

  async uploadPublicSkills() {
    const repository = this.publicRepository() ?? (await this.ensurePublicRepository({ silent: true }))
    if (!repository?.id) {
      return
    }

    this.#dialog
      .open<Array<ISkillPackage | ISkillRepositoryIndex> | null>(XpertSkillUploadDialogComponent, {
        data: {
          repositoryId: repository.id
        }
      })
      .closed.subscribe({
        next: (result) => {
          if (result?.length) {
            this.refreshRepositories()
          }
        }
      })
  }

  openRegisterRepositoryModal() {
    this.#dialog.open<string | null>(XpertSkillRepositoryRegisterComponent).closed.subscribe({
      next: (repositoryId) => {
        if (repositoryId) {
          this.selectedRepositoryId.set(repositoryId)
          this.refreshRepositories()
        }
      }
    })
  }

  async syncTemplateSkills() {
    await this.runTemplateSkillSync('incremental')
  }

  async forceSyncTemplateSkills() {
    const confirmed = await firstValueFrom(
      this.#toastr.confirm({
        code: 'Pro.SkillSync.ConfirmFullSync',
        params: {
          Default:
            'Force a full template sync? This will re-check repositories, indexes, and bundled workspace-public skills.'
        }
      })
    )
    if (!confirmed) {
      return
    }

    await this.runTemplateSkillSync('full')
  }

  onRepositoriesLoaded(repositories: ISkillRepository[]) {
    const repository = repositories.find((item) => item.provider === WORKSPACE_PUBLIC_SKILL_SOURCE_PROVIDER) ?? null
    this.publicRepository.set(repository)
    this.loadingPublicRepository.set(false)

    if (repository?.id && !this.selectedRepositoryId()) {
      this.selectedRepositoryId.set(repository.id)
    }
  }

  private async ensurePublicRepository(options?: { silent?: boolean }) {
    if (this.initializingPublicRepository()) {
      return this.publicRepository()
    }

    this.initializingPublicRepository.set(true)
    try {
      const repository = await firstValueFrom(this.#skillRepositoryService.ensureWorkspacePublicRepository())
      this.publicRepository.set(repository)
      this.selectedRepositoryId.set(repository.id)
      this.refreshRepositories()

      if (!options?.silent) {
        this.#toastr.success(
          this.#translate.instant('PAC.Skill.PublicRepositoryReady', {
            Default: 'The public skill repository is ready.'
          })
        )
      }

      return repository
    } catch (error) {
      this.#toastr.danger(getErrorMessage(error))
      return null
    } finally {
      this.initializingPublicRepository.set(false)
    }
  }

  private refreshRepositories() {
    this.loadingPublicRepository.set(true)
    this.repositoriesRef()?.loadRepositories()
  }

  private async runTemplateSkillSync(mode: TemplateSkillSyncMode) {
    try {
      this.syncingTemplateAssets.set(true)
      const result = await firstValueFrom(
        this.#xpertTemplateService.syncSkillAssets({
          mode,
          validateOnly: false
        })
      )
      this.syncResult.set(result)
      this.refreshRepositories()
      this.#toastr.success(
        this.#translate.instant(
          mode === 'full' ? 'Pro.SkillSync.FullSyncDone' : 'Pro.SkillSync.SyncDone',
          {
            Default:
              mode === 'full'
                ? 'Template skill assets fully synchronized.'
                : 'Template skill assets synchronized.'
          }
        )
      )
    } catch (error) {
      this.#toastr.danger(getErrorMessage(error))
    } finally {
      this.syncingTemplateAssets.set(false)
    }
  }
}
