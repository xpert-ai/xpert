import { Dialog } from '@angular/cdk/dialog'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { CommonModule } from '@angular/common'
import { Component, computed, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { injectProjectService } from '@cloud/app/@core'
import { linkedModel } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { derivedAsync } from 'ngxtension/derived-async'
import { AbstractInterruptComponent } from '../../agent'
import { injectI18nService } from '../../i18n'
import { XpProjectGitHubInstallationComponent } from '../github-installation/installation.component'
import { XpProjectGitHubLoginComponent } from '../github-login/login.component'
import { XpProjectGitHubRepositoriesComponent } from '../github-repositories/repositories.component'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    CdkListboxModule,
    XpProjectGitHubLoginComponent,
    XpProjectGitHubInstallationComponent,
    XpProjectGitHubRepositoriesComponent
  ],
  selector: 'xp-project-switch-repository',
  templateUrl: 'switch-repository.component.html',
  styleUrls: ['switch-repository.component.scss']
})
export class ProjectSwitchRepositoryComponent extends AbstractInterruptComponent<
  { integration?: string },
  { url?: string }
> {
  readonly #dialog = inject(Dialog)
  readonly i18nService = injectI18nService()
  readonly projectAPI = injectProjectService()

  readonly vcs = derivedAsync(() => this.projectAPI.getVCS(this.projectId()), { initialValue: null })
  readonly vcsIntegrationId = computed(() => this.vcs()?.integrationId)

  readonly integrationId = computed(() => this.data()?.integration || this.vcsIntegrationId())

  readonly repositoryUrl = linkedModel({
    initialValue: null,
    compute: () => this.value()?.url,
    update: (value) => this.value.set({ url: value ? `https://github.com/${value}.git` : null })
  })
}
