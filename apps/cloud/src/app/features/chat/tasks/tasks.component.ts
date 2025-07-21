import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule, Location } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { Router, RouterModule } from '@angular/router'
import { XpertInlineProfileComponent } from '@cloud/app/@shared/xpert'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { myRxResource } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { derivedAsync } from 'ngxtension/derived-async'
import { injectParams } from 'ngxtension/inject-params'
import { BehaviorSubject, debounceTime, map, of, startWith, switchMap } from 'rxjs'
import {
  DateRelativePipe,
  getErrorMessage,
  injectToastr,
  IXpertTask,
  OrderTypeEnum,
  XpertTaskService,
  ScheduleTaskStatus
} from '../../../@core'
import { EmojiAvatarComponent } from '../../../@shared/avatar'
import { sortBy } from 'lodash-es'
import { XpertTaskDialogComponent } from '@cloud/app/@shared/chat'

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
    DateRelativePipe,
    XpertInlineProfileComponent
  ],
  selector: 'pac-chat-tasks',
  templateUrl: './tasks.component.html',
  styleUrl: 'tasks.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatTasksComponent {
  eXpertTaskStatus = ScheduleTaskStatus

  readonly taskService = inject(XpertTaskService)
  readonly #toastr = injectToastr()
  readonly dialog = inject(Dialog)
  readonly router = inject(Router)
  readonly #location = inject(Location)
  readonly paramId = injectParams('id')

  // Refresh debounce 5 seconds
  readonly #refresh$ = new BehaviorSubject<void>(null)
  readonly refresh$ = this.#refresh$.pipe(debounceTime(5000), startWith(true))
  // Refresh immediately
  readonly _refresh = signal({})
  readonly tasks = derivedAsync(() => this._refresh() &&
    this.refresh$.pipe(
      switchMap(() => this.taskService.getMyAll({ relations: ['xpert', 'conversations'], order: { updatedAt: OrderTypeEnum.DESC } })),
      map(({ items }) => items)
    )
  )

  readonly scheduledTasks = derivedAsync(() => this.tasks()?.filter((task) => task.status === ScheduleTaskStatus.SCHEDULED))
  readonly pausedTasks = derivedAsync(() => this.tasks()?.filter((task) => task.status === ScheduleTaskStatus.PAUSED))
  readonly archivedTasks = derivedAsync(() => this.tasks()?.filter((task) => task.status === ScheduleTaskStatus.ARCHIVED))

  // Details
  readonly taskId = signal<string>(null)
  readonly openedTask = computed(() => this.tasks()?.find((task) => task.id === this.taskId()))
  readonly #taskDetail = myRxResource({
    request: () => ({ id: this.openedTask()?.id }),
    loader: ({ request }) => {
      const taskId = request.id
      return taskId
        ? this.taskService.getOneById(taskId, {
            relations: ['xpert', 'conversations'],
          })
        : of(null)
    }
  })
  readonly taskHistory = this.#taskDetail.value
  readonly historyConversations = computed(() => this.taskHistory()?.conversations ? sortBy(this.taskHistory()?.conversations, 'updatedAt').reverse() : [])
  readonly taskDetailLoading = computed(() => this.#taskDetail.status() === 'loading')

  readonly loading = signal(false)

  constructor() {
    effect(
      () => {
        if (this.paramId()) {
          this.taskId.set(this.paramId())
        }
      },
      { allowSignalWrites: true }
    )

    effect(() => {
      if (this.taskId() && this.taskId() !== this.paramId()) {
        this.#location.replaceState('/chat/tasks/' + this.taskId())
      }
    })

    effect(() => {
      if (this.tasks()?.filter((_) => _.status === ScheduleTaskStatus.SCHEDULED).length > 0) {
        this.#refresh$.next()
      }
    })
  }

  openTask(task: IXpertTask) {
    this.taskId.set(task?.id)
  }

  editTask(task: IXpertTask) {
    this.dialog
      .open(XpertTaskDialogComponent, {
        data: {
          task
        },
        disableClose: true,
        backdropClass: 'xp-overlay-share-sheet',
        panelClass: 'xp-overlay-pane-share-sheet'
      })
      .closed.subscribe({
        next: (task) => {
          if (task) {
            this._refresh.set({})
          }
        }
      })
  }

  pauseTask(task: IXpertTask) {
    this.loading.set(true)
    this.taskService.pause(task.id).subscribe({
      next: () => {
        this.loading.set(false)
        this._refresh.set({})
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  scheduleTask(task: IXpertTask) {
    this.loading.set(true)
    this.taskService.schedule(task.id).subscribe({
      next: () => {
        this.loading.set(false)
        this._refresh.set({})
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  archiveTask(task: IXpertTask) {
    this.loading.set(true)
    this.taskService.archive(task.id).subscribe({
      next: () => {
        this.loading.set(false)
        this._refresh.set({})
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
    this.dialog
      .open<IXpertTask>(XpertTaskDialogComponent, {
        data: {total: this.scheduledTasks()?.length},
        disableClose: true,
        backdropClass: 'xp-overlay-share-sheet',
        panelClass: 'xp-overlay-pane-share-sheet'
      })
      .closed.subscribe({
        next: (task) => {
          if (task?.id) {
            this.taskId.set(task.id)
            this._refresh.set({})
          }
        }
      })
  }

  runTask(task: IXpertTask) {
    this.loading.set(true)
    this.taskService.test(task.id).subscribe({
      next: () => {
        this.loading.set(false)
        this._refresh.set({})
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }
}
