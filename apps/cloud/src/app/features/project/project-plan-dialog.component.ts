import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import type {
  IXpertProjectMilestone,
  IXpertProjectPlan,
  IXpertProjectSprint,
  TXpertProjectMilestoneStatus,
  TXpertProjectPlanStatus,
  TXpertProjectSprintStatus,
  TXpertProjectSprintStrategy
} from '@xpert-ai/contracts'
import {
  Z_MODAL_DATA,
  ZardButtonComponent,
  ZardDialogRef,
  ZardFormImports,
  ZardInputDirective,
  ZardSelectImports
} from '@xpert-ai/headless-ui'

export type XpertProjectPlanDialogMode = 'plan' | 'sprint' | 'milestone'

export type XpertProjectPlanDialogData = {
  mode: XpertProjectPlanDialogMode
  initial?: XpertProjectPlanDialogResult
}

export type XpertProjectPlanDialogResult =
  | Partial<IXpertProjectPlan>
  | Partial<IXpertProjectSprint>
  | Partial<IXpertProjectMilestone>

@Component({
  standalone: true,
  selector: 'xp-project-plan-dialog',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    ZardButtonComponent,
    ZardInputDirective,
    ...ZardFormImports,
    ...ZardSelectImports
  ],
  template: `
    <section class="min-w-0">
      <header class="border-b border-divider-subtle pb-4">
        <p class="text-xs font-medium uppercase tracking-wide text-text-tertiary">
          {{ 'XP.XProject.' + modeLabel() | translate: { Default: modeLabel() } }}
        </p>
        <h2 class="mt-1 text-lg font-semibold text-text-primary">
          {{ 'XP.XProject.' + titleKey() | translate: { Default: titleKey() } }}
        </h2>
      </header>

      <form class="space-y-4 py-5" [formGroup]="form" (ngSubmit)="submit()">
        @if (mode === 'plan') {
          <z-form-field class="w-full">
            <z-form-label [zRequired]="true">{{ 'XP.XProject.PlanName' | translate }}</z-form-label>
            <input z-input formControlName="name" [placeholder]="'XP.XProject.PlanNamePlaceholder' | translate" />
          </z-form-field>
          <z-form-field class="w-full">
            <z-form-label>{{ 'XP.XProject.Description' | translate }}</z-form-label>
            <textarea z-input class="min-h-24 resize-y" formControlName="description"></textarea>
          </z-form-field>
          <z-form-field class="w-full">
            <z-form-label>{{ 'XP.XProject.PlanStatusLabel' | translate }}</z-form-label>
            <z-select class="w-full" formControlName="status">
              @for (status of planStatuses; track status) {
                <z-select-item [zValue]="status">{{ 'XP.XProject.PlanStatus.' + status | translate }}</z-select-item>
              }
            </z-select>
          </z-form-field>
        } @else if (mode === 'sprint') {
          <z-form-field class="w-full">
            <z-form-label [zRequired]="true">{{ 'XP.XProject.SprintGoal' | translate }}</z-form-label>
            <input z-input formControlName="goal" [placeholder]="'XP.XProject.SprintGoalPlaceholder' | translate" />
          </z-form-field>
          <div class="grid gap-4 sm:grid-cols-2">
            <z-form-field class="w-full">
              <z-form-label>{{ 'XP.XProject.SprintStrategyLabel' | translate }}</z-form-label>
              <z-select class="w-full" formControlName="strategyType">
                @for (strategy of sprintStrategies; track strategy) {
                  <z-select-item [zValue]="strategy">{{
                    'XP.XProject.SprintStrategy.' + strategy | translate
                  }}</z-select-item>
                }
              </z-select>
            </z-form-field>
            <z-form-field class="w-full">
              <z-form-label>{{ 'XP.XProject.SprintStatusLabel' | translate }}</z-form-label>
              <z-select class="w-full" formControlName="status">
                @for (status of sprintStatuses; track status) {
                  <z-select-item [zValue]="status">{{
                    'XP.XProject.SprintStatus.' + status | translate
                  }}</z-select-item>
                }
              </z-select>
            </z-form-field>
          </div>
          <div class="grid gap-4 sm:grid-cols-2">
            <z-form-field class="w-full">
              <z-form-label>{{ 'XP.XProject.StartDate' | translate }}</z-form-label>
              <input z-input type="date" formControlName="startAt" />
            </z-form-field>
            <z-form-field class="w-full">
              <z-form-label>{{ 'XP.XProject.EndDate' | translate }}</z-form-label>
              <input z-input type="date" formControlName="endAt" />
            </z-form-field>
          </div>
        } @else {
          <z-form-field class="w-full">
            <z-form-label [zRequired]="true">{{ 'XP.XProject.MilestoneName' | translate }}</z-form-label>
            <input z-input formControlName="name" [placeholder]="'XP.XProject.MilestoneNamePlaceholder' | translate" />
          </z-form-field>
          <z-form-field class="w-full">
            <z-form-label>{{ 'XP.XProject.Description' | translate }}</z-form-label>
            <textarea z-input class="min-h-24 resize-y" formControlName="description"></textarea>
          </z-form-field>
          <div class="grid gap-4 sm:grid-cols-2">
            <z-form-field class="w-full">
              <z-form-label>{{ 'XP.XProject.MilestoneStatusLabel' | translate }}</z-form-label>
              <z-select class="w-full" formControlName="status">
                @for (status of milestoneStatuses; track status) {
                  <z-select-item [zValue]="status">{{
                    'XP.XProject.MilestoneStatus.' + status | translate
                  }}</z-select-item>
                }
              </z-select>
            </z-form-field>
            <z-form-field class="w-full">
              <z-form-label>{{ 'XP.XProject.DueDateColumn' | translate }}</z-form-label>
              <input z-input type="date" formControlName="dueDate" />
            </z-form-field>
          </div>
        }

        <footer class="flex justify-end gap-2 border-t border-divider-subtle pt-4">
          <button z-button zType="outline" type="button" (click)="close()">
            {{ 'XP.XProject.Cancel' | translate }}
          </button>
          <button z-button zType="default" type="submit" [disabled]="form.invalid">
            {{ 'XP.XProject.' + submitKey() | translate: { Default: submitKey() } }}
          </button>
        </footer>
      </form>
    </section>
  `,
  host: { class: 'block w-full min-w-0' }
})
export class XpertProjectPlanDialogComponent {
  readonly #dialogRef =
    inject<ZardDialogRef<XpertProjectPlanDialogComponent, XpertProjectPlanDialogResult | null>>(ZardDialogRef)
  readonly #fb = inject(FormBuilder)
  readonly #data = inject<XpertProjectPlanDialogData>(Z_MODAL_DATA)

