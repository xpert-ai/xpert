import { Dialog } from '@angular/cdk/dialog'
import { CommonModule, Location } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core'
import { Router } from '@angular/router'
import { XpertInlineProfileComponent } from '@cloud/app/@shared/xpert'
import { NgmCommonModule } from '@xpert-ai/ocap-angular/common'
import { myRxResource } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { derivedAsync } from 'ngxtension/derived-async'
import { injectParams } from 'ngxtension/inject-params'
import { BehaviorSubject, debounceTime, map, of, startWith, switchMap } from 'rxjs'
import {
  DateRelativePipe,
  IChatConversation,
  getErrorMessage,
  injectToastr,
  IXpertTask,
  OrderTypeEnum,
  XpertTaskService,
  ScheduleTaskStatus
} from '../../../@core'
import { EmojiAvatarComponent } from '../../../@shared/avatar'
import { sortBy } from 'lodash-es'
import { XpertTaskDialogComponent, XpertTaskDialogService } from '@cloud/app/@shared/chat'
import { ZardBadgeComponent, ZardButtonComponent, ZardEmptyComponent, ZardTooltipImports } from '@xpert-ai/headless-ui'
import { buildTaskHistoryConversationRoute } from './tasks.utils'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    ...ZardTooltipImports,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardEmptyComponent,
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
  readonly #taskDialog = inject(XpertTaskDialogService)
  readonly #location = inject(Location)
  readonly #router = inject(Router)
  readonly paramId = injectParams('id')
  readonly embedded = input(false)
  readonly xpertId = input<string | null>(null)
  readonly tasksChanged = output<void>()
  readonly conversationSelected = output<IChatConversation>()

  // Refresh debounce 5 seconds
  readonly #refresh$ = new BehaviorSubject<void>(null)
  readonly refresh$ = this.#refresh$.pipe(debounceTime(5000), startWith(true))
  // Refresh immediately
  readonly _refresh = signal({})
  readonly tasks = derivedAsync(() => {
    this._refresh()
    const xpertId = this.xpertId()

    return this.refresh$.pipe(
      switchMap(() =>
        this.taskService.getMyAll({
          relations: ['xpert', 'conversations'],
          order: { updatedAt: OrderTypeEnum.DESC },
          ...(xpertId
            ? {
                where: {
                  xpertId
                } as never
              }
            : {})
        })
      ),
      map(({ items }) => items)
    )
  })

  readonly scheduledTasks = derivedAsync(() =>
    this.tasks()?.filter((task) => task.status === ScheduleTaskStatus.SCHEDULED)
  )
  readonly pausedTasks = derivedAsync(() => this.tasks()?.filter((task) => task.status === ScheduleTaskStatus.PAUSED))
  readonly archivedTasks = derivedAsync(() =>
    this.tasks()?.filter((task) => task.status === ScheduleTaskStatus.ARCHIVED)
  )
  readonly tasksLoaded = computed(() => Array.isArray(this.tasks()))
  readonly totalTaskCount = computed(() => this.tasks()?.length ?? 0)
  readonly scheduledTaskCount = computed(() => this.scheduledTasks()?.length ?? 0)
  readonly pausedTaskCount = computed(() => this.pausedTasks()?.length ?? 0)
  readonly archivedTaskCount = computed(() => this.archivedTasks()?.length ?? 0)
  readonly successfulExecutionCount = computed(
    () => this.tasks()?.reduce((total, task) => total + (task.successCount ?? 0), 0) ?? 0
  )
  readonly failedExecutionCount = computed(
    () => this.tasks()?.reduce((total, task) => total + (task.errorCount ?? 0), 0) ?? 0
  )

  // Details
  readonly taskId = signal<string>(null)
  readonly openedTask = computed(() => this.tasks()?.find((task) => task.id === this.taskId()))
  readonly #taskDetail = myRxResource({
    request: () => ({ id: this.openedTask()?.id }),
    loader: ({ request }) => {
      const taskId = request.id
      return taskId
        ? this.taskService.getOneById(taskId, {
            relations: ['xpert', 'conversations']
          })
        : of(null)
    }
  })
  readonly taskHistory = this.#taskDetail.value
  readonly historyConversations = computed(() =>
    this.taskHistory()?.conversations ? sortBy(this.taskHistory()?.conversations, 'updatedAt').reverse() : []
  )
  readonly taskDetailLoading = computed(() => this.#taskDetail.status() === 'loading')

  readonly loading = signal(false)

  constructor() {
    effect(() => {
      if (this.embedded()) {
        return
      }

      if (this.paramId()) {
        this.taskId.set(this.paramId())
      }
    })

    effect(() => {
      if (this.embedded()) {
        return
      }

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

  openHistoryConversation(conversation: IChatConversation) {
    if (this.embedded()) {
      this.conversationSelected.emit(conversation)
      return
    }

    const route = buildTaskHistoryConversationRoute(conversation, this.taskHistory() ?? this.openedTask())
    if (!route) {
      this.#toastr.error('PAC.Chat.ClawXpert.TaskHistoryThreadMissing', 'PAC.TOASTR.TITLE.ERROR', {
        Default: 'This task history record has no conversation thread.'
      })
      return
    }

    void this.#router.navigate(route)
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
            this.refreshTasks()
          }
        }
      })
  }

  pauseTask(task: IXpertTask) {
    this.loading.set(true)
    this.taskService.pause(task.id).subscribe({
      next: () => {
        this.loading.set(false)
        this.refreshTasks()
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
        this.refreshTasks()
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
        this.refreshTasks()
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  newTask() {
    this.#taskDialog
      .openCreateTask({
        total: this.scheduledTasks()?.length,
        xpertId: this.xpertId(),
        lockXpertSelection: !!this.xpertId()
      })
      .closed.subscribe({
        next: (task) => {
          if (task?.id) {
            this.refreshTasks(task.id)
          }
        }
      })
  }

  runTask(task: IXpertTask) {
    this.loading.set(true)
    this.taskService.test(task.id).subscribe({
      next: () => {
        this.loading.set(false)
        this.refreshTasks()
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  private refreshTasks(taskId?: string) {
    if (taskId) {
      this.taskId.set(taskId)
    }

    this._refresh.set({})
    this.tasksChanged.emit()
  }
}
