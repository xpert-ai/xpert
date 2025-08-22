import { CommonModule } from '@angular/common'
import { Component, computed, effect, input, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { getErrorMessage, injectGitHubAPI, injectProjectService, injectToastr, Repository, transformInstallation } from '@cloud/app/@core'
import { NgmSelectComponent } from '@cloud/app/@shared/common'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { linkedModel, myRxResource } from '@metad/ocap-angular/core'
import { derivedAsync } from 'ngxtension/derived-async'

@Component({
  selector: 'chat-project-vcs',
  standalone: true,
  imports: [CommonModule, FormsModule, NgmSelectComponent, NgmSpinComponent],
  templateUrl: './vcs.component.html',
  styleUrl: './vcs.component.scss'
})
export class ChatProjectVcsComponent {
  readonly projectAPI = injectProjectService()
  readonly githubAPI = injectGitHubAPI()
  readonly #toastr = injectToastr()

  // Inputs
  readonly projectId = input.required<string>()

  // States
  readonly vcs = derivedAsync(() => this.projectAPI.getVCS(this.projectId()), { initialValue: null })
  readonly #installations = myRxResource({
    request: () => (this.vcs() ? this.projectId() : null),
    loader: ({ request }) => (request ? this.projectAPI.getGithubInstallations(request) : null)
  })
  readonly installations = computed(() => {
    const transformedInstallations = this.#installations.value()?.installations?.map(transformInstallation)
    return transformedInstallations
  })
  readonly installationTotal = computed(() => this.#installations.value()?.total_count || 0)
  readonly installationsLoading = computed(() => this.#installations.status() === 'loading')

  readonly installationId = linkedModel({
    initialValue: null,
    compute: () => this.vcs()?.installationId,
    update: () => {}
  })
  readonly currentInstallation = computed(() => this.installations()?.find((i) => ''+i.id === this.installationId()))

  readonly installationOptions = computed(() =>
    this.installations()?.map((installation) => ({
      value: `${installation.id}`,
      label: installation.accountName
    }))
  )

  // GitHub Repositories
  readonly repositoriesPage = signal(1)
  readonly repositoriesHasMore = signal(true)
  readonly repositoriesLoadingMore = signal(false)
  readonly repositories = signal<Repository[]>([])

  readonly isInstalled = signal(false)
  readonly isLoading = signal(false)
  readonly error = signal('')

  readonly installationsError = signal('')

  constructor() {
    effect(() => {
      if (this.installationId()) {
        this.checkInstallation()
      }
    }, { allowSignalWrites: true })

    effect(() => {
      console.log(this.isLoading())
    })
  }

  handleInstallationChange(installationId: string) {
    console.log(installationId)
    this.projectAPI.updateVCS(this.projectId(), { installationId }).subscribe({
      next: () => {
        this.installationId.set(installationId)
      },
      error: (err) => {
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  handleInstallApp() {
    window.location.href = `/api/xpert-project/${this.projectId()}/github-installation`
  }
  refreshInstallations() {
    this.#installations.reload()
  }

  checkInstallation(page: number = 1, append: boolean = false,) {
    if (!append)
      this.isLoading.set(true)
    if (append)
      this.repositoriesLoadingMore.set(true)
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

        this.isLoading.set(false)
        this.repositoriesLoadingMore.set(false)
      },
      error: (err)=> {
        this.error.set(getErrorMessage(err))
        this.isInstalled.set(false)
        this.isLoading.set(false)
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
    this.refreshInstallations(),
    this.checkInstallation()
  }

  openRepository(repo: Repository) {
    window.open(repo.html_url, '_blank')
  }

  handleManageOnGitHub() {
    const appId = null;
    const fallbackInstallationsUrl =
      "https://github.com/settings/installations";
    const applicationUrl = appId
      ? `https://github.com/settings/connections/applications/${appId}`
      : fallbackInstallationsUrl;
    window.open(applicationUrl, "_blank");
  }
}
