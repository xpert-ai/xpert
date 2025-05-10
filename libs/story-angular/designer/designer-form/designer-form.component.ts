import { CommonModule } from '@angular/common'
import { Component, inject, signal } from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { nonNullable } from '@metad/core'
import { cloneDeep } from '@metad/ocap-core'
import { FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { isEqual } from 'lodash-es'
import { NGXLogger } from 'ngx-logger'
import { filter, isObservable, of } from 'rxjs'
import { DesignerSchema, STORY_DESIGNER_FORM, STORY_DESIGNER_SCHEMA } from '../types'

/**
 * Designer form component
 * Two ways to bind model value:
 * 1. Through STORY_DESIGNER_FORM to bind model value
 *
 * Both ways are build formly form through STORY_DESIGNER_SCHEMA
 */
@Component({
  standalone: true,
  selector: 'ngm-designer-form',
  templateUrl: 'designer-form.component.html',
  styleUrls: ['designer-form.component.scss'],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, FormlyModule, TranslateModule]
})
export class NgmDesignerFormComponent {
  readonly #logger = inject(NGXLogger)
  private schema: DesignerSchema = inject(STORY_DESIGNER_SCHEMA)
  readonly #settingsComponent? = inject(STORY_DESIGNER_FORM, { optional: true })

  formGroup = new FormGroup({})
  model = {}
  options = {}

  readonly initial = signal(true)
  readonly isEmpty = signal(false)

  public readonly fields = toSignal(this.schema.getSchema())

  private modelSub = (isObservable(this.#settingsComponent?.model)
    ? this.#settingsComponent.model
    : of(this.#settingsComponent?.model)
  )
    .pipe(
      filter((model) => this.initial() || !isEqual(model, this.model)),
      takeUntilDestroyed()
    )
    .subscribe((model) => {
      // if (!nonNullable(model?.modeling) && !this.initial()) {
      if (!nonNullable(model) && !this.initial()) {
        this.isEmpty.set(true)
      } else {
        this.initial.set(false)
        this.model = cloneDeep(model)
        this.schema.model = model
      }
    })

  onModelChange(event) {
    const title = this.schema.title()
    this.#logger.trace(`[NgmDesignerFormComponent] schema '${title}' onModelChange value:`, event)
    this.onSubmit(event)
  }

  /**
   * Submit the form value back
   * @param value
   */
  onSubmit(value?: unknown) {
    const newValue = value ?? this.model
    this.#settingsComponent?.submit.next(newValue)
  }
}
