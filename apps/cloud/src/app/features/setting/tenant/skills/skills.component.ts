import { Dialog } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { Component, inject, signal, viewChild } from '@angular/core'
import {
  getErrorMessage,
  ISkillRepository,
  ISkillRepositoryIndex,
  ISkillPackage,
  WORKSPACE_PUBLIC_SKILL_SOURCE_PROVIDER
} from '@cloud/app/@core'
import { XpertSkillRepositoriesComponent, XpertSkillRepositoryRegisterComponent } from '@cloud/app/@shared/skills'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import { SkillRepositoryService, ToastrService } from '../../../../@core/services'
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

  readonly repositoriesRef = viewChild('repositories', { read: XpertSkillRepositoriesComponent })

  readonly publicRepository = signal<ISkillRepository | null>(null)
  readonly selectedRepositoryId = signal<string | null>(null)
  readonly loadingPublicRepository = signal(true)
  readonly initializingPublicRepository = signal(false)

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
}
