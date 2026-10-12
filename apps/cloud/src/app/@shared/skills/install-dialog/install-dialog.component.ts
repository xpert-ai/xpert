import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core'
import { ISkillPackage, ISkillRepository, ISkillRepositoryIndex } from '@cloud/app/@core'
import { TranslateModule } from '@ngx-translate/core'
import {
  XpDialogFrameImports,
  XpDialogActionGroupDirective,
  ZardButtonComponent,
  ZardIconComponent
} from '@xpert-ai/headless-ui'
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

export type XpertSkillInstallDialogData = {
  workspaceId?: string | null
  scope?: 'workspace' | 'project'
}

@Component({
  standalone: true,
  selector: 'xp-skill-install-dialog',
  imports: [
    ...XpDialogFrameImports,
    XpDialogActionGroupDirective,
    CommonModule,
    TranslateModule,
    ZardButtonComponent,
    ZardIconComponent,
    XpertGithubSkillInstallComponent,
    XpertSkillRepositoriesComponent,
    XpertSkillIndexesComponent
  ],
  template: `
    <section xpDialogLayout="wide" class="w-full max-h-[calc(100dvh-32px)]">
      <header xpDialogHeader>
        <div class="flex items-start gap-3">
          <div class="min-w-0">
            <h2 xpDialogHeading>
              {{
                (isProject() ? 'XP.XProject.InstallProjectSkillTitle' : 'XP.Xpert.InstallWorkspaceSkillsTitle')
                  | translate
                    : {
                        Default: isProject()
                          ? 'Install a skill in this Project'
                          : 'Install or update skills in this workspace'
                      }
              }}
            </h2>
            <p xpDialogDescription class="mt-[8px]">
              {{
                (isProject()
                  ? 'XP.XProject.InstallProjectSkillDescription'
                  : 'XP.Xpert.InstallWorkspaceSkillsDialogDesc'
                )
                  | translate
                    : {
                        Default: isProject()
                          ? 'Browse repositories and install a skill into this Project.'
                          : 'Browse repositories, pick a skill, and install it into the current workspace. Existing installs are reused, and newer versions update in place.'
                      }
              }}
            </p>
          </div>
        </div>
        <button
          z-button
          type="button"
          zType="ghost"
          zSize="icon"
          xpDialogCloseButton
          [attr.aria-label]="'XP.ACTIONS.Close' | translate: { Default: 'Close' }"
          (click)="close()"
        >
          <z-icon zType="x" />
        </button>
      </header>

      <div xpDialogBody>
        <div class="space-y-[16px]">
          <div xpDialogActionGroup="inline" class="flex flex-wrap items-center justify-between gap-[8px]">
            <div class="text-sm font-semibold text-text-primary">
              {{ 'XP.Skill.SelectSkillSource' | translate: { Default: 'Select a skill source' } }}
            </div>
            @if (!isProject()) {
              <button z-button zType="outline" type="button" (click)="showGithubInstall.update(toggleBoolean)">
                <z-icon zType="add"></z-icon>
                {{ 'XP.Skill.AddSkill' | translate: { Default: 'Add Skill' } }}
              </button>
            }
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

      <footer xpDialogFooter>
        <div class="flex w-full justify-end">
          <button z-button zType="outline" type="button" (click)="close()">
            {{ 'XP.ACTIONS.CANCEL' | translate: { Default: 'Cancel' } }}
          </button>
        </div>
      </footer>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertSkillInstallDialogComponent {
  readonly #dialogRef = inject(DialogRef<XpertSkillInstallDialogResult | undefined>)
  readonly #data = inject<XpertSkillInstallDialogData | null>(DIALOG_DATA, { optional: true })

  readonly selectedRepository = signal<ISkillRepository | null>(null)
  readonly workspaceId = signal(this.#data?.workspaceId ?? null)
  readonly isProject = signal(this.#data?.scope === 'project')
  readonly showGithubInstall = signal(false)
  readonly toggleBoolean = (value: boolean) => !value

  close() {
    this.#dialogRef.close()
  }

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
