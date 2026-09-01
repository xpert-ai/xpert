import { CommonModule } from '@angular/common'
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core'
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import type {
  IXpertProjectPlan,
  IXpertProjectTask,
  TXpertProjectTaskPriority,
  TXpertProjectTaskStatus
} from '@xpert-ai/contracts'
import type { XpertProjectConversationTarget, XpertProjectTaskRelations } from './project-api.service'
import {
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardDrawerImports,
  ZardFormImports,
  ZardInputDirective,
  ZardSelectImports
} from '@xpert-ai/headless-ui'

type TaskForm = {
  title: FormControl<string>
  description: FormControl<string>
  status: FormControl<TXpertProjectTaskStatus>
  priority: FormControl<TXpertProjectTaskPriority>
  dueDate: FormControl<string>
  planId: FormControl<string>
  milestoneId: FormControl<string>
}

@Component({
  standalone: true,
  selector: 'xp-project-task-drawer',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardInputDirective,
    ...ZardDrawerImports,
    ...ZardFormImports,
    ...ZardSelectImports
  ],
  template: `
    <z-drawer-container class="h-full" [class.pointer-events-auto]="opened" [hasBackdrop]="false">
      <z-drawer [opened]="opened" mode="over" position="end" (openedChange)="openedChange.emit($event)">
        <z-drawer-content class="w-[min(100vw,32rem)] bg-components-card-bg">
          <form class="flex h-full min-h-0 flex-col" [formGroup]="form" (ngSubmit)="save()">
            <header class="flex items-start justify-between border-b border-divider-subtle px-5 py-4">
              <div class="min-w-0">
                <p class="text-xs font-medium uppercase tracking-wide text-text-tertiary">
                  {{ 'XP.XProject.TaskDetail' | translate }}
                </p>
                <h2 class="mt-1 truncate text-base font-semibold text-text-primary">
                  {{ task?.title || task?.name || ('XP.XProject.UntitledTask' | translate) }}
                </h2>
              </div>
              <button
                z-button
                zType="ghost"
                type="button"
                [attr.aria-label]="'XP.XProject.Close' | translate"
                (click)="close()"
              >
                <i class="ri-close-line"></i>
              </button>
            </header>
            <div class="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
              <z-form-field appearance="fill" class="w-full">
                <z-form-label>{{ 'XP.XProject.TaskColumn' | translate }}</z-form-label>
                <input z-input formControlName="title" />
              </z-form-field>
              <z-form-field appearance="fill" class="w-full">
                <z-form-label>{{ 'XP.XProject.Description' | translate }}</z-form-label>
                <textarea z-input formControlName="description" class="min-h-24 resize-y"></textarea>
              </z-form-field>
              <div class="grid grid-cols-2 gap-3">
                <z-form-field appearance="fill" class="w-full">
                  <z-form-label>{{ 'XP.XProject.StatusColumn' | translate }}</z-form-label>
                  <z-select class="w-full" formControlName="status">
                    @for (status of statuses; track status) {
                      <z-select-item [zValue]="status">{{ 'XP.XProject.Status.' + status | translate }}</z-select-item>
                    }
                  </z-select>
                </z-form-field>
                <z-form-field appearance="fill" class="w-full">
                  <z-form-label>{{ 'XP.XProject.PriorityColumn' | translate }}</z-form-label>
                  <z-select class="w-full" formControlName="priority">
                    @for (priority of priorities; track priority) {
                      <z-select-item [zValue]="priority">{{
                        'XP.XProject.Priority.' + priority | translate
                      }}</z-select-item>
                    }
                  </z-select>
                </z-form-field>
              </div>
              <z-form-field appearance="fill" class="w-full">
                <z-form-label>{{ 'XP.XProject.DueDateColumn' | translate }}</z-form-label>
                <input z-input type="date" formControlName="dueDate" />
              </z-form-field>
              @if (advanced) {
                <div class="grid gap-3 sm:grid-cols-2">
                  <z-form-field appearance="fill" class="w-full">
                    <z-form-label>{{ 'XP.XProject.PlanColumn' | translate }}</z-form-label>
                    <z-select class="w-full" formControlName="planId" (zSelectionChange)="changePlan($event)">
                      @for (plan of plans; track plan.id) {
                        <z-select-item [zValue]="plan.id">{{ plan.name }}</z-select-item>
                      }
                    </z-select>
                  </z-form-field>
                  <z-form-field appearance="fill" class="w-full">
                    <z-form-label>{{ 'XP.XProject.MilestonesColumn' | translate }}</z-form-label>
                    <z-select class="w-full" formControlName="milestoneId">
                      <z-select-item zValue="">{{ 'XP.XProject.Unassigned' | translate }}</z-select-item>
                      @for (milestone of selectedPlan()?.milestones || []; track milestone.id) {
                        <z-select-item [zValue]="milestone.id">{{ milestone.name }}</z-select-item>
                      }
                    </z-select>
                  </z-form-field>
                </div>
              }
              <section class="border-t border-divider-subtle pt-4">
                <div class="flex items-center justify-between">
                  <h3 class="text-sm font-medium text-text-primary">
                    {{ 'XP.XProject.ExecutionSteps' | translate: { count: task?.steps?.length || 0 } }}
                  </h3>
                  @if (task?.executions?.length) {
                    <z-badge zType="outline">{{ task?.executions?.length }}</z-badge>
                  }
                </div>
                <div class="mt-3 space-y-2">
                  @for (step of task?.steps || []; track step.id || step.stepIndex) {
                    <div class="flex gap-3 border-b border-divider-subtle py-2 text-sm">
                      <span class="text-text-tertiary">{{ step.stepIndex + 1 }}</span>
                      <span class="min-w-0 flex-1 text-text-secondary">{{ step.description }}</span>
                      <z-badge zType="outline">{{ 'XP.XProject.StepStatus.' + step.status | translate }}</z-badge>
                    </div>
                  } @empty {
                    <p class="text-sm text-text-tertiary">{{ 'XP.XProject.NoExecutionSteps' | translate }}</p>
                  }
                </div>
              </section>
              <section class="border-t border-divider-subtle pt-4">
                <div class="flex items-center justify-between">
                  <h3 class="text-sm font-medium text-text-primary">
                    {{ 'XP.XProject.ExecutionContext' | translate }}
                  </h3>
                  @if (relations.executions.length) {
                    <z-badge zType="outline">{{ relations.executions.length }}</z-badge>
                  }
                </div>
                <div class="mt-3 divide-y divide-divider-subtle">
                  @for (execution of relations.executions; track execution.id) {
                    <div class="py-3 text-xs">
                      <div class="flex items-center justify-between gap-3">
                        <div class="flex min-w-0 items-center gap-2">
                          <z-badge zType="outline">
                            {{ 'XP.XProject.ExecutionStatus.' + execution.status | translate }}
                          </z-badge>
                          <span class="truncate text-text-secondary">
                            {{ execution.agentKey || execution.xpertId || ('XP.XProject.ProjectExpert' | translate) }}
                          </span>
                        </div>
                        <span class="shrink-0 text-text-tertiary">#{{ execution.attempt }}</span>
                      </div>
                      <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-text-tertiary">
                        <span>{{ execution.createdAt | date: 'medium' }}</span>
                        @if (execution.threadId) {
                          <button
                            z-button
                            zType="link"
                            type="button"
                            class="h-auto p-0 text-xs"
                            (click)="openConversation(execution.conversationId, execution.threadId, execution.xpertId)"
                          >
                            {{ 'XP.XProject.OpenConversation' | translate }}
                          </button>
                        }
                      </div>
                      @if (execution.error) {
                        <p class="mt-2 text-text-destructive">{{ execution.error }}</p>
                      } @else if (execution.outputSummary) {
                        <p class="mt-2 text-text-secondary">{{ execution.outputSummary }}</p>
                      }
                    </div>
                  } @empty {
                    <p class="py-3 text-sm text-text-tertiary">{{ 'XP.XProject.NoExecutionContext' | translate }}</p>
                  }
                </div>
              </section>
              <section class="border-t border-divider-subtle pt-4">
                <h3 class="text-sm font-medium text-text-primary">{{ 'XP.XProject.TaskConversations' | translate }}</h3>
                <div class="mt-3 divide-y divide-divider-subtle">
                  @for (link of relations.conversations; track link.id) {
                    <div class="flex items-center justify-between gap-3 py-2 text-xs">
                      <span class="truncate text-text-secondary">
                        {{ link.conversation?.title || link.conversation?.threadId || link.conversationId }}
                      </span>
                      @if (link.conversation?.threadId) {
                        <button
                          z-button
                          zType="link"
                          type="button"
                          class="h-auto shrink-0 p-0 text-xs"
                          (click)="
                            openConversation(link.conversationId, link.conversation.threadId, link.conversation.xpertId)
                          "
                        >
                          {{ 'XP.XProject.OpenConversation' | translate }}
                        </button>
                      }
                    </div>
                  } @empty {
                    <p class="py-3 text-sm text-text-tertiary">{{ 'XP.XProject.NoTaskConversations' | translate }}</p>
                  }
                </div>
              </section>
              <section class="border-t border-divider-subtle pt-4">
                <h3 class="text-sm font-medium text-text-primary">{{ 'XP.XProject.TaskContext' | translate }}</h3>
                <dl class="mt-3 space-y-2 text-xs">
                  <div class="flex justify-between gap-3">
                    <dt class="text-text-tertiary">{{ 'XP.XProject.PlanColumn' | translate }}</dt>
                    <dd class="text-right text-text-secondary">
                      {{ task?.plan?.name || ('XP.XProject.Unassigned' | translate) }}
                    </dd>
                  </div>
                  <div class="flex justify-between gap-3">
                    <dt class="text-text-tertiary">{{ 'XP.XProject.MilestonesColumn' | translate }}</dt>
                    <dd class="text-right text-text-secondary">
                      {{ task?.milestone?.name || ('XP.XProject.Unassigned' | translate) }}
                    </dd>
                  </div>
                  <div class="flex justify-between gap-3">
                    <dt class="text-text-tertiary">{{ 'XP.XProject.AssigneeColumn' | translate }}</dt>
                    <dd class="text-right text-text-secondary">
                      {{ task?.assignee?.name || ('XP.XProject.Unassigned' | translate) }}
                    </dd>
                  </div>
                </dl>
              </section>
            </div>
            <footer class="flex justify-end gap-2 border-t border-divider-subtle px-5 py-4">
              <button z-button zType="ghost" type="button" (click)="close()">
                {{ 'XP.XProject.Cancel' | translate }}
              </button>
              <button z-button zType="default" type="submit">{{ 'XP.XProject.Save' | translate }}</button>
            </footer>
          </form>
        </z-drawer-content>
      </z-drawer>
    </z-drawer-container>
  `,
  host: { class: 'pointer-events-none fixed inset-0 z-40' }
})
export class XpertProjectTaskDrawerComponent implements OnChanges {
  @Input() task: IXpertProjectTask | null = null
  @Input() relations: XpertProjectTaskRelations = { conversations: [], executions: [] }
  @Input() plans: IXpertProjectPlan[] = []
  @Input() advanced = false
  @Input() opened = false
  @Output() readonly openedChange = new EventEmitter<boolean>()
  @Output() readonly saved = new EventEmitter<Partial<IXpertProjectTask>>()
  @Output() readonly conversationOpened = new EventEmitter<XpertProjectConversationTarget>()

