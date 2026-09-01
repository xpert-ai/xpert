import { CommonModule } from '@angular/common'
import { Component, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import type { TXpertProjectSkillSummary } from '@xpert-ai/contracts'
import {
  Z_MODAL_DATA,
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardDialogRef,
  ZardSwitchComponent
} from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import { getErrorMessage, ToastrService } from '../../@core'
import { XpertProjectApiService } from './project-api.service'

type ProjectSkillsDialogData = {
  projectId: string
  skills: TXpertProjectSkillSummary[]
  canEdit: boolean
}

@Component({
  standalone: true,
  selector: 'xp-project-skills-dialog',
  imports: [CommonModule, FormsModule, TranslateModule, ZardBadgeComponent, ZardButtonComponent, ZardSwitchComponent],
  template: `
    <section class="flex max-h-[84vh] min-w-0 flex-col">
      <header class="flex items-start justify-between border-b border-divider-subtle pb-4">
        <div>
          <h2 class="text-lg font-semibold text-text-primary">{{ 'XP.XProject.ManageProjectSkills' | translate }}</h2>
          <p class="mt-1 text-sm text-text-secondary">
            {{ 'XP.XProject.ManageProjectSkillsDescription' | translate }}
          </p>
        </div>
        <button z-button zType="ghost" zSize="sm" type="button" (click)="close()">
          <i class="ri-close-line"></i>
        </button>
      </header>

      <div class="min-h-0 flex-1 overflow-y-auto py-5">
        <div class="divide-y divide-divider-subtle rounded-xl border border-divider-subtle">
          @for (skill of skills(); track skill.id) {
            <div class="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <p class="truncate text-sm font-medium text-text-primary">{{ skill.name }}</p>
                  <z-badge zType="outline">{{ sourceKey(skill.source) | translate }}</z-badge>
                  @if (skill.version) {
                    <span class="text-xs text-text-tertiary">v{{ skill.version }}</span>
                  }
                </div>
                @if (skill.description) {
                  <p class="mt-1 line-clamp-2 text-xs text-text-secondary">{{ skill.description }}</p>
                }
              </div>
              <div class="flex shrink-0 items-center justify-end gap-3">
                <span class="text-xs text-text-tertiary">
                  {{
                    (skill.enabled ? 'XP.XProject.ProjectSkillEnabled' : 'XP.XProject.ProjectSkillDisabled') | translate
                  }}
                </span>
                <z-switch
                  zSize="sm"
                  [ngModel]="skill.enabled"
                  [disabled]="!data.canEdit || busySkillId() === skill.id"
                  (ngModelChange)="setEnabled(skill, $event)"
                />
                @if (data.canEdit) {
                  <button
                    z-button
                    zType="ghost"
                    zSize="sm"
                    type="button"
                    [disabled]="busySkillId() === skill.id"
                    [attr.aria-label]="'XP.XProject.UninstallProjectSkill' | translate"
                    (click)="uninstall(skill)"
                  >
                    <i class="ri-delete-bin-line text-text-destructive"></i>
                  </button>
                }
              </div>
            </div>
          } @empty {
            <p class="p-6 text-center text-sm text-text-tertiary">{{ 'XP.XProject.NoProjectSkills' | translate }}</p>
          }
        </div>
      </div>

      <footer class="flex justify-end border-t border-divider-subtle pt-4">
        <button z-button zType="outline" type="button" (click)="close()">
          {{ 'XP.XProject.Done' | translate }}
        </button>
      </footer>
    </section>
  `,
  host: { class: 'block w-full min-w-0' }
})
export class XpertProjectSkillsDialogComponent {
  readonly #dialogRef = inject<ZardDialogRef<XpertProjectSkillsDialogComponent, boolean>>(ZardDialogRef)
  readonly #api = inject(XpertProjectApiService)
  readonly #toastr = inject(ToastrService)
  readonly data = inject<ProjectSkillsDialogData>(Z_MODAL_DATA)
  readonly skills = signal(this.data.skills.map((skill) => ({ ...skill })))
  readonly busySkillId = signal<string | null>(null)
  readonly changed = signal(false)

  async setEnabled(skill: TXpertProjectSkillSummary, enabled: boolean) {
    if (!this.data.canEdit || enabled === skill.enabled || this.busySkillId()) return
    this.busySkillId.set(skill.id)
    try {
      const updated = await firstValueFrom(this.#api.setSkillEnabled(this.data.projectId, skill.id, enabled))
      this.skills.update((items) => items.map((item) => (item.id === updated.id ? updated : item)))
      this.changed.set(true)
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.busySkillId.set(null)
    }
  }

  async uninstall(skill: TXpertProjectSkillSummary) {
    if (!this.data.canEdit || this.busySkillId()) return
    const confirmed = await firstValueFrom(
      this.#toastr.confirm({
        code: 'XP.XProject.UninstallProjectSkillConfirmation',
        params: { name: skill.name }
      })
    )
    if (!confirmed) return

    this.busySkillId.set(skill.id)
    try {
      await firstValueFrom(this.#api.uninstallSkill(this.data.projectId, skill.id))
      this.skills.update((items) => items.filter((item) => item.id !== skill.id))
      this.changed.set(true)
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.busySkillId.set(null)
    }
  }

  sourceKey(source: TXpertProjectSkillSummary['source']) {
    switch (source) {
      case 'repository':
        return 'XP.XProject.ProjectSkillSourceRepository'
      case 'upload':
        return 'XP.XProject.ProjectSkillSourceUpload'
      default:
        return 'XP.XProject.ProjectSkillSourceLegacy'
    }
  }

  close() {
    this.#dialogRef.close(this.changed())
  }
}
