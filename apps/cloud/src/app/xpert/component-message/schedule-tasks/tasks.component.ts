import { Dialog } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { isEqual, isNil } from 'lodash-es'
import { distinctUntilChanged, filter, map, switchMap } from 'rxjs'
import { injectToastr, XpertTaskService } from '../../../@core'
import { getErrorMessage, IXpertTask, ScheduleTaskStatus } from '../../../@core/types'
import { XpertTaskDialogComponent } from '../../../@shared/chat'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    DragDropModule,
    CdkMenuModule,
    RouterModule,
    TranslateModule,
    MatTooltipModule,
    NgmSpinComponent
  ],
  selector: 'chat-component-schedule-tasks',
  templateUrl: './tasks.component.html',
  styleUrl: 'tasks.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatComponentScheduleTasksComponent {
  eXpertTaskStatus = ScheduleTaskStatus

  readonly dialog = inject(Dialog)
  readonly taskService = inject(XpertTaskService)
  readonly #toastr = injectToastr()

  // Inputs
  readonly tasks = input<IXpertTask[]>()

  // States
  readonly taskDetails = signal<IXpertTask[]>(null)
  readonly syncedTasks = computed(() => {
    return this.taskDetails() ? this.tasks().map(
      (_) => this.taskDetails().find((item) => item.id === _.id) ?? { ..._, deletedAt: new Date() }
    ) : this.tasks()
  })

  readonly loading = signal(false)

  private taskDetailSub = toObservable(this.tasks)
    .pipe(
      filter((_) => !isNil(_)),
      map((tasks) => tasks?.map((_) => _.id)),
      distinctUntilChanged(isEqual),
      switchMap((ids) => this.taskService.getByIds(ids)),
      map(({ items }) => items)
    )
    .subscribe((tasks) => this.taskDetails.set(tasks))

  constructor() {
    effect(() => {
      // console.log(this.tasks())
    })
  }

  editTask(task: IXpertTask) {
    this.dialog
      .open<IXpertTask>(XpertTaskDialogComponent, {
        data: {
          task
        }
      })
      .closed.subscribe({
        next: (task) => {
          if (task) {
            this.taskDetails.update((tasks) => [
              { ...task, status: ScheduleTaskStatus.PAUSED },
              ...(tasks?.filter((_) => _.id !== task.id) ?? [])
            ])
          }
        }
      })
  }

  pause(task: IXpertTask) {
    this.loading.set(true)
    this.taskService.pause(task.id).subscribe({
      next: () => {
        this.loading.set(false)
        this.taskDetails.update((tasks) => [
          { ...task, status: ScheduleTaskStatus.PAUSED },
          ...(tasks?.filter((_) => _.id !== task.id) ?? [])
        ])
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  schedule(task: IXpertTask) {
    this.loading.set(true)
    this.taskService.schedule(task.id).subscribe({
      next: () => {
        this.loading.set(false)
        this.taskDetails.update((tasks) => [
          { ...task, status: ScheduleTaskStatus.SCHEDULED },
          ...(tasks?.filter((_) => _.id !== task.id) ?? [])
        ])
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }
}
