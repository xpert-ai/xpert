import { CommonModule } from '@angular/common'
import { Component, computed, inject, OnInit, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute, Router } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import type { IXpertProjectTask, TXpertProjectPlanView, TXpertProjectTaskStatus } from '@xpert-ai/contracts'
import {
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardInputDirective,
  ZardSelectImports,
  ZardTableImports
} from '@xpert-ai/headless-ui'
import { XpertProjectFacade } from './project.facade'
import { XpertProjectTaskDrawerComponent } from './project-task-drawer.component'

type PlanView = TXpertProjectPlanView

@Component({
  standalone: true,
  selector: 'xp-project-plan',
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardInputDirective,
    XpertProjectTaskDrawerComponent,
    ...ZardSelectImports,
    ...ZardTableImports
  ],
  template: `
    <section class="flex w-full min-w-0 flex-col">
      <header class="sticky top-0 z-20 border-b border-divider-subtle bg-background px-4 py-4 sm:px-6">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <p class="text-xs font-medium uppercase tracking-wide text-text-tertiary">
                {{ 'XP.XProject.DeliveryPlanning' | translate }}
              </p>
              <z-badge zType="outline">{{
                (isAdvanced() ? 'XP.XProject.AdvancedMode' : 'XP.XProject.SimpleMode') | translate
              }}</z-badge>
            </div>
            <h2 class="mt-1 truncate text-xl font-semibold text-text-primary">
              {{ 'XP.XProject.PlansAndMilestones' | translate }}
            </h2>
            <p class="mt-1 max-w-2xl text-sm text-text-secondary">
              {{ activePlan()?.description || ('XP.XProject.PlanWorkspaceHint' | translate) }}
            </p>
          </div>
          <div class="flex flex-wrap items-center justify-end gap-2">
            @if (isAdvanced()) {
              <z-select class="min-w-44" [zValue]="activePlan()?.id || ''" (zSelectionChange)="selectPlan($event)">
                @for (plan of facade.plans(); track plan.id) {
                  <z-select-item [zValue]="plan.id">{{ plan.name }}</z-select-item>
                }</z-select
              ><z-select class="min-w-44" [zValue]="activeSprint()?.id || ''" (zSelectionChange)="selectSprint($event)">
                @for (sprint of activePlan()?.sprints || []; track sprint.id) {
                  <z-select-item [zValue]="sprint.id">{{ sprint.goal }}</z-select-item>
                }</z-select
              ><button z-button zType="outline" type="button" (click)="addSprint()">
                <i class="ri-timer-line mr-1"></i>{{ 'XP.XProject.AddSprint' | translate }}
              </button>
            }
            <button z-button zType="default" type="button" (click)="addTask()">
              <i class="ri-add-line mr-1"></i>{{ 'XP.XProject.AddTask' | translate }}
            </button>
          </div>
        </div>
        <div class="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-divider-subtle pt-3">
          <div
            class="flex flex-wrap items-center gap-1"
            role="tablist"
            [attr.aria-label]="'XP.XProject.PlanViews' | translate"
          >
            @for (option of viewOptions; track option.value) {
              <button
                z-button
                zType="ghost"
                type="button"
                role="tab"
                [attr.aria-selected]="view() === option.value"
                [class.bg-background-default-subtle]="view() === option.value"
                [class.text-text-primary]="view() === option.value"
                (click)="setView(option.value)"
              >
                <i [class]="option.icon + ' mr-1'"></i>{{ option.label | translate }}
              </button>
            }
          </div>
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <input
              z-input
              class="w-52"
              [placeholder]="'XP.XProject.FilterTasks' | translate"
              [ngModel]="search()"
              (ngModelChange)="search.set($event)"
            /><z-select class="w-36" [zValue]="status()" (zSelectionChange)="status.set($event.toString())">
              @for (item of statusOptions; track item) {
                <z-select-item [zValue]="item">{{ 'XP.XProject.Status.' + item | translate }}</z-select-item>
              }
            </z-select>
          </div>
        </div>
      </header>
      <div class="flex flex-wrap items-center gap-6 border-b border-divider-subtle px-4 py-3 text-sm sm:px-6">
        <div>
          <span class="text-text-tertiary">{{ 'XP.XProject.OpenTasks' | translate }}</span
          ><strong class="ml-2 text-text-primary">{{ openTaskCount() }}</strong>
        </div>
        <div>
          <span class="text-text-tertiary">{{ 'XP.XProject.CompletedTasks' | translate }}</span
          ><strong class="ml-2 text-text-primary">{{ completedTaskCount() }}</strong>
        </div>
        <div>
          <span class="text-text-tertiary">{{ 'XP.XProject.PlanProgress' | translate }}</span
          ><strong class="ml-2 text-text-primary">{{ progress() }}%</strong>
        </div>
        @if (activeSprint()) {
          <div class="text-text-secondary">
            <i class="ri-timer-line mr-1"></i>{{ 'XP.XProject.SprintStatus.' + activeSprint()?.status | translate }}
          </div>
        }
        @if (activePlan()?.dueDate) {
          <div class="text-text-secondary">
            <i class="ri-calendar-line mr-1"></i>{{ activePlan()?.dueDate | date: 'mediumDate' }}
          </div>
        }
      </div>
      @if (isAdvanced() && activeSprint()?.swimlanes?.length) {
        <div class="flex gap-2 overflow-x-auto border-b border-divider-subtle px-4 py-2 sm:px-6">
          @for (lane of activeSprint()?.swimlanes; track lane.id) {
            <div class="flex shrink-0 items-center gap-2 border border-divider-subtle px-2.5 py-1.5 text-xs">
              <span class="font-medium text-text-primary">{{ lane.name }}</span
              ><span class="text-text-tertiary">{{ lane.agentRole }}</span>
              @if (lane.wipLimit) {
                <z-badge zType="outline">{{ 'XP.XProject.WIP' | translate }} {{ lane.wipLimit }}</z-badge>
              }
            </div>
          }
        </div>
      }
      <main class="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        @switch (view()) {
          @case ('board') {
            <ng-container *ngTemplateOutlet="boardView" />
          }
          @case ('table') {
            <ng-container *ngTemplateOutlet="tableView" />
          }
          @case ('gantt') {
            <ng-container *ngTemplateOutlet="ganttView" />
          }
          @case ('calendar') {
            <ng-container *ngTemplateOutlet="calendarView" />
          }
          @default {
            <ng-container *ngTemplateOutlet="listView" />
          }
        }
      </main>
    </section>
    <ng-template #boardView
      ><div class="flex min-w-0 gap-3 overflow-x-auto pb-2">
        @for (lane of lanes(); track lane.status) {
          <section
            class="flex min-h-72 w-[min(78vw,19rem)] shrink-0 flex-col border border-divider-subtle bg-background-default-subtle/30"
          >
            <header class="flex items-center justify-between border-b border-divider-subtle px-3 py-3">
              <h3 class="text-sm font-medium text-text-primary">{{ lane.label | translate }}</h3>
              <z-badge zType="secondary">{{ tasksFor(lane.status).length }}</z-badge>
            </header>
            <div class="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
              @for (task of tasksFor(lane.status); track task.id) {
                <ng-container *ngTemplateOutlet="taskRow; context: { task: task }" />
              } @empty {
                <p class="py-8 text-center text-xs text-text-tertiary">{{ 'XP.XProject.NoTasks' | translate }}</p>
              }
            </div>
          </section>
        }
      </div></ng-template
    >
    <ng-template #tableView
      ><div class="overflow-x-auto border border-divider-subtle">
        <table z-table zSize="compact" class="w-full min-w-[820px] text-sm">
          <thead z-table-header>
            <tr z-table-row class="bg-background-default-subtle">
              <th z-table-head>{{ 'XP.XProject.TaskColumn' | translate }}</th>
              <th z-table-head>{{ 'XP.XProject.StatusColumn' | translate }}</th>
              <th z-table-head>{{ 'XP.XProject.PriorityColumn' | translate }}</th>
              <th z-table-head>{{ 'XP.XProject.MilestonesColumn' | translate }}</th>
              <th z-table-head>{{ 'XP.XProject.DueDateColumn' | translate }}</th>
              <th z-table-head></th>
            </tr>
          </thead>
          <tbody z-table-body>
            @for (task of visibleTasks(); track task.id) {
              <tr z-table-row class="hover:bg-background-default-subtle/60">
                <td z-table-cell>
                  <button
                    class="max-w-[360px] truncate text-left font-medium text-text-primary hover:text-primary"
                    (click)="selectTask(task)"
                  >
                    {{ task.title || task.name }}
                  </button>
                  <p class="max-w-[420px] truncate text-xs text-text-tertiary">
                    {{ task.description || ('XP.XProject.NoDescription' | translate) }}
                  </p>
                </td>
                <td z-table-cell>
                  <z-badge zType="outline">{{
                    'XP.XProject.Status.' + normalizedStatus(task.status) | translate
                  }}</z-badge>
                </td>
                <td z-table-cell>
                  <span [class]="priorityClass(task.priority)">{{
                    'XP.XProject.Priority.' + (task.priority || 'medium') | translate
                  }}</span>
                </td>
                <td z-table-cell class="text-text-secondary">
                  {{ task.milestone?.name || ('XP.XProject.Unassigned' | translate) }}
                </td>
                <td z-table-cell class="text-text-secondary">
                  {{ task.dueDate ? (task.dueDate | date: 'mediumDate') : ('XP.XProject.NoDueDate' | translate) }}
                </td>
                <td z-table-cell class="text-right">
                  <button z-button zType="ghost" type="button" (click)="selectTask(task)">
                    {{ 'XP.XProject.Details' | translate }}<i class="ri-arrow-right-line ml-1"></i>
                  </button>
                </td>
              </tr>
            } @empty {
              <tr z-table-row>
                <td z-table-cell colspan="6" class="py-12 text-center text-text-tertiary">
                  {{ 'XP.XProject.NoTasksMatch' | translate }}
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div></ng-template
    >
    <ng-template #ganttView
      ><section class="border border-divider-subtle">
        <header class="flex items-center justify-between border-b border-divider-subtle px-4 py-3">
          <h3 class="text-sm font-medium text-text-primary">{{ 'XP.XProject.Gantt' | translate }}</h3>
          <span class="text-xs text-text-tertiary">{{ 'XP.XProject.GanttHint' | translate }}</span>
        </header>
        <div class="divide-y divide-divider-subtle">
          @for (task of visibleTasks(); track task.id) {
            <button
              class="grid w-full grid-cols-[minmax(12rem,18rem)_1fr] items-center gap-4 px-4 py-3 text-left hover:bg-background-default-subtle/60"
              (click)="selectTask(task)"
            >
              <span class="truncate text-sm text-text-primary">{{ task.title || task.name }}</span
              ><span class="relative h-2 rounded-full bg-background-default-subtle"
                ><span
                  class="absolute inset-y-0 rounded-full bg-primary"
                  [style.left.%]="ganttOffset(task)"
                  [style.width.%]="ganttWidth(task)"
                ></span
              ></span>
            </button>
          } @empty {
            <p class="px-4 py-12 text-center text-sm text-text-tertiary">
              {{ 'XP.XProject.NoTasksMatch' | translate }}
            </p>
          }
        </div>
      </section></ng-template
    >
    <ng-template #calendarView
      ><section class="border border-divider-subtle">
        <header class="border-b border-divider-subtle px-4 py-3">
          <h3 class="text-sm font-medium text-text-primary">{{ 'XP.XProject.Calendar' | translate }}</h3>
        </header>
        <div class="grid gap-px bg-divider-subtle sm:grid-cols-2 lg:grid-cols-4">
          @for (day of calendarDays; track day) {
            <div class="min-h-32 bg-background p-3">
              <p class="text-xs font-medium text-text-tertiary">{{ 'XP.XProject.' + day | translate }}</p>
              <div class="mt-3 space-y-1">
                @for (task of tasksForDay(day); track task.id) {
                  <button
                    class="block w-full truncate border-l-2 border-primary px-2 py-1 text-left text-xs text-text-secondary hover:bg-background-default-subtle"
                    (click)="selectTask(task)"
                  >
                    {{ task.title || task.name }}
                  </button>
                }
              </div>
            </div>
          }
        </div>
      </section></ng-template
    >
    <ng-template #listView
      ><section class="divide-y divide-divider-subtle border-y border-divider-subtle">
        @for (task of visibleTasks(); track task.id) {
          <button
            class="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-background-default-subtle"
            (click)="selectTask(task)"
          >
            <span class="size-2 shrink-0 rounded-full bg-primary"></span
            ><span class="min-w-0 flex-1 truncate text-sm text-text-primary">{{ task.title || task.name }}</span
            ><z-badge zType="outline">{{ 'XP.XProject.Status.' + normalizedStatus(task.status) | translate }}</z-badge
            ><span class="hidden text-xs text-text-tertiary sm:block">{{
              task.dueDate ? (task.dueDate | date: 'mediumDate') : ('XP.XProject.NoDueDate' | translate)
            }}</span>
          </button>
        } @empty {
          <p class="py-12 text-center text-sm text-text-tertiary">{{ 'XP.XProject.NoTasksMatch' | translate }}</p>
        }
      </section></ng-template
    >
    <ng-template #taskRow let-task="task"
      ><button
        class="w-full border border-divider-subtle bg-background p-3 text-left transition-colors hover:border-primary/40"
        (click)="selectTask(task)"
      >
        <div class="flex items-start justify-between gap-2">
          <span class="min-w-0 flex-1 text-sm font-medium text-text-primary">{{ task.title || task.name }}</span
          ><i class="ri-more-2-line shrink-0 text-text-tertiary"></i>
        </div>
        <div class="mt-2 flex items-center justify-between gap-2 text-xs text-text-tertiary">
          <span [class]="priorityClass(task.priority)">{{
            'XP.XProject.Priority.' + (task.priority || 'medium') | translate
          }}</span
          ><span>{{ task.dueDate ? (task.dueDate | date: 'MMM d') : ('XP.XProject.NoDueDate' | translate) }}</span>
        </div>
      </button></ng-template
    >
    <xp-project-task-drawer
      [task]="selectedTask()"
      [opened]="!!selectedTask()"
      (openedChange)="closeTask()"
      (saved)="saveTask($event)"
    />
  `,
  host: { class: 'block w-full min-w-0' }
})
export class XpertProjectPlanComponent implements OnInit {
  readonly facade = inject(XpertProjectFacade)
  readonly #route = inject(ActivatedRoute)
  readonly #router = inject(Router)
  readonly #translate = inject(TranslateService)
  readonly view = signal<PlanView>(this.readView())
  readonly status = signal('all')
  readonly search = signal('')
  readonly selectedTask = signal<IXpertProjectTask | null>(null)
  readonly selectedPlanId = signal<string | null>(null)
  readonly selectedSprintId = signal<string | null>(null)
  readonly viewOptions = [
    { value: 'board' as const, label: 'XP.XProject.Board', icon: 'ri-kanban-view-2-line' },
    { value: 'table' as const, label: 'XP.XProject.Table', icon: 'ri-list-check-2' },
    { value: 'gantt' as const, label: 'XP.XProject.Gantt', icon: 'ri-bar-chart-horizontal-line' },
    { value: 'calendar' as const, label: 'XP.XProject.Calendar', icon: 'ri-calendar-line' },
    { value: 'list' as const, label: 'XP.XProject.List', icon: 'ri-list-unordered' }
  ]
  readonly statusOptions = ['all', 'todo', 'in_progress', 'paused', 'review', 'done', 'blocked', 'cancelled']
  readonly calendarDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  readonly activePlan = computed(
    () => this.facade.plans().find((plan) => plan.id === this.selectedPlanId()) || this.facade.plans()[0] || null
  )
  readonly activeSprint = computed(
    () =>
      this.activePlan()?.sprints?.find((sprint) => sprint.id === this.selectedSprintId()) ||
      this.activePlan()?.sprints?.[0] ||
      null
  )
  readonly isAdvanced = computed(() => this.facade.project()?.settings?.managementMode === 'advanced')
  readonly visibleTasks = computed(() => {
    const query = this.search().trim().toLowerCase()
    const planId = this.activePlan()?.id
    return this.facade.tasks().filter((task) => {
      const status = this.normalizedStatus(task.status)
      return (
        (!planId || !task.planId || task.planId === planId) &&
        (this.status() === 'all' || status === this.status()) &&
        (!query || `${task.title || ''} ${task.name} ${task.description || ''}`.toLowerCase().includes(query))
      )
    })
  })
  readonly openTaskCount = computed(
    () =>
      this.visibleTasks().filter((task) => !['done', 'cancelled'].includes(this.normalizedStatus(task.status))).length
  )
  readonly completedTaskCount = computed(
    () => this.visibleTasks().filter((task) => this.normalizedStatus(task.status) === 'done').length
  )
  readonly progress = computed(() =>
    this.visibleTasks().length ? Math.round((this.completedTaskCount() / this.visibleTasks().length) * 100) : 0
  )
  readonly lanes = computed(() =>
    this.isAdvanced()
      ? [
          { status: 'todo', label: 'XP.XProject.Status.todo' },
          { status: 'in_progress', label: 'XP.XProject.Status.in_progress' },
          { status: 'review', label: 'XP.XProject.Status.review' },
          { status: 'blocked', label: 'XP.XProject.Status.blocked' },
          { status: 'done', label: 'XP.XProject.Status.done' }
        ]
      : [
          { status: 'todo', label: 'XP.XProject.StatusTodo' },
          { status: 'in_progress', label: 'XP.XProject.StatusInProgress' },
          { status: 'paused', label: 'XP.XProject.StatusPaused' },
          { status: 'done', label: 'XP.XProject.StatusDone' }
        ]
  )