  readonly statuses: TXpertProjectTaskStatus[] = [
    'todo',
    'in_progress',
    'review',
    'paused',
    'done',
    'blocked',
    'cancelled'
  ]
  readonly priorities: TXpertProjectTaskPriority[] = ['urgent', 'high', 'medium', 'low']
  readonly form = new FormGroup<TaskForm>({
    title: new FormControl('', { nonNullable: true }),
    description: new FormControl('', { nonNullable: true }),
    status: new FormControl<TXpertProjectTaskStatus>('todo', { nonNullable: true }),
    priority: new FormControl<TXpertProjectTaskPriority>('medium', { nonNullable: true }),
    dueDate: new FormControl('', { nonNullable: true }),
    planId: new FormControl('', { nonNullable: true }),
    milestoneId: new FormControl('', { nonNullable: true })
  })

  selectedPlan() {
    const planId = this.form.controls.planId.value
    return this.plans.find((plan) => plan.id === planId)
  }

  changePlan(value: unknown) {
    this.form.controls.planId.setValue(String(value ?? ''))
    this.form.controls.milestoneId.setValue('')
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['task'] && this.task) {
      this.form.reset({
        title: this.task.title || this.task.name || '',
        description: this.task.description || '',
        status: normalizeStatus(this.task.status),
        priority: this.task.priority || 'medium',
        dueDate: this.task.dueDate ? new Date(this.task.dueDate).toISOString().slice(0, 10) : '',
        planId: this.task.planId || this.plans[0]?.id || '',
        milestoneId: this.task.milestoneId || ''
      })
    }
  }

  close() {
    this.openedChange.emit(false)
  }
  openConversation(conversationId?: string, threadId?: string, xpertId?: string) {
    const normalizedThreadId = threadId?.trim()
    if (!normalizedThreadId) return
    this.conversationOpened.emit({
      conversationId,
      threadId: normalizedThreadId,
      xpertId: xpertId?.trim() || this.task?.assigneeXpertId?.trim() || undefined
    })
  }
  save() {
    if (!this.task) return
    const value = this.form.getRawValue()
    this.saved.emit({
      ...value,
      name: value.title,
      id: this.task.id,
      planId: value.planId || undefined,
      milestoneId: value.milestoneId || undefined,
      dueDate: value.dueDate ? new Date(`${value.dueDate}T00:00:00`) : undefined
    })
  }
}

function normalizeStatus(status: IXpertProjectTask['status']): TXpertProjectTaskStatus {
  if (status === 'pending') return 'todo'
  if (status === 'completed') return 'done'
  if (status === 'failed') return 'blocked'
  return status as TXpertProjectTaskStatus
}
