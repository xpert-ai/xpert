import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import type {
  IXpertProject,
  IXpertProjectPlan,
  IXpertProjectTask,
  TXpertProjectTaskPriority,
  TXpertProjectTaskStatus
} from '@xpert-ai/contracts'
import type { XpertProjectTaskRelations } from './project-api.service'
import {
  Z_MODAL_DATA,
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardDialogRef,
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
  assigneeXpertId: FormControl<string>
}

@Component({
  standalone: true,
  selector: 'xp-project-task-dialog',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardInputDirective,
    ...ZardFormImports,
    ...ZardSelectImports
  ],
  template: `
    <form class="flex max-h-[82vh] min-w-0 flex-col" [formGroup]="form" (ngSubmit)="save()">
      <header class="flex items-start justify-between border-b border-divider-subtle pb-3">
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
      <div class="min-h-0 flex-1 space-y-3 overflow-y-auto py-3">
        <z-form-field appearance="fill" class="w-full">
          <z-form-label>{{ 'XP.XProject.TaskColumn' | translate }}</z-form-label>
          <input z-input formControlName="title" />
        </z-form-field>
        <z-form-field appearance="fill" class="w-full">
          <z-form-label>{{ 'XP.XProject.Description' | translate }}</z-form-label>
          <textarea z-input formControlName="description" class="min-h-20 resize-y"></textarea>
        </z-form-field>
        <div class="grid grid-cols-2 gap-2">
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
                <z-select-item [zValue]="priority">{{ 'XP.XProject.Priority.' + priority | translate }}</z-select-item>
              }
            </z-select>
          </z-form-field>
        </div>
        <z-form-field appearance="fill" class="w-full">
          <z-form-label>{{ 'XP.XProject.DueDateColumn' | translate }}</z-form-label>
          <input z-input type="date" formControlName="dueDate" />
        </z-form-field>
        <z-form-field appearance="fill" class="w-full">
          <z-form-label>{{ 'XP.XProject.ExecutionAssistantColumn' | translate }}</z-form-label>
          <z-select class="w-full" formControlName="assigneeXpertId">
            @for (assistant of project?.xperts || []; track assistant.id) {
              <z-select-item [zValue]="assistant.id">{{ assistant.title || assistant.name }}</z-select-item>
            }
          </z-select>
          <p class="mt-0.5 text-xs text-text-tertiary">
            {{ 'XP.XProject.ExecutionAssistantHint' | translate }}
          </p>
        </z-form-field>
        @if (advanced) {
          <div class="grid gap-2 sm:grid-cols-2">
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
        <section class="border-t border-divider-subtle pt-3">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-medium text-text-primary">
              {{ 'XP.XProject.ExecutionSteps' | translate: { count: task?.steps?.length || 0 } }}
            </h3>
            @if (task?.executions?.length) {
              <z-badge zType="outline">{{ task?.executions?.length }}</z-badge>
            }
          </div>
          <div class="mt-2 space-y-1.5">
            @for (step of task?.steps || []; track step.id || step.stepIndex) {
              <div class="flex gap-2 border-b border-divider-subtle py-1.5 text-sm">
                <span class="text-text-tertiary">{{ step.stepIndex + 1 }}</span>
                <span class="min-w-0 flex-1 text-text-secondary">{{ step.description }}</span>
                <z-badge zType="outline">{{ 'XP.XProject.StepStatus.' + step.status | translate }}</z-badge>
              </div>
            } @empty {
              <p class="text-sm text-text-tertiary">{{ 'XP.XProject.NoExecutionSteps' | translate }}</p>
            }
          </div>
        </section>
        <section class="border-t border-divider-subtle pt-3">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-medium text-text-primary">
              {{ 'XP.XProject.ExecutionContext' | translate }}
            </h3>
            @if (relations.executions.length) {
              <z-badge zType="outline">{{ relations.executions.length }}</z-badge>
            }
          </div>
          <div class="mt-2 divide-y divide-divider-subtle">
            @for (execution of relations.executions; track execution.id) {
              <div class="py-2.5 text-xs">
                <div class="flex items-center justify-between gap-3">
                  <div class="flex min-w-0 items-center gap-2">
                    <z-badge zType="outline">
                      {{ 'XP.XProject.ExecutionStatus.' + execution.status | translate }}
                    </z-badge>
                    <span class="truncate text-text-secondary">
                      {{ execution.agentKey || execution.xpertId || ('XP.XProject.Assistant' | translate) }}
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
                      (click)="openConversation(execution.conversationId, execution.threadId)"
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
        <section class="border-t border-divider-subtle pt-3">
          <h3 class="text-sm font-medium text-text-primary">{{ 'XP.XProject.TaskConversations' | translate }}</h3>
          <div class="mt-2 divide-y divide-divider-subtle">
            @for (link of relations.conversations; track link.id) {
              <div class="flex items-center justify-between gap-3 py-1.5 text-xs">
                <span class="truncate text-text-secondary">
                  {{ link.conversation?.title || link.conversation?.threadId || link.conversationId }}
                </span>
                @if (link.conversation?.threadId) {
                  <button
                    z-button
                    zType="link"
                    type="button"
                    class="h-auto shrink-0 p-0 text-xs"
                    (click)="openConversation(link.conversationId, link.conversation.threadId)"
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
        <section class="border-t border-divider-subtle pt-3">
          <h3 class="text-sm font-medium text-text-primary">{{ 'XP.XProject.TaskContext' | translate }}</h3>
          <dl class="mt-2 space-y-1.5 text-xs">
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
              <dt class="text-text-tertiary">{{ 'XP.XProject.ExecutionAssistantColumn' | translate }}</dt>
              <dd class="text-right text-text-secondary">
                {{ executionAssistantName() || ('XP.XProject.Unassigned' | translate) }}
              </dd>
            </div>
          </dl>
        </section>
      </div>
      <footer class="flex justify-end gap-2 border-t border-divider-subtle pt-3">
        <button z-button zType="ghost" type="button" (click)="close()">
          {{ 'XP.XProject.Cancel' | translate }}
        </button>
        <button z-button zType="default" type="submit">{{ 'XP.XProject.Save' | translate }}</button>
      </footer>
    </form>
  `
})
export class XpertProjectTaskDialogComponent {
  readonly data = inject<XpertProjectTaskDialogData>(Z_MODAL_DATA)
  readonly #dialogRef =
    inject<ZardDialogRef<XpertProjectTaskDialogComponent, XpertProjectTaskDialogResult | null>>(ZardDialogRef)
  readonly task = this.data.task
  readonly relations = this.data.relations
  readonly plans = this.data.plans
  readonly project = this.data.project
  readonly advanced = this.data.advanced

