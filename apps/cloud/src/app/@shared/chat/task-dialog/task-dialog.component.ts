import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, inject, model, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatDatepickerModule } from '@angular/material/datepicker'
import {
  injectXperts,
  IXpert,
  IXpertTask,
  TaskFrequency,
  ToastrService,
  XpertTaskService,
  ScheduleTaskStatus
} from '@cloud/app/@core'
import { EmojiAvatarComponent } from '@cloud/app/@shared/avatar'
import { NgmProgressSpinnerComponent, NgmSearchComponent, NgmSpinComponent } from '@metad/ocap-angular/common'
import { attrModel, linkedModel, myRxResource } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { isNil } from 'lodash-es'
import { of } from 'rxjs'

@Component({
  selector: 'xpert-task-new-blank',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    DragDropModule,
    FormsModule,
    ReactiveFormsModule,
    CdkListboxModule,
    CdkMenuModule,
    MatDatepickerModule,
    NgmSpinComponent,
    EmojiAvatarComponent,
    NgmSearchComponent,
    NgmProgressSpinnerComponent
  ],
  templateUrl: './task-dialog.component.html',
  styleUrl: './task-dialog.component.scss'
})
export class XpertTaskDialogComponent {
  eTaskFrequency = TaskFrequency

  readonly #data = inject<{ task: IXpertTask; total: number }>(DIALOG_DATA)
  readonly #dialogRef = inject(DialogRef<IXpertTask | undefined>)
  readonly #toastr = inject(ToastrService)
  readonly taskAPI = inject(XpertTaskService)
  readonly myXperts = injectXperts()

  readonly #myTasks = myRxResource({
    request: () => this.#data.total,
    loader: ({ request }) => {
      return isNil(request) ? this.taskAPI.total({ where: { status: ScheduleTaskStatus.SCHEDULED } }) : of(request)
    }
  })
  readonly total = this.#myTasks.value
  readonly task = model<Partial<IXpertTask>>(this.#data.task ?? {})
  readonly name = attrModel(this.task, 'name')
  readonly xpertId = attrModel(this.task, 'xpertId')
  readonly options = attrModel(this.task, 'options')
  readonly prompt = attrModel(this.task, 'prompt')
  readonly frequency = attrModel(this.options, 'frequency', TaskFrequency.Once)
  readonly _frequency = linkedModel({
    initialValue: [TaskFrequency.Once],
    compute: () => (this.frequency() ? [this.frequency()] : [TaskFrequency.Once]),
    update: (value) => {
      this.frequency.update(() => value?.[0])
    }
  })
  readonly time = attrModel(this.options, 'time')
  readonly date = attrModel(this.options, 'date')
  readonly dayOfWeek = attrModel(this.options, 'dayOfWeek')
  readonly dayOfMonth = attrModel(this.options, 'dayOfMonth')

  readonly dayLabel = computed(
    () => this.WEEKLY_OPTIONS.find((option) => option.value === this.dayOfWeek())?.label || 'Select Day'
  )

  readonly FREQUENCY_OPTIONS = Object.values(TaskFrequency).map((frequency) => ({
    label: frequency,
    value: frequency
  }))

  readonly WEEKLY_OPTIONS = [
    {
      value: 1,
      label: 'Monday'
    },
    {
      value: 2,
      label: 'Tuesday'
    },
    {
      value: 3,
      label: 'Wednesday'
    },
    {
      value: 4,
      label: 'Thursday'
    },
    {
      value: 5,
      label: 'Friday'
    },
    {
      value: 6,
      label: 'Saturday'
    },
    {
      value: 7,
      label: 'Sunday'
    }
  ]

  readonly xpert = computed(() => this.myXperts()?.find((xpert) => xpert.id === this.xpertId()))

  readonly loading = signal(false)
  readonly search = model<string>('')

  selectDay(day: number) {
    this.dayOfWeek.set(day)
  }

  bindExpert(xpert: IXpert) {
    this.xpertId.set(xpert.id)
  }

  close(value?: IXpertTask) {
    this.#dialogRef.close(value)
  }

  createTask() {
    this.loading.set(true)
    this.taskAPI
      .upsert({
        ...this.task(),
        options: {
          ...this.options(),
          frequency: this.frequency() || TaskFrequency.Once
        },
        status: ScheduleTaskStatus.SCHEDULED,
        xpertId: this.xpertId()
      })
      .subscribe({
        next: (task) => {
          this.loading.set(false)
          this.#toastr.success('Task created successfully')
          this.close(task)
        },
        error: (error) => {
          this.loading.set(false)
          this.#toastr.error(error.message || 'Failed to create task')
        }
      })
  }
}
