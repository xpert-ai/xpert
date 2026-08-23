import { CommonModule } from '@angular/common'
import { Component, computed, inject, OnInit, signal } from '@angular/core'
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute, Router } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import type {
  IXpertProjectMilestone,
  IXpertProjectPlan,
  IXpertProjectSprint,
  IXpertProjectSwimlane,
  IXpertProjectTask,
  TXpertProjectPlanView,
  TXpertProjectTaskStatus
} from '@xpert-ai/contracts'
import {
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardDialogService,
  ZardInputDirective,
  ZardSelectImports,
  ZardTableImports,
  ZardToggleGroupComponent,
  ZardToggleGroupItemComponent
} from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import { getErrorMessage, injectToastr } from '@cloud/app/@core'
import { XpertProjectFacade } from './project.facade'
import type { XpertProjectTaskRelations } from './project-api.service'
import {
  XpertProjectPlanDialogComponent,
  type XpertProjectPlanDialogMode,
  type XpertProjectPlanDialogResult
} from './project-plan-dialog.component'
import {
  XpertProjectTaskDialogComponent,
  type XpertProjectTaskDialogData,
  type XpertProjectTaskDialogResult
} from './project-task-dialog.component'

type PlanView = TXpertProjectPlanView
type BoardLane = {
  key: string
  label: string
  status?: TXpertProjectTaskStatus
  swimlane?: IXpertProjectSwimlane
}

