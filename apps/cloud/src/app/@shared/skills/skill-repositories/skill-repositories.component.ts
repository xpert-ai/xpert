import { Dialog } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { afterNextRender, Component, effect, inject, input, model, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { getErrorMessage, ISkillRepository, ISkillRepositoryIndex } from '@cloud/app/@core'
import { injectConfirmDelete } from '@metad/ocap-angular/common'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { finalize } from 'rxjs'
import { SkillRepositoryService, ToastrService } from '../../../@core/services'
import { XpertSkillRepositoryRegisterComponent } from '../register/register.component'
import { XpertSkillRepositoryComponent } from '../skill-repository/skill-repository.component'

@Component({
  standalone: true,
  selector: 'xp-skill-repositories',
  templateUrl: './skill-repositories.component.html',
  styleUrls: ['./skill-repositories.component.scss'],
  imports: [CommonModule, RouterModule, FormsModule, ReactiveFormsModule, TranslateModule]
})
export class XpertSkillRepositoriesComponent {
  readonly repositoryService = inject(SkillRepositoryService)
  readonly toastr = inject(ToastrService)
  readonly confirmDelete = injectConfirmDelete()
  readonly #translate = inject(TranslateService)
  readonly #dialog = inject(Dialog)

  // Inputs
  readonly readonlyMode = input<boolean>(false, { alias: 'readonly' })
  readonly selectedRepositoryId = model<string | null>(null)
  readonly selectedRepository = model<ISkillRepository | null>(null)

  readonly repositories = signal<ISkillRepository[]>([])

  readonly loadingRepos = signal(false)
  readonly savingRepo = signal(false)

  readonly loading = signal(false)

  constructor() {
    effect(
      () => {
        if (this.selectedRepositoryId()) {
          this.selectedRepository.set(this.repositories().find((repo) => repo.id === this.selectedRepositoryId()))
        }
      },
      { allowSignalWrites: true }
    )
    afterNextRender(() => {
      this.loadRepositories()
    })
  }

  loadRepositories() {
    this.loadingRepos.set(true)
    const repositories$ = this.readonlyMode()
      ? this.repositoryService.getAvailables()
      : this.repositoryService.getAllInOrg()

    repositories$
      .pipe(finalize(() => this.loadingRepos.set(false)))
      .subscribe({
        next: ({ items }) => {
          this.repositories.set(items ?? [])
          // if (!this.selectedRepositoryId() && items?.length) {
          //   this.selectedRepositoryId.set(items[0].id)
          // }
        },
        error: (err) => {
          this.toastr.error(getErrorMessage(err))
        }
      })
  }

  selectRepository(repo: ISkillRepository) {
    this.selectedRepositoryId.set(repo.id)
  }

  displayName(item: ISkillRepositoryIndex) {
    return item.name || item.skillId || item.skillPath
  }

  openRepository(repo: ISkillRepository, event: Event) {
    event.stopPropagation()
    this.#dialog
      .open(XpertSkillRepositoryComponent, {
        data: {
          repository: repo
        },
        disableClose: true,
        backdropClass: 'xp-overlay-share-sheet',
        panelClass: 'xp-overlay-pane-share-sheet',
      })
      .closed.subscribe({
        next: (result) => {
          //
        }
      })
  }

  editRepository(repo: ISkillRepository, event: Event) {
    event.stopPropagation()
    this.#dialog
      .open<string | null>(XpertSkillRepositoryRegisterComponent, {
        data: {
          repository: repo
        }
      })
      .closed.subscribe({
        next: (repositoryId) => {
          if (repositoryId) {
            this.selectedRepositoryId.set(repositoryId)
            this.loadRepositories()
          }
        }
      })
  }

  deleteRepository(repo: ISkillRepository, event: Event) {
    event.stopPropagation()
    this.confirmDelete(
      {
        value: repo.name,
        information: this.#translate.instant('Pro.DeleteSkillRepositoryConfirm', {
          Default: 'Are you sure you want to delete this skill repository?'
        })
      },
      () => {
        this.savingRepo.set(true)
        return this.repositoryService.delete(repo.id).pipe(finalize(() => this.savingRepo.set(false)))
      }
    ).subscribe({
      next: () => {
        if (this.selectedRepositoryId() === repo.id) {
          this.selectedRepositoryId.set(null)
          this.selectedRepository.set(null)
        }
        this.toastr.success(
          this.#translate.instant('Pro.RepositoryDeleted', {
            Default: 'Repository deleted'
          })
        )
        this.loadRepositories()
      },
      error: (err) => {
        this.toastr.error(getErrorMessage(err))
      }
    })
  }
}
