import { CommonModule } from '@angular/common'
import { Component, inject, signal } from '@angular/core'
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import {
  Z_MODAL_DATA,
  ZardButtonComponent,
  ZardDialogRef,
  ZardFormImports,
  ZardInputDirective
} from '@xpert-ai/headless-ui'
import type { IXpertProject } from '@xpert-ai/contracts'

@Component({
  standalone: true,
  selector: 'xp-project-create-dialog',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    ZardButtonComponent,
    ZardInputDirective,
    ...ZardFormImports
  ],
  template: `
    <form class="flex max-h-[82vh] min-w-0 flex-col" [formGroup]="form" (ngSubmit)="submit()">
      <div class="flex items-start justify-between border-b border-divider-subtle pb-4">
        <div>
          <p class="text-xs font-medium uppercase tracking-wide text-text-tertiary">
            {{ 'XP.XProject.StepOf' | translate: { step: step(), total: 3 } }}
          </p>
          <h2 class="mt-1 text-lg font-semibold text-text-primary">{{ 'XP.XProject.NewProject' | translate }}</h2>
        </div>
        <button
          z-button
          zType="ghost"
          zSize="sm"
          type="button"
          [attr.aria-label]="'XP.XProject.Close' | translate"
          (click)="close()"
        >
          <i class="ri-close-line"></i>
        </button>
      </div>
      <div class="min-h-64 space-y-4 overflow-auto py-5">
        @if (step() === 1) {
          <z-form-field appearance="fill" class="w-full">
            <z-form-label [zRequired]="true">{{ 'XP.XProject.ProjectName' | translate }}</z-form-label>
            <input z-input formControlName="name" [placeholder]="'XP.XProject.ProjectNamePlaceholder' | translate" />
          </z-form-field>
          <z-form-field appearance="fill" class="w-full">
            <z-form-label>{{ 'XP.XProject.GoalInstructions' | translate }}</z-form-label>
            <textarea
              z-input
              class="min-h-28 resize-y"
              formControlName="description"
              [placeholder]="'XP.XProject.GoalPlaceholder' | translate"
            ></textarea>
          </z-form-field>
          <z-form-field appearance="fill" class="w-full">
            <z-form-label>{{ 'XP.XProject.ProjectMode' | translate }}</z-form-label>
            <div class="grid gap-2 sm:grid-cols-2">
              @for (mode of modes; track mode.value) {
                <button
                  z-button
                  type="button"
                  [zType]="form.controls.managementMode.value === mode.value ? 'default' : 'outline'"
                  class="h-auto justify-start whitespace-normal px-3 py-3 text-left"
                  (click)="form.controls.managementMode.setValue(mode.value)"
                >
                  <span
                    ><span class="block font-medium">{{ mode.label | translate }}</span
                    ><span class="mt-1 block text-xs font-normal opacity-80">{{
                      mode.description | translate
                    }}</span></span
                  >
                </button>
              }
            </div>
          </z-form-field>
        }
        @if (step() === 2) {
          <z-form-field appearance="fill" class="w-full">
            <z-form-label>{{ 'XP.XProject.WorkspaceResources' | translate }}</z-form-label>
            <textarea
              z-input
              class="min-h-28 resize-y"
              formControlName="resources"
              [placeholder]="'XP.XProject.ResourcesPlaceholder' | translate"
            ></textarea>
          </z-form-field>
          <p class="text-xs text-text-tertiary">{{ 'XP.XProject.ResourcesHint' | translate }}</p>
        }
        @if (step() === 3) {
          <z-form-field appearance="fill" class="w-full">
            <z-form-label>{{ 'XP.XProject.MembersLabel' | translate }}</z-form-label>
            <input z-input formControlName="members" [placeholder]="'XP.XProject.MembersPlaceholder' | translate" />
          </z-form-field>
          <z-form-field appearance="fill" class="w-full">
            <z-form-label>{{ 'XP.XProject.CopilotModel' | translate }}</z-form-label>
            <input
              z-input
              formControlName="copilotModelId"
              [placeholder]="'XP.XProject.CopilotModelPlaceholder' | translate"
            />
          </z-form-field>
        }
      </div>
      <div class="flex items-center justify-between border-t border-divider-subtle pt-4">
        <button z-button zType="ghost" type="button" [disabled]="step() === 1" (click)="previous()">
          {{ 'XP.XProject.Back' | translate }}
        </button>
        @if (step() < 3) {
          <button z-button zType="default" type="button" [disabled]="!canContinue()" (click)="next()">
            {{ 'XP.XProject.Continue' | translate }}
          </button>
        } @else {
          <button z-button zType="default" type="submit" [disabled]="form.invalid || submitting()">
            {{ 'XP.XProject.CreateProject' | translate }}
          </button>
        }
      </div>
    </form>
  `,
  host: { class: 'block w-full min-w-0' }
})
export class XpertProjectCreateDialogComponent {
  readonly #dialogRef = inject<ZardDialogRef<XpertProjectCreateDialogComponent>>(ZardDialogRef)
  readonly #fb = inject(FormBuilder)
  readonly step = signal(1)
  readonly submitting = signal(false)
  readonly form = this.#fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    description: [''],
    resources: [''],
    members: [''],
    copilotModelId: [''],
    managementMode: ['simple' as 'simple' | 'advanced']
  })
  readonly modes = [
    { value: 'simple' as const, label: 'XP.XProject.SimpleMode', description: 'XP.XProject.SimpleModeDescription' },
    {
      value: 'advanced' as const,
      label: 'XP.XProject.AdvancedMode',
      description: 'XP.XProject.AdvancedModeDescription'
    }
  ]
  readonly data = inject<{ initial?: Partial<IXpertProject> }>(Z_MODAL_DATA, { optional: true })

  constructor() {
    if (this.data?.initial)
      this.form.patchValue({ name: this.data.initial.name ?? '', description: this.data.initial.description ?? '' })
  }

  canContinue() {
    return this.step() === 1 ? this.form.controls.name.valid : true
  }
  next() {
    if (this.canContinue()) this.step.update((value) => Math.min(3, value + 1))
  }
  previous() {
    this.step.update((value) => Math.max(1, value - 1))
  }
  close() {
    this.#dialogRef.close()
  }
  submit() {
    if (this.form.invalid) return
    const value = this.form.getRawValue()
    const copilotModelId = value.copilotModelId.trim()
    const input: Partial<IXpertProject> = {
      name: value.name,
      description: value.description,
      status: 'active',
      settings: { instruction: value.description, managementMode: value.managementMode }
    }
    // Model ids are UUID foreign keys. Keep the project on its default model
    // when the optional wizard field contains a display name or is blank.
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(copilotModelId)) {
      input.copilotModelId = copilotModelId
    }
    this.#dialogRef.close(input)
  }
}
