import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import type { IProjectCore, IProjectTeamBinding, ITeamDefinition } from '@xpert-ai/contracts'
import { ZardButtonComponent, ZardInputDirective } from '@xpert-ai/headless-ui'
import { NgmSpinComponent } from '@xpert-ai/ocap-angular/common'
import { injectToastr, TeamBindingService, TeamDefinitionService } from '../../../@core/services'
import { getErrorMessage } from '../../../@core/types'

type ProjectTeamBindingsDialogData = {
  project: IProjectCore
}

type ProjectTeamBindingDraft = {
  bindingId?: string
  teamId: IProjectTeamBinding['teamId']
  role: string
  sortOrder: number
}

@Component({
  standalone: true,
  selector: 'xp-project-team-bindings-dialog',
  imports: [CommonModule, FormsModule, TranslateModule, NgmSpinComponent, ZardButtonComponent, ZardInputDirective],
  templateUrl: './project-team-bindings-dialog.component.html',
  styles: `
    :host {
      display: block;
      width: min(72rem, calc(100vw - 2rem));
      max-width: 100%;
      max-height: 90vh;
      overflow: auto;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProjectTeamBindingsDialogComponent {
  readonly #dialogRef = inject(DialogRef<boolean | undefined>)
  readonly #data = inject<ProjectTeamBindingsDialogData>(DIALOG_DATA)
  readonly #teamDefinitionService = inject(TeamDefinitionService)
  readonly #teamBindingService = inject(TeamBindingService)
  readonly #toastr = injectToastr()

  readonly project = this.#data.project
  readonly loading = signal(true)
  readonly submitting = signal(false)
  readonly error = signal<string | null>(null)
  readonly teams = signal<ITeamDefinition[]>([])
  readonly existingBindings = signal<IProjectTeamBinding[]>([])
  readonly draftBindings = signal<ProjectTeamBindingDraft[]>([])

  readonly selectedTeamIds = computed(() => new Set(this.draftBindings().map((binding) => binding.teamId)))
  readonly availableTeams = computed(() => this.teams())
  readonly selectedBindings = computed(() => {
    const teamById = new Map(this.teams().map((team) => [team.id, team]))
    return this.draftBindings()
      .map((binding) => {
        const team = teamById.get(binding.teamId)
        return team ? { binding, team } : null
      })
      .filter((value): value is { binding: ProjectTeamBindingDraft; team: ITeamDefinition } => value !== null)
  })

  constructor() {
    void this.load()
  }

  close() {
    if (this.submitting()) {
      return
    }

    this.#dialogRef.close()
  }

  isSelected(teamId: IProjectTeamBinding['teamId']) {
    return this.selectedTeamIds().has(teamId)
  }

  toggleTeam(teamId: IProjectTeamBinding['teamId']) {
    const current = this.draftBindings()
    const existingIndex = current.findIndex((binding) => binding.teamId === teamId)

    if (existingIndex >= 0) {
      const next = current.filter((binding) => binding.teamId !== teamId).map((binding, index) => ({
        ...binding,
        sortOrder: index
      }))
      this.draftBindings.set(next)
      return
    }

    this.draftBindings.set([
      ...current,
      {
        teamId,
        role: '',
        sortOrder: current.length
      }
    ])
  }

  updateRole(teamId: IProjectTeamBinding['teamId'], role: string) {
    this.draftBindings.set(
      this.draftBindings().map((binding) =>
        binding.teamId === teamId
          ? {
              ...binding,
              role
            }
          : binding
      )
    )
  }

  async submit() {
    const projectId = this.project.id
    if (!projectId) {
      this.#toastr.error('Project id is required.')
      return
    }

    this.submitting.set(true)

    try {
      const currentBindings = this.existingBindings()
      const nextBindings = this.draftBindings()
      const nextTeamIds = new Set(nextBindings.map((binding) => binding.teamId))

      const removedBindings = currentBindings.filter((binding) => !nextTeamIds.has(binding.teamId))
      for (const binding of removedBindings) {
        await firstValueFrom(this.#teamBindingService.delete(binding.id))
      }

      for (const [index, draft] of nextBindings.entries()) {
        const existingBinding = currentBindings.find((binding) => binding.teamId === draft.teamId)
        if (existingBinding) {
          const normalizedRole = draft.role.trim()
          const currentRole = existingBinding.role?.trim() ?? ''
          if (currentRole !== normalizedRole || existingBinding.sortOrder !== index) {
            await firstValueFrom(
              this.#teamBindingService.update(existingBinding.id, {
                role: normalizedRole,
                sortOrder: index
              })
            )
          }
          continue
        }

        await firstValueFrom(
          this.#teamBindingService.create({
            projectId,
            teamId: draft.teamId,
            role: draft.role.trim(),
            sortOrder: index
          })
        )
      }

      this.#dialogRef.close(true)
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.submitting.set(false)
    }
  }

  private async load() {
    const projectId = this.project.id
    if (!projectId) {
      this.error.set('Project id is required.')
      this.loading.set(false)
      return
    }

    this.loading.set(true)
    this.error.set(null)

    try {
      const [teams, bindingsResult] = await Promise.all([
        firstValueFrom(this.#teamDefinitionService.getAll()),
        firstValueFrom(this.#teamBindingService.listByProject(projectId))
      ])

      this.teams.set(teams)
      this.existingBindings.set(bindingsResult.items ?? [])
      this.draftBindings.set(
        (bindingsResult.items ?? []).map((binding, index) => ({
          bindingId: binding.id,
          teamId: binding.teamId,
          role: binding.role ?? '',
          sortOrder: binding.sortOrder ?? index
        }))
      )
    } catch (error) {
      this.error.set(getErrorMessage(error))
      this.teams.set([])
      this.existingBindings.set([])
      this.draftBindings.set([])
    } finally {
      this.loading.set(false)
    }
  }
}
