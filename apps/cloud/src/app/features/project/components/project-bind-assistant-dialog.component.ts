import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import { AssistantBindingScope, AssistantCode, type IProjectCore, type IXpert } from '@xpert-ai/contracts'
import { AssistantBindingService } from '../../../@core/services/assistant-binding.service'
import { ProjectCoreService } from '../../../@core/services/project-core.service'
import { getErrorMessage } from '../../../@core/types'
import { ProjectAssistantPickerComponent } from './project-assistant-picker.component'
import { injectToastr } from '../../../@core/services/toastr.service'

type ProjectBindAssistantDialogData = {
  project: IProjectCore
}

@Component({
  standalone: true,
  selector: 'xp-project-bind-assistant-dialog',
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, ProjectAssistantPickerComponent],
  templateUrl: './project-bind-assistant-dialog.component.html',
  styles: `
    :host {
      display: block;
      width: min(56rem, calc(100vw - 2rem));
      max-width: 100%;
      max-height: 90vh;
      overflow: auto;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProjectBindAssistantDialogComponent {
  readonly #dialogRef = inject(DialogRef<IProjectCore | undefined>)
  readonly #data = inject<ProjectBindAssistantDialogData>(DIALOG_DATA)
  readonly #assistantBindingService = inject(AssistantBindingService)
  readonly #projectCoreService = inject(ProjectCoreService)
  readonly #toastr = injectToastr()

  readonly loadingAssistants = signal(true)
  readonly assistantsError = signal<string | null>(null)
  readonly assistants = signal<IXpert[]>([])
  readonly submitting = signal(false)
  readonly project = this.#data.project
  readonly isReplacing = computed(() => Boolean(this.project.mainAssistantId))

  readonly form = new FormGroup({
    mainAssistantId: new FormControl(this.#data.project.mainAssistantId ?? '', {
      nonNullable: true,
      validators: [Validators.required]
    })
  })

  readonly selectedAssistantId = toSignal(this.form.controls.mainAssistantId.valueChanges, {
    initialValue: this.form.controls.mainAssistantId.value
  })

  constructor() {
    void this.loadAssistants()
  }

  close() {
    if (this.submitting()) {
      return
    }

    this.#dialogRef.close()
  }

  selectAssistant(assistantId: string) {
    this.form.controls.mainAssistantId.setValue(assistantId)
    this.form.controls.mainAssistantId.markAsDirty()
    this.form.controls.mainAssistantId.markAsTouched()
  }

  async submit() {
    if (this.form.invalid || this.loadingAssistants() || !this.assistants().length) {
      this.form.markAllAsTouched()
      return
    }

    if (!this.project.id) {
      this.#toastr.error('Project id is required.')
      return
    }

    this.submitting.set(true)
    try {
      const result = await firstValueFrom(
        this.#projectCoreService.update(this.project.id, {
          mainAssistantId: this.selectedAssistantId()
        })
      )

      if (!isProjectCore(result)) {
        throw new Error('The updated project payload is invalid.')
      }

      this.#dialogRef.close(result)
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.submitting.set(false)
    }
  }

  private async loadAssistants() {
    this.loadingAssistants.set(true)
    this.assistantsError.set(null)

    try {
      const assistants = await firstValueFrom(
        this.#assistantBindingService.getAvailableXperts(AssistantBindingScope.USER, AssistantCode.PROJECT_MAIN)
      )
      this.assistants.set(assistants)
    } catch (error) {
      this.assistants.set([])
      this.assistantsError.set(getErrorMessage(error))
    } finally {
      this.loadingAssistants.set(false)
    }
  }
}

function isProjectCore(value: unknown): value is IProjectCore {
  if (!value || typeof value !== 'object') {
    return false
  }

  return (
    'name' in value &&
    typeof value.name === 'string' &&
    'goal' in value &&
    typeof value.goal === 'string' &&
    'status' in value &&
    typeof value.status === 'string' &&
    'mainAssistantId' in value &&
    (typeof value.mainAssistantId === 'string' || value.mainAssistantId === null)
  )
}
