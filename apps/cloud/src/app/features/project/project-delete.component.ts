import { Component, computed, inject, signal } from '@angular/core'
import { Router } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { injectConfirmDelete, ZardButtonComponent } from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import { getErrorMessage, ToastrService } from '../../@core'
import { XpertProjectApiService } from './project-api.service'
import { XpertProjectFacade } from './project.facade'

@Component({
  standalone: true,
  selector: 'xp-project-delete',
  imports: [TranslateModule, ZardButtonComponent],
  template: `
    @if (isOwner()) {
      <section class="space-y-3 border-t border-divider-subtle pt-6" aria-labelledby="project-delete-title">
        <h3 id="project-delete-title" class="text-base font-semibold text-text-primary">
          {{ 'XP.XProject.DeleteProject' | translate }}
        </h3>
        @if (applicationManaged()) {
          <p class="text-sm text-text-secondary">{{ 'XP.XProject.DeleteInApplication' | translate }}</p>
        } @else {
          <p class="text-sm text-text-secondary">{{ 'XP.XProject.DeleteProjectWarning' | translate }}</p>
          <button
            z-button
            zType="destructive"
            type="button"
            [zDisabled]="pending()"
            [disabled]="pending()"
            (click)="deleteProject()"
          >
            {{ 'XP.XProject.DeleteProject' | translate }}
          </button>
        }
      </section>
    }
  `
})
export class XpertProjectDeleteComponent {
  readonly #facade = inject(XpertProjectFacade)
  readonly #api = inject(XpertProjectApiService)
  readonly #router = inject(Router)
  readonly #translate = inject(TranslateService)
  readonly #toastr = inject(ToastrService)
  readonly #confirmDelete = injectConfirmDelete()
  readonly pending = signal(false)
  readonly isOwner = computed(() => {
    const access = this.#facade.projectAccess()
    return access?.role === 'owner' && access.capabilities.canManage
  })
  // Presentation only; the server enforces ownership and the current type's lifecycle policy.
  readonly applicationManaged = computed(() => this.#facade.project()?.projectTypeSnapshot?.binding.kind === 'entity')

  async deleteProject() {
    const project = this.#facade.project()
    if (!project?.id || !this.isOwner() || this.applicationManaged() || this.pending()) return
    this.pending.set(true)
    try {
      const confirmed = await firstValueFrom(
        this.#confirmDelete({
          value: project.name,
          information: this.#translate.instant('XP.XProject.DeleteProjectWarning')
        }),
        { defaultValue: false }
      )
      if (!confirmed || this.#facade.project()?.id !== project.id || !this.isOwner() || this.applicationManaged())
        return
      await firstValueFrom(this.#api.deleteProject(project.id))
      this.#toastr.success('XP.Messages.DeletedSuccessfully')
      if (this.#facade.project()?.id === project.id) await this.#router.navigate(['/project'])
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.pending.set(false)
    }
  }
}
