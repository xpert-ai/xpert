import { Component, DestroyRef, inject, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { ActivatedRoute, Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import { getErrorMessage } from '@cloud/app/@core'
import { XpertProjectApiService } from './project-api.service'
import { navigateProjectEntry } from './project-entry'

/** Resolve the registered application on each visit; URL values never choose an Assistant or business object. */
@Component({
  standalone: true,
  selector: 'xp-project-application',
  imports: [TranslateModule, ZardButtonComponent],
  template: `<div class="flex h-full flex-col items-center justify-center gap-4 p-6">
    @if (error()) {
      <p role="alert" class="text-sm text-text-secondary">{{ error() }}</p>
      <button z-button zType="outline" type="button" [disabled]="busy()" (click)="open()">
        {{ 'XP.Common.ErrorState.Retry' | translate }}
      </button>
    } @else {
      <p role="status" class="text-sm text-text-secondary">{{ 'XP.XProject.OpeningProject' | translate }}</p>
    }
  </div>`
})
export class XpertProjectApplicationComponent {
  private readonly api = inject(XpertProjectApiService)
  private readonly router = inject(Router)
  private readonly route = inject(ActivatedRoute).parent!
  private readonly destroyRef = inject(DestroyRef)
  private generation = 0
  readonly busy = signal(false)
  readonly error = signal<string | null>(null)

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.generation++
    })
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(() => {
      void this.open()
    })
  }

  async open() {
    const projectId = this.route.snapshot.paramMap.get('id')
    if (!projectId) return
    const generation = ++this.generation
    this.busy.set(true)
    this.error.set(null)
    try {
      const project = await firstValueFrom(this.api.get(projectId))
      if (generation !== this.generation) return
      if (project.id !== projectId) throw Error('PROJECT_APPLICATION_CONTEXT_CHANGED')
      if (!project.applicationKey || !project.projectTypeKey) {
        if (!(await this.router.navigate(['/project', projectId])))
          throw Error('PROJECT_APPLICATION_NAVIGATION_CANCELLED')
        return
      }
      const entry = await firstValueFrom(
        this.api.typeEntry(
          { applicationKey: project.applicationKey, projectTypeKey: project.projectTypeKey },
          {
            projectId,
            ...(this.route.snapshot.queryParamMap.get('pipelineNodeId')
              ? { pipelineNodeId: this.route.snapshot.queryParamMap.get('pipelineNodeId')! }
              : {})
          }
        )
      )
      if (generation !== this.generation) return
      if (entry.projectId !== projectId) throw Error('PROJECT_APPLICATION_CONTEXT_CHANGED')
      if (!(await navigateProjectEntry(this.router, entry))) throw Error('PROJECT_APPLICATION_NAVIGATION_CANCELLED')
    } catch (error) {
      if (generation === this.generation) this.error.set(getErrorMessage(error))
    } finally {
      if (generation === this.generation) this.busy.set(false)
    }
  }
}