  readonly statuses: TXpertProjectTaskStatus[] = this.advanced
    ? ['todo', 'in_progress', 'review', 'paused', 'done', 'blocked', 'cancelled']
    : ['todo', 'in_progress', 'paused', 'done', 'blocked', 'cancelled']
  readonly priorities: TXpertProjectTaskPriority[] = ['urgent', 'high', 'medium', 'low']
  readonly form = new FormGroup<TaskForm>({
    title: new FormControl('', { nonNullable: true }),
    description: new FormControl('', { nonNullable: true }),
    status: new FormControl<TXpertProjectTaskStatus>('todo', { nonNullable: true }),
    priority: new FormControl<TXpertProjectTaskPriority>('medium', { nonNullable: true }),
    dueDate: new FormControl('', { nonNullable: true }),
    planId: new FormControl('', { nonNullable: true }),
    milestoneId: new FormControl('', { nonNullable: true }),
    assigneeXpertId: new FormControl('', { nonNullable: true })
  })

  selectedPlan() {
    const planId = this.form.controls.planId.value
    return this.plans.find((plan) => plan.id === planId)
  }

  changePlan(value: unknown) {
    this.form.controls.planId.setValue(String(value ?? ''))
    this.form.controls.milestoneId.setValue('')
  }

  constructor() {
    this.form.reset({
      title: this.task.title || this.task.name || '',
      description: this.task.description || '',
      status: normalizeStatus(this.task.status, this.advanced),
      priority: this.task.priority || 'medium',
      dueDate: this.task.dueDate ? new Date(this.task.dueDate).toISOString().slice(0, 10) : '',
      planId: this.task.planId || this.plans[0]?.id || '',
      milestoneId: this.task.milestoneId || '',
      assigneeXpertId:
        this.task.assigneeXpertId || this.project?.settings?.projectAssistantId || this.project?.xperts?.[0]?.id || ''
    })
  }

  executionAssistantName() {
    const id = this.form.controls.assigneeXpertId.value || this.task.assigneeXpertId
    return (
      this.project?.xperts?.find((assistant) => assistant.id === id)?.title ||
      this.project?.xperts?.find((assistant) => assistant.id === id)?.name ||
      ''
    )
  }

  close() {
    this.#dialogRef.close(null)
  }
  openConversation(conversationId?: string, threadId?: string) {
    if (threadId?.trim()) this.#dialogRef.close({ openConversation: { conversationId, threadId } })
  }
  save() {
    const value = this.form.getRawValue()
    this.#dialogRef.close({
      ...value,
      name: value.title,
      id: this.task.id,
      planId: value.planId || undefined,
      milestoneId: value.milestoneId || undefined,
      dueDate: value.dueDate ? new Date(`${value.dueDate}T00:00:00`) : undefined
    })
  }
}

export type XpertProjectTaskDialogData = {
  task: IXpertProjectTask
  relations: XpertProjectTaskRelations
  plans: IXpertProjectPlan[]
  project?: IXpertProject | null
  advanced: boolean
}

export type XpertProjectTaskDialogResult =
  | Partial<IXpertProjectTask>
  | { openConversation: { conversationId?: string; threadId: string } }

function normalizeStatus(status: IXpertProjectTask['status'], advanced: boolean): TXpertProjectTaskStatus {
  if (status === 'pending') return 'todo'
  if (status === 'completed') return 'done'
  if (status === 'failed') return 'blocked'
  if (!advanced && status === 'review') return 'in_progress'
  return status as TXpertProjectTaskStatus
}
