import { CommonModule } from '@angular/common'
import { Component, computed, inject } from '@angular/core'
import { RouterLink } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { ZardBadgeComponent, ZardButtonComponent, ZardCardImports } from '@xpert-ai/headless-ui'
import { XpertProjectFacade } from './project.facade'

@Component({
  standalone: true,
  selector: 'xp-project-overview',
  imports: [CommonModule, RouterLink, TranslateModule, ZardBadgeComponent, ZardButtonComponent, ...ZardCardImports],
  template: `
    <section class="mx-auto flex w-full flex-col gap-4 p-4 sm:p-6">
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        @for (metric of metrics(); track metric.label) {
          <z-card class="border border-divider-regular bg-components-card-bg shadow-none"
            ><z-card-content class="p-4"
              ><div class="flex items-center justify-between text-xs text-text-secondary">
                <span>{{ metric.label | translate }}</span
                ><i [class]="metric.icon"></i>
              </div>
              <p class="mt-3 text-2xl font-semibold tabular-nums text-text-primary">{{ metric.value }}</p>
              <p class="mt-1 text-xs text-text-tertiary">
                {{ metric.detail | translate: metric.params }}
              </p></z-card-content
            ></z-card
          >
        }
      </div>
      <div class="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,1fr)]">
        <z-card class="overflow-hidden border border-divider-regular bg-components-card-bg shadow-none"
          ><z-card-header class="border-b border-divider-subtle px-5 py-4"
            ><z-card-title>{{ 'XP.XProject.RecentActivity' | translate }}</z-card-title
            ><z-card-subtitle class="mt-1">{{
              'XP.XProject.ActivitySubtitle' | translate
            }}</z-card-subtitle></z-card-header
          ><z-card-content class="p-0">
            @if (!facade.activities().length) {
              <div class="px-5 py-10 text-center text-sm text-text-tertiary">
                {{ 'XP.XProject.NoActivity' | translate }}
              </div>
            } @else {
              @for (activity of facade.activities().slice(0, 8); track activity.id) {
                <div class="flex gap-3 border-b border-divider-subtle px-5 py-3 last:border-0">
                  <span
                    class="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-background-default-subtle text-text-secondary"
                    ><i class="ri-pulse-line"></i
                  ></span>
                  <div class="min-w-0">
                    <p class="text-sm text-text-primary">{{ activity.summary }}</p>
                    <p class="mt-0.5 text-xs text-text-tertiary">
                      {{ activity.type }} · {{ formatDate(activity.createdAt) }}
                    </p>
                  </div>
                </div>
              }
            }
          </z-card-content></z-card
        >
        <div class="flex flex-col gap-4">
          <z-card class="border border-divider-regular bg-components-card-bg shadow-none"
            ><z-card-header class="px-5 py-4"
              ><div class="flex items-center justify-between">
                <z-card-title>{{ 'XP.XProject.ActivePlan' | translate }}</z-card-title
                ><a z-button zType="ghost" zSize="sm" routerLink="../plan" queryParamsHandling="preserve">{{
                  'XP.XProject.ViewAll' | translate
                }}</a>
              </div></z-card-header
            ><z-card-content class="space-y-3 px-5 pb-5">
              @if (!facade.plans().length) {
                <p class="text-sm text-text-tertiary">{{ 'XP.XProject.CreatePlanHint' | translate }}</p>
              } @else {
                @for (plan of facade.plans().slice(0, 4); track plan.id) {
                  <div class="flex items-center justify-between gap-3">
                    <span class="truncate text-sm text-text-primary">{{ plan.name }}</span
                    ><z-badge zType="outline">{{ plan.status }}</z-badge>
                  </div>
                }
              }
            </z-card-content></z-card
          ><z-card class="border border-divider-regular bg-components-card-bg shadow-none"
            ><z-card-header class="px-5 py-4"
              ><div class="flex items-center justify-between">
                <z-card-title>{{ 'XP.XProject.InProgress' | translate }}</z-card-title
                ><a z-button zType="ghost" zSize="sm" routerLink="../tasks" queryParamsHandling="preserve">{{
                  'XP.XProject.OpenTasks' | translate
                }}</a>
              </div></z-card-header
            ><z-card-content class="space-y-3 px-5 pb-5">
              @for (task of inProgress(); track task.id) {
                <div class="flex items-center justify-between gap-3">
                  <span class="truncate text-sm text-text-primary">{{ task.title || task.name }}</span
                  ><z-badge zType="secondary">{{
                    task.priority || ('XP.XProject.PriorityMedium' | translate)
                  }}</z-badge>
                </div>
              } @empty {
                <p class="text-sm text-text-tertiary">{{ 'XP.XProject.NoInProgressTasks' | translate }}</p>
              }
            </z-card-content></z-card
          >
        </div>
      </div>
    </section>
  `,
  host: { class: 'block w-full min-w-0' }
})
export class XpertProjectOverviewComponent {
  readonly facade = inject(XpertProjectFacade)
  readonly inProgress = computed(() =>
    this.facade
      .tasks()
      .filter((task) => task.status === 'in_progress')
      .slice(0, 6)
  )
  readonly metrics = computed(() => [
    {
      label: 'XP.XProject.Tasks',
      value: this.facade.tasks().length,
      detail: 'XP.XProject.InProgressCount',
      params: { count: this.inProgress().length },
      icon: 'ri-list-check-2-line'
    },
    {
      label: 'XP.XProject.PlansLabel',
      value: this.facade.plans().length,
      detail: 'XP.XProject.DeliveryStructure',
      params: {},
      icon: 'ri-route-line'
    },
    {
      label: 'XP.XProject.Assets',
      value: this.facade.assetCount(),
      detail: 'XP.XProject.IndexedProjectFiles',
      params: {},
      icon: 'ri-folder-6-line'
    },
    {
      label: 'XP.XProject.Automations',
      value: this.facade.automations().length,
      detail: 'XP.XProject.ConfiguredWorkflows',
      params: {},
      icon: 'ri-loop-right-line'
    }
  ])
  formatDate(value?: Date | string) {
    return value
      ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
      : '—'
  }
}