  readonly mode = this.#data.mode
  readonly planStatuses: TXpertProjectPlanStatus[] = ['draft', 'active', 'completed', 'archived']
  readonly sprintStatuses: TXpertProjectSprintStatus[] = ['planned', 'running', 'review', 'done']
  readonly sprintStrategies: TXpertProjectSprintStrategy[] = ['software_delivery', 'data_analysis']
  readonly milestoneStatuses: TXpertProjectMilestoneStatus[] = ['planned', 'in_progress', 'completed', 'blocked']
  readonly form = this.#fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    description: [''],
    status: ['active' as TXpertProjectPlanStatus],
    goal: ['', [Validators.required, Validators.maxLength(160)]],
    strategyType: ['software_delivery' as TXpertProjectSprintStrategy],
    startAt: [''],
    endAt: [''],
    dueDate: ['']
  })

  constructor() {
    const initial = this.#data.initial
    if (!initial) return
    if (this.mode === 'plan') {
      const value = initial as Partial<IXpertProjectPlan>
      this.form.patchValue({
        name: value.name ?? '',
        description: value.description ?? '',
        status: value.status ?? 'active'
      })
    } else if (this.mode === 'milestone') {
      const value = initial as Partial<IXpertProjectMilestone>
      this.form.patchValue({
        name: value.name ?? '',
        description: value.description ?? '',
        status: (value.status ?? 'planned') as TXpertProjectPlanStatus,
        dueDate: value.dueDate ? new Date(value.dueDate).toISOString().slice(0, 10) : ''
      })
    }
  }

  editing() {
    return Boolean(this.#data.initial && 'id' in this.#data.initial && this.#data.initial.id)
  }

  modeLabel() {
    return this.mode === 'plan' ? 'Plan' : this.mode === 'sprint' ? 'Sprint' : 'Milestone'
  }

  titleKey() {
    if (this.editing()) return this.mode === 'plan' ? 'EditPlan' : 'EditMilestone'
    return this.mode === 'plan' ? 'CreatePlan' : this.mode === 'sprint' ? 'CreateSprint' : 'CreateMilestone'
  }

  submitKey() {
    return this.titleKey()
  }

  close() {
    this.#dialogRef.close(null)
  }

  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched()
      return
    }

    const value = this.form.getRawValue()
    if (this.mode === 'plan') {
      this.#dialogRef.close({
        name: value.name.trim(),
        description: value.description.trim() || undefined,
        status: value.status,
        view: 'board'
      } satisfies Partial<IXpertProjectPlan>)
      return
    }
    if (this.mode === 'sprint') {
      this.#dialogRef.close({
        goal: value.goal.trim(),
        status: value.status as TXpertProjectSprintStatus,
        strategyType: value.strategyType,
        startAt: value.startAt ? new Date(`${value.startAt}T00:00:00`) : undefined,
        endAt: value.endAt ? new Date(`${value.endAt}T23:59:59`) : undefined
      } satisfies Partial<IXpertProjectSprint>)
      return
    }
    this.#dialogRef.close({
      name: value.name.trim(),
      description: value.description.trim() || undefined,
      status: value.status as TXpertProjectMilestoneStatus,
      dueDate: value.dueDate ? new Date(`${value.dueDate}T23:59:59`) : undefined
    } satisfies Partial<IXpertProjectMilestone>)
  }
}
