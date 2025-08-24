import { CommonModule } from '@angular/common'
import { Component, computed, input, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { getErrorMessage, injectGitHubAPI, injectProjectService, injectToastr } from '@cloud/app/@core'
import { NgmSelectComponent } from '@cloud/app/@shared/common'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { myRxResource } from '@metad/ocap-angular/core'

@Component({
  selector: 'xp-project-github-login',
  standalone: true,
  imports: [CommonModule, FormsModule, NgmSelectComponent, NgmSpinComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class XpProjectGitHubLoginComponent {
  readonly projectAPI = injectProjectService()
  readonly githubAPI = injectGitHubAPI()
  readonly #toastr = injectToastr()

  // Inputs
  readonly projectId = input.required<string>()
  readonly integrationId = input<string>()

  // States
  readonly #vcs = myRxResource({
    request: () => this.projectId(),
    loader: ({ request }) => (request ? this.projectAPI.getVCS(request) : null)
  })
  readonly vcs = this.#vcs.value

  readonly _integrationId = computed(() => this.vcs()?.integrationId)
  readonly auth = computed(() => this.vcs()?.auth)

  readonly #isLoading = signal(false)
  readonly isLoading = computed(() => this.#isLoading() || this.#vcs.status() === 'loading')

  readonly integrations = computed(() => {
    const items = []
    if (this.integrationId()) {
      items.push({
        value: this.integrationId(),
        label: this.integrationId()
      })
    }
    if (this.vcs()?.integrationId && this.vcs().integrationId !== this.integrationId()) {
      items.push({
        value: this.vcs().integrationId,
        label: this.vcs().integrationId
      })
    }
    return items
  })

  handleIntegrationChange(event: string) {
    if (event !== this.vcs()?.integrationId) {
      this.#isLoading.set(true)
      this.projectAPI.updateVCS(this.projectId(), { integrationId: event }).subscribe({
        next: () => {
          this.#isLoading.set(false)
          this.#vcs.reload()
          this.#toastr.success('TOASTR.MESSAGE.SAVED', 'TOASTR.TITLE.SUCCESS')
        },
        error: (err) => {
          this.#isLoading.set(false)
          this.#toastr.error(getErrorMessage(err))
        }
      })
    }
  }

  handleLogin() {
    window.location.href = `/api/github/${this.integrationId()}/login?projectId=${this.projectId()}&redirectUri=${encodeURIComponent(window.location.href)}`
  }
}
