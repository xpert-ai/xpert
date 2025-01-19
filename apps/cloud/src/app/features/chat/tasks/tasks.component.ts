import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { Router, RouterModule } from '@angular/router'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { derivedAsync } from 'ngxtension/derived-async'
import { map } from 'rxjs'
import { getErrorMessage, injectToastr, IXpertTask, XpertTaskService, XpertTaskStatus } from '../../../@core'
import { XpertTaskDialogComponent } from '../../../@shared/chat'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    CdkMenuModule,
    TranslateModule,
    NgmCommonModule
  ],
  selector: 'pac-chat-tasks',
  templateUrl: './tasks.component.html',
  styleUrl: 'tasks.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatTasksComponent {

  eXpertTaskStatus = XpertTaskStatus

  readonly taskService = inject(XpertTaskService)
  readonly #toastr = injectToastr()
  readonly dialog = inject(Dialog)
  readonly router = inject(Router)

  readonly tasks = derivedAsync(() => this.taskService.getMyAll().pipe(map(({ items }) => items)))

  readonly scheduledTasks = derivedAsync(() =>
    this.tasks().filter(task => task.status === XpertTaskStatus.RUNNING)
  )

  readonly pausedTasks = derivedAsync(() => 
    this.tasks().filter(task => task.status === this.eXpertTaskStatus.PAUSED)
  )

  readonly loading = signal(false)
  
  editTask(task: IXpertTask) {
    this.dialog
      .open(XpertTaskDialogComponent, {
        data: {
          task
        }
      })
      .closed.subscribe({
        next: () => {}
      })
  }

  pauseTask(task: IXpertTask) {
    this.loading.set(true)
    this.taskService.pause(task.id).subscribe({
      next: () => {
        this.loading.set(false)
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  viewAllTaks() {
    this.router.navigate(['/chat/tasks'])
  }
}