@Component({
  standalone: true,
  selector: 'xp-project-plan',
  styleUrl: './project-plan.component.scss',
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    DragDropModule,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardInputDirective,
    ...ZardSelectImports,
    ...ZardTableImports,
    ZardToggleGroupComponent,
    ZardToggleGroupItemComponent
  ],
  template: `
    <section class="flex w-full min-w-0 flex-col">
      <header class="sticky top-0 z-20 border-b border-divider-subtle bg-background px-4 py-3 sm:px-6">
        <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p class="text-xs font-medium uppercase tracking-wide text-text-tertiary">
                {{ 'XP.XProject.DeliveryPlanning' | translate }}
              </p>
              <h2 class="truncate text-xl font-semibold text-text-primary">
                {{ 'XP.XProject.PlansAndMilestones' | translate }}
              </h2>
            </div>
            <p class="mt-1 max-w-2xl text-sm text-text-secondary">
              {{ activePlan()?.description || ('XP.XProject.PlanWorkspaceHint' | translate) }}
            </p>
          </div>
          <div class="flex flex-wrap items-center justify-end gap-2">
            @if (isAdvanced()) {
              <z-select
                class="min-w-44"
                [zValue]="activePlan()?.id || ''"
                [zPlaceholder]="'XP.XProject.SelectPlan' | translate"
                (zSelectionChange)="selectPlan($event)"
              >
                @for (plan of facade.plans(); track plan.id) {
                  <z-select-item [zValue]="plan.id">{{ plan.name }}</z-select-item>
                }
              </z-select>
              @if (activePlan()?.sprints?.length) {
                <z-select
                  class="min-w-44"
                  [zValue]="activeSprint()?.id || ''"
                  [zPlaceholder]="'XP.XProject.SelectSprint' | translate"
                  (zSelectionChange)="selectSprint($event)"
                >
                  @for (sprint of activePlan()?.sprints || []; track sprint.id) {
                    <z-select-item [zValue]="sprint.id">{{ sprint.goal }}</z-select-item>
                  }
                </z-select>
              } @else {
                <span class="border border-dashed border-divider-regular px-3 py-2 text-xs text-text-tertiary">
                  {{ 'XP.XProject.NoSprints' | translate }}
                </span>
              }
              <button z-button zType="outline" type="button" (click)="addPlan()">
                <i class="ri-file-add-line mr-1"></i>{{ 'XP.XProject.AddPlan' | translate }}
              </button>
              <button z-button zType="outline" type="button" (click)="addSprint()">
                <i class="ri-timer-line mr-1"></i>{{ 'XP.XProject.AddSprint' | translate }}
              </button>
              <button z-button zType="outline" type="button" [disabled]="!activePlan()" (click)="addMilestone()">
                <i class="ri-flag-line mr-1"></i>{{ 'XP.XProject.AddMilestone' | translate }}
              </button>
              <button z-button zType="ghost" type="button" [disabled]="!activePlan()" (click)="editPlan()">
                <i class="ri-edit-line mr-1"></i>{{ 'XP.XProject.EditPlan' | translate }}
              </button>
              @if (activeMilestone()) {
                <button z-button zType="ghost" type="button" (click)="editMilestone()">
                  <i class="ri-flag-2-line mr-1"></i>{{ 'XP.XProject.EditMilestone' | translate }}
                </button>
              }
            }
            <button z-button zType="default" type="button" (click)="addTask()">
              <i class="ri-add-line mr-1"></i>{{ 'XP.XProject.AddTask' | translate }}
            </button>
          </div>
        </div>
        <div class="mt-3 flex flex-wrap items-center gap-3">
          <z-toggle-group
            zType="outline"
            zSize="sm"
            class="shrink-0"
            [value]="view()"
            [attr.aria-label]="'XP.XProject.PlanViews' | translate"
            (valueChange)="changeView($event)"
          >
            @for (option of viewOptions; track option.value) {
              <z-toggle-group-item [value]="option.value" [attr.aria-label]="option.label | translate">
                <i [class]="option.icon" aria-hidden="true"></i>
                <span>{{ option.label | translate }}</span>
              </z-toggle-group-item>
            }
          </z-toggle-group>
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
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
              <span class="text-text-secondary">
                <i class="ri-timer-line mr-1" aria-hidden="true"></i
                >{{ 'XP.XProject.SprintStatus.' + activeSprint()?.status | translate }}
              </span>
            }
            @if (activePlan()?.dueDate) {
              <span class="text-text-secondary">
                <i class="ri-calendar-line mr-1" aria-hidden="true"></i>{{ activePlan()?.dueDate | date: 'mediumDate' }}
              </span>
            }
          </div>
          <div class="ml-auto flex min-w-0 flex-wrap items-center gap-2">
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
            @if (isAdvanced() && activePlan()?.milestones?.length) {
              <z-select
                class="w-44"
                [zValue]="selectedMilestoneId()"
                [zPlaceholder]="'XP.XProject.AllMilestones' | translate"
                (zSelectionChange)="selectMilestone($event)"
              >
                <z-select-item zValue="">{{ 'XP.XProject.AllMilestones' | translate }}</z-select-item>
                @for (milestone of activePlan()?.milestones || []; track milestone.id) {
                  <z-select-item [zValue]="milestone.id">{{ milestone.name }}</z-select-item>
                }
              </z-select>
            }
          </div>
        </div>
      </header>
      @if (isAdvanced() && activeSprint()?.swimlanes?.length) {
        <div class="flex gap-2 overflow-x-auto border-b border-divider-subtle px-4 py-2 sm:px-6">
          @for (lane of activeSprint()?.swimlanes; track lane.id) {
            <div class="flex shrink-0 items-center gap-2 rounded-lg border border-divider-subtle px-2.5 py-1.5 text-xs">
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
      ><div cdkDropListGroup class="flex min-w-0 gap-3 overflow-x-auto pb-2">
        @for (lane of lanes(); track lane.key) {
          <section
            class="flex min-h-72 w-[min(82vw,20rem)] shrink-0 flex-col overflow-hidden rounded-lg border border-divider-subtle bg-background-default-subtle/30"
            [attr.data-lane-key]="lane.key"
          >
            <header class="border-b border-divider-subtle px-3 py-3">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    <h3 class="truncate text-sm font-medium text-text-primary">{{ laneLabel(lane) }}</h3>
                    <z-badge zType="secondary">{{ laneTasks(lane).length }}</z-badge>
                  </div>
                  @if (lane.swimlane) {
                    <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-text-tertiary">
                      <span>{{ lane.swimlane.agentRole }}</span>
                      <span class="text-divider-regular">·</span>
                      <span>{{ lane.swimlane.environmentType }}</span>
                    </div>
                  }
                </div>
                <div class="flex shrink-0 items-center gap-1">
                  @if (lane.swimlane?.wipLimit) {
                    <z-badge zType="outline"
                      >{{ laneTasks(lane).length }}/{{ lane.swimlane?.wipLimit }}
                      {{ 'XP.XProject.WIP' | translate }}</z-badge
                    >
                  }
                  @if (lane.status === 'done' || lane.key === 'release') {
                    <button
                      z-button
                      zType="ghost"
                      zSize="sm"
                      type="button"
                      class="size-7 p-0"
                      [attr.aria-label]="'XP.XProject.CollapseCompleted' | translate"
                      [title]="'XP.XProject.CollapseCompleted' | translate"
                      (click)="toggleCompletedCollapsed()"
                    >
                      <i [class]="completedCollapsed() ? 'ri-expand-up-down-line' : 'ri-collapse-up-down-line'"></i>
                    </button>
                  }
                  <button
                    z-button
                    zType="ghost"
                    zSize="sm"
                    type="button"
                    class="size-7 p-0"
                    [attr.aria-label]="'XP.XProject.AddTask' | translate"
                    [title]="'XP.XProject.AddTask' | translate"
                    (click)="addTask(lane)"
                  >
                    <i class="ri-add-line"></i>
                  </button>
                </div>
              </div>
              @if (lane.swimlane?.concurrencyLimit) {
                <div class="mt-2 flex items-center gap-2 text-[11px] text-text-tertiary">
                  <span class="h-1.5 flex-1 overflow-hidden bg-background-default-subtle">
                    <span
                      class="block h-full bg-primary transition-[width]"
                      [style.width.%]="laneCapacityPercent(lane)"
                    ></span>
                  </span>
                  <span>{{ laneTasks(lane).length }}/{{ lane.swimlane?.concurrencyLimit }}</span>
                </div>
              }
            </header>
            @if (!(lane.status === 'done' || lane.key === 'release') || !completedCollapsed()) {
              <div
                cdkDropList
                class="project-plan-lane-list min-h-0 flex-1 space-y-2 overflow-y-auto p-2"
                [id]="dropListId(lane.key)"
                [cdkDropListData]="laneTasks(lane)"
                [cdkDropListConnectedTo]="dropListIds()"
                (cdkDropListDropped)="dropTask($event, lane)"
              >
                @for (task of laneTasks(lane); track task.id) {
                  <article
                    cdkDrag
                    [cdkDragData]="task"
                    tabindex="0"
                    class="project-task-card cursor-grab rounded-lg border border-divider-subtle bg-background p-3 text-left transition-colors hover:border-primary/50 active:cursor-grabbing"
                    (click)="selectTask(task)"
                    (keydown.enter)="selectTask(task)"
                  >
                    <div class="flex items-start justify-between gap-2">
                      <span class="min-w-0 flex-1 text-sm font-medium text-text-primary">{{
                        task.title || task.name
                      }}</span>
                      @if (isRiskTask(task)) {
                        <i
                          class="ri-alert-line shrink-0 text-text-warning"
                          [attr.title]="'XP.XProject.TaskRisk' | translate"
                        ></i>
                      }
                    </div>
                    @if (task.description) {
                      <p class="mt-1 line-clamp-2 text-xs text-text-tertiary">{{ task.description }}</p>
                    }
                    @if (taskAssistantName(task); as assistantName) {
                      <div class="mt-2 flex min-w-0 items-center gap-1 text-[11px] text-text-tertiary">
                        <i class="ri-sparkling-2-line shrink-0"></i>
                        <span class="truncate">{{ assistantName }}</span>
                      </div>
                    }
                    <div class="mt-2 flex items-center justify-between gap-2 text-xs text-text-tertiary">
                      <span [class]="priorityClass(task.priority)">{{
                        'XP.XProject.Priority.' + (task.priority || 'medium') | translate
                      }}</span>
                      <span>{{
                        task.dueDate ? (task.dueDate | date: 'MMM d') : ('XP.XProject.NoDueDate' | translate)
                      }}</span>
                    </div>
                    @if (task.steps?.length) {
                      <div class="mt-2 flex items-center gap-2 text-[11px] text-text-tertiary">
                        <span class="h-1 flex-1 overflow-hidden bg-background-default-subtle">
                          <span class="block h-full bg-primary" [style.width.%]="stepProgress(task)"></span>
                        </span>
                        <span>{{ completedSteps(task) }}/{{ task.steps.length }}</span>
                      </div>
                    }
                    <ng-template cdkDragPreview [matchSize]="true">
                      <div
                        class="project-task-drag-preview rounded-lg border border-primary/60 bg-background p-3 text-sm shadow-xl"
                      >
                        <div class="flex items-center gap-2">
                          <i class="ri-drag-move-2-line shrink-0 text-primary"></i>
                          <span class="min-w-0 flex-1 truncate font-medium text-text-primary">
                            {{ task.title || task.name }}
                          </span>
                        </div>
                        <div class="mt-2 flex items-center gap-2 text-xs text-text-tertiary">
                          <span [class]="priorityClass(task.priority)">
                            {{ 'XP.XProject.Priority.' + (task.priority || 'medium') | translate }}
                          </span>
                          @if (taskAssistantName(task); as assistantName) {
                            <span class="flex min-w-0 items-center gap-1 truncate">
                              <i class="ri-sparkling-2-line shrink-0"></i>
                              <span class="truncate">{{ assistantName }}</span>
                            </span>
                          }
                          <span class="ml-auto shrink-0">
                            {{ task.dueDate ? (task.dueDate | date: 'MMM d') : ('XP.XProject.NoDueDate' | translate) }}
                          </span>
                        </div>
                      </div>
                    </ng-template>
                  </article>
                } @empty {
                  <button
                    z-button
                    zType="ghost"
                    type="button"
                    class="min-h-20 w-full rounded-lg border border-dashed border-divider-regular text-xs text-text-tertiary"
                    (click)="addTask(lane)"
                  >
                    <i class="ri-add-line mr-1"></i>{{ 'XP.XProject.NoTasks' | translate }}
                  </button>
                }
              </div>
            }
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
  `,
  host: { class: 'block w-full min-w-0' }
})
export class XpertProjectPlanComponent implements OnInit {
  readonly facade = inject(XpertProjectFacade)
  readonly #route = inject(ActivatedRoute)
  readonly #router = inject(Router)
  readonly #translate = inject(TranslateService)
  readonly #dialog = inject(ZardDialogService)
  readonly #toastr = injectToastr()
  readonly view = signal<PlanView>(this.readView())
  readonly status = signal('all')
  readonly search = signal('')
  readonly selectedPlanId = signal<string | null>(null)
  readonly selectedSprintId = signal<string | null>(null)
  readonly selectedMilestoneId = signal('')
  readonly completedCollapsed = signal(false)
  readonly viewOptions = [
    { value: 'board' as const, label: 'XP.XProject.Board', icon: 'ri-kanban-view-2-line' },
    { value: 'table' as const, label: 'XP.XProject.Table', icon: 'ri-table-line' },
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
  readonly activeMilestone = computed(
    () => this.activePlan()?.milestones?.find((milestone) => milestone.id === this.selectedMilestoneId()) || null
  )
  readonly isAdvanced = computed(() => this.facade.project()?.settings?.managementMode === 'advanced')
  readonly visibleTasks = computed(() => {
    const query = this.search().trim().toLowerCase()
    const planId = this.activePlan()?.id
    return this.facade.tasks().filter((task) => {
      const status = this.normalizedStatus(task.status)
      return (
        (!planId || !task.planId || task.planId === planId) &&
        (!this.selectedMilestoneId() || task.milestoneId === this.selectedMilestoneId()) &&
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
  readonly lanes = computed<BoardLane[]>(() => {
    if (this.isAdvanced()) {
      const swimlanes = [...(this.activeSprint()?.swimlanes ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)
      if (swimlanes.length) return swimlanes.map((swimlane) => ({ key: swimlane.key, label: swimlane.name, swimlane }))
      return [
        { key: 'backlog', label: 'XP.XProject.Status.todo', status: 'todo' },
        { key: 'coding', label: 'XP.XProject.Status.in_progress', status: 'in_progress' },
        { key: 'review', label: 'XP.XProject.Status.review', status: 'review' },
        { key: 'release', label: 'XP.XProject.Status.done', status: 'done' }
      ]
    }
    return [
      { key: 'todo', label: 'XP.XProject.StatusTodo', status: 'todo' },
      { key: 'in_progress', label: 'XP.XProject.StatusInProgress', status: 'in_progress' },
      { key: 'paused', label: 'XP.XProject.StatusPaused', status: 'paused' },
      { key: 'done', label: 'XP.XProject.StatusDone', status: 'done' }
    ]
  })

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
  changeView(value: unknown) {
    if (typeof value === 'string' && this.viewOptions.some((option) => option.value === value)) {
      this.setView(value as PlanView)
    }
  }
  selectPlan(value: unknown) {
    this.selectedPlanId.set(String(value))
    this.selectedSprintId.set(null)
    this.selectedMilestoneId.set('')
  }
  selectSprint(value: unknown) {
    this.selectedSprintId.set(String(value))
  }
  selectMilestone(value: unknown) {
    this.selectedMilestoneId.set(String(value ?? ''))
  }
  laneLabel(lane: BoardLane) {
    return lane.swimlane?.name || this.#translate.instant(lane.label)
  }
  dropListId(key: string) {
    return `project-plan-lane-${key}`
  }
  dropListIds() {
    return this.lanes().map((lane) => this.dropListId(lane.key))
  }
  laneTasks(lane: BoardLane) {
    return this.visibleTasks().filter((task) => this.boardLaneForTask(task) === lane.key)
  }
  boardLaneForTask(task: IXpertProjectTask) {
    const lanes = this.lanes()
    const status = this.normalizedStatus(task.status)
    if (task.column && status !== 'done' && lanes.some((lane) => lane.key === task.column)) return task.column
    const direct = lanes.find((lane) => lane.status === status || lane.key === status)
    if (direct) return direct.key
    if (!this.isAdvanced()) return status === 'done' ? 'done' : status === 'todo' ? 'todo' : 'paused'
    if (status === 'todo') return lanes.find((lane) => lane.key === 'backlog')?.key || lanes[0]?.key
    if (status === 'done') return lanes.find((lane) => lane.key === 'release')?.key || lanes.at(-1)?.key
    if (status === 'review' || status === 'blocked')
      return lanes.find((lane) => lane.key === 'review')?.key || lanes[0]?.key
    return (
      lanes.find((lane) => lane.key === 'coding')?.key ||
      lanes.find((lane) => lane.swimlane?.kind === 'execution')?.key ||
      lanes[0]?.key
    )
  }
  laneStatus(lane: BoardLane): TXpertProjectTaskStatus {
    if (lane.status) return lane.status
    if (!this.isAdvanced()) return lane.key as TXpertProjectTaskStatus
    if (lane.key === 'backlog') return 'todo'
    if (lane.key === 'review') return 'review'
    if (lane.key === 'release') return 'done'
    return 'in_progress'
  }
  isRiskTask(task: IXpertProjectTask) {
    return ['blocked', 'cancelled', 'failed'].includes(task.status)
  }
  completedSteps(task: IXpertProjectTask) {
    return (task.steps || []).filter((step) => step.status === 'done').length
  }
  stepProgress(task: IXpertProjectTask) {
    return task.steps?.length ? Math.round((this.completedSteps(task) / task.steps.length) * 100) : 0
  }
  laneCapacityPercent(lane: BoardLane) {
    const limit = lane.swimlane?.concurrencyLimit || lane.swimlane?.wipLimit || 0
    return limit ? Math.min(100, Math.round((this.laneTasks(lane).length / limit) * 100)) : 0
  }
  taskAssistantName(task: IXpertProjectTask) {
    const project = this.facade.project()
    const id = task.assigneeXpertId || project?.settings?.projectAssistantId || project?.xperts?.[0]?.id
    const assistant = project?.xperts?.find((item) => item.id === id)
    return assistant?.title || assistant?.name || ''
  }
  toggleCompletedCollapsed() {
    this.completedCollapsed.update((value) => !value)
  }
  async dropTask(event: CdkDragDrop<IXpertProjectTask[]>, targetLane: BoardLane) {
    const task = event.item.data as IXpertProjectTask | undefined
    if (!task) return
    const sourceLaneKey = this.boardLaneForTask(task)
    const buckets = new Map(this.lanes().map((lane) => [lane.key, [...this.laneTasks(lane)]]))
    const source = buckets.get(sourceLaneKey) ?? []
    const existingDestination = buckets.get(targetLane.key) ?? []
    const wipLimit = targetLane.swimlane?.wipLimit || 0
    if (sourceLaneKey !== targetLane.key && wipLimit > 0 && existingDestination.length >= wipLimit) {
      this.#toastr.warning('XP.XProject.WipLimitReached')
      return
    }
    const sourceIndex = source.findIndex((item) => item.id === task.id)
    if (sourceIndex >= 0) source.splice(sourceIndex, 1)
    const destination = existingDestination
    const insertAt = Math.max(0, Math.min(event.currentIndex, destination.length))
    destination.splice(insertAt, 0, task)
    buckets.set(sourceLaneKey, source)
    buckets.set(targetLane.key, destination)
    const items = [...buckets.entries()].flatMap(([column, tasks]) =>
      tasks.map((item, order) => ({
        id: item.id,
        order,
        column,
        ...(item.id === task.id ? { status: this.laneStatus(targetLane) } : {})
      }))
    )
    try {
      await this.facade.reorderTasks(items)
      if (task.status !== this.laneStatus(targetLane))
        await this.facade.updateTask(task.id, { status: this.laneStatus(targetLane), column: targetLane.key })
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    }
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
  async selectTask(task: IXpertProjectTask) {
    let relations: XpertProjectTaskRelations = { conversations: [], executions: [] }
    try {
      relations = await this.facade.loadTaskRelations(task.id)
    } catch {
      // The task remains editable when relation history is unavailable.
    }
    const data: XpertProjectTaskDialogData = {
      task,
      relations,
      plans: this.facade.plans(),
      project: this.facade.project(),
      advanced: this.isAdvanced()
    }
    const result = await firstValueFrom(
      this.#dialog.open<
        XpertProjectTaskDialogComponent,
        XpertProjectTaskDialogData,
        XpertProjectTaskDialogResult | null
      >(XpertProjectTaskDialogComponent, {
        data,
        width: 'min(94vw, 720px)',
        maxWidth: 'calc(100vw - 32px)',
        backdropClass: 'backdrop-blur-sm-black',
        panelClass: 'xp-overlay-pane-card'
      }).closed
    )
    if (!result) return
    if ('openConversation' in result) {
      this.openTaskConversation(result.openConversation)
      return
    }
    await this.saveTask(task, result)
  }
  openTaskConversation(event: { conversationId?: string; threadId?: string }) {
    const threadId = event.threadId?.trim()
    if (!threadId) return
    void this.#router.navigate([], {
      relativeTo: this.#route,
      queryParams: { chat: 'open', threadId },
      queryParamsHandling: 'merge'
    })
  }
  async saveTask(task: IXpertProjectTask, input: Partial<IXpertProjectTask>) {
    try {
      await this.facade.updateTask(task.id, input)
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    }
  }
  async addTask(lane?: BoardLane) {
    const title = this.#translate.instant('XP.XProject.NewTask')
    try {
      const status = lane ? this.laneStatus(lane) : 'todo'
      const task = await this.facade.createTask({
        title,
        name: title,
        status,
        priority: 'medium',
        column: lane?.key,
        planId: this.activePlan()?.id,
        milestoneId: this.selectedMilestoneId() || undefined
      })
      if (task) await this.selectTask(task)
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    }
  }
  async addPlan() {
    await this.openPlanDialog('plan', async (input) => {
      const plan = await this.facade.createPlan(input as Partial<IXpertProjectPlan>)
      if (plan) this.selectedPlanId.set(plan.id)
    })
  }

  async addSprint() {
    const plan = this.activePlan()
    if (!plan) return
    await this.openPlanDialog('sprint', async (input) => {
      const sprint = await this.facade.createSprint(plan.id, input as Partial<IXpertProjectSprint>)
      if (sprint) this.selectedSprintId.set(sprint.id)
    })
  }

  async addMilestone() {
    const plan = this.activePlan()
    if (!plan) return
    await this.openPlanDialog('milestone', async (input) => {
      const milestone = await this.facade.createMilestone(plan.id, input as Partial<IXpertProjectMilestone>)
      if (milestone) this.selectedMilestoneId.set(milestone.id)
    })
  }

  async editPlan() {
    const plan = this.activePlan()
    if (!plan) return
    await this.openPlanDialog(
      'plan',
      async (input) => {
        await this.facade.updatePlan(plan.id, input as Partial<IXpertProjectPlan>)
      },
      plan
    )
  }

  async editMilestone() {
    const plan = this.activePlan()
    const milestone = this.activeMilestone()
    if (!plan || !milestone) return
    await this.openPlanDialog(
      'milestone',
      async (input) => {
        await this.facade.updateMilestone(plan.id, milestone.id, input as Partial<IXpertProjectMilestone>)
      },
      milestone
    )
  }

  private async openPlanDialog(
    mode: XpertProjectPlanDialogMode,
    onSubmit: (input: XpertProjectPlanDialogResult) => Promise<void>,
    initial?: XpertProjectPlanDialogResult
  ) {
    const input = await firstValueFrom(
      this.#dialog.open<
        XpertProjectPlanDialogComponent,
        { mode: XpertProjectPlanDialogMode; initial?: XpertProjectPlanDialogResult },
        XpertProjectPlanDialogResult | null
      >(XpertProjectPlanDialogComponent, { data: { mode, initial }, width: 'min(94vw, 560px)' }).closed
    )
    if (!input) return
    try {
      await onSubmit(input)
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    }
  }
}
