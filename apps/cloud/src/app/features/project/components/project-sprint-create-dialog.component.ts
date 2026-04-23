import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import {
  IProjectCore,
  IProjectSprint,
  IProjectTask,
  ProjectSprintStatusEnum,
  ProjectSprintStrategyEnum
} from '@xpert-ai/contracts'
import {
  getErrorMessage,
  injectToastr,
  ProjectSprintService,
  ProjectSwimlaneService,
  ProjectTaskService
} from '../../../@core'
import {
  ZardButtonComponent,
  ZardCheckboxComponent,
  ZardFormImports,
  ZardInputDirective,
  ZardSelectImports
} from '@xpert-ai/headless-ui'
import { formatProjectLabel, getBacklogSwimlane } from '../project-page.utils'

type ProjectSprintCreateDialogData = {
  project: IProjectCore
  currentSprint?: IProjectSprint | null
  backlogTasks?: IProjectTask[]
}

@Component({
  standalone: true,
  selector: 'xp-project-sprint-create-dialog',
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
  templateUrl: './project-sprint-create-dialog.component.html',
  styles: `
    :host {
      display: block;
      width: min(56rem, calc(100vw - 2rem));
      max-width: 100%;
      max-height: 90vh;
      overflow: auto;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProjectSprintCreateDialogComponent {
  readonly #dialogRef = inject(DialogRef<IProjectSprint | undefined>)
  readonly #data = inject<ProjectSprintCreateDialogData>(DIALOG_DATA)
  readonly #projectSprintService = inject(ProjectSprintService)
  readonly #projectSwimlaneService = inject(ProjectSwimlaneService)
  readonly #projectTaskService = inject(ProjectTaskService)
  readonly #toastr = injectToastr()

  readonly project = this.#data.project
  readonly currentSprint = this.#data.currentSprint ?? null
  readonly backlogTasks = this.#data.backlogTasks ?? []
  readonly submitting = signal(false)
  readonly strategyOptions = Object.values(ProjectSprintStrategyEnum)
  readonly statusOptions = [ProjectSprintStatusEnum.Planned, ProjectSprintStatusEnum.Running]
  readonly selectedCarryOverTaskIds = signal<string[]>([])
  readonly formatProjectLabel = formatProjectLabel

  readonly form = new FormGroup({
    goal: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/)]
    }),
    strategyType: new FormControl<ProjectSprintStrategyEnum>(
      this.currentSprint?.strategyType ?? ProjectSprintStrategyEnum.SoftwareDelivery,
      {
        nonNullable: true,
        validators: [Validators.required]
      }
    ),
    status: new FormControl<ProjectSprintStatusEnum>(ProjectSprintStatusEnum.Planned, {
      nonNullable: true,
      validators: [Validators.required]
    }),
    startAt: new FormControl('', {
      nonNullable: true
    }),
    endAt: new FormControl('', {
      nonNullable: true
    })
  })

  readonly startAtValue = toSignal(this.form.controls.startAt.valueChanges, {
    initialValue: this.form.controls.startAt.value
  })
  readonly endAtValue = toSignal(this.form.controls.endAt.valueChanges, {
    initialValue: this.form.controls.endAt.value
  })
  readonly hasCarryOverTasks = computed(() => this.backlogTasks.length > 0)
  readonly selectedCarryOverCount = computed(() => this.selectedCarryOverTaskIds().length)

  constructor() {
    effect(() => {
      const startAt = this.startAtValue()
      const endAt = this.endAtValue()
      if (!startAt || !endAt) {
        if (this.form.controls.endAt.hasError('endBeforeStart')) {
          this.form.controls.endAt.setErrors(null)
        }
        return
      }

      if (new Date(endAt).getTime() < new Date(startAt).getTime()) {
        this.form.controls.endAt.setErrors({ endBeforeStart: true })
      } else if (this.form.controls.endAt.hasError('endBeforeStart')) {
        this.form.controls.endAt.setErrors(null)
      }
    })
  }

  close() {
    if (this.submitting()) {
      return
    }

    this.#dialogRef.close()
  }

  toggleCarryOverTask(taskId: string) {
    if (!taskId) {
      return
    }

    const current = this.selectedCarryOverTaskIds()
    if (current.includes(taskId)) {
      this.selectedCarryOverTaskIds.set(current.filter((id) => id !== taskId))
      return
    }

    this.selectedCarryOverTaskIds.set([...current, taskId])
  }

  async submit() {
    if (this.form.invalid || !this.project.id) {
      this.form.markAllAsTouched()
      return
    }

    const value = this.form.getRawValue()
    this.submitting.set(true)

    try {
      const sprint = await firstValueFrom(
        this.#projectSprintService.create({
          projectId: this.project.id,
          goal: value.goal.trim(),
          strategyType: value.strategyType,
          status: value.status,
          ...(value.startAt ? { startAt: this.toDate(value.startAt) } : {}),
          ...(value.endAt ? { endAt: this.toDate(value.endAt) } : {})
        })
      )

      await this.carryOverBacklogTasks(sprint)
      this.#dialogRef.close(sprint)
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.submitting.set(false)
    }
  }

  private async carryOverBacklogTasks(sprint: IProjectSprint) {
    if (!sprint.id || !this.project.id || !this.selectedCarryOverTaskIds().length) {
      return
    }

    try {
      const { items: swimlanes = [] } = await firstValueFrom(
        this.#projectSwimlaneService.listBySprint(this.project.id, sprint.id)
      )
      const backlogLane = getBacklogSwimlane(swimlanes)
      if (!backlogLane?.id) {
        throw new Error('Backlog swimlane was not generated for the new sprint.')
      }

      await firstValueFrom(
        this.#projectTaskService.moveTasks({
          taskIds: this.selectedCarryOverTaskIds(),
          targetSwimlaneId: backlogLane.id
        })
      )
    } catch (error) {
      this.#toastr.warning(getErrorMessage(error))
    }
  }

  private toDate(value: string) {
    return new Date(`${value}T00:00:00`)
  }
}
