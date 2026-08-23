import { CommonModule } from '@angular/common'
import { Component, computed, inject, signal } from '@angular/core'
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { TranslateModule } from '@ngx-translate/core'
import type {
  ICopilotModel,
  IKnowledgebase,
  IUser,
  IXpert,
  IXpertProject,
  IXpertProjectCreateInput,
  IXpertToolset,
  IXpertWorkspace,
  OrderTypeEnum
} from '@xpert-ai/contracts'
import { AiModelTypeEnum } from '@xpert-ai/contracts'
import {
  Z_MODAL_DATA,
  ZardButtonComponent,
  ZardDialogRef,
  ZardFormImports,
  ZardInputDirective,
  ZardSelectImports,
  ZardTagSelectComponent,
  type ZardTagSelectOption
} from '@xpert-ai/headless-ui'
import {
  BehaviorSubject,
  catchError,
  distinctUntilChanged,
  firstValueFrom,
  map,
  of,
  startWith,
  switchMap,
  take,
  tap
} from 'rxjs'
import { KnowledgebaseService } from '../../@core/services/knowledgebase.service'
import { UsersOrganizationsService } from '../../@core/services/users-organizations.service'
import { XpertAPIService } from '../../@core/services/xpert.service'
import { XpertToolsetService } from '../../@core/services/xpert-toolset.service'
import { XpertTemplateService } from '../../@core/services/xpert-template.service'
import { XpertWorkspaceService } from '../../@core/services/xpert-workspace.service'
import { CopilotModelSelectComponent } from '../../@shared/copilot'
import { getErrorMessage, injectToastr } from '@cloud/app/@core'
import { isProjectAssistant, PROJECT_ASSISTANT_TEMPLATE_ID } from './project-assistant.constants'

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
    CopilotModelSelectComponent,
    ...ZardFormImports,
    ...ZardSelectImports
  ],
  template: `
    <form class="flex max-h-[min(82vh,720px)] min-w-0 flex-col" [formGroup]="form" (ngSubmit)="submit()">
      <div class="flex items-start justify-between border-b border-divider-subtle pb-3">
        <div>
          <p class="text-xs font-medium uppercase tracking-wide text-text-tertiary">
            {{ 'XP.XProject.StepOf' | translate: { step: step(), total: 3 } }}
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
      <div class="min-h-0 flex-1 space-y-3 overflow-y-auto py-4">
        @if (step() === 1) {
          <z-form-field appearance="fill" class="w-full">
            <z-form-label [zRequired]="true">{{ 'XP.XProject.WorkspaceLabel' | translate }}</z-form-label>
            <z-select class="w-full" formControlName="workspaceId" [zDisabled]="workspacesLoading()">
              <z-select-item zValue="">{{ 'XP.XProject.SelectWorkspace' | translate }}</z-select-item>
              @for (workspace of workspaces(); track workspace.id) {
                <z-select-item [zValue]="workspace.id">{{ workspace.name }}</z-select-item>
              }
            </z-select>
            @if (!workspacesLoading() && !workspaces().length) {
              <p class="col-span-full mt-1 text-xs text-text-tertiary">
                {{ 'XP.XProject.NoAuthoringWorkspace' | translate }}
              </p>
            }
          </z-form-field>
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
            <z-form-label>{{ 'XP.XProject.CopilotModel' | translate }}</z-form-label>
            <copilot-model-select
              class="block w-full"
              [modelType]="eModelType.LLM"
              [hiddenLabel]="true"
              [required]="true"
              [(ngModel)]="copilotModel"
              [ngModelOptions]="{ standalone: true }"
            />
          </z-form-field>
          <z-form-field appearance="fill" class="w-full">
            <z-form-label>{{ 'XP.XProject.ProjectAssistant' | translate }}</z-form-label>
            <div class="col-span-full grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <z-select
                class="block w-full min-w-0"
                formControlName="xpertId"
                [zDisabled]="xpertsLoading() || installingTemplate()"
              >
                <z-select-item zValue="">{{ 'XP.XProject.NotSelected' | translate }}</z-select-item>
                @for (xpert of projectAssistants(); track xpert.id) {
                  <z-select-item [zValue]="xpert.id">{{ xpert.title || xpert.name }}</z-select-item>
                }
              </z-select>
              <button
                z-button
                zType="outline"
                zSize="sm"
                class="w-full whitespace-nowrap sm:w-auto"
                type="button"
                [zDisabled]="!canCreateProjectAssistantFromTemplate()"
                (click)="createProjectAssistantFromTemplate()"
              >
                <i class="ri-magic-line mr-1"></i>
                {{
                  (installingTemplate() ? 'XP.XProject.CreatingProjectAssistant' : 'XP.XProject.CreateProjectAssistant')
                    | translate
                }}
              </button>
            </div>
            <p class="col-span-full mt-1 text-xs leading-5 text-text-tertiary">
              {{ 'XP.XProject.ProjectAssistantTemplateHint' | translate }}
            </p>
          </z-form-field>
          <z-form-field appearance="fill" class="w-full">
            <z-form-label>{{ 'XP.XProject.ToolsetResource' | translate }}</z-form-label>
            <z-select class="w-full" formControlName="toolsetId" [zDisabled]="toolsetsLoading()">
              <z-select-item zValue="">{{ 'XP.XProject.NotSelected' | translate }}</z-select-item>
              @for (toolset of toolsets(); track toolset.id) {
                <z-select-item [zValue]="toolset.id">{{ toolset.name }}</z-select-item>
              }
            </z-select>
          </z-form-field>
          <z-form-field appearance="fill" class="w-full">
            <z-form-label>{{ 'XP.XProject.KnowledgeResource' | translate }}</z-form-label>
            <z-select class="w-full" formControlName="knowledgebaseId" [zDisabled]="knowledgebasesLoading()">
              <z-select-item zValue="">{{ 'XP.XProject.NotSelected' | translate }}</z-select-item>
              @for (knowledgebase of knowledgebases(); track knowledgebase.id) {
                <z-select-item [zValue]="knowledgebase.id">{{ knowledgebase.name }}</z-select-item>
              }
            </z-select>
          </z-form-field>
          <p class="text-xs text-text-tertiary">{{ 'XP.XProject.ResourcesHint' | translate }}</p>
        }
        @if (step() === 3) {
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
        }
      </div>
      <div class="flex items-center justify-between border-t border-divider-subtle pt-3">
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
  readonly eModelType = AiModelTypeEnum
  readonly #dialogRef = inject<ZardDialogRef<XpertProjectCreateDialogComponent>>(ZardDialogRef)
  readonly #fb = inject(FormBuilder)
  readonly #xpertService = inject(XpertAPIService)
  readonly #templateService = inject(XpertTemplateService)
  readonly #toolsetService = inject(XpertToolsetService)
  readonly #knowledgebaseService = inject(KnowledgebaseService)
  readonly #membersService = inject(UsersOrganizationsService)
  readonly #workspaceService = inject(XpertWorkspaceService)
  readonly #toastr = injectToastr()
  readonly step = signal(1)
  readonly submitting = signal(false)
  readonly workspacesLoading = signal(true)
  readonly xpertsLoading = signal(true)
  readonly installingTemplate = signal(false)
  readonly installedAssistant = signal<IXpert | null>(null)
  readonly toolsetsLoading = signal(true)
  readonly knowledgebasesLoading = signal(true)
  copilotModel: Partial<ICopilotModel> | null = null
  readonly #workspaceSelection$ = new BehaviorSubject<string>('')
  readonly workspaces = toSignal(
    this.#workspaceService.getAllMy({ order: { updatedAt: 'DESC' as OrderTypeEnum } }, { purpose: 'authoring' }).pipe(
      map(({ items }) => items ?? []),
      catchError(() => of([] as IXpertWorkspace[])),
      tap(() => this.workspacesLoading.set(false))
    ),
    { initialValue: [] as IXpertWorkspace[] }
  )
  readonly xperts = toSignal(
    this.#workspaceSelection$.pipe(
      distinctUntilChanged(),
      tap(() => this.xpertsLoading.set(true)),
      switchMap((workspaceId) =>
        workspaceId
          ? this.#xpertService
              .getAllByWorkspace(
                workspaceId,
                { where: { latest: true }, take: 100, order: { updatedAt: 'DESC' as OrderTypeEnum } },
                false
              )
              .pipe(
                map(({ items }) => items ?? []),
                catchError(() => of([] as IXpert[]))
              )
          : of([] as IXpert[])
      ),
      tap(() => this.xpertsLoading.set(false))
    ),
    { initialValue: [] as IXpert[] }
  )
  readonly projectAssistants = computed(() => {
    const items = this.installedAssistant()
      ? [...this.xperts(), this.installedAssistant()!].filter(
          (xpert, index, all) => all.findIndex((item) => item.id === xpert.id) === index
        )
      : this.xperts()
    const marked = items.filter((xpert) => isProjectAssistant(xpert))
    // Keep legacy workspaces usable until their assistants are re-marked.
    return marked.length ? marked : items
  })
  readonly toolsets = toSignal(
    this.#workspaceSelection$.pipe(
      distinctUntilChanged(),
      tap(() => this.toolsetsLoading.set(true)),
      switchMap((workspaceId) =>
        workspaceId
          ? this.#toolsetService
              .getAllByWorkspace(workspaceId, { take: 100, order: { updatedAt: 'DESC' as OrderTypeEnum } })
              .pipe(
                map(({ items }) => items ?? []),
                catchError(() => of([] as IXpertToolset[]))
              )
          : of([] as IXpertToolset[])
      ),
      tap(() => this.toolsetsLoading.set(false))
    ),
    { initialValue: [] as IXpertToolset[] }
  )
  readonly knowledgebases = toSignal(
    this.#workspaceSelection$.pipe(
      distinctUntilChanged(),
      tap(() => this.knowledgebasesLoading.set(true)),
      switchMap((workspaceId) =>
        workspaceId
          ? this.#knowledgebaseService
              .getAllByWorkspace(workspaceId, { take: 100, order: { updatedAt: 'DESC' as OrderTypeEnum } })
              .pipe(
                map(({ items }) => (items ?? []).filter((knowledgebase) => knowledgebase.workspaceId === workspaceId)),
                catchError(() => of([] as IKnowledgebase[]))
              )
          : of([] as IKnowledgebase[])
      ),
      tap(() => this.knowledgebasesLoading.set(false))
    ),
    { initialValue: [] as IKnowledgebase[] }
  )
  readonly members = toSignal(
    this.#membersService.getAllInOrg(['user'], { isActive: true }).pipe(
      map(({ items }) => items?.map((entry) => entry.user).filter((user): user is IUser => !!user) ?? []),
      catchError(() => of([])),
      map((items) => {
        return items
      })
    ),
    { initialValue: [] as IUser[] }
  )
  readonly memberOptions = computed<ZardTagSelectOption<IUser>[]>(() =>
    this.members().map((user) => ({ value: user, label: this.displayUser(user), data: user }))
  )
  readonly form = this.#fb.nonNullable.group({
    workspaceId: ['', Validators.required],
    name: ['', [Validators.required, Validators.maxLength(120)]],
    description: [''],
    xpertId: [''],
    toolsetId: [''],
    knowledgebaseId: [''],
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
    const value = user as IUser | undefined
    return value?.fullName || value?.username || value?.email || ''
  }
  readonly compareUsers = (left: unknown, right: unknown) => (left as IUser)?.id === (right as IUser)?.id

  constructor() {
    this.form.controls.workspaceId.valueChanges
      .pipe(startWith(this.form.controls.workspaceId.value), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((workspaceId) => this.#workspaceSelection$.next(workspaceId))

    if (this.data?.initial) {
      this.form.patchValue({
        workspaceId: this.data.initial.workspaceId ?? '',
        name: this.data.initial.name ?? '',
        description: this.data.initial.description ?? ''
      })
    } else {
      this.#workspaceService
        .getMyDefault({ purpose: 'authoring' })
        .pipe(take(1))
        .subscribe((workspace) => {
          if (workspace && !this.form.controls.workspaceId.value) {
            this.form.controls.workspaceId.setValue(workspace.id)
          }
        })
    }
  }

  canContinue() {
    return this.step() === 1 ? this.form.controls.name.valid && !!this.form.controls.workspaceId.value : true
  }
  canCreateProjectAssistantFromTemplate() {
    const model = this.copilotModel
    return (
      !!this.form.controls.workspaceId.value &&
      !this.installingTemplate() &&
      (!model?.modelType || model.modelType === AiModelTypeEnum.LLM) &&
      !!model?.copilotId &&
      !!model?.model
    )
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
    const input: IXpertProjectCreateInput = {
      workspaceId: value.workspaceId,
      name: value.name,
      description: value.description,
      status: 'active',
      settings: {
        instruction: value.description,
        managementMode: value.managementMode,
        ...(value.xpertId ? { projectAssistantId: value.xpertId } : {})
      }
    }
    const memberIds = value.memberIds.map((user) => user.id).filter(Boolean)
    if (value.xpertId) input.xpertIds = [value.xpertId]
    if (value.toolsetId) input.toolsetIds = [value.toolsetId]
    if (value.knowledgebaseId) input.knowledgebaseIds = [value.knowledgebaseId]
    if (memberIds.length) input.memberIds = memberIds
    if (this.copilotModel) input.copilotModel = this.copilotModel
    this.#dialogRef.close(input)
  }

  async createProjectAssistantFromTemplate() {
    const workspaceId = this.form.controls.workspaceId.value
    const selectedModel = this.copilotModel
    if (!workspaceId || !selectedModel || !this.canCreateProjectAssistantFromTemplate()) return
    this.installingTemplate.set(true)
    try {
      const response = await firstValueFrom(
        this.#templateService.installTemplate(PROJECT_ASSISTANT_TEMPLATE_ID, {
          workspaceId,
          publish: true,
          basic: {
            name: `${this.form.controls.name.value.trim() || 'Project'} Assistant`,
            title: `${this.form.controls.name.value.trim() || 'Project'} Assistant`,
            description: this.form.controls.description.value.trim() || undefined,
            copilotModel: {
              copilotId: selectedModel.copilotId,
              model: selectedModel.model,
              modelType: selectedModel.modelType ?? AiModelTypeEnum.LLM,
              options: selectedModel.options
            }
          }
        })
      )
      if (response.xpert) {
        this.installedAssistant.set(response.xpert)
        this.form.controls.xpertId.setValue(response.xpert.id)
      }
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.installingTemplate.set(false)
    }
  }
}
