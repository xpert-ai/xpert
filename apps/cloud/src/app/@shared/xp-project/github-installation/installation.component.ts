import { CommonModule } from '@angular/common'
import { Component, computed, effect, input, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { getErrorMessage, injectGitHubAPI, injectProjectService, injectToastr, Repository, transformInstallation } from '@cloud/app/@core'
import { NgmSelectComponent } from '@cloud/app/@shared/common'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { linkedModel, myRxResource } from '@metad/ocap-angular/core'
import { derivedAsync } from 'ngxtension/derived-async'

@Component({
  selector: 'xp-project-github-installation',
  standalone: true,
  imports: [CommonModule, FormsModule, NgmSelectComponent, NgmSpinComponent],
  templateUrl: './installation.component.html',
  styleUrl: './installation.component.scss'
})
export class XpProjectGitHubInstallationComponent {
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

  readonly isInstalled = signal(false)
  readonly isLoading = signal(false)
  readonly error = signal('')

  readonly installationsError = signal('')

  constructor() {
    // effect(() => {
    //   console.log(this.isLoading())
    // })
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

  handleRefresh() {
    this.refreshInstallations()
  }

}
