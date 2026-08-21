import { CommonModule } from '@angular/common'
import { Component, inject, signal } from '@angular/core'
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
  selector: 'xp-project-plan',
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
      <header class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p class="text-xs font-medium uppercase tracking-wide text-text-tertiary">
            {{ 'XP.XProject.DeliveryPlanning' | translate }}
          </p>
          <h2 class="mt-1 text-xl font-semibold text-text-primary">
            {{ 'XP.XProject.PlansAndMilestones' | translate }}
          </h2>
        </div>
        <div class="flex gap-2">
          <button
            z-button
            zType="ghost"
            zSize="sm"
            type="button"
            [class.bg-background-default-subtle]="view() === 'table'"
            (click)="view.set('table')"
          >
            <i class="ri-list-unordered mr-1"></i>{{ 'XP.XProject.Table' | translate }}</button
          ><button
            z-button
            zType="ghost"
            zSize="sm"
            type="button"
            [class.bg-background-default-subtle]="view() === 'board'"
            (click)="view.set('board')"
          >
            <i class="ri-kanban-view-2 mr-1"></i>{{ 'XP.XProject.Board' | translate }}</button
          ><button z-button zType="default" zSize="sm" type="button" (click)="addPlan()">
            <i class="ri-add-line mr-1"></i>{{ 'XP.XProject.AddPlan' | translate }}
          </button>
        </div>
      </header>
      @if (view() === 'table') {
        <z-card class="w-full overflow-hidden border border-divider-regular bg-components-card-bg shadow-none"
          ><z-card-content class="p-0"
            ><div class="overflow-x-auto">
              <table z-table zSize="compact" class="w-full min-w-[720px] text-sm">
                <thead z-table-header>
                  <tr z-table-row class="bg-background-default-subtle">
                    <th z-table-head>{{ 'XP.XProject.PlanColumn' | translate }}</th>
                    <th z-table-head>{{ 'XP.XProject.StatusColumn' | translate }}</th>
                    <th z-table-head>{{ 'XP.XProject.MilestonesColumn' | translate }}</th>
                    <th z-table-head>{{ 'XP.XProject.DueColumn' | translate }}</th>
                  </tr>
                </thead>
                <tbody z-table-body>
                  @for (plan of facade.plans(); track plan.id) {
                    <tr z-table-row>
                      <td z-table-cell>
                        <div class="font-medium text-text-primary">{{ plan.name }}</div>
                        <div class="text-xs text-text-tertiary">
                          {{ plan.description || ('XP.XProject.NoDescription' | translate) }}
                        </div>
                      </td>
                      <td z-table-cell>
                        <z-badge zType="outline">{{ plan.status }}</z-badge>
                      </td>
                      <td z-table-cell>{{ plan.milestones?.length || 0 }}</td>
                      <td z-table-cell class="text-text-secondary">
                        {{ plan.dueDate ? (plan.dueDate | date: 'mediumDate') : '—' }}
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div></z-card-content
          ></z-card
        >
      } @else {
        <div class="grid gap-3 lg:grid-cols-3">
          @for (column of columns; track column.status) {
            <z-card class="min-h-72 border border-divider-regular bg-components-card-bg shadow-none"
              ><z-card-header class="border-b border-divider-subtle px-4 py-3"
                ><div class="flex items-center justify-between">
                  <z-card-title class="text-sm">{{ column.label | translate }}</z-card-title
                  ><z-badge zType="secondary">{{ tasksFor(column.status).length }}</z-badge>
                </div></z-card-header
              ><z-card-content class="space-y-2 p-3">
                @for (task of tasksFor(column.status); track task.id) {
                  <div class="rounded-md border border-divider-subtle bg-background-default-subtle/40 p-3">
                    <p class="text-sm font-medium text-text-primary">{{ task.title || task.name }}</p>
                    <div class="mt-2 flex items-center justify-between text-xs text-text-tertiary">
                      <span>{{ task.priority || ('XP.XProject.PriorityMedium' | translate) }}</span
                      ><span>{{
                        task.dueDate ? (task.dueDate | date: 'MMM d') : ('XP.XProject.NoDueDate' | translate)
                      }}</span>
                    </div>
                  </div>
                } @empty {
                  <p class="py-6 text-center text-xs text-text-tertiary">{{ 'XP.XProject.NoTasks' | translate }}</p>
                }
              </z-card-content></z-card
            >
          }
        </div>
      }
    </section>
  `,
  host: { class: 'block w-full min-w-0' }
})
export class XpertProjectPlanComponent {
  readonly facade = inject(XpertProjectFacade)
  readonly view = signal<'table' | 'board'>('table')
  readonly columns = [
    { label: 'XP.XProject.StatusTodo', status: 'todo' },
    { label: 'XP.XProject.StatusInProgress', status: 'in_progress' },
    { label: 'XP.XProject.StatusReview', status: 'review' }
  ]
  tasksFor(status: string) {
    return this.facade.tasks().filter((task) => task.status === status)
  }
  async addPlan() {
    await this.facade.createPlan({ name: 'New plan', status: 'draft', view: this.view() })
  }
}
