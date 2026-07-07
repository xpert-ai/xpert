import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core'
import { AbstractControl, FormControl, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms'
import { getErrorMessage, ISkillPackage, SkillPackageService, ToastrService } from '@cloud/app/@core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { parseGithubSkillInstallCommand } from '@xpert-ai/contracts'
import { ZardButtonComponent } from '@xpert-ai/headless-ui/components/button'
import { ZardIconComponent } from '@xpert-ai/headless-ui/components/icon'
import { ZardInputDirective } from '@xpert-ai/headless-ui/components/input'
import { firstValueFrom } from 'rxjs'

@Component({
  standalone: true,
  selector: 'xp-github-skill-install',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    ZardButtonComponent,
    ZardIconComponent,
    ZardInputDirective
  ],
  template: `
    <form class="rounded-lg border border-divider-regular bg-background p-5" (submit)="install($event)">
      @if (showTitle()) {
        <div class="flex items-start gap-3">
          <div
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-divider-regular bg-background-default-subtle text-text-primary"
          >
            <i class="ri-github-fill text-lg"></i>
          </div>
          <div class="min-w-0">
            <div class="text-sm font-semibold text-text-primary">
              {{ 'PAC.Skill.AddSkillFromGithubTitle' | translate: { Default: 'Add skill from GitHub' } }}
            </div>
            <div class="mt-0.5 text-xs leading-5 text-text-secondary">
              {{
                'PAC.Skill.GithubSkillInstallCaption'
                  | translate
                    : { Default: 'Install all skills from a GitHub repository, or target one skill by command.' }
              }}
            </div>
          </div>
        </div>
      }

      <div class="flex flex-col gap-3" [class.mt-4]="showTitle()">
        <label class="block min-w-0">
          <span class="mb-1 block text-xs font-medium text-text-secondary">
            {{ 'PAC.Skill.GithubSkillInstallInput' | translate: { Default: 'GitHub command or repository' } }}
          </span>
          <input
            z-input
            type="text"
            class="h-11 w-full text-sm"
            [formControl]="commandControl"
            [placeholder]="'PAC.Skill.GithubSkillInstallInputPlaceholder' | translate: { Default: exampleCommand }"
          />
          @if (commandControl.touched && commandControl.hasError('required')) {
            <div class="mt-1 text-xs text-text-destructive">
              {{ 'PAC.Skill.GithubSkillInstallInputRequired' | translate: { Default: 'GitHub source is required.' } }}
            </div>
          } @else if (commandControl.touched && commandControl.hasError('githubSkillInstallCommand')) {
            <div class="mt-1 text-xs text-text-destructive">
              {{
                'PAC.Skill.GithubSkillInstallInputInvalid'
                  | translate: { Default: 'Paste a valid GitHub repository or npx skills add command.' }
              }}
            </div>
          }
        </label>

        <div class="flex justify-end">
          <button z-button zType="default" type="submit" class="h-10 shrink-0 gap-2 px-4" [disabled]="installing()">
            @if (installing()) {
              <z-icon zType="refresh-cw" zSize="sm" class="animate-spin" />
            } @else {
              <z-icon zType="file_download" zSize="sm" />
            }
            {{
              installing()
                ? ('PAC.Skill.InstallingGithubSkills' | translate: { Default: 'Installing...' })
                : ('PAC.Skill.InstallGithubSkills' | translate: { Default: 'Install skills' })
            }}
          </button>
        </div>
      </div>
    </form>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertGithubSkillInstallComponent {
  readonly workspaceId = input<string | null>(null)
  readonly showTitle = input(true)
  readonly installed = output<ISkillPackage[]>()

  readonly #skillPackageService = inject(SkillPackageService)
  readonly #toastr = inject(ToastrService)
  readonly #translate = inject(TranslateService)

  readonly installing = signal(false)
  readonly exampleCommand = 'npx skills add Leonxlnx/taste-skill --skill "design-taste-frontend"'
  readonly commandControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, githubSkillInstallCommandValidator]
  })

  async install(event?: SubmitEvent) {
    event?.preventDefault()
    event?.stopPropagation()

    this.commandControl.markAsTouched()
    this.commandControl.updateValueAndValidity()
    const workspaceId = this.workspaceId()
    const command = this.commandControl.value.trim()
    if (this.commandControl.invalid || this.installing()) {
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
      const packages = await firstValueFrom(this.#skillPackageService.installGithubPackages(workspaceId, { command }))
      this.#toastr.success(
        this.#translate.instant('PAC.Skill.GithubSkillInstallSuccess', {
          Default: 'Installed {{count}} skill(s) from GitHub.',
          count: packages.length
        })
      )
      this.commandControl.reset('')
      this.installed.emit(packages)
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.installing.set(false)
    }
  }
}

function githubSkillInstallCommandValidator(control: AbstractControl<string>): ValidationErrors | null {
  const raw = control.value?.trim()
  if (!raw) {
    return null
  }

  try {
    parseGithubSkillInstallCommand(raw)
    return null
  } catch {
    return { githubSkillInstallCommand: true }
  }
}
