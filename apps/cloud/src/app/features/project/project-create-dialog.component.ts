import { CommonModule } from '@angular/common'
import { Component, computed, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import type { IUser, IXpertProject, IXpertProjectCreateInput } from '@xpert-ai/contracts'
import {
  Z_MODAL_DATA,
  ZardButtonComponent,
  ZardDialogRef,
  ZardFormImports,
  ZardInputDirective,
  ZardTagSelectComponent,
  type ZardTagSelectOption
} from '@xpert-ai/headless-ui'
import { catchError, map, of } from 'rxjs'
import { UsersOrganizationsService } from '../../@core/services/users-organizations.service'
import { Store } from '../../@core'

@Component({
  standalone: true,
  selector: 'xp-project-create-dialog',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    ZardButtonComponent,
    ZardInputDirective,
    ZardTagSelectComponent,
    ...ZardFormImports
  ],
  template: `
    <form class="flex max-h-[min(82vh,720px)] min-w-0 flex-col" [formGroup]="form" (ngSubmit)="submit()">
      <div class="flex items-start justify-between border-b border-divider-subtle pb-3">
        <div>
          <p class="text-xs font-medium uppercase tracking-wide text-text-tertiary">
            {{ 'XP.XProject.StepOf' | translate: { step: step(), total: 2 } }}
          </p>
          <h2 class="mt-1 text-base font-semibold text-text-primary">{{ 'XP.XProject.NewProject' | translate }}</h2>
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

      <div class="min-h-0 flex-1 space-y-4 overflow-y-auto py-4">
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
                  <span>
                    <span class="block font-medium">{{ mode.label | translate }}</span>
                    <span class="mt-1 block text-xs font-normal opacity-80">{{ mode.description | translate }}</span>
                  </span>
                </button>
              }
            </div>
          </z-form-field>
        } @else {
          <z-form-field appearance="fill" class="w-full">
            <z-form-label>{{ 'XP.XProject.MembersLabel' | translate }}</z-form-label>
            <z-tag-select
              mode="multiple"
              formControlName="memberIds"
              [options]="memberOptions()"
              [enableSuggestions]="true"
              [searchable]="true"
              [placeholder]="'XP.XProject.MembersPlaceholder' | translate"
              [displayWith]="displayUser"
              [compareWith]="compareUsers"
            />
          </z-form-field>
          <p class="text-xs leading-5 text-text-tertiary">
            {{ 'XP.XProject.ProjectExpertsAfterCreateHint' | translate }}
          </p>
        }
      </div>

      <div class="flex items-center justify-between border-t border-divider-subtle pt-3">
        <button z-button zType="ghost" type="button" [disabled]="step() === 1" (click)="previous()">
          {{ 'XP.XProject.Back' | translate }}
        </button>
        @if (step() === 1) {
          <button z-button zType="default" type="button" [disabled]="form.controls.name.invalid" (click)="next()">
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
  readonly #membersService = inject(UsersOrganizationsService)
  readonly #store = inject(Store)
  readonly step = signal(1)
  readonly submitting = signal(false)
  readonly members = toSignal(
    this.#membersService.getAllInOrg(['user'], { isActive: true }).pipe(
      map(({ items }) => items?.map((entry) => entry.user).filter((user): user is IUser => !!user) ?? []),
      catchError(() => of([] as IUser[]))
    ),
    { initialValue: [] as IUser[] }
  )
  readonly memberOptions = computed<ZardTagSelectOption<IUser>[]>(() =>
    this.members()
      .filter((user) => user.id !== this.#store.userId)
      .map((user) => ({ value: user, label: this.displayUser(user), data: user }))
  )
  readonly form = this.#fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    description: [''],
    memberIds: this.#fb.nonNullable.control<IUser[]>([]),
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

  readonly displayUser = (user: unknown) => {
    return isUserValue(user) ? user.fullName || user.username || user.email || '' : ''
  }
  readonly compareUsers = (left: unknown, right: unknown) =>
    isUserValue(left) && isUserValue(right) && left.id === right.id

  constructor() {
    if (this.data?.initial) {
      this.form.patchValue({
        name: this.data.initial.name ?? '',
        description: this.data.initial.description ?? '',
        managementMode: this.data.initial.settings?.managementMode ?? 'simple'
      })
    }
  }

  next() {
    if (this.form.controls.name.valid) this.step.set(2)
  }

  previous() {
    this.step.set(1)
  }

  close() {
    this.#dialogRef.close()
  }

  submit() {
    if (this.form.invalid) return
    const value = this.form.getRawValue()
    const input: IXpertProjectCreateInput = {
      name: value.name.trim(),
      description: value.description.trim(),
      status: 'active',
      settings: { managementMode: value.managementMode }
    }
    const memberIds = [
      ...new Set(
        value.memberIds
          .map((user) => user.id?.trim())
          .filter((id): id is string => !!id && id !== this.#store.userId)
      )
    ]
    if (memberIds.length) input.memberIds = memberIds
    this.#dialogRef.close(input)
  }
}

function isUserValue(value: unknown): value is IUser {
  return !!value && typeof value === 'object' && 'id' in value && typeof Reflect.get(value, 'id') === 'string'
}
