import { DialogRef } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core'
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import type { IProjectCore } from '@xpert-ai/contracts'
import { ProjectCoreService } from '../../../@core/services/project-core.service'
import { injectToastr } from '../../../@core/services/toastr.service'
import { getErrorMessage } from '../../../@core/types'

@Component({
  standalone: true,
  selector: 'xp-project-create-dialog',
  imports: [CommonModule, ReactiveFormsModule, TranslateModule],
  templateUrl: './project-create-dialog.component.html',
  styles: `
    :host {
      display: block;
      width: min(40rem, calc(100vw - 2rem));
      max-width: 100%;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProjectCreateDialogComponent {
  readonly #dialogRef = inject(DialogRef<IProjectCore | undefined>)
  readonly #projectCoreService = inject(ProjectCoreService)
  readonly #toastr = injectToastr()

  readonly submitting = signal(false)

  readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/)]
    }),
    goal: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/)]
    }),
    description: new FormControl('', {
      nonNullable: true
    })
  })

  readonly nameControl = this.form.controls.name
  readonly goalControl = this.form.controls.goal
  readonly descriptionControl = this.form.controls.description

  close() {
    if (this.submitting()) {
      return
    }

    this.#dialogRef.close()
  }

  async submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched()
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
}
