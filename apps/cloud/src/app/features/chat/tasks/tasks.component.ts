import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule, Location } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { Router } from '@angular/router'
import { XpertTaskDialogComponent, XpertTaskDialogService } from '@cloud/app/@shared/chat'
import { XpertInlineProfileComponent } from '@cloud/app/@shared/xpert'
import {
  DateRelativePipe,
  getErrorMessage,
  IChatConversation,
  injectToastr,
  IXpertTask,
  OrderTypeEnum,
  ScheduleTaskStatus,
  XpertTaskService
} from '../../../@core'
import { EmojiAvatarComponent } from '../../../@shared/avatar'
import {
  injectConfirmDelete,
  myRxResource,
  XpCommonModule,
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardTooltipImports
} from '@xpert-ai/headless-ui'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { derivedAsync } from 'ngxtension/derived-async'
import { injectParams } from 'ngxtension/inject-params'
import { sortBy } from 'lodash-es'
import { BehaviorSubject, debounceTime, forkJoin, map, of, startWith, switchMap } from 'rxjs'
import { AUTOMATION_TEMPLATES, type AutomationTemplate } from './automation-templates'
import {
  buildTaskExecutionRecords,
  buildTaskHistoryConversationRoute,
  filterArchivedTasks,
  filterCurrentTasks,
  filterTaskExecutionRecords,
  getTaskExecutionTotal,
  getTaskLastExecution,
  getTaskSuccessRate,
  type CurrentTaskStatusFilter,
  type TaskExecutionRecord
} from './tasks.utils'

