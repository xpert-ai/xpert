import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, inject, model, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import {
  injectXperts,
  ISemanticModelEntity,
  SemanticModelEntityService,
  TaskFrequency,
  ToastrService
} from '@cloud/app/@core'
import { ScheduleFormComponent } from '@cloud/app/@shared/schedule'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { attrModel } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { omit } from 'lodash-es'


@Component({
  selector: 'model-sync-task',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    DragDropModule,
    FormsModule,
    ReactiveFormsModule,
    CdkMenuModule,
    NgmSpinComponent,
    ScheduleFormComponent
  ],
  templateUrl: './task.component.html',
  styleUrl: './task.component.scss'
})
export class ModelTaskDialogComponent {
  eTaskFrequency = TaskFrequency

  readonly #data = inject<{ task: ISemanticModelEntity; total: number }>(DIALOG_DATA)
  readonly #dialogRef = inject(DialogRef<ISemanticModelEntity | undefined>)
  readonly #toastr = inject(ToastrService)
  readonly modelEntityAPI = inject(SemanticModelEntityService)
  readonly myXperts = injectXperts()

  readonly task = model<Partial<ISemanticModelEntity>>(this.#data.task ?? {})
  readonly name = attrModel(this.task, 'name')
  readonly schedule = attrModel(this.task, 'schedule')

  readonly loading = signal(false)
  readonly search = model<string>('')

  close(value?: ISemanticModelEntity) {
    this.#dialogRef.close(value)
  }

  createTask() {
    this.loading.set(true)
    this.modelEntityAPI
      .startSchedule(this.task().id, {
        schedule: {...this.schedule(), frequency: this.schedule().frequency || TaskFrequency.Once}
      })
      .subscribe({
        next: (task) => {
          this.loading.set(false)
          this.#toastr.success('PAC.MODEL.TaskCreatedSuccessfully', {Default: 'Task created successfully'})
          this.close(task)
        },
        error: (error) => {
          this.loading.set(false)
          this.#toastr.error(error.message || 'Failed to create task')
        }
      })
  }

  remove() {
    this.loading.set(true)
    this.modelEntityAPI.removeSchedule(this.task().id).subscribe({
      next: () => {
        this.loading.set(false)
        // this.#toastr.success('Task deleted successfully')
        this.close(omit(this.task(), 'schedule'))
      },
      error: (error) => {
        this.loading.set(false)
        this.#toastr.error(error.message || 'Failed to delete task')
      }
    })
  }
}
