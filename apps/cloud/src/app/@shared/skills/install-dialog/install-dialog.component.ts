import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, HostBinding, inject, signal } from '@angular/core'
import { ISkillRepository, ISkillRepositoryIndex } from '@cloud/app/@core'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent, ZardDialogModule, ZardDialogRef, ZardIconComponent } from '@xpert-ai/headless-ui'
import { XpertSkillIndexesComponent } from '../indexes/indexes.component'
import { XpertSkillRepositoriesComponent } from '../skill-repositories/skill-repositories.component'

@Component({
  standalone: true,
  selector: 'xp-skill-install-dialog',
  imports: [
    CommonModule,
    TranslateModule,
    ZardButtonComponent,
    ZardDialogModule,
    ZardIconComponent,
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

  readonly #dialogRef = inject(ZardDialogRef<XpertSkillInstallDialogComponent, ISkillRepositoryIndex | undefined>)
  readonly selectedRepository = signal<ISkillRepository | null>(null)

  install(item: ISkillRepositoryIndex) {
    this.#dialogRef.close(item)
  }
}
