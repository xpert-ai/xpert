import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, signal } from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import {
  createOptionalTeamId,
  IProjectCore,
  IProjectSprint,
  IProjectSwimlane,
  IProjectTask,
  ProjectSwimlaneKindEnum,
  ProjectTaskStatusEnum
} from '@xpert-ai/contracts'
import { getErrorMessage, injectToastr, ProjectTaskService } from '../../../@core'
import {
  ZardButtonComponent,
  ZardCheckboxComponent,
  ZardFormImports,
  ZardInputDirective,
  ZardSelectImports
} from '@xpert-ai/headless-ui'
import { formatProjectLabel, getDefaultTaskSwimlane, ProjectBoundTeamViewModel } from '../project-page.utils'

type ProjectTaskDialogData = {
  project: IProjectCore
  sprint: IProjectSprint
  swimlanes: IProjectSwimlane[]
  tasks: IProjectTask[]
  boundTeams: ProjectBoundTeamViewModel[]
  task?: IProjectTask | null
  preferredSwimlaneId?: string | null
}

@Component({
  standalone: true,
  selector: 'xp-project-task-dialog',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    ZardButtonComponent,
    ZardCheckboxComponent,
    ZardInputDirective,
    ...ZardFormImports,
    ...ZardSelectImports
  ],
  templateUrl: './project-task-dialog.component.html',
  styles: `
    :host {
      display: block;
      width: min(60rem, calc(100vw - 2rem));
      max-width: 100%;
      max-height: 90vh;
      overflow: auto;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProjectTaskDialogComponent {
  readonly #dialogRef = inject(DialogRef<IProjectTask | undefined>)
  readonly #data = inject<ProjectTaskDialogData>(DIALOG_DATA)
  readonly #projectTaskService = inject(ProjectTaskService)
  readonly #toastr = injectToastr()
  readonly #destroyRef = inject(DestroyRef)

  readonly project = this.#data.project
  readonly sprint = this.#data.sprint
  readonly task = this.#data.task ?? null
  readonly swimlanes = this.#data.swimlanes
  readonly tasks = this.#data.tasks
  readonly boundTeams = this.#data.boundTeams
  readonly submitting = signal(false)
  readonly formatProjectLabel = formatProjectLabel
  readonly allStatusOptions = Object.values(ProjectTaskStatusEnum)

  readonly form = new FormGroup({
    title: new FormControl(this.task?.title ?? '', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/)]
    }),
    description: new FormControl(this.task?.description ?? '', {
      nonNullable: true
    }),
    swimlaneId: new FormControl(
      this.task?.swimlaneId ?? this.#data.preferredSwimlaneId ?? getDefaultTaskSwimlane(this.swimlanes)?.id ?? '',
      {
        nonNullable: true,
        validators: [Validators.required]
      }
    ),
    status: new FormControl(this.task?.status ?? ProjectTaskStatusEnum.Todo, {
      nonNullable: true,
      validators: [Validators.required]
    }),
    teamId: new FormControl(this.task?.teamId ?? '', {
      nonNullable: true
    }),
    dependencies: new FormControl<string[]>(this.task?.dependencies ?? [], {
      nonNullable: true
    })
  })

  readonly swimlaneIdValue = toSignal(this.form.controls.swimlaneId.valueChanges, {
    initialValue: this.form.controls.swimlaneId.value
  })
  readonly selectedSwimlane = computed(
    () => this.swimlanes.find((lane) => lane.id === this.swimlaneIdValue()) ?? null
  )
  readonly isBacklogLane = computed(
    () => (this.selectedSwimlane()?.kind ?? ProjectSwimlaneKindEnum.Execution) === ProjectSwimlaneKindEnum.Backlog
  )
  readonly availableStatusOptions = computed(() =>
    this.isBacklogLane() ? [ProjectTaskStatusEnum.Todo] : this.allStatusOptions
  )
  readonly availableDependencies = computed(() =>
    this.tasks.filter((task) => task.id !== this.task?.id && task.sprintId === this.sprint.id)
  )
  readonly hasTeams = computed(() => this.boundTeams.length > 0)
  readonly dialogTitle = computed(() =>
    this.task
      ? 'PAC.Project.TaskDialogEditTitle'
      : 'PAC.Project.TaskDialogCreateTitle'
  )
  readonly dialogTitleDefault = computed(() =>
    this.task ? 'Task details' : 'Create task'
  )

  constructor() {
    effect(() => {
      this.normalizeBacklogLane(this.isBacklogLane())
    })

    this.form.controls.swimlaneId.valueChanges
      .pipe(takeUntilDestroyed(this.#destroyRef))
      .subscribe((swimlaneId) => {
        this.normalizeBacklogLane(this.isBacklogSwimlaneId(swimlaneId))
      })
  }

  close() {
    if (this.submitting()) {
      return
    }

    this.#dialogRef.close()
  }

  toggleDependency(taskId: string) {
    if (!taskId || this.isBacklogLane()) {
      return
    }

    const current = this.form.controls.dependencies.value
    if (current.includes(taskId)) {
      this.form.controls.dependencies.setValue(current.filter((id) => id !== taskId))
      return
    }

    this.form.controls.dependencies.setValue([...current, taskId])
  }

  async submit() {
    if (this.form.invalid || !this.project.id || !this.sprint.id) {
      this.form.markAllAsTouched()
      return
    }

    const value = this.form.getRawValue()
    const payload = {
      projectId: this.project.id,
      sprintId: this.sprint.id,
      swimlaneId: value.swimlaneId,
      title: value.title.trim(),
      description: value.description.trim() || undefined,
      status: this.isBacklogLane() ? ProjectTaskStatusEnum.Todo : value.status,
      dependencies: this.isBacklogLane() ? [] : value.dependencies,
      teamId: createOptionalTeamId(value.teamId || null) ?? null
    }

    this.submitting.set(true)

    try {
      const result = this.task?.id
        ? await firstValueFrom(this.#projectTaskService.update(this.task.id, payload))
        : await firstValueFrom(this.#projectTaskService.create(payload))

      this.#dialogRef.close(result as IProjectTask)
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.submitting.set(false)
    }
  }

  private isBacklogSwimlaneId(swimlaneId: string) {
    const swimlane = this.swimlanes.find((lane) => lane.id === swimlaneId)
    return (swimlane?.kind ?? ProjectSwimlaneKindEnum.Execution) === ProjectSwimlaneKindEnum.Backlog
  }

  private normalizeBacklogLane(isBacklogLane: boolean) {
    if (!isBacklogLane) {
      return
    }

    if (this.form.controls.status.value !== ProjectTaskStatusEnum.Todo) {
      this.form.controls.status.setValue(ProjectTaskStatusEnum.Todo)
    }

    if (this.form.controls.dependencies.value.length) {
      this.form.controls.dependencies.setValue([])
    }
  }
}
