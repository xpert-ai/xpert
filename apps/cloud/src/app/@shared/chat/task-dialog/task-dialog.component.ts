import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, inject, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import {
  getErrorMessage,
  injectXperts,
  IXpert,
  IXpertTask,
  ScheduleTaskStatus,
  TaskFrequency,
  ToastrService,
  XpertTaskService
} from '@cloud/app/@core'
import { EmojiAvatarComponent } from '@cloud/app/@shared/avatar'
import { NgmProgressSpinnerComponent, NgmSearchComponent, NgmSpinComponent } from '@metad/ocap-angular/common'
import { attrModel, myRxResource } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { isNil } from 'lodash-es'
import { of } from 'rxjs'
import { ScheduleFormComponent } from '../../schedule'

@Component({
  selector: 'xpert-task-new-blank',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    DragDropModule,
    FormsModule,
    CdkMenuModule,
    NgmSpinComponent,
    EmojiAvatarComponent,
    NgmSearchComponent,
    NgmProgressSpinnerComponent,
    ScheduleFormComponent
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

  readonly xpert = computed(() => this.myXperts()?.find((xpert) => xpert.id === this.xpertId()))

  readonly loading = signal(false)
  readonly search = model<string>('')

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
          frequency: this.options().frequency || TaskFrequency.Once
        },
        status: ScheduleTaskStatus.SCHEDULED,
        xpertId: this.xpertId()
      })
      .subscribe({
        next: (task) => {
          this.loading.set(false)
          this.#toastr.success('PAC.Xpert.TaskCreatedSuccessfully', {Default: 'Task created successfully'})
          this.close(task)
        },
        error: (error) => {
          this.loading.set(false)
          this.#toastr.error(getErrorMessage(error))
        }
      })
  }
}
