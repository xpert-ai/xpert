import { DialogRef } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import { AssistantBindingScope, AssistantCode, type IProjectCore, type IXpert } from '@xpert-ai/contracts'
import { ZardTabsImports } from '@xpert-ai/headless-ui'
import { AssistantBindingService } from '../../../@core/services/assistant-binding.service'
import { ProjectCoreService } from '../../../@core/services/project-core.service'
import { injectToastr } from '../../../@core/services/toastr.service'
import { getErrorMessage } from '../../../@core/types'
import { ProjectAssistantPickerComponent } from './project-assistant-picker.component'

type ProjectCreateTabKey = 'basic' | 'assistantBinding'

@Component({
  standalone: true,
  selector: 'xp-project-create-dialog',
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, ProjectAssistantPickerComponent, ...ZardTabsImports],
  templateUrl: './project-create-dialog.component.html',
  styles: `
    :host {
      display: block;
      width: min(56rem, calc(100vw - 2rem));
      max-height: 90vh;
      overflow: auto;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProjectCreateDialogComponent {
  readonly #dialogRef = inject(DialogRef<IProjectCore | undefined>)
  readonly #assistantBindingService = inject(AssistantBindingService)
  readonly #projectCoreService = inject(ProjectCoreService)
  readonly #toastr = injectToastr()

  readonly loadingAssistants = signal(true)
  readonly assistantsError = signal<string | null>(null)
  readonly assistants = signal<IXpert[]>([])
  readonly submitting = signal(false)
  readonly activeTab = signal<ProjectCreateTabKey>('basic')

  readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/)]
    }),
    goal: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/)]
    }),
    mainAssistantId: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required]
    }),
    description: new FormControl('', {
      nonNullable: true
    })
  })

  readonly nameControl = this.form.controls.name
  readonly goalControl = this.form.controls.goal
  readonly mainAssistantIdControl = this.form.controls.mainAssistantId
  readonly descriptionControl = this.form.controls.description
  readonly selectedAssistantId = toSignal(this.mainAssistantIdControl.valueChanges, {
    initialValue: this.mainAssistantIdControl.value
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

  async submit() {
    if (this.form.invalid || this.loadingAssistants() || !this.assistants().length) {
      this.form.markAllAsTouched()
      this.activateFirstInvalidTab()
      return
    }

    const value = this.form.getRawValue()
    const description = value.description.trim()

    this.submitting.set(true)
    try {
      const project = await firstValueFrom(
        this.#projectCoreService.create({
          name: value.name.trim(),
          goal: value.goal.trim(),
          mainAssistantId: value.mainAssistantId.trim(),
          ...(description ? { description } : {})
        })
      )

      this.#dialogRef.close(project)
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.submitting.set(false)
    }
  }

  isInvalid(control: FormControl<string>) {
    return control.invalid && (control.touched || control.dirty)
  }

  selectAssistant(assistantId: string) {
    this.mainAssistantIdControl.setValue(assistantId)
    this.mainAssistantIdControl.markAsTouched()
    this.mainAssistantIdControl.markAsDirty()
  }

  selectTab(tab: ProjectCreateTabKey) {
    this.activeTab.set(tab)
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

  private activateFirstInvalidTab() {
    if (this.nameControl.invalid || this.goalControl.invalid) {
      this.activeTab.set('basic')
      return
    }

    if (this.mainAssistantIdControl.invalid || this.loadingAssistants() || !this.assistants().length) {
      this.activeTab.set('assistantBinding')
    }
  }
}
