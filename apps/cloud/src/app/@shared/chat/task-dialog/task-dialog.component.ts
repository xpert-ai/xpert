import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { Component, inject, signal, viewChild } from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { catchError, switchMap, tap, of } from 'rxjs'
import { injectToastr, XpertTaskService } from '../../../@core'
import { getErrorMessage, IXpertTask } from '../../../@core/types'
import { XpertTaskFormComponent } from '../task-form/task-form.component'

@Component({
  standalone: true,
  selector: 'xpert-task-dialog',
  templateUrl: `task-dialog.component.html`,
  styleUrl: `task-dialog.component.scss`,
  imports: [CommonModule, FormsModule, DragDropModule, TranslateModule, NgmSpinComponent, XpertTaskFormComponent]
})
export class XpertTaskDialogComponent {
  readonly #data = inject<{ task: IXpertTask }>(DIALOG_DATA)
  readonly #dialogRef = inject(DialogRef)
  readonly taskService = inject(XpertTaskService)
  readonly #toastr = injectToastr()

  readonly form = viewChild('form', { read: XpertTaskFormComponent })

  readonly taskId = signal(this.#data.task.id)

  readonly task = signal(null)

  readonly loading = signal(false)

  private taskSub = toObservable(this.taskId)
    .pipe(switchMap((id) => this.getTaskDetail(id)))
    .subscribe((task) => {
      this.task.set(task)
    })

  getTaskDetail(id: string) {
    this.loading.set(true)
    return this.taskService.getOneById(id).pipe(
      catchError((err) => of(null)),
      tap(() => {
        this.loading.set(false)
      }),
    )
  }

  close() {
    this.#dialogRef.close()
  }

  delete() {
    this.loading.set(true)
    this.taskService.softDelete(this.taskId()).subscribe({
      next: () => {
        this.loading.set(false)
        this.close()
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  save() {
    console.log(this.form().formGroup.value)
  }
}
