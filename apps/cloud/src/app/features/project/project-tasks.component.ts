import { CommonModule } from '@angular/common'
import { Component, computed, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import {
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardCardImports,
  ZardInputDirective,
  ZardTableImports
} from '@xpert-ai/headless-ui'
import { XpertProjectFacade } from './project.facade'

@Component({
  standalone: true,
  selector: 'xp-project-tasks',
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardInputDirective,
    ...ZardCardImports,
    ...ZardTableImports
  ],
  template: `
    <section class="mx-auto flex w-full flex-col gap-4 p-4 sm:p-6">
      <header class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p class="text-xs font-medium uppercase tracking-wide text-text-tertiary">
            {{ 'XP.XProject.ExecutionQueue' | translate }}
          </p>
          <h2 class="mt-1 text-xl font-semibold text-text-primary">{{ 'XP.XProject.Tasks' | translate }}</h2>
        </div>
        <button z-button zType="default" zSize="sm" type="button" (click)="addTask()">
          <i class="ri-add-line mr-1"></i>{{ 'XP.XProject.AddTask' | translate }}
        </button>
      </header>
      <div class="flex flex-col gap-3 md:flex-row">
        <input
          z-input
          class="w-full md:max-w-sm"
          [placeholder]="'XP.XProject.FilterTasks' | translate"
          [value]="search()"
          (input)="search.set($any($event.target).value)"
        />
        <div class="flex gap-1 text-xs">
          @for (filter of filters; track filter) {
            <button
              z-button
              zType="ghost"
              zSize="sm"
              type="button"
              [class.bg-background-default-subtle]="status() === filter"
              (click)="status.set(filter)"
            >
              {{ 'XP.XProject.Status.' + filter | translate }}
            </button>
          }
        </div>
      </div>
      <z-card class="w-full overflow-hidden border border-divider-regular bg-components-card-bg shadow-none"
        ><z-card-content class="p-0"
          ><div class="overflow-x-auto">
            <table z-table zSize="compact" class="w-full min-w-[900px] text-sm">
              <thead z-table-header>
                <tr z-table-row class="bg-background-default-subtle">
                  <th z-table-head>{{ 'XP.XProject.TaskColumn' | translate }}</th>
                  <th z-table-head>{{ 'XP.XProject.StatusColumn' | translate }}</th>
                  <th z-table-head>{{ 'XP.XProject.PriorityColumn' | translate }}</th>
                  <th z-table-head>{{ 'XP.XProject.AssigneeColumn' | translate }}</th>
                  <th z-table-head>{{ 'XP.XProject.DueDateColumn' | translate }}</th>
                  <th z-table-head>{{ 'XP.XProject.ExecutionColumn' | translate }}</th>
                </tr>
              </thead>
              <tbody z-table-body>
                @for (task of visibleTasks(); track task.id) {
                  <tr z-table-row class="hover:bg-background-default-subtle/60">
                    <td z-table-cell>
                      <div class="font-medium text-text-primary">{{ task.title || task.name }}</div>
                      <div class="max-w-[360px] truncate text-xs text-text-tertiary">
                        {{ task.description || ('XP.XProject.NoDescription' | translate) }}
                      </div>
                    </td>
                    <td z-table-cell>
                      <z-badge zType="outline">{{ 'XP.XProject.Status.' + task.status | translate }}</z-badge>
                    </td>
                    <td z-table-cell>
                      <span [class]="priorityClass(task.priority)">{{
                        'XP.XProject.Priority.' + (task.priority || 'medium') | translate
                      }}</span>
                    </td>
                    <td z-table-cell class="text-text-secondary">
                      {{ task.assignee?.name || task.assigneeId || ('XP.XProject.Unassigned' | translate) }}
                    </td>
                    <td z-table-cell class="text-text-secondary">
                      {{ task.dueDate ? (task.dueDate | date: 'mediumDate') : '—' }}
                    </td>
                    <td z-table-cell>
                      <button z-button zType="ghost" zSize="sm" type="button" (click)="select(task.id)">
                        <i class="ri-file-list-3-line mr-1"></i>{{ 'XP.XProject.Details' | translate }}
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
          </div></z-card-content
        ></z-card
      >
      @if (selectedTask()) {
        <z-card class="border border-primary/30 bg-components-card-bg shadow-none"
          ><z-card-content class="p-4"
            ><div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-xs uppercase tracking-wide text-text-tertiary">
                  {{ 'XP.XProject.TaskDetail' | translate }}
                </p>
                <h3 class="mt-1 font-semibold text-text-primary">
                  {{ selectedTask()?.title || selectedTask()?.name }}
                </h3>
              </div>
              <button
                z-button
                zType="ghost"
                zSize="sm"
                type="button"
                [attr.aria-label]="'XP.XProject.Close' | translate"
                (click)="selected.set(null)"
              >
                <i class="ri-close-line"></i>
              </button>
            </div>
            <p class="mt-3 text-sm text-text-secondary">
              {{ selectedTask()?.description || ('XP.XProject.NoDescription' | translate) }}
            </p>
            <div class="mt-4 border-t border-divider-subtle pt-3 text-xs text-text-tertiary">
              {{ 'XP.XProject.ExecutionSteps' | translate: { count: selectedTask()?.steps?.length || 0 } }} ·
              {{ 'XP.XProject.Thread' | translate }}:
              {{ selectedTask()?.threadId || ('XP.XProject.NotStarted' | translate) }}
            </div></z-card-content
          ></z-card
        >
      }
    </section>
  `,
  host: { class: 'block w-full min-w-0' }
})
export class XpertProjectTasksComponent {
  readonly facade = inject(XpertProjectFacade)
  readonly search = signal('')
  readonly status = signal('all')
  readonly selected = signal<string | null>(null)
  readonly filters = ['all', 'todo', 'in_progress', 'review', 'done', 'blocked']
  readonly visibleTasks = computed(() =>
    this.facade
      .tasks()
      .filter(
        (task) =>
          (this.status() === 'all' || task.status === this.status()) &&
          `${task.title ?? ''} ${task.name}`.toLowerCase().includes(this.search().toLowerCase().trim())
      )
  )
  readonly selectedTask = computed(() => this.facade.tasks().find((task) => task.id === this.selected()) ?? null)
  select(id: string) {
    this.selected.set(id)
  }
  priorityClass(priority?: string) {
    return priority === 'urgent'
      ? 'text-text-destructive font-medium'
      : priority === 'high'
        ? 'text-text-warning'
        : 'text-text-secondary'
  }
  async addTask() {
    await this.facade.createTask({ title: 'New task', name: 'New task', status: 'todo', priority: 'medium' })
  }
}
