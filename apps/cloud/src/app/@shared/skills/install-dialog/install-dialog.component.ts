import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, HostBinding, inject, signal } from '@angular/core'
import { ISkillPackage, ISkillRepository, ISkillRepositoryIndex } from '@cloud/app/@core'
import { TranslateModule } from '@ngx-translate/core'
import { Z_MODAL_DATA, ZardButtonComponent, ZardDialogModule, ZardDialogRef, ZardIconComponent } from '@xpert-ai/headless-ui'
import { XpertGithubSkillInstallComponent } from '../github-install/github-install.component'
import { XpertSkillIndexesComponent } from '../indexes/indexes.component'
import { XpertSkillRepositoriesComponent } from '../skill-repositories/skill-repositories.component'

export type XpertSkillInstallDialogResult =
  | {
      kind: 'repository-index'
      skillIndex: ISkillRepositoryIndex
    }
  | {
      kind: 'installed-packages'
      packages: ISkillPackage[]
    }

type XpertSkillInstallDialogData = {
  workspaceId?: string | null
}

@Component({
  standalone: true,
  selector: 'xp-skill-install-dialog',
  imports: [
    CommonModule,
    TranslateModule,
    ZardButtonComponent,
    ZardDialogModule,
    ZardIconComponent,
    XpertGithubSkillInstallComponent,
    XpertSkillRepositoriesComponent,
    XpertSkillIndexesComponent
  ],
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        max-height: 90vh;
      }
    `
  ],
  template: `
    <header xpDialogTitle>
      <div class="flex items-start gap-3">
        <div
          class="flex h-10 w-10 items-center justify-center rounded-2xl border border-divider-regular bg-background-default-subtle"
        >
          <z-icon zType="work_history" class="text-lg text-text-primary"></z-icon>
        </div>
        <div class="min-w-0">
          <h4 class="text-lg font-semibold text-text-primary">
            {{ 'PAC.Xpert.InstallWorkspaceSkillsTitle' | translate: { Default: 'Install or update skills in this workspace' } }}
          </h4>
          <p class="mt-1 text-sm leading-6 text-text-secondary">
            {{
              'PAC.Xpert.InstallWorkspaceSkillsDialogDesc'
                | translate
                  : {
                      Default:
                        'Browse repositories, pick a skill, and install it into the current workspace. Existing installs are reused, and newer versions update in place.'
                    }
            }}
          </p>
        </div>
      </div>
    </header>

    <div xpDialogContent class="relative w-full overflow-auto">
      <div class="sticky top-0 z-10 mt-1 rounded-2xl border border-divider-regular bg-background p-3">
        <div class="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div class="text-sm font-semibold text-text-primary">
            {{ 'PAC.Skill.SelectSkillSource' | translate: { Default: 'Select a skill source' } }}
          </div>
          <button z-button zType="outline" type="button" (click)="showGithubInstall.update(toggleBoolean)">
            <z-icon zType="add" class="mr-1 text-base"></z-icon>
            {{ 'PAC.Skill.AddSkill' | translate: { Default: 'Add Skill' } }}
          </button>
        </div>

        @if (showGithubInstall()) {
          <xp-github-skill-install
            class="mb-3 block"
            [workspaceId]="workspaceId()"
            (installed)="onGithubInstalled($event)"
          />
        }

        <xp-skill-repositories
          [readonly]="true"
          [selectedRepository]="selectedRepository()"
          (selectedRepositoryChange)="selectedRepository.set($event)"
        />
      </div>

      <xp-skill-indexes class="mt-2" [selectedRepository]="selectedRepository()" (installing)="install($event)" />
    </div>

    <div xpDialogActions>
      <div class="flex w-full justify-end">
        <button z-button zType="outline" type="button" xpDialogClose>
          {{ 'PAC.ACTIONS.CANCEL' | translate: { Default: 'Cancel' } }}
        </button>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertSkillInstallDialogComponent {
  @HostBinding('class.ngm-dialog-container') readonly isDialogContainer = true

  readonly #dialogRef = inject(ZardDialogRef<XpertSkillInstallDialogComponent, XpertSkillInstallDialogResult | undefined>)
  readonly #data = inject<XpertSkillInstallDialogData | null>(Z_MODAL_DATA, { optional: true })

  readonly selectedRepository = signal<ISkillRepository | null>(null)
  readonly workspaceId = signal(this.#data?.workspaceId ?? null)
  readonly showGithubInstall = signal(false)
  readonly toggleBoolean = (value: boolean) => !value

  install(item: ISkillRepositoryIndex) {
    this.#dialogRef.close({
      kind: 'repository-index',
      skillIndex: item
    })
  }

  onGithubInstalled(packages: ISkillPackage[]) {
    this.#dialogRef.close({
      kind: 'installed-packages',
      packages
    })
  }
}