  ngOnInit() {
    if (this.facade.plans().length) this.selectedPlanId.set(this.facade.plans()[0].id)
  }
  readView(): PlanView {
    const value = this.#route.snapshot.queryParamMap.get('view')
    return ['board', 'table', 'gantt', 'calendar', 'list'].includes(value || '') ? (value as PlanView) : 'board'
  }
  setView(view: PlanView) {
    this.view.set(view)
    void this.#router.navigate([], {
      relativeTo: this.#route,
      queryParams: { view },
      queryParamsHandling: 'merge',
      replaceUrl: true
    })
  }
  selectPlan(value: unknown) {
    this.selectedPlanId.set(String(value))
    this.selectedSprintId.set(null)
  }
  selectSprint(value: unknown) {
    this.selectedSprintId.set(String(value))
  }
  tasksFor(status: string) {
    return this.visibleTasks().filter((task) => this.normalizedStatus(task.status) === status)
  }
  tasksForDay(day: string) {
    return this.visibleTasks().filter(
      (task) =>
        task.dueDate &&
        new Intl.DateTimeFormat('en', { weekday: 'short' }).format(new Date(task.dueDate)).startsWith(day)
    )
  }
  ganttOffset(task: IXpertProjectTask) {
    return task.dueDate
      ? Math.min(72, Math.max(0, Math.round(((new Date(task.dueDate).getTime() - Date.now()) / 86400000 + 14) * 2)))
      : 8
  }
  ganttWidth(task: IXpertProjectTask) {
    return task.dueDate ? Math.min(72, Math.max(18, 100 - this.ganttOffset(task))) : 36
  }
  normalizedStatus(status: IXpertProjectTask['status']): TXpertProjectTaskStatus {
    return status === 'pending'
      ? 'todo'
      : status === 'completed'
        ? 'done'
        : status === 'failed'
          ? 'blocked'
          : (status as TXpertProjectTaskStatus)
  }
  priorityClass(priority?: string) {
    return priority === 'urgent'
      ? 'font-medium text-text-destructive'
      : priority === 'high'
        ? 'text-text-warning'
        : 'text-text-secondary'
  }
  selectTask(task: IXpertProjectTask) {
    this.selectedTask.set(task)
  }
  closeTask() {
    this.selectedTask.set(null)
  }
  async saveTask(input: Partial<IXpertProjectTask>) {
    const task = this.selectedTask()
    if (!task) return
    await this.facade.updateTask(task.id, input)
    this.closeTask()
  }
  async addTask() {
    const title = this.#translate.instant('XP.XProject.NewTask')
    const task = await this.facade.createTask({
      title,
      name: title,
      status: 'todo',
      priority: 'medium',
      planId: this.activePlan()?.id
    })
    if (task) this.selectTask(task)
  }
  async addSprint() {
    const plan = this.activePlan()
    if (!plan) return
    await this.facade.createSprint(plan.id, {
      goal: this.#translate.instant('XP.XProject.NewSprint'),
      status: 'planned',
      strategyType: 'software_delivery'
    })
  }
}
