import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { Router, RouterModule } from '@angular/router'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { derivedAsync } from 'ngxtension/derived-async'
import { BehaviorSubject, map, switchMap } from 'rxjs'
import {
  getErrorMessage,
  injectToastr,
  IXpertTask,
  OrderTypeEnum,
  XpertTaskService,
  XpertTaskStatus
} from '../../../@core'
import { EmojiAvatarComponent } from '../../../@shared/avatar'
import { XpertTaskDialogComponent } from '../../../@shared/chat'
import { XpertTaskNewBlankComponent } from './blank/blank.component'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    CdkMenuModule,
    TranslateModule,
    MatTooltipModule,
    NgmCommonModule,
    EmojiAvatarComponent,
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

  readonly #refresh$ = new BehaviorSubject<void>(null)
  readonly tasks = derivedAsync(() =>
    this.#refresh$.pipe(
      switchMap(() => this.taskService.getMyAll({ relations: ['xpert'], order: { updatedAt: OrderTypeEnum.DESC } })),
      map(({ items }) => items)
    )
  )

  readonly scheduledTasks = derivedAsync(() => this.tasks()?.filter((task) => task.status === XpertTaskStatus.RUNNING))

  readonly pausedTasks = derivedAsync(() => this.tasks()?.filter((task) => task.status === XpertTaskStatus.PAUSED))

  readonly loading = signal(false)

  editTask(task: IXpertTask) {
    this.dialog
      .open(XpertTaskDialogComponent, {
        data: {
          task
        }
      })
      .closed.subscribe({
        next: (task) => {
          if (task) {
            this.#refresh$.next()
          }
        }
      })
  }

  pauseTask(task: IXpertTask) {
    this.loading.set(true)
    this.taskService.pause(task.id).subscribe({
      next: () => {
        this.loading.set(false)
        this.#refresh$.next()
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

  newTask() {
    this.dialog.open(XpertTaskNewBlankComponent, {
      disableClose: true,
      backdropClass: 'xp-overlay-share-sheet',
      panelClass: 'xp-overlay-pane-share-sheet',
    }).closed.subscribe({
      next: (task) => {
        if (task) {
          this.#refresh$.next()
        }
      }
    })
  }
}