export type TasksPageView = 'tasks' | 'history' | 'archived'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CdkMenuModule,
    TranslateModule,
    ...ZardTooltipImports,
    ZardBadgeComponent,
    ZardButtonComponent,
    XpCommonModule,
    EmojiAvatarComponent,
    DateRelativePipe,
    XpertInlineProfileComponent
  ],
  selector: 'xp-chat-tasks',
  templateUrl: './tasks.component.html',
  styleUrl: 'tasks.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatTasksComponent {
  readonly eXpertTaskStatus = ScheduleTaskStatus
  readonly automationTemplates = AUTOMATION_TEMPLATES

  readonly taskService = inject(XpertTaskService)
  readonly #toastr = injectToastr()
  readonly #translate = inject(TranslateService)
  readonly #confirmDelete = injectConfirmDelete()
  readonly dialog = inject(Dialog)
  readonly #taskDialog = inject(XpertTaskDialogService)
  readonly #location = inject(Location)
  readonly #router = inject(Router)
  readonly paramId = injectParams('id')
  readonly embedded = input(false)
  readonly xpertId = input<string | null>(null)
  readonly tasksChanged = output<void>()
  readonly conversationSelected = output<IChatConversation>()

  readonly view = signal<TasksPageView>('tasks')
  readonly searchQuery = signal('')
  readonly currentTaskFilter = signal<CurrentTaskStatusFilter>('all')
  readonly batchManaging = signal(false)
  readonly selectedTaskIds = signal(new Set<string>())
  readonly templatePickerOpen = signal(false)

  // Scheduled tasks update in the background while the page is open.
  readonly #refresh$ = new BehaviorSubject<void>(null)
  readonly refresh$ = this.#refresh$.pipe(debounceTime(5000), startWith(true))
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

  readonly tasksLoaded = computed(() => Array.isArray(this.tasks()))
  readonly scheduledTasks = computed(
    () => this.tasks()?.filter((task) => task.status === ScheduleTaskStatus.SCHEDULED) ?? []
  )
  readonly pausedTasks = computed(() => this.tasks()?.filter((task) => task.status === ScheduleTaskStatus.PAUSED) ?? [])
  readonly archivedTasks = computed(
    () => this.tasks()?.filter((task) => task.status === ScheduleTaskStatus.ARCHIVED) ?? []
  )
  readonly currentTasks = computed(() =>
    (this.tasks() ?? []).filter((task) => task.status !== ScheduleTaskStatus.ARCHIVED)
  )
  readonly currentTaskCount = computed(() => this.currentTasks().length)
  readonly scheduledTaskCount = computed(() => this.scheduledTasks().length)
  readonly pausedTaskCount = computed(() => this.pausedTasks().length)
  readonly archivedTaskCount = computed(() => this.archivedTasks().length)
  readonly visibleCurrentTasks = computed(() =>
    filterCurrentTasks(this.tasks() ?? [], this.currentTaskFilter(), this.searchQuery())
  )
  readonly visibleArchivedTasks = computed(() => filterArchivedTasks(this.tasks() ?? [], this.searchQuery()))
  readonly executionRecords = computed(() => buildTaskExecutionRecords(this.tasks() ?? []))
  readonly visibleExecutionRecords = computed(() =>
    filterTaskExecutionRecords(this.executionRecords(), this.searchQuery())
  )
  readonly allVisibleTasksSelected = computed(
    () =>
      this.visibleCurrentTasks().length > 0 &&
      this.visibleCurrentTasks().every((task) => this.selectedTaskIds().has(task.id))
  )

  readonly taskId = signal<string>(null)
  readonly openedTask = computed(() => this.tasks()?.find((task) => task.id === this.taskId()))
  readonly #taskDetail = myRxResource({
    request: () => ({ id: this.openedTask()?.id }),
    loader: ({ request }) =>
      request.id
        ? this.taskService.getOneById(request.id, {
            relations: ['xpert', 'conversations']
          })
        : of(null)
  })
  readonly taskHistory = this.#taskDetail.value
  readonly historyConversations = computed(() =>
    this.taskHistory()?.conversations ? sortBy(this.taskHistory()?.conversations, 'updatedAt').reverse() : []
  )
  readonly taskDetailLoading = computed(() => this.#taskDetail.status() === 'loading')

  readonly loading = signal(false)
  readonly taskExecutionTotal = getTaskExecutionTotal
  readonly taskSuccessRate = getTaskSuccessRate
  readonly taskLastExecution = getTaskLastExecution

  constructor() {
    effect(() => {
      if (!this.embedded() && this.paramId()) {
        this.taskId.set(this.paramId())
      }
    })

    effect(() => {
      const openedTask = this.openedTask()
      if (openedTask?.status === ScheduleTaskStatus.ARCHIVED) {
        this.view.set('archived')
      }
    })

    effect(() => {
      if (!this.embedded() && this.taskId() && this.taskId() !== this.paramId()) {
        this.#location.replaceState('/chat/tasks/' + this.taskId())
      }
    })

    effect(() => {
      if (this.scheduledTasks().length > 0) {
        this.#refresh$.next()
      }
    })
  }

  setView(view: TasksPageView) {
    this.view.set(view)
    this.searchQuery.set('')
    this.exitBatchManagement()

    const openedTask = this.openedTask()
    if (
      view === 'history' ||
      (view === 'tasks' && openedTask?.status === ScheduleTaskStatus.ARCHIVED) ||
      (view === 'archived' && openedTask?.status !== ScheduleTaskStatus.ARCHIVED)
    ) {
      this.closeTask()
    }
  }

  setCurrentTaskFilter(filter: CurrentTaskStatusFilter) {
    this.currentTaskFilter.set(filter)
  }

  openTask(task: IXpertTask) {
    if (this.batchManaging()) {
      this.toggleTaskSelection(task.id)
      return
    }
    this.taskId.set(task.id)
  }

  closeTask() {
    this.taskId.set(null)
    if (!this.embedded()) {
      this.#location.replaceState('/chat/tasks')
    }
  }

  openHistoryConversation(conversation: IChatConversation, task?: IXpertTask) {
    if (this.embedded()) {
      this.conversationSelected.emit(conversation)
      return
    }

    const route = buildTaskHistoryConversationRoute(conversation, task ?? this.taskHistory() ?? this.openedTask())
    if (!route) {
      this.#toastr.error('XP.Chat.ClawXpert.TaskHistoryThreadMissing', 'XP.TOASTR.TITLE.ERROR', {
        Default: 'This task history record has no conversation thread.'
      })
      return
    }

    void this.#router.navigate(route)
  }

  openExecutionRecord(record: TaskExecutionRecord) {
    this.openHistoryConversation(record.conversation, record.task)
  }

  editTask(task: IXpertTask) {
    this.dialog
      .open(XpertTaskDialogComponent, {
        data: { task },
        disableClose: true,
        backdropClass: 'xp-overlay-share-sheet',
        panelClass: 'xp-overlay-pane-share-sheet'
      })
      .closed.subscribe({
        next: (updatedTask) => {
          if (updatedTask) {
            this.refreshTasks(task.id)
          }
        }
      })
  }

  pauseTask(task: IXpertTask) {
    this.runTaskMutation(this.taskService.pause(task.id), task.id)
  }

  scheduleTask(task: IXpertTask) {
    this.runTaskMutation(this.taskService.schedule(task.id), task.id)
  }

  archiveTask(task: IXpertTask) {
    this.loading.set(true)
    this.taskService.archive(task.id).subscribe({
      next: () => {
        this.loading.set(false)
        if (this.taskId() === task.id) {
          this.closeTask()
        }
        this.refreshTasks()
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  unarchiveTask(task: IXpertTask) {
    this.loading.set(true)
    this.taskService.unarchive(task.id).subscribe({
      next: () => {
        this.loading.set(false)
        this.#toastr.success('XP.Chat.TaskUnarchived', {
          Default: 'Task restored to paused.'
        })
        this.closeTask()
        this.view.set('tasks')
        this.refreshTasks()
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  newTask(template?: AutomationTemplate) {
    if (template) {
      this.templatePickerOpen.set(false)
    }

    this.#taskDialog
      .openCreateTask({
        total: this.scheduledTaskCount(),
        xpertId: this.xpertId(),
        lockXpertSelection: !!this.xpertId(),
        ...(template
          ? {
              task: {
                name: this.#translate.instant(template.titleKey, { Default: template.title }),
                prompt: this.#translate.instant(template.promptKey, { Default: template.prompt }),
                options: { ...template.options }
              }
            }
          : {})
      })
      .closed.subscribe({
        next: (task) => {
          if (task?.id) {
            this.closeTask()
            this.view.set('tasks')
            this.currentTaskFilter.set('all')
            this.searchQuery.set('')
            this.refreshTasks()
          }
        }
      })
  }

  deleteTask(task: IXpertTask) {
    this.#confirmDelete(
      {
        title: this.#translate.instant('XP.Chat.Automation.DeleteTaskTitle', {
          Default: 'Delete scheduled task'
        }),
        value: task.name || this.#translate.instant('XP.Chat.UntitledTask', { Default: 'Untitled task' }),
        information: this.#translate.instant('XP.Chat.Automation.DeleteTaskInformation', {
          Default: 'This task will be paused and removed from the task list. Its data will be retained.'
        })
      },
      () => this.taskService.softDelete(task.id)
    ).subscribe({
      next: () => {
        if (this.taskId() === task.id) {
          this.closeTask()
        }
        this.#toastr.success('XP.Chat.Automation.TaskDeleted', {
          Default: 'Task deleted.'
        })
        this.refreshTasks()
      },
      error: (err) => this.#toastr.error(getErrorMessage(err))
    })
  }

  runTask(task: IXpertTask) {
    this.runTaskMutation(this.taskService.test(task.id), task.id)
  }

  enterBatchManagement() {
    this.batchManaging.set(true)
    this.selectedTaskIds.set(new Set())
    this.closeTask()
  }

  exitBatchManagement() {
    this.batchManaging.set(false)
    this.selectedTaskIds.set(new Set())
  }

  toggleTaskSelection(taskId: string) {
    this.selectedTaskIds.update((selected) => {
      const next = new Set(selected)
      if (next.has(taskId)) {
        next.delete(taskId)
      } else {
        next.add(taskId)
      }
      return next
    })
  }

  toggleSelectAllVisibleTasks() {
    const visibleIds = this.visibleCurrentTasks().map((task) => task.id)
    if (this.allVisibleTasksSelected()) {
      this.selectedTaskIds.update((selected) => {
        const next = new Set(selected)
        visibleIds.forEach((id) => next.delete(id))
        return next
      })
    } else {
      this.selectedTaskIds.update((selected) => new Set([...selected, ...visibleIds]))
    }
  }

  deleteSelectedTasks() {
    const ids = Array.from(this.selectedTaskIds())
    if (!ids.length) {
      return
    }

    this.#confirmDelete(
      {
        title: this.#translate.instant('XP.Chat.Automation.BatchDeleteTitle', {
          Default: 'Delete scheduled tasks'
        }),
        value: this.#translate.instant('XP.Chat.Automation.SelectedTaskCount', {
          Default: `${ids.length} selected tasks`,
          count: ids.length
        }),
        information: this.#translate.instant('XP.Chat.Automation.SoftDeleteInformation', {
          Default: 'The selected tasks will be paused and removed from the task list. Their data will be retained.'
        })
      },
      () => {
        this.loading.set(true)
        return forkJoin(ids.map((id) => this.taskService.softDelete(id)))
      }
    ).subscribe({
      next: () => {
        this.loading.set(false)
        this.exitBatchManagement()
        this.#toastr.success('XP.Chat.Automation.TasksDeleted', {
          Default: 'Selected tasks deleted.'
        })
        this.refreshTasks()
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  private runTaskMutation(request: ReturnType<XpertTaskService['pause']>, taskId?: string) {
    this.loading.set(true)
    request.subscribe({
      next: () => {
        this.loading.set(false)
        this.refreshTasks(taskId)
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
