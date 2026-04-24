import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core'
import { AbstractControl, FormControl, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms'
import { getErrorMessage, ISkillPackage, SkillPackageService, ToastrService } from '@cloud/app/@core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'

@Component({
  standalone: true,
  selector: 'xp-github-skill-install',
  imports: [CommonModule, ReactiveFormsModule, TranslateModule],
  template: `
    <form class="rounded-lg border border-divider-regular bg-background-default-subtle p-4" (submit)="install($event)">
      <div class="flex flex-col gap-1">
        <div class="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <i class="ri-github-line text-base"></i>
          {{ 'PAC.Skill.AddSkillFromGithubTitle' | translate: { Default: 'Add skill from GitHub' } }}
        </div>
      </div>

      <div class="mt-4 flex flex-col gap-3 lg:flex-row lg:items-start">
        <label class="min-w-0 flex-1">
          <span class="mb-1 block text-xs font-medium text-text-secondary">
            {{ 'PAC.Skill.GithubRepositoryUrl' | translate: { Default: 'GitHub repository URL' } }}
          </span>
          <input
            type="text"
            class="w-full rounded-lg border border-divider-regular bg-background px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-components-input-border-active"
            [formControl]="urlControl"
            [placeholder]="
              'PAC.Skill.GithubRepositoryUrlPlaceholder'
                | translate: { Default: 'https://github.com/op7418/guizang-ppt-skill' }
            "
          />
          @if (urlControl.touched && urlControl.hasError('required')) {
            <div class="mt-1 text-xs text-text-destructive">
              {{ 'PAC.Skill.GithubRepositoryUrlRequired' | translate: { Default: 'Repository URL is required.' } }}
            </div>
          } @else if (urlControl.touched && urlControl.hasError('githubRepository')) {
            <div class="mt-1 text-xs text-text-destructive">
              {{
                'PAC.Skill.GithubRepositoryUrlInvalid'
                  | translate: { Default: 'Use a valid github.com repository URL.' }
              }}
            </div>
          }
        </label>

        <button
          type="submit"
          class="btn btn-primary btn-large shrink-0"
          [disabled]="installing()"
        >
          <i [class]="installing() ? 'ri-loader-4-line mr-1 animate-spin' : 'ri-download-cloud-2-line mr-1'"></i>
          {{
            installing()
              ? ('PAC.Skill.InstallingGithubSkills' | translate: { Default: 'Installing...' })
              : ('PAC.Skill.InstallGithubSkills' | translate: { Default: 'Install skills' })
          }}
        </button>
      </div>
    </form>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertGithubSkillInstallComponent {
  readonly workspaceId = input<string | null>(null)
  readonly installed = output<ISkillPackage[]>()

  readonly #skillPackageService = inject(SkillPackageService)
  readonly #toastr = inject(ToastrService)
  readonly #translate = inject(TranslateService)

  readonly installing = signal(false)
  readonly urlControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, githubRepositoryUrlValidator]
  })

  async install(event?: SubmitEvent) {
    event?.preventDefault()
    event?.stopPropagation()

    this.urlControl.markAsTouched()
    this.urlControl.updateValueAndValidity()
    const workspaceId = this.workspaceId()
    const url = this.urlControl.value.trim()
    if (this.urlControl.invalid || this.installing()) {
      return
    }

    if (!workspaceId) {
      this.#toastr.error(
        this.#translate.instant('PAC.Skill.WorkspaceRequiredForGithubInstall', {
          Default: 'Workspace is required before installing GitHub skills.'
        })
      )
      return
    }

    this.installing.set(true)
    try {
      const packages = await firstValueFrom(this.#skillPackageService.installGithubPackages(workspaceId, { url }))
      this.#toastr.success(
        this.#translate.instant('PAC.Skill.GithubSkillInstallSuccess', {
          Default: 'Installed {{count}} skill(s) from GitHub.',
          count: packages.length
        })
      )
      this.urlControl.reset('')
      this.installed.emit(packages)
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.installing.set(false)
    }
  }
}

function githubRepositoryUrlValidator(control: AbstractControl<string>): ValidationErrors | null {
  const raw = control.value?.trim()
  if (!raw) {
    return null
  }

  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  try {
    const url = new URL(candidate)
    const [owner, repo] = url.pathname.replace(/^\/+/, '').split('/')
    return url.hostname.toLowerCase() === 'github.com' && !!owner?.trim() && !!repo?.trim()
      ? null
      : { githubRepository: true }
  } catch {
    return { githubRepository: true }
  }
}
