import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'

import { Component, computed, inject, model, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { Router } from '@angular/router'
import {
  AIPermissionsEnum,
  getErrorMessage,
  injectXperts,
  IXpert,
  IXpertTask,
  JsonSchemaObjectType,
  RolesEnum,
  ScheduleTaskStatus,
  Store,
  TaskFrequency,
  ToastrService,
  XpertTaskService
} from '@cloud/app/@core'
import { EmojiAvatarComponent } from '@cloud/app/@shared/avatar'
import { JSONSchemaFormComponent } from '@cloud/app/@shared/forms'
import { NgmProgressSpinnerComponent, NgmSearchComponent, NgmSpinComponent } from '@xpert-ai/ocap-angular/common'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
import { attrModel, myRxResource } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { isNil } from 'lodash-es'
import { NgxPermissionsService } from 'ngx-permissions'
import { catchError, map, of } from 'rxjs'
import { ScheduleFormComponent } from '../../schedule'
import { buildJsonSchemaDefaults, hasJsonSchemaRequiredErrors } from '../../workflow/trigger-config/trigger-config.util'

@Component({
  selector: 'xpert-task-new-blank',
  standalone: true,
  imports: [
    TranslateModule,
    DragDropModule,
    FormsModule,
    CdkMenuModule,
    NgmSpinComponent,
    EmojiAvatarComponent,
    NgmSearchComponent,
    NgmProgressSpinnerComponent,
    ScheduleFormComponent,
    JSONSchemaFormComponent,
    ...ZardTooltipImports
  ],
  templateUrl: './task-dialog.component.html',
  styleUrl: './task-dialog.component.scss'
})
export class XpertTaskDialogComponent {
  eTaskFrequency = TaskFrequency

  readonly #data = inject<{ task?: Partial<IXpertTask>; total?: number; lockXpertSelection?: boolean }>(DIALOG_DATA)
  readonly #dialogRef = inject(DialogRef<IXpertTask | undefined>)
  readonly #toastr = inject(ToastrService)
  readonly #store = inject(Store)
  readonly #router = inject(Router)
  readonly #permissionsService = inject(NgxPermissionsService)
  readonly taskAPI = inject(XpertTaskService)
  readonly myXperts = injectXperts()

  readonly #myTasks = myRxResource({
    request: () => this.#data.total,
    loader: ({ request }) => {
      return isNil(request) ? this.taskAPI.total({ where: { status: ScheduleTaskStatus.SCHEDULED } }) : of(request)
    }
  })
  readonly total = this.#myTasks.value
  readonly task = model<Partial<IXpertTask>>(this.#data?.task ?? {})
  readonly name = attrModel(this.task, 'name')
  readonly xpertId = attrModel(this.task, 'xpertId')
  readonly agentKey = attrModel(this.task, 'agentKey')
  readonly options = attrModel(this.task, 'options')
  readonly prompt = attrModel(this.task, 'prompt')
  readonly runtimeState = attrModel(this.task, 'runtimeState')
  readonly user = toSignal(this.#store.user$, { initialValue: null })
  readonly #scheduleCapabilities = myRxResource({
    request: () => ({ xpertId: this.xpertId(), agentKey: this.agentKey() }),
    loader: ({ request }) => {
      return request.xpertId
        ? this.taskAPI
            .getScheduleCapabilities(request.xpertId, request.agentKey || undefined)
            .pipe(catchError(() => of(null)))
        : of(null)
    }
  })

  readonly xpert = computed(() => this.myXperts()?.find((xpert) => xpert.id === this.xpertId()))
  readonly runtimeStateSchema = computed(() => {
    const schema = this.#scheduleCapabilities.value()?.stateSchema
    return isJsonSchemaObject(schema) ? schema : null
  })
  readonly runtimeStateValue = computed(() => {
    const value = this.runtimeState()
    return isRecord(value) ? value : (buildJsonSchemaDefaults(this.runtimeStateSchema()) ?? {})
  })
  readonly lockXpertSelection = computed(() => !!this.#data?.lockXpertSelection)
  readonly hasEditXpertPermission = toSignal(
    this.#permissionsService.permissions$.pipe(map((permissions) => !!permissions[AIPermissionsEnum.XPERT_EDIT]))
  )
  readonly canEditSelectedXpert = computed(() => {
    const selectedXpert = this.xpert()
    if (!selectedXpert || !this.hasEditXpertPermission()) {
      return false
    }

    return selectedXpert.workspace?.capabilities?.canWrite ?? true
  })
  readonly isTrialUser = computed(() => this.user()?.role?.name === RolesEnum.TRIAL)
  readonly isCreateMode = computed(() => !this.task()?.id)
  readonly isTrialTaskLimitPending = computed(() => this.isTrialUser() && this.isCreateMode() && this.total() == null)
  readonly isTrialTaskLimitReached = computed(
    () => this.isTrialUser() && this.isCreateMode() && (this.total() ?? 0) >= 10
  )
  readonly isSubmitDisabled = computed(
    () =>
      !this.prompt() ||
      !this.xpertId() ||
      hasJsonSchemaRequiredErrors(this.runtimeStateSchema(), this.runtimeStateValue()) ||
      this.loading() ||
      this.isTrialTaskLimitPending() ||
      this.isTrialTaskLimitReached()
  )

  readonly loading = signal(false)
  readonly search = model<string>('')

  bindExpert(xpert: IXpert) {
    if (this.lockXpertSelection()) {
      return
    }

    this.xpertId.set(xpert.id)
    this.agentKey.set(undefined)
    this.runtimeState.set(null)
  }

  setRuntimeState(value: Record<string, unknown>) {
    this.runtimeState.set(value)
  }

  editXpert() {
    const selectedXpert = this.xpert()
    if (!selectedXpert || !this.canEditSelectedXpert()) {
      return
    }

    this.close()
    void this.#router.navigate(['/xpert/x', selectedXpert.id])
  }

  close(value?: IXpertTask) {
    this.#dialogRef.close(value)
  }

  createTask() {
    if (this.isTrialTaskLimitPending()) {
      return
    }

    if (this.isTrialTaskLimitReached()) {
      this.#toastr.error('Trial users can schedule a maximum of 10 tasks')
      return
    }

    this.loading.set(true)
    const currentTask = this.task()
    this.taskAPI
      .upsert({
        ...(currentTask.id ? { id: currentTask.id } : {}),
        name: this.name(),
        timeZone: currentTask.timeZone,
        prompt: this.prompt(),
        options: {
          ...this.options(),
          frequency: this.options().frequency || TaskFrequency.Once
        },
        runtimeState: this.runtimeState(),
        status: ScheduleTaskStatus.SCHEDULED,
        xpertId: this.xpertId(),
        agentKey: this.agentKey() || undefined
      })
      .subscribe({
        next: (task) => {
          this.loading.set(false)
          this.#toastr.success('PAC.Xpert.TaskCreatedSuccessfully', { Default: 'Task created successfully' })
          this.close(task)
        },
        error: (error) => {
          this.loading.set(false)
          this.#toastr.error(getErrorMessage(error))
        }
      })
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isJsonSchemaObject(value: unknown): value is JsonSchemaObjectType {
  return isRecord(value) && value.type === 'object' && isRecord(value.properties)
}
