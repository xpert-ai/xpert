import { CommonModule } from '@angular/common'
import { Component, computed, effect, input, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { getErrorMessage, injectGitHubAPI, injectProjectService, injectToastr, Repository } from '@cloud/app/@core'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { myRxResource } from '@metad/ocap-angular/core'

@Component({
  selector: 'xp-project-github-repositories',
  standalone: true,
  imports: [CommonModule, FormsModule, NgmSpinComponent],
  templateUrl: './repositories.component.html',
  styleUrl: './repositories.component.scss'
})
export class XpProjectGitHubRepositoriesComponent {
  readonly projectAPI = injectProjectService()
  readonly githubAPI = injectGitHubAPI()
  readonly #toastr = injectToastr()

  // Inputs
  readonly projectId = input.required<string>()
  readonly integrationId = input<string>()

  // Models
  readonly repositoryUrl = model<string>('')

  // States
  readonly #vcs = myRxResource({
    request: () => this.projectId(),
    loader: ({ request }) => (request ? this.projectAPI.getVCS(request) : null)
  })
  readonly vcs = this.#vcs.value

  readonly installationId = computed(() => this.vcs()?.installationId)
  readonly repositoryName = computed(() => this.vcs()?.repository)
  readonly auth = computed(() => this.vcs()?.auth)

  readonly #isLoading = signal(false)
  readonly isLoading = computed(() => this.#isLoading() || this.#vcs.status() === 'loading')

  // GitHub Repositories
  readonly repositoriesPage = signal(1)
  readonly repositoriesHasMore = signal(true)
  readonly repositoriesLoadingMore = signal(false)
  readonly repositories = signal<Repository[]>([])

  readonly isInstalled = signal(false)
  readonly error = signal('')

  readonly installationsError = signal('')

  readonly repository = computed(() => this.repositories().find((repo) => repo.full_name === this.repositoryName()))

  constructor() {
    effect(
      () => {
        if (this.installationId()) {
          this.checkInstallation()
        }
      },
      { allowSignalWrites: true }
    )

    effect(
      () => {
        this.repositoryUrl.set(this.repositoryName())
      },
      { allowSignalWrites: true }
    )
  }

  checkInstallation(page: number = 1, append: boolean = false) {
    if (!append) this.#isLoading.set(true)
    if (append) this.repositoriesLoadingMore.set(true)
    this.error.set(null)
    this.githubAPI.getRepositories(this.vcs().integrationId, this.installationId() as string, page, 30).subscribe({
      next: (data) => {
        const newRepositories = data.repositories || []
        if (append) {
          this.repositories.update((state) => [...state, ...newRepositories])
        } else {
          this.repositories.set(newRepositories)
        }

        this.repositoriesPage.set(data.pagination?.page || page)
        this.repositoriesHasMore.set(data.pagination?.hasMore || false)
        this.isInstalled.set(true)

        this.#isLoading.set(false)
        this.repositoriesLoadingMore.set(false)
      },
      error: (err) => {
        this.error.set(getErrorMessage(err))
        this.isInstalled.set(false)
        this.#isLoading.set(false)
        this.repositoriesLoadingMore.set(false)
      }
    })
  }

  loadMoreRepositories() {
    if (this.repositoriesHasMore() && !this.repositoriesLoadingMore()) {
      this.checkInstallation(this.repositoriesPage() + 1, true)
    }
  }

  handleRefresh() {
    this.checkInstallation()
  }

  openRepository(repo: Repository) {
    window.open(repo.html_url, '_blank')
  }

  selectRepository(repo: Repository) {
    this.projectAPI
      .updateVCS(this.projectId(), {
        repository: repo.full_name
      })
      .subscribe({
        next: () => {
          this.#vcs.reload()
          this.#toastr.success('Repository selected')
        },
        error: (err) => {
          this.#toastr.error(getErrorMessage(err))
        }
      })
  }
}
